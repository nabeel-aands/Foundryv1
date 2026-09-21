/**
 * Conversation store and message budget for Ask Foundry chat mode, on the KV.
 * Locally that is a process-local map (exactly the old behaviour); on Vercel it is Redis,
 * because the next turn of a conversation lands on a different invocation. The browser
 * only ever holds the conversation ID.
 */
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { foundryConfig } from "@/lib/config";
import { getKV } from "../store";
import type { Source } from "./types";

export type Conversation = {
  id: string;
  personaId: string;
  snapshotFetchedAt: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  sources: Source[];
  /** user turns so far (for the 20-turn cap) */
  turns: number;
  /** input tokens reported by the last turn's usage, drives trimming */
  lastInputTokens: number;
  createdAt: number;
  touchedAt: number;
};

/** Idle expiry, re-armed on every save. Replaces the old sweep over an in-process map. */
const TTL_SECONDS = 30 * 60;

const convoKey = (id: string) => `ask:convo:${id}`;
/** One counter per persona per clock hour; the expiry does the forgetting. */
const budgetKey = (personaId: string) => `ask:budget:${personaId}:${Math.floor(Date.now() / 3_600_000)}`;

export async function getConversation(id: string | undefined): Promise<Conversation | undefined> {
  if (!id) return undefined;
  const c = await getKV().get<Conversation>(convoKey(id));
  if (!c) return undefined;
  c.touchedAt = Date.now();
  return c;
}

export function createConversation(personaId: string, snapshotFetchedAt: string): Conversation {
  return {
    id: randomUUID(), personaId, snapshotFetchedAt,
    messages: [], sources: [], turns: 0, lastInputTokens: 0,
    createdAt: Date.now(), touchedAt: Date.now(),
  };
}

/** Persist the conversation and re-arm its idle expiry. A new one only exists once saved. */
export async function saveConversation(c: Conversation): Promise<void> {
  c.touchedAt = Date.now();
  await getKV().set(convoKey(c.id), c, TTL_SECONDS);
}

export async function discardConversation(id: string): Promise<void> {
  await getKV().del(convoKey(id));
}

/** Rolling-hour message budget per persona. Returns false when the budget is spent. */
export async function takeMessageBudget(personaId: string): Promise<boolean> {
  const n = await getKV().incr(budgetKey(personaId), 3_600);
  return n <= foundryConfig.assistant.messagesPerHour;
}

/**
 * When the last turn reported more input tokens than the threshold, drop the oldest turns
 * after the first user message, keeping assistant tool_use / user tool_result pairs intact.
 * Messages alternate user/assistant, so removing whole messages in pairs from position 1
 * never splits a tool_use from its tool_result.
 */
export function trimConversation(c: Conversation): void {
  if (c.lastInputTokens <= foundryConfig.assistant.trimAtInputTokens) return;
  while (c.messages.length > 3 && c.lastInputTokens > foundryConfig.assistant.trimAtInputTokens) {
    // remove messages[1] and messages[2] (one assistant + one user round) after the first user message
    c.messages.splice(1, 2);
    c.lastInputTokens = Math.round(c.lastInputTokens * 0.8); // rough decay; corrected by the next turn's real usage
  }
}
