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
- Your authority is capped at recommending. You cannot grant access, submit requests or change data.`;

/** Strip anything that looks like an email or an Airtable record/user id, as a last line of defence. */
export function redact(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted]").replace(/\b(rec|usr|app|wsp|pbd|ugp)[A-Za-z0-9]{14,17}\b/g, "[id]");
}

function isHaiku(model: string) {
  return /haiku/i.test(model);
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
