import Anthropic from "@anthropic-ai/sdk";
import { foundryConfig } from "../../../foundry.config";
import type { CurrentUser } from "../persona";
import type { Data } from "../snapshot";
import { buildTools } from "./tools";
import type { AskResult, Source, ToolCall } from "./types";

const SYSTEM = `You are Ask Foundry, the assistant inside Foundry, an enterprise governance portal for an organisation's Airtable estate.
You answer questions like "what's available to me for X", "has this been built already", "who owns Y" and "what should I do next".

Rules:
- Only use the tools. Never invent bases, datasets, people or numbers. If the tools return nothing, say so plainly.
- Everything the tools return is already filtered to what this user may see. Do not speculate about what they cannot see beyond what find_locked returns.
- Prefer reuse: if something exists and the user can open it, say that first. If it exists but is locked, tell them to request access. Only then suggest a new request, using draft_request.
- Never output email addresses, record IDs, or URLs. Refer to people by display name only.
- Answer in plain prose with short bullet lists (lines starting with '- '). Two to six sentences plus bullets is the right length. No headings, no bold or other markdown emphasis.
- Your authority is capped at recommending. You cannot grant access, submit requests or change data.
- This is a single-turn answer. Do not ask the user follow-up questions; state the concrete next step instead (open X, request access to Y, or draft a request).`;

const SYSTEM_CHAT = SYSTEM.replace(
  "- This is a single-turn answer. Do not ask the user follow-up questions; state the concrete next step instead (open X, request access to Y, or draft a request).",
  "- This is an ongoing conversation. Keep answers short and build on earlier turns; the user can refine a drafted request over several turns before submitting it.",
);

/** Strip anything that looks like an email or an Airtable record/user id, as a last line of defence. */
export function redact(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted]").replace(/\b(rec|usr|app|wsp|pbd|ugp)[A-Za-z0-9]{14,17}\b/g, "[id]");
}

function isHaiku(model: string) {
  return /haiku/i.test(model);
}

export type TurnUsage = { inputTokens: number; outputTokens: number; cacheRead: number; iterations: number; ms: number; contextTokens: number };

export type TurnResult = {
  /** Full message history after this turn, including tool_use/tool_result blocks. */
  messages: Anthropic.Beta.BetaMessageParam[];
  text: string;
  usage: TurnUsage;
  toolCalls: ToolCall[];
  draft?: { title: string; description: string; useCase?: string };
  stopReason?: string;
};

export type TurnEmit = {
  onText: (delta: string) => void;
  onToolStart: (name: string) => void;
  onToolEnd: (call: ToolCall) => void;
};

