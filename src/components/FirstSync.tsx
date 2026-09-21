"use client";
import { useState } from "react";

/**
 * First-run bootstrap. On Vercel the very first deploy has an empty store and no way to run
 * `npm run sync`, so this posts the CRON_SECRET to /api/jobs/sync once. The secret is typed
 * here and sent straight to the job route; it is never stored.
 */
export function FirstSync() {
  const [secret, setSecret] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setState("running");
    setMessage("Pulling every table from Airtable. This takes about ten seconds.");
    try {
      const res = await fetch("/api/jobs/sync", { headers: { Authorization: `Bearer ${secret.trim()}` } });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; ran?: boolean };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `The job route answered ${res.status}.`);
      setState("done");
      setMessage(body.ran ? "Snapshot written. Reloading…" : "A sync was already running; reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-6">
      <label htmlFor="cron-secret" className="eyebrow">CRON_SECRET</label>
      <div className="flex gap-2 mt-1">
        <input
          id="cron-secret" type="password" value={secret} autoComplete="off"
          onChange={(e) => setSecret(e.target.value)}
          placeholder="the value you set in the project's environment variables"
          className="flex-1"
        />
        <button className="btn btn-primary" onClick={run} disabled={!secret.trim() || state === "running" || state === "done"}>
          {state === "running" ? "Syncing…" : "Run first sync"}
        </button>
      </div>
      {message && <p className={`mt-2 text-sm ${state === "error" ? "text-red-700" : "text-ink-2"}`}>{message}</p>}
    </div>
  );
}
