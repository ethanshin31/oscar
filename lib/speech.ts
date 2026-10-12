// Browser speech helpers. Recognition uses the Web Speech API (Chrome, Edge, Safari on iOS/iPadOS/macOS).

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };

export interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function createRecognizer(): Recognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = navigator.language || "en-US";
  r.interimResults = true;
  r.continuous = false;
  return r;
}

export function transcriptOf(e: RecognitionEvent): { text: string; final: boolean } {
  let text = "";
  let final = false;
  for (let i = 0; i < e.results.length; i++) {
    text += e.results[i][0].transcript;
    if (e.results[i].isFinal) final = true;
  }
  return { text, final };
}

// Calm British voices first, J.A.R.V.I.S. style; falls back to any English voice.
const PREFERRED = ["Daniel", "Arthur", "Oliver", "Google UK English Male", "Microsoft Ryan", "Microsoft George", "Microsoft Thomas"];

export function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
}

/** Strip markdown and links so text reads naturally aloud. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits streamed text into complete sentences, keeping the unfinished tail. */
export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?\n]+[.!?]+["')\]]*(?=\s)|[^\n]+\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer))) {
    sentences.push(m[0].trim());
    last = re.lastIndex;
  }
  return { sentences: sentences.filter(Boolean), rest: buffer.slice(last) };
}