function withCacheBreakpoint(messages: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.BetaMessageParam[] {
  // Strip stale breakpoints, then mark the last block of the last prior message so the whole
  // earlier conversation is a cached prefix on the next call.
  const clean = messages.map((m) => ({
    ...m,
    content: typeof m.content === "string"
      ? m.content
      : m.content.map((b) => { const { cache_control: _drop, ...rest } = b as unknown as { cache_control?: unknown } & Record<string, unknown>; return rest as unknown as typeof b; }),
  }));
  const last = clean[clean.length - 1];
  if (!last) return clean;
  if (typeof last.content === "string") last.content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
  else if (last.content.length) (last.content[last.content.length - 1] as { cache_control?: { type: "ephemeral" } }).cache_control = { type: "ephemeral" };
  return clean;
}

/**
 * One streamed chat turn. Appends the user message to `prior`, runs the tool loop, forwards
 * text deltas and tool events through `emit`, and returns the full history for the store.
 * Persona details go in the first user message only; the system prompt stays cacheable.
 */
export async function streamClaudeTurn(
  data: Data, me: CurrentUser, prior: Anthropic.Beta.BetaMessageParam[], userText: string,
  sources: Source[], emit: TurnEmit,
): Promise<TurnResult> {
  const cfg = foundryConfig.assistant;
  const client = new Anthropic();
  const toolCalls: ToolCall[] = [];
  const { tools } = buildTools(data, me, toolCalls, sources);
  const started = Date.now();

  const firstTurn = prior.length === 0;
  const userMessage: Anthropic.Beta.BetaMessageParam = {
    role: "user",
    content: firstTurn ? `User role: ${me.role}. Org unit: ${me.orgUnit.value}.\n\nQuestion: ${userText}` : userText,
  };
  const messages = [...withCacheBreakpoint(prior), userMessage];

  const runner = client.beta.messages.toolRunner({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    max_iterations: cfg.maxToolCalls + 1,
    stream: true,
    system: [{ type: "text", text: SYSTEM_CHAT, cache_control: { type: "ephemeral" } }],
    tools,
    ...(isHaiku(cfg.model) ? {} : { thinking: { type: "adaptive" as const }, output_config: { effort: cfg.effort } }),
    messages,
  });

  let inputTokens = 0, outputTokens = 0, cacheRead = 0, iterations = 0, contextTokens = 0;
  let flushed = 0;
  const flushTools = () => { while (flushed < toolCalls.length) emit.onToolEnd(toolCalls[flushed++]); };
  const texts: string[] = [];
  let stopReason: string | undefined;

  for await (const stream of runner) {
    flushTools(); // tools from the previous iteration ran just before this API call
    iterations++;
    for await (const ev of stream) {
      if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") emit.onToolStart(ev.content_block.name);
      else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) { texts.push(ev.delta.text); emit.onText(redact(ev.delta.text)); }
    }
    const msg = await stream.finalMessage();
    inputTokens += msg.usage.input_tokens;
    outputTokens += msg.usage.output_tokens;
    cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    contextTokens = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    stopReason = msg.stop_reason ?? undefined;
  }
  flushTools();

  const text = redact(texts.join("").trim() || (stopReason === "refusal" ? "The model declined to answer this question." : "No answer was produced."));
  const draftCall = [...toolCalls].reverse().find((c) => c.name === "draft_request");
  const usage: TurnUsage = { inputTokens, outputTokens, cacheRead, iterations, ms: Date.now() - started, contextTokens };
  console.log(`[ask-foundry] chat · ${cfg.model} · ${toolCalls.length} tool calls · in ${inputTokens} (cached ${cacheRead}) · out ${outputTokens} · ${usage.ms}ms · persona ${me.role}`);

  return {
    messages: runner.params.messages as Anthropic.Beta.BetaMessageParam[],
    text, usage, toolCalls, stopReason,
    draft: draftCall ? { title: String(draftCall.input.title ?? ""), description: String(draftCall.input.description ?? ""), useCase: draftCall.input.useCase ? String(draftCall.input.useCase) : undefined } : undefined,
  };
}

export async function askClaude(data: Data, me: CurrentUser, question: string): Promise<AskResult> {
  const cfg = foundryConfig.assistant;
  const client = new Anthropic();
  const toolCalls: ToolCall[] = [];
  const sources: Source[] = [];
  const { tools } = buildTools(data, me, toolCalls, sources);
  const started = Date.now();

  const runner = client.beta.messages.toolRunner({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    max_iterations: cfg.maxToolCalls + 1,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools,
    ...(isHaiku(cfg.model) ? {} : { thinking: { type: "adaptive" as const }, output_config: { effort: cfg.effort } }),
    messages: [{ role: "user", content: `User role: ${me.role}. Org unit: ${me.orgUnit.value}.\n\nQuestion: ${question}` }],
  });

  let inputTokens = 0, outputTokens = 0, cacheRead = 0, iterations = 0;
  let last: Anthropic.Beta.BetaMessage | undefined;
  for await (const message of runner) {
    iterations++;
    last = message;
    inputTokens += message.usage.input_tokens;
    outputTokens += message.usage.output_tokens;
    cacheRead += message.usage.cache_read_input_tokens ?? 0;
  }
  const final = last;
  const text = (final?.content ?? []).filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const draftCall = toolCalls.find((c) => c.name === "draft_request");
  const usage = { inputTokens, outputTokens, cacheRead, iterations, ms: Date.now() - started };
  console.log(`[ask-foundry] ${cfg.model} · ${toolCalls.length} tool calls · in ${inputTokens} (cached ${cacheRead}) · out ${outputTokens} · ${usage.ms}ms · persona ${me.role}`);

  return {
    mode: "claude",
    model: cfg.model,
    answer: redact(text || (final?.stop_reason === "refusal" ? "The model declined to answer this question." : "No answer was produced.")),
    sources,
    toolCalls,
    usage,
    draft: draftCall ? { title: String(draftCall.input.title ?? ""), description: String(draftCall.input.description ?? ""), useCase: draftCall.input.useCase ? String(draftCall.input.useCase) : undefined } : undefined,
  };
}
