import type { Data } from "@/lib/snapshot";
import { Chip } from "./Chip";

export function ControlStrip({ data, demo }: { data: Data; demo: boolean }) {
  const t = new Date(data.fetchedAt);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 md:px-8 py-2 border-b border-line bg-card text-[12px] mono text-ink-2">
      <span className="flex items-center gap-2"><Chip kind="real" /> Users {data.counts.users} · Groups {data.counts.groups} · Workspaces {data.counts.workspaces} · Bases {data.counts.bases} · Interfaces {data.counts.interfaces} · Datasets {data.counts.verifiedDatasets}</span>
      <span className="text-muted">fetched from Airtable {t.toLocaleString()}</span>
      <span className="flex items-center gap-2"><Chip kind="seeded" /> Requests {data.counts.requests} · Votes {data.counts.votes}</span>
      {demo && <span className="ml-auto flex items-center gap-2"><Chip kind="warn">Demo mode</Chip> persona switcher on · loopback only</span>}
    </div>
  );
}
