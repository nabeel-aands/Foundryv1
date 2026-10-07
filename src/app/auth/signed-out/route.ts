/**
 * Shown after Sign out. A route handler rather than a page, like the sign-in and denial pages,
 * because the person has no session here and must not be sent through the app layout.
 *
 * Without it, signing out would land on Home, Home would send the person to the provider, and a
 * provider they are still signed in to (Google, for one) would approve silently: no visible sign out.
 */
import { foundryConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function GET(): Promise<Response> {
  // The account chooser stops a shared computer being signed straight back in.
  const href = "/auth/login?prompt=select_account";
  const label = "Sign in again";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Foundry · signed out</title>
<style>
  body { font: 16px/1.55 ui-sans-serif, system-ui, sans-serif; color: #1b1b1b; background: #faf9f7; margin: 0; }
  main { max-width: 26rem; margin: 14vh auto; padding: 0 1.5rem; }
  .mark { display: flex; align-items: center; gap: .5rem; font-weight: 600; letter-spacing: -.01em; }
  .mark i { width: 14px; height: 14px; border-radius: 3px; background: #f5b400; display: inline-block; }
  .mark span { margin-left: auto; font: 11px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; color: #8a857c; }
  h1 { font-size: 1.5rem; margin: 1.75rem 0 .5rem; }
  p { color: #555; margin: 0 0 1.75rem; }
  a.btn { display: block; text-align: center; text-decoration: none; background: #1b1b1b; color: #fff;
          font-weight: 600; padding: .8rem 1rem; border-radius: 6px; }
  a.btn:hover { background: #333; }
  small { display: block; margin-top: 1.75rem; font-size: 13px; color: #8a857c; }
</style></head>
<body><main>
  <div class="mark"><i aria-hidden></i>Foundry<span>${escape(foundryConfig.client.shortName)}</span></div>
  <h1>You're signed out</h1>
  <p>Your Foundry session has ended on this browser.</p>
  <a class="btn" href="${escape(href)}">${escape(label)}</a>
  <small>Signing out of Foundry does not sign you out of your identity provider. Close the browser if you are on a shared computer.</small>
</main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
