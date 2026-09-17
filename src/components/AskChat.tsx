"use client";
/**
 * Chat mode for Ask Foundry. Streams /api/ask server-sent events into a message list,
 * shows tool chips while a turn runs, and accumulates sources in the right rail.
 * The server only ever knows the conversation by its ID; the persona comes from the cookie.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chip } from "./Chip";

type Source = { kind: string; id: string; title: string; subtitle: string; inScope: boolean; href?: string };
type ToolChip = { name: string; input?: Record<string, unknown>; resultCount?: number; ms?: number; running: boolean };
type Draft = { title: string; description: string; useCase?: string };
type Msg = { role: "user" | "assistant"; text: string; tools: ToolChip[]; error?: string; draft?: Draft };
type Usage = { inputTokens: number; outputTokens: number; cacheRead: number; iterations: number; ms: number };

export type AskChatProps = {
  personaId: string;
  mode: "claude" | "keyword";
  model: string;
  starters: string[];
  scope: { basesInScope: number; basesInEstate: number; datasets: number; visibleRequests: number; hiddenRequests: number; role: string; orgUnit: string; groups: string[]; external: boolean };
};

/** Render **bold** and `code` spans from model text without a markdown library. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function AssistantText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        return isList
          ? <ul key={i} className="list-disc pl-5 my-2 flex flex-col gap-1">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>)}</ul>
          : <p key={i} className="my-2 first:mt-0 last:mb-0">{inline(para)}</p>;
      })}
    </>
  );
}

/** Minimal SSE parser over a fetch body. Calls back per event. */
async function readSse(res: Response, onEvent: (event: string, data: Record<string, unknown>) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message", data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) { try { onEvent(event, JSON.parse(data)); } catch { /* skip malformed frame */ } }
    }
  }
}

