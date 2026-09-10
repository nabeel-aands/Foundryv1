"use client";
import { useRef, useTransition } from "react";

export type PersonaOption = { id: string; label: string; detail: string };

export function PersonaSwitcher({
  current, quick, all, action,
}: { current: string; quick: PersonaOption[]; all: PersonaOption[]; action: (formData: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const quickIds = new Set(quick.map((q) => q.id));
  return (
    <form ref={form} action={(fd) => start(() => action(fd))} className="flex flex-col gap-1">
      <label htmlFor="persona" className="eyebrow !text-side-text/60">View as</label>
      <select
        id="persona" name="id" defaultValue={current} disabled={pending}
        onChange={() => form.current?.requestSubmit()}
        className="!bg-side-2 !border-side-2 !text-side-text !text-sm"
      >
        <optgroup label="Quick picks">
          {quick.map((o) => <option key={o.id} value={o.id}>{o.label} · {o.detail}</option>)}
        </optgroup>
        <optgroup label="All users">
          {all.filter((o) => !quickIds.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.label} · {o.detail}</option>)}
        </optgroup>
      </select>
      {pending && <span className="text-[11px] text-side-text/60 mono">switching…</span>}
    </form>
  );
}
