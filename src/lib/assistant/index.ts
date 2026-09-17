import { foundryConfig } from "../../../foundry.config";
import type { CurrentUser } from "../persona";
import type { Data } from "../snapshot";
import { askKeyword } from "./keyword";
import type { AskResult } from "./types";

export type { AskResult } from "./types";

export function assistantMode(): "claude" | "keyword" {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "keyword";
}

type Cached = { at: number; result: AskResult };
const g = globalThis as unknown as { __askCache?: Map<string, Cached> };
const cache = (g.__askCache ??= new Map());

/** Answer a question for a persona. Cached per persona + question + snapshot so refreshes do not re-spend credits. */
export async function ask(data: Data, me: CurrentUser, question: string): Promise<AskResult> {
  const q = question.trim();
  if (!q) return { mode: assistantMode(), answer: "", sources: [], toolCalls: [] };
  const key = `${me.user.id}|${data.fetchedAt}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < foundryConfig.assistant.cacheMinutes * 60_000) return { ...hit.result, cached: true };

  let result: AskResult;
  if (assistantMode() === "claude") {
    try {
      const { askClaude } = await import("./claude");
      result = await askClaude(data, me, q);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ask-foundry] Claude failed, falling back to keyword mode: ${msg}`);
      result = { ...askKeyword(data, me, q), error: msg };
    }
  } else {
    result = askKeyword(data, me, q);
  }
  cache.set(key, { at: Date.now(), result });
  return result;
}