export function AskChat({ personaId, mode, model, starters, scope }: AskChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [turns, setTurns] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [lastMode, setLastMode] = useState<"claude" | "keyword">(mode);
  const conversationId = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const lastPersona = useRef(personaId);

  const reset = () => {
    conversationId.current = undefined;
    setMessages([]); setSources([]); setTurns(0); setTotalTokens(0); setLastMode(mode);
  };

  // A persona switch re-renders the layout with a new prop; the chat must not leak scope across it.
  useEffect(() => {
    if (lastPersona.current !== personaId) { lastPersona.current = personaId; reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => ms.length ? [...ms.slice(0, -1), fn(ms[ms.length - 1])] : ms);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    setMessages((ms) => [...ms, { role: "user", text: message, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId.current, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readSse(res, (event, data) => {
        if (event === "text") patchLast((m) => ({ ...m, text: m.text + String(data.delta ?? "") }));
        else if (event === "tool") {
          patchLast((m) => {
            const tools = [...m.tools];
            if (data.phase === "start") tools.push({ name: String(data.name), running: true });
            else {
              const i = tools.findIndex((t) => t.running && t.name === data.name);
              const done: ToolChip = { name: String(data.name), input: data.input as Record<string, unknown>, resultCount: Number(data.resultCount ?? 0), ms: Number(data.ms ?? 0), running: false };
              if (i >= 0) tools[i] = done; else tools.push(done);
            }
            return { ...m, tools };
          });
        } else if (event === "error") patchLast((m) => ({ ...m, error: String(data.message ?? "Something went wrong.") }));
        else if (event === "done") {
          if (data.conversationId) conversationId.current = String(data.conversationId);
          if (typeof data.turns === "number") setTurns(data.turns);
          if (Array.isArray(data.sources)) setSources(data.sources as Source[]);
          if (data.mode === "claude" || data.mode === "keyword") setLastMode(data.mode);
          const u = data.usage as Usage | undefined;
          if (u) setTotalTokens((t) => t + u.inputTokens + u.outputTokens);
          const draft = data.draft as Draft | undefined;
          if (draft?.title) patchLast((m) => ({ ...m, draft }));
        }
      });
    } catch (e) {
      patchLast((m) => ({ ...m, error: `The request failed (${e instanceof Error ? e.message : String(e)}). Try again.` }));
    } finally {
      setBusy(false);
    }
  };

  const groups: [string, Source[]][] = [
    ["You can open", sources.filter((s) => s.inScope && (s.kind === "base" || s.kind === "interface"))],
    ["You can link", sources.filter((s) => s.kind === "dataset")],
    ["Related proposals", sources.filter((s) => s.kind === "request")],
    ["People and workspaces", sources.filter((s) => s.kind === "workspace")],
    ["Exists, access required", sources.filter((s) => !s.inScope)],
  ];

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
      <div className="flex flex-col">
        <div ref={listRef} className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {messages.map((m, i) => m.role === "user" ? (
            <div key={i} className="self-end max-w-[85%] card !bg-amber-soft px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.text}</div>
          ) : (
            <div key={i} className="self-start max-w-full w-fit min-w-[40%]">
              {m.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {m.tools.map((t, j) => (
                    <span key={j} className={`chip chip-neutral !text-[11px] mono ${t.running ? "animate-pulse" : ""}`}>
                      {t.name}{t.running ? "…" : ` · ${t.resultCount} result${t.resultCount === 1 ? "" : "s"}`}
                    </span>
                  ))}
                </div>
              )}
              <div className="card px-4 py-3 text-[15px] leading-relaxed">
                {m.text ? <AssistantText text={m.text} /> : !m.error && <span className="text-muted text-sm animate-pulse">{m.tools.some((t) => t.running) ? "Looking things up…" : "Thinking…"}</span>}
                {m.error && <div className="mt-2 text-xs text-model">{m.error}</div>}
              </div>
              {m.draft && (
                <div className="card p-4 !bg-lilac mt-2">
                  <div className="eyebrow">Drafted for you · not submitted</div>
                  <div className="font-semibold mt-1">{m.draft.title}</div>
                  <p className="text-sm text-ink-2 mt-1">{m.draft.description}</p>
                  <Link href={`/build?step=4&path=Team+Build&q=${encodeURIComponent(m.draft.description)}`} className="btn !mt-3 !text-xs">Review and submit in the wizard →</Link>
                </div>
              )}
            </div>
          ))}
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 text-xs mb-3">
            {starters.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="chip chip-neutral !py-1.5 !px-2.5 !text-[11px] hover:bg-line cursor-pointer">{s}</button>
            ))}
          </div>
        )}

        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <textarea
            value={input} rows={2} aria-label="Message Ask Foundry"
            placeholder={messages.length ? "Refine, or ask a follow-up… (Enter to send)" : "e.g. what can I use for supplier onboarding? who owns the food price data?"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="flex-1"
          />
          <div className="flex flex-col gap-1.5">
            <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>{busy ? "…" : "Send"}</button>
            {messages.length > 0 && <button className="btn btn-ghost !text-xs" type="button" onClick={reset} disabled={busy}>New conversation</button>}
          </div>
        </form>
      </div>

      <aside className="card p-4 text-sm h-fit">
        <div className="eyebrow">Answering with</div>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="card p-2.5"><b>{scope.basesInScope}</b> bases in your scope<div className="text-xs text-muted">of {scope.basesInEstate} in the estate</div></li>
          <li className="card p-2.5"><b>{scope.datasets}</b> verified datasets<div className="text-xs text-muted">schema and steward only</div></li>
          <li className="card p-2.5"><b>{scope.visibleRequests}</b> roadmap items<div className="text-xs text-muted">{scope.hiddenRequests > 0 ? "excluding NDA-flagged items" : "none hidden from you"}</div></li>
        </ul>
        <div className="eyebrow mt-4">Your scope</div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-muted">Role</dt><dd>{scope.role}</dd><dt className="text-muted">Org unit</dt><dd>{scope.orgUnit}</dd><dt className="text-muted">Groups</dt><dd>{scope.groups.join(", ") || "none"}</dd><dt className="text-muted">Account</dt><dd>{scope.external ? "external" : "member"}</dd></dl>

        {sources.length > 0 && <div className="eyebrow mt-4">Sources so far</div>}
        {groups.map(([title, list]) => list.length > 0 && (
          <section key={title} className="mt-2">
            <h2 className="font-semibold text-xs">{title}</h2>
            <ul className="mt-1 flex flex-col gap-1.5">
              {list.map((s) => (
                <li key={s.kind + s.id} className="card p-2 flex items-center gap-2">
                  <Chip kind={s.inScope ? (s.kind === "dataset" ? "real" : "neutral") : "locked"}>{s.inScope ? s.kind : "locked"}</Chip>
                  <div className="min-w-0 flex-1"><div className="text-xs font-medium truncate">{s.title}</div><div className="text-[11px] text-muted truncate">{s.subtitle}</div></div>
                  {s.href && s.inScope && (s.href.startsWith("/") ? <Link className="text-xs underline" href={s.href}>Open</Link> : <a className="text-xs underline" href={s.href} target="_blank" rel="noreferrer">Open ↗</a>)}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted mono">
          {lastMode === "claude" ? `Claude · ${model}` : "keyword mode · no model"} · {turns} turn{turns === 1 ? "" : "s"}{totalTokens > 0 ? ` · ${totalTokens.toLocaleString()} tokens` : ""}
        </div>
      </aside>
    </div>
  );
}
