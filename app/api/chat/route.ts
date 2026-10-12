import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { MODEL, systemPrompt } from "@/lib/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Turn = { role: "user" | "assistant"; content: string };
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const MAX_TURNS = 40;
const MAX_CONTINUATIONS = 5;
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

const client = new Anthropic();

function parseHistory(body: unknown): Turn[] | null {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages)) return null;
  const turns: Turn[] = [];
  for (const m of messages) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      !m.content.trim()
    ) {
      continue;
    }
    // Merge consecutive same-role turns so roles always alternate.
    const last = turns.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else turns.push({ role: m.role, content: m.content });
  }
  const recent = turns.slice(-MAX_TURNS);
  while (recent.length && recent[0].role !== "user") recent.shift();
  if (!recent.length || recent.at(-1)!.role !== "user") return null;
  return recent;
}

export async function POST(req: Request) {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    const msg = JSON.stringify({ t: "error", v: "My API key isn't set. Add ANTHROPIC_API_KEY to the server's environment." });
    return new Response(msg + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  }

  const body = await req.json().catch(() => null);
  const history = parseHistory(body);
  if (!history) return new Response("Bad request", { status: 400 });

  const clientTime = (body as { now?: unknown }).now;
  const timeZone = (body as { timeZone?: unknown }).timeZone;
  const contextNote =
    typeof clientTime === "string" && typeof timeZone === "string"
      ? `Current local time for the user: ${clientTime} (${timeZone}).`
      : `Current time (UTC): ${new Date().toISOString()}.`;
  const location = (body as { location?: unknown }).location;
  const locationNote = typeof location === "string" ? ` Approximate location: ${location.slice(0, 120)}.` : "";

  const envEffort = process.env.OSCAR_EFFORT as Effort | undefined;
  const effort: Effort = envEffort && EFFORTS.includes(envEffort) ? envEffort : "low";

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: "system", content: contextNote + locationNote },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
          const response = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              output_config: { effort },
              system: systemPrompt(process.env.OSCAR_USER_NAME || "Peter"),
              tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
              messages,
            },
            { signal: req.signal },
          );

          for await (const event of response) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "server_tool_use") send({ t: "status", v: "searching" });
              if (event.content_block.type === "text") send({ t: "status", v: "speaking" });
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ t: "text", v: event.delta.text });
            }
          }

          const final = await response.finalMessage();
          if (final.stop_reason === "refusal") {
            send({ t: "text", v: "I'm afraid I can't help with that one." });
            break;
          }
          if (final.stop_reason !== "pause_turn") break;
          // A long server-side search paused the turn; hand it back so Claude can continue.
          messages.push({ role: "assistant", content: final.content });
        }
        send({ t: "done" });
      } catch (err) {
        if (req.signal.aborted) return controller.close();
        let message = "Something went wrong reaching my brain. Please try again.";
        if (err instanceof Anthropic.AuthenticationError) {
          message = "My API key is missing or invalid. Check ANTHROPIC_API_KEY on the server.";
        } else if (err instanceof Anthropic.RateLimitError) {
          message = "I'm being rate limited. Give me a moment and try again.";
        } else if (err instanceof Anthropic.APIConnectionError) {
          message = "I can't reach the Anthropic API right now.";
        }
        console.error("chat error", err);
        send({ t: "error", v: message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
