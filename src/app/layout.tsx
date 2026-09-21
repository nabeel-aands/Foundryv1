import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "./globals.css";
import { foundryConfig } from "@/lib/config";
import { NavLinks } from "@/components/NavLinks";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { ControlStrip } from "@/components/ControlStrip";
import { FirstSync } from "@/components/FirstSync";
import { AccessDenied, getCurrentUser, NotSignedIn, quickPicks, type CurrentUser } from "@/lib/persona";
import { displayName, getData, hasSnapshot, type Data } from "@/lib/snapshot";
import { authMode, DENIAL_TEXT } from "@/lib/identity";
import { storeKind } from "@/lib/store";
import { setPersona } from "./actions";

export const metadata: Metadata = { title: "Foundry", description: "Enterprise governance for Airtable" };
export const dynamic = "force-dynamic";

function Bare({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <html lang="en"><body className="p-10 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </body></html>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSnapshot())) {
    const remote = storeKind() === "blob";
    return (
      <Bare title="Foundry needs a snapshot">
        {remote ? (
          <>
            <p className="mt-2 text-ink-2">
              This deployment has an empty Blob store. Run the first sync once and Foundry takes over from the crons in
              <code className="mono"> vercel.json</code>.
            </p>
            <FirstSync />
            <p className="mt-4 text-xs text-muted">
              Or from a terminal: <code className="mono">curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://your-host/api/jobs/sync</code>
            </p>
          </>
        ) : (
          <p className="mt-2 text-ink-2">Run <code className="mono">npm run sync</code> with your <code className="mono">.env</code> filled in, then reload.</p>
        )}
      </Bare>
    );
  }

  const data = await getData();
  let me: CurrentUser;
  try {
    me = await getCurrentUser();
  } catch (e) {
    if (e instanceof NotSignedIn) redirect("/auth/login");
    if (e instanceof AccessDenied) {
      return (
        <Bare title="Foundry cannot sign you in">
          <p className="mt-2 text-ink-2">{DENIAL_TEXT[e.reason]}</p>
          <p className="mt-4"><a className="btn" href="/auth/logout">Sign out and try another account</a></p>
        </Bare>
      );
    }
    throw e;
  }

  const mode = authMode();
  const demo = mode === "demo";
  const toOpt = (u: Data["users"][number]) => ({ id: u.id, label: displayName(u), detail: u.admin ? "admin" : (u.accountType ?? "member").toLowerCase() });
  const nav = [
    { href: "/", label: "Home" },
    { href: "/build", label: "Build something" },
    { href: "/library", label: "Airtable library" },
    { href: "/roadmap", label: "Roadmap" },
    { href: "/resources", label: "Resources" },
    { href: "/ask", label: "Ask Foundry" },
  ];
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen md:grid md:grid-cols-[236px_minmax(0,1fr)]">
          <aside className="bg-side text-side-text flex flex-col md:sticky md:top-0 md:h-screen">
            <div className="px-4 py-4 flex items-center gap-2 border-b border-side-2">
              <span className="w-3.5 h-3.5 rounded-[3px] bg-amber inline-block" aria-hidden />
              <span className="font-semibold text-white tracking-tight">Foundry</span>
              <span className="ml-auto eyebrow !text-side-text/60">{foundryConfig.client.shortName}</span>
            </div>
            <nav className="px-3 py-3 md:flex-1" aria-label="Primary">
              <NavLinks items={nav} />
              {me.isAdmin && (
                <div className="mt-4">
                  <div className="eyebrow !text-side-text/50 px-3 mb-1">Admin</div>
                  <NavLinks items={[{ href: "/admin", label: "Governance console" }, { href: "/admin/access", label: "Access requests" }]} />
                </div>
              )}
            </nav>
            <div className="px-4 py-4 border-t border-side-2 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-amber text-ink grid place-items-center text-xs font-bold">{me.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{me.name}</div>
                  <div className="text-[11px] mono text-side-text/70 truncate" title={`org unit source: ${me.orgUnit.source}`}>{me.role} · {me.orgUnit.value}{me.external ? " · external" : ""}</div>
                </div>
              </div>
              {/* The switcher is compiled in only for demo mode; signed-in deployments get a sign-out link. */}
              {demo && <PersonaSwitcher current={me.user.id} quick={quickPicks(data).map(toOpt)} all={data.users.filter((u) => (u.status ?? "").toLowerCase() === "active").sort((a, b) => displayName(a).localeCompare(displayName(b))).map(toOpt)} action={setPersona} />}
              {mode === "oidc" && <a href="/auth/logout" className="text-[11px] mono text-side-text/70 hover:text-white">Sign out</a>}
            </div>
          </aside>
          <div className="min-w-0 flex flex-col">
            <ControlStrip data={data} demo={demo} />
            <main className="px-4 md:px-8 py-6 md:py-8 flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
