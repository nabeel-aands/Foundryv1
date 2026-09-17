"use client";
/**
 * Polls /api/version every 15 seconds (visible tabs only) and refreshes the page when the
 * snapshot's fetchedAt changes, so webhook- or schedule-driven syncs reach the open page.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 15_000;

export function LiveRefresh({ initialFetchedAt }: { initialFetchedAt: string }) {
  const router = useRouter();
  const last = useRef(initialFetchedAt);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    last.current = initialFetchedAt;
  }, [initialFetchedAt]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { fetchedAt } = (await res.json()) as { fetchedAt: string | null };
        if (fetchedAt && fetchedAt !== last.current) {
          last.current = fetchedAt;
          setFlash(true);
          router.refresh();
          setTimeout(() => setFlash(false), 4000);
        }
      } catch {
        /* server briefly unreachable; try again next tick */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [router]);

  return flash ? <span className="chip chip-real !text-[11px]">Updated just now</span> : null;
}
