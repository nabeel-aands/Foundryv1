"use client";
import { useEffect, useRef, type ComponentProps } from "react";
import Link from "next/link";

function scroller(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

const HOLD_MS = 2500;

/**
 * A Link that keeps itself where it was on screen after the navigation re-renders the page.
 * Opening or closing a panel elsewhere changes the content height; without this, the card
 * you just clicked slides away from under the pointer. After a click it re-anchors on every
 * layout change for a short while, and stops as soon as the user scrolls.
 */
export function AnchoredLink(props: ComponentProps<typeof Link>) {
  const ref = useRef<HTMLAnchorElement>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const hold = () => {
    stop.current?.();
    const el = ref.current;
    if (!el) return;
    const target = el.getBoundingClientRect().top;
    const box = scroller(el);
    const content = box?.firstElementChild as HTMLElement | undefined;
    // If the page gets shorter, the browser would clamp the scroll position and move the card.
    // Keep the old height until the user scrolls again.
    if (content) content.style.minHeight = `${content.offsetHeight}px`;
    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      const delta = ref.current.getBoundingClientRect().top - target;
      if (Math.abs(delta) < 1) return;
      if (box) box.scrollTop += delta; else window.scrollBy(0, delta);
    });
    ro.observe(content ?? document.body);
    const events = ["wheel", "touchmove", "keydown"] as const;
    const done = () => {
      ro.disconnect();
      clearTimeout(t);
      if (content) content.style.minHeight = "";
      for (const ev of events) window.removeEventListener(ev, done);
      stop.current = null;
    };
    const t = setTimeout(() => ro.disconnect(), HOLD_MS);
    for (const ev of events) window.addEventListener(ev, done, { once: true });
    stop.current = done;
  };

  return (
    <Link
      {...props}
      scroll={false}
      ref={ref}
      onClick={(e) => { hold(); props.onClick?.(e); }}
    />
  );
}
