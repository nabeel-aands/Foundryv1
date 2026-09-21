import { foundryConfig } from "@/lib/config";
import type { CurrentUser } from "../persona";
import type { Data } from "../snapshot";
import { getKV } from "../store";
import { askKeyword } from "./keyword";
import type { AskResult } from "./types";

export type { AskResult } from "./types";

export function assistantMode(): "claude" | "keyword" {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "keyword";
}

/** Answer a question for a persona. Cached per persona + question + snapshot so refreshes do not re-spend credits. */
export async function ask(data: Data, me: CurrentUser, question: string): Promise<AskResult> {
  const q = question.trim();
  if (!q) return { mode: assistantMode(), answer: "", sources: [], toolCalls: [] };
  const kv = getKV();
  // The snapshot stamp is in the key, so a refresh naturally misses rather than serving stale numbers.
  const key = `ask:answer:${me.user.id}|${data.fetchedAt}|${q.toLowerCase()}`;
  const hit = await kv.get<AskResult>(key);
  if (hit) return { ...hit, cached: true };

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
  await kv.set(key, result, foundryConfig.assistant.cacheMinutes * 60);
  return result;
}
