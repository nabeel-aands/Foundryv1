/**
 * Streamed chat transport for Ask Foundry. POST { conversationId?, message } → server-sent
 * events (text / tool / done / error). The persona always comes from the cookie, never the body.
 */
import { foundryConfig } from "../../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { assistantMode } from "@/lib/assistant";
import { askKeyword } from "@/lib/assistant/keyword";
import { createConversation, discardConversation, getConversation, takeMessageBudget, trimConversation } from "@/lib/assistant/conversations";
import { SSE_HEADERS, sseStream } from "@/lib/assistant/stream";
import type { Source } from "@/lib/assistant/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { conversationId?: string; message?: string };
  const message = String(body.message ?? "").trim();
  const data = getData();
  const me = await getCurrentUser();
  const { stream, send, close } = sseStream();

  const fail = (msg: string, extra: Record<string, unknown> = {}) => {
    send({ event: "error", data: { message: msg } });
    send({ event: "done", data: { mode: assistantMode(), ...extra } });
    close();
  };

  if (!message) { fail("Say something first."); return new Response(stream, { headers: SSE_HEADERS }); }

  // Resolve the conversation before spending budget, so persona switches start clean.
  let convo = getConversation(body.conversationId);
  if (convo && convo.personaId !== me.user.id) { discardConversation(convo.id); convo = undefined; }
  if (!convo) convo = createConversation(me.user.id, data.fetchedAt);

  const work = async () => {
    if (convo.turns >= foundryConfig.assistant.maxTurns) {
      fail(`This conversation reached its ${foundryConfig.assistant.maxTurns}-turn cap. Start a new conversation to continue.`, { conversationId: convo.id, turns: convo.turns });
      return;
    }
    if (!takeMessageBudget(me.user.id)) {
      fail(`You have sent ${foundryConfig.assistant.messagesPerHour} messages in the last hour. Take a short break and try again soon.`, { conversationId: convo.id, turns: convo.turns });
      return;
    }

    let userText = message;
    if (convo.messages.length && convo.snapshotFetchedAt !== data.fetchedAt) {
      userText = `(Note: the data snapshot was refreshed since the last turn; earlier counts may have changed.)\n\n${message}`;
      convo.snapshotFetchedAt = data.fetchedAt;
    }

    const keywordAnswer = () => {
      const r = askKeyword(data, me, message);
      send({ event: "text", data: { delta: r.answer } });
      mergeSources(convo.sources, r.sources);
      convo.turns++;
      send({ event: "done", data: { mode: "keyword", conversationId: convo.id, turns: convo.turns, sources: convo.sources, toolCalls: r.toolCalls } });
      close();
    };

    if (assistantMode() === "keyword") { keywordAnswer(); return; }

    try {
      const { streamClaudeTurn } = await import("@/lib/assistant/claude");
      const turnSources: Source[] = [];
      const result = await streamClaudeTurn(data, me, convo.messages, userText, turnSources, {
        onText: (delta) => send({ event: "text", data: { delta } }),
        onToolStart: (name) => send({ event: "tool", data: { phase: "start", name } }),
        onToolEnd: (c) => send({ event: "tool", data: { phase: "end", ...c } }),
      });
      convo.messages = result.messages;
      convo.turns++;
      convo.lastInputTokens = result.usage.contextTokens;
      mergeSources(convo.sources, turnSources);
      trimConversation(convo);
      send({ event: "done", data: {
        mode: "claude", model: foundryConfig.assistant.model, conversationId: convo.id, turns: convo.turns,
        usage: result.usage, sources: convo.sources, toolCalls: result.toolCalls, draft: result.draft, accessDraft: result.accessDraft,
      } });
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ask-foundry] chat turn failed, keyword fallback: ${msg}`);
      send({ event: "error", data: { message: `Claude was unavailable (${msg.slice(0, 120)}); this is the keyword answer.` } });
      keywordAnswer();
    }
  };

  // Run the producer without blocking the Response; errors end the stream cleanly.
  work().catch((e) => fail(e instanceof Error ? e.message : String(e), { conversationId: convo.id }));
  return new Response(stream, { headers: SSE_HEADERS });
}

function mergeSources(into: Source[], add: Source[]): void {
  const seen = new Set(into.map((s) => s.kind + s.id));
  for (const s of add) if (!seen.has(s.kind + s.id)) { seen.add(s.kind + s.id); into.push(s); }
}
