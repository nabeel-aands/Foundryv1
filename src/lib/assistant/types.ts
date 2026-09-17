export type Source = { kind: "base" | "interface" | "dataset" | "request" | "workspace"; id: string; title: string; subtitle: string; inScope: boolean; href?: string };

export type ToolCall = { name: string; input: Record<string, unknown>; resultCount: number; ms: number };

export type AskResult = {
  mode: "claude" | "keyword";
  model?: string;
  answer: string;
  sources: Source[];
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number; cacheRead: number; iterations: number; ms: number };
  draft?: { title: string; description: string; useCase?: string };
  error?: string;
  cached?: boolean;
};
