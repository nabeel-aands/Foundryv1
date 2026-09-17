/**
 * In-memory conversation store for Ask Foundry chat mode. Lives on globalThis so dev hot
 * reloads keep it; nothing is persisted. The browser only ever holds the conversation ID.
 */
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { foundryConfig } from "../../../foundry.config";
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

const TTL_MS = 30 * 60_000;

type Store = { conversations: Map<string, Conversation>; sent: Map<string, number[]> };
const g = globalThis as unknown as { __askConversations?: Store };
const store: Store = (g.__askConversations ??= { conversations: new Map(), sent: new Map() });

function sweep(): void {
  const now = Date.now();
  for (const [id, c] of store.conversations) if (now - c.touchedAt > TTL_MS) store.conversations.delete(id);
}

export function getConversation(id: string | undefined): Conversation | undefined {
  sweep();
  if (!id) return undefined;
  const c = store.conversations.get(id);
  if (c) c.touchedAt = Date.now();
  return c;
}

export function createConversation(personaId: string, snapshotFetchedAt: string): Conversation {
  sweep();
  const c: Conversation = {
    id: randomUUID(), personaId, snapshotFetchedAt,
    messages: [], sources: [], turns: 0, lastInputTokens: 0,
    createdAt: Date.now(), touchedAt: Date.now(),
  };
  store.conversations.set(c.id, c);
  return c;
}

export function discardConversation(id: string): void {
  store.conversations.delete(id);
}

/** Rolling-hour message budget per persona. Returns false when the budget is spent. */
export function takeMessageBudget(personaId: string): boolean {
  const now = Date.now();
  const cutoff = now - 60 * 60_000;
  const times = (store.sent.get(personaId) ?? []).filter((t) => t > cutoff);
  if (times.length >= foundryConfig.assistant.messagesPerHour) {
    store.sent.set(personaId, times);
    return false;
  }
  times.push(now);
  store.sent.set(personaId, times);
  return true;
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
