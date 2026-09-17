/**
 * Server-sent-event encoding helpers for the /api/ask chat transport.
 * Frames: `text` (delta), `tool` (start/end of a tool call), `done` (turn summary), `error`.
 */

export type SseEvent =
  | { event: "text"; data: { delta: string } }
  | { event: "tool"; data: { phase: "start"; name: string } | { phase: "end"; name: string; input: Record<string, unknown>; resultCount: number; ms: number } }
  | { event: "done"; data: Record<string, unknown> }
  | { event: "error"; data: { message: string } };

const encoder = new TextEncoder();

export function encodeSse(e: SseEvent): Uint8Array {
  return encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
}

/** A ReadableStream the route handler returns, with a push/close interface for the producer. */
export function sseStream(): { stream: ReadableStream<Uint8Array>; send: (e: SseEvent) => void; close: () => void } {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { closed = true; },
  });
  return {
    stream,
    send: (e) => { if (!closed) try { controller.enqueue(encodeSse(e)); } catch { closed = true; } },
    close: () => { if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } } },
  };
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;
