"use client";
import { useState, type ReactNode } from "react";

/** Reveals extra rows (children) on demand. The toggle sits after the visible rows, so "Show fewer" ends up at the bottom of the expanded list. */
export function ShowMoreRows({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && children}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="block w-full px-3 py-1.5 border-t border-line text-left text-ink-2 hover:bg-card-2">
        {open ? "Show fewer" : `Show ${count} more`}
      </button>
    </>
  );
}
