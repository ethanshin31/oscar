"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Comms from "./Comms";
import Core, { type CoreState } from "./Core";
import Globe from "./Globe";
import { createRecognizer, pickVoice, speakable, takeSentences, transcriptOf, type Recognizer } from "@/lib/speech";

type Turn = { role: "user" | "assistant"; content: string; at: number };
export type Place = { name: string; lat: number; lon: number };
type Located = Place & { source: "device" | "home" };

const HISTORY_KEY = "oscar.history.v1";
const VOICE_KEY = "oscar.voice.v1";

const QUICK_ACTIONS = [
  "Brief me on today",
  "What's in the news right now?",
  "Help me plan my week",
  "Tell me something interesting",
];

const STATE_LABEL: Record<CoreState, string> = {
  idle: "Standing by",
  listening: "Listening",
  thinking: "Thinking",
  searching: "Searching the web",
  speaking: "Responding",
  error: "Attention",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: Oscar still works, it just forgets on reload.
  }
}

function greeting(name: string, now: Date) {
  const h = now.getHours();
  const part = h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}.`;
}

export default function Hud({ userName, model, home }: { userName: string; model: string; home: Place }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<CoreState>("idle");
  const [input, setInput] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [canListen, setCanListen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [place, setPlace] = useState<Located>({ ...home, source: "home" });

  const abortRef = useRef<AbortController | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const speakQueue = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore saved state after mount (avoids server/client mismatch).
  useEffect(() => {
    setTurns(load<Turn[]>(HISTORY_KEY, []));
    setVoiceOn(load<boolean>(VOICE_KEY, true));
    setCanListen(!!createRecognizer());
    setNow(new Date());
    setOnline(navigator.onLine);
    const tick = setInterval(() => setNow(new Date()), 1000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Use the device's position when allowed; otherwise stay on the home location.
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        setPlace((p) => ({ ...p, lat: pos.coords.latitude, lon: pos.coords.longitude, source: "device" })),
      () => {},
      { maximumAge: 10 * 60 * 1000, timeout: 15000 },
    );
    // Some browsers load voices asynchronously.
    window.speechSynthesis?.getVoices();
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => save(HISTORY_KEY, turns.slice(-100)), [turns]);
  useEffect(() => save(VOICE_KEY, voiceOn), [voiceOn]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || !("speechSynthesis" in window)) return;
      const clean = speakable(text);
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      const v = pickVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = 1.03;
      speakQueue.current += 1;
      setState("speaking");
      const finish = () => {
        speakQueue.current = Math.max(0, speakQueue.current - 1);
        if (speakQueue.current === 0) setState((s) => (s === "speaking" ? "idle" : s));
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
    },
    [voiceOn],
  );

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    recognizerRef.current?.abort();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speakQueue.current = 0;
    setState("idle");
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      stopAll();
      setInput("");

      const userTurn: Turn = { role: "user", content: text, at: Date.now() };
      const history = [...turns, userTurn];
      setTurns([...history, { role: "assistant", content: "", at: Date.now() }]);
      setState("thinking");

      const controller = new AbortController();
      abortRef.current = controller;
      const started = performance.now();
      let firstByte = true;
      let reply = "";
      let pendingSpeech = "";

      const appendReply = (chunk: string) => {
        reply += chunk;
        setTurns((ts) => {
          const copy = ts.slice();
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: reply };
          return copy;
        });
        pendingSpeech += chunk;
        const { sentences, rest } = takeSentences(pendingSpeech);
        pendingSpeech = rest;
        sentences.forEach(speak);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
            now: new Date().toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            location: `${place.name} (${place.lat.toFixed(2)}, ${place.lon.toFixed(2)})`,
          }),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as { t: string; v?: string };
            if (ev.t === "text" && ev.v) {
              if (firstByte) {
                setLatency(Math.round(performance.now() - started));
                firstByte = false;
              }
              if (!voiceOn) setState("speaking");
              appendReply(ev.v);
            } else if (ev.t === "status" && ev.v === "searching") {
              setState("searching");
            } else if (ev.t === "error") {
              appendReply((reply ? "\n\n" : "") + (ev.v ?? "Something went wrong."));
              setState("error");
            }
          }
        }
        if (pendingSpeech.trim()) speak(pendingSpeech);
        setState((s) => (s === "error" ? s : speakQueue.current > 0 ? "speaking" : "idle"));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        appendReply(online ? "I lost the connection mid-thought. Please try again." : "You appear to be offline.");
        setState("error");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [turns, speak, stopAll, voiceOn, online, place],
  );

  const listen = useCallback(() => {
    if (state === "listening") {
      recognizerRef.current?.stop();
      return;
    }
    stopAll();
    const r = createRecognizer();
    if (!r) return;
    recognizerRef.current = r;
    let finalText = "";
    r.onresult = (e) => {
      const { text, final } = transcriptOf(e);
      setInput(text);
      if (final) finalText = text;
    };
    r.onerror = () => setState("idle");
    r.onend = () => {
      recognizerRef.current = null;
      if (finalText.trim()) send(finalText);
      else setState((s) => (s === "listening" ? "idle" : s));
    };
    setState("listening");
    r.start();
  }, [state, send, stopAll]);

  // Space bar (when not typing) toggles the microphone, Escape stops everything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === inputRef.current;
      if (e.key === "Escape") stopAll();
      if (e.code === "Space" && !typing && canListen) {
        e.preventDefault();
        listen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listen, stopAll, canListen]);

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function clearHistory() {
    stopAll();
    setTurns([]);
    setMenuOpen(false);
  }

  const busy = state === "thinking" || state === "searching";
  const lastReply = [...turns].reverse().find((t) => t.role === "assistant");
  const recentAsks = turns.filter((t) => t.role === "user").slice(-3).reverse();

  return (
    <div className={`hud ${turns.length ? "hud-active" : ""}`}>
      <div className="hud-grid" aria-hidden="true" />

      <header className="hud-top">
        <div className="wordmark">
          <span className="wordmark-dot" />
          OSCAR
        </div>
        <div className="top-meta mono">
          {now && now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="top-actions">
          <button
            className={`chip ${voiceOn ? "chip-on" : ""}`}
            onClick={() => {
              if (voiceOn) window.speechSynthesis?.cancel();
              setVoiceOn(!voiceOn);
            }}
            aria-pressed={voiceOn}
          >
            Voice {voiceOn ? "on" : "off"}
          </button>
          <button className="chip" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
            Menu
          </button>
          {menuOpen && (
            <div className="menu glass" role="menu">
              <button role="menuitem" onClick={clearHistory}>
                Clear conversation
              </button>
              <button role="menuitem" onClick={signOut}>
                Sign out of this device
              </button>
            </div>
          )}
        </div>
      </header>

      <aside className="panel panel-left">
        <section className="glass card">
          <p className="eyebrow">Local time</p>
          <p className="clock">{now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}</p>
          <p className="muted">{now ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}</p>
        </section>
        <section className="glass card">
          <p className="eyebrow">Systems</p>
          <dl className="stats mono">
            <div>
              <dt>Core</dt>
              <dd>{model}</dd>
            </div>
            <div>
              <dt>Link</dt>
              <dd className={online ? "ok" : "warn"}>{online ? "Online" : "Offline"}</dd>
            </div>
            <div>
              <dt>Response</dt>
              <dd>{latency ? `${(latency / 1000).toFixed(1)} s` : "Waiting"}</dd>
            </div>
            <div>
              <dt>Voice in</dt>
              <dd>{canListen ? "Ready" : "Not supported"}</dd>
            </div>
          </dl>
        </section>
        <section className="glass card">
          <p className="eyebrow">Location</p>
          <Globe lon={place.lon} lat={place.lat} />
          <p className="place-name">{place.name}</p>
          <p className="muted mono place-coords">
            {Math.abs(place.lat).toFixed(2)}° {place.lat >= 0 ? "N" : "S"}, {Math.abs(place.lon).toFixed(2)}°{" "}
            {place.lon >= 0 ? "E" : "W"} · {place.source === "device" ? "GPS" : "Home"}
          </p>
        </section>
      </aside>

      <main className="center">
        <Core state={state} label={STATE_LABEL[state]} />
        <div className="log glass" ref={logRef} aria-live="polite">
          {turns.length === 0 ? (
            <div className="welcome">
              <p className="welcome-line">{now ? greeting(userName, now) : " "}</p>
              <p className="muted">How can I help? Tap the mic or type below.</p>
              <div className="welcome-quick">
                {QUICK_ACTIONS.map((q) => (
                  <button key={q} className="chip" onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={`turn turn-${t.role} ${t === lastReply ? "turn-latest" : ""}`}>
                {t.role === "assistant" && !t.content && busy ? (
                  <span className="typing" aria-label="Oscar is thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  t.content
                )}
              </div>
            ))
          )}
        </div>
      </main>

      <aside className="panel panel-right">
        <section className="glass card">
          <p className="eyebrow">Quick actions</p>
          <div className="quick">
            {QUICK_ACTIONS.map((q) => (
              <button key={q} className="quick-btn" onClick={() => send(q)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        </section>
        <section className="glass card">
          <p className="eyebrow">Recent requests</p>
          {recentAsks.length ? (
            <ul className="recent">
              {recentAsks.map((t) => (
                <li key={t.at}>
                  <span className="mono muted">
                    {new Date(t.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {t.content}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing yet.</p>
          )}
        </section>
        <Comms />
      </aside>

      <form
        className="composer glass"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {canListen && (
          <button
            type="button"
            className={`mic ${state === "listening" ? "mic-live" : ""}`}
            onClick={listen}
            aria-label={state === "listening" ? "Stop listening" : "Talk to Oscar"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" />
            </svg>
          </button>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          placeholder={state === "listening" ? "Listening…" : "Ask Oscar anything"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          aria-label="Message Oscar"
        />
        {busy || state === "speaking" ? (
          <button type="button" className="send" onClick={stopAll} aria-label="Stop">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="send" disabled={!input.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
