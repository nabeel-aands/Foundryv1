/**
 * Streamed chat transport for Ask Foundry. POST { conversationId?, message } → server-sent
 * events (text / tool / done / error). The persona always comes from the cookie, never the body.
 */
import { foundryConfig } from "@/lib/config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { assistantMode } from "@/lib/assistant";
import { askKeyword } from "@/lib/assistant/keyword";
import { createConversation, discardConversation, getConversation, saveConversation, takeMessageBudget, trimConversation } from "@/lib/assistant/conversations";
import { SSE_HEADERS, sseStream } from "@/lib/assistant/stream";
import type { Source } from "@/lib/assistant/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { conversationId?: string; message?: string };
  const message = String(body.message ?? "").trim();
  const data = await getData();
  const me = await getCurrentUser();
  const { stream, send, close } = sseStream();

  const fail = (msg: string, extra: Record<string, unknown> = {}) => {
    send({ event: "error", data: { message: msg } });
    send({ event: "done", data: { mode: assistantMode(), ...extra } });
    close();
  };

  if (!message) { fail("Say something first."); return new Response(stream, { headers: SSE_HEADERS }); }

  // Resolve the conversation before spending budget, so persona switches start clean.
  let convo = await getConversation(body.conversationId);
  if (convo && convo.personaId !== me.user.id) { await discardConversation(convo.id); convo = undefined; }
  if (!convo) convo = createConversation(me.user.id, data.fetchedAt);
  const conversation = convo;

  const work = async () => {
    if (conversation.turns >= foundryConfig.assistant.maxTurns) {
      fail(`This conversation reached its ${foundryConfig.assistant.maxTurns}-turn cap. Start a new conversation to continue.`, { conversationId: conversation.id, turns: conversation.turns });
      return;
    }
    if (!(await takeMessageBudget(me.user.id))) {
      fail(`You have sent ${foundryConfig.assistant.messagesPerHour} messages in the last hour. Take a short break and try again soon.`, { conversationId: conversation.id, turns: conversation.turns });
      return;
    }

    let userText = message;
    if (conversation.messages.length && conversation.snapshotFetchedAt !== data.fetchedAt) {
      userText = `(Note: the data snapshot was refreshed since the last turn; earlier counts may have changed.)\n\n${message}`;
      conversation.snapshotFetchedAt = data.fetchedAt;
    }

    const keywordAnswer = async () => {
      const r = askKeyword(data, me, message);
      send({ event: "text", data: { delta: r.answer } });
      mergeSources(conversation.sources, r.sources);
      conversation.turns++;
      await saveConversation(conversation);
      send({ event: "done", data: { mode: "keyword", conversationId: conversation.id, turns: conversation.turns, sources: conversation.sources, toolCalls: r.toolCalls } });
      close();
    };

    if (assistantMode() === "keyword") { await keywordAnswer(); return; }

    try {
      const { streamClaudeTurn } = await import("@/lib/assistant/claude");
      const turnSources: Source[] = [];
      const result = await streamClaudeTurn(data, me, conversation.messages, userText, turnSources, {
        onText: (delta) => send({ event: "text", data: { delta } }),
        onToolStart: (name) => send({ event: "tool", data: { phase: "start", name } }),
        onToolEnd: (c) => send({ event: "tool", data: { phase: "end", ...c } }),
      });
      conversation.messages = result.messages;
      conversation.turns++;
      conversation.lastInputTokens = result.usage.contextTokens;
      mergeSources(conversation.sources, turnSources);
      trimConversation(conversation);
      await saveConversation(conversation);
      send({ event: "done", data: {
        mode: "claude", model: foundryConfig.assistant.model, conversationId: conversation.id, turns: conversation.turns,
        usage: result.usage, sources: conversation.sources, toolCalls: result.toolCalls, draft: result.draft, accessDraft: result.accessDraft,
      } });
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ask-foundry] chat turn failed, keyword fallback: ${msg}`);
      send({ event: "error", data: { message: `Claude was unavailable (${msg.slice(0, 120)}); this is the keyword answer.` } });
      await keywordAnswer();
    }
  };

  // Run the producer without blocking the Response; errors end the stream cleanly.
  work().catch((e) => fail(e instanceof Error ? e.message : String(e), { conversationId: conversation.id }));
  return new Response(stream, { headers: SSE_HEADERS });
}

function mergeSources(into: Source[], add: Source[]): void {
  const seen = new Set(into.map((s) => s.kind + s.id));
  for (const s of add) if (!seen.has(s.kind + s.id)) { seen.add(s.kind + s.id); into.push(s); }
}
