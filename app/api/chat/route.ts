import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { MODEL, systemPrompt } from "@/lib/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Turn = { role: "user" | "assistant"; content: string };
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const MAX_TURNS = 40;
const MAX_ROUNDS = 6;
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

const client = new Anthropic();

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  {
    name: "add_mission",
    description:
      "Add a task to the user's Missions list on their HUD. Use when the user asks you to remember, track or remind them about something to do.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title, under 80 characters, written as an action." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
];

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
  const missions = (body as { missions?: unknown }).missions;
  const missionNote =
    Array.isArray(missions) && missions.length
      ? ` Open missions on the user's list: ${missions
          .filter((m): m is string => typeof m === "string")
          .slice(0, 20)
          .map((m) => m.slice(0, 100))
          .join("; ")}.`
      : " The user's Missions list is empty.";
  const location = (body as { location?: unknown }).location;
  const locationNote = typeof location === "string" ? ` Approximate location: ${location.slice(0, 120)}.` : "";

  const envEffort = process.env.OSCAR_EFFORT as Effort | undefined;
  const effort: Effort = envEffort && EFFORTS.includes(envEffort) ? envEffort : "low";

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: "system", content: contextNote + locationNote + missionNote },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const response = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              output_config: { effort },
              system: systemPrompt(process.env.OSCAR_USER_NAME || "Peter"),
              tools: TOOLS,
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
          if (final.stop_reason === "pause_turn") {
            // A long server-side search paused the turn; hand it back so Claude can continue.
            messages.push({ role: "assistant", content: final.content });
            continue;
          }
          if (final.stop_reason !== "tool_use") break;

          // Oscar's own tools run in the browser; the server only relays them.
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            const title = (block.input as { title?: unknown } | null)?.title;
            if (block.name === "add_mission" && typeof title === "string" && title.trim()) {
              send({ t: "mission", v: title.trim().slice(0, 120) });
              results.push({ type: "tool_result", tool_use_id: block.id, content: "Added to the Missions list." });
            } else {
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: "Invalid input: expected a non-empty title.",
                is_error: true,
              });
            }
          }
          messages.push({ role: "assistant", content: final.content });
          messages.push({ role: "user", content: results });
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
