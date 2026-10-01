/**
 * The sign-in page for Airtable mode: one button, nothing else.
 *
 * A route handler rather than a page, for the same reason as /auth/denied — whoever lands
 * here has no session, so it must not go through the app layout that requires one. The
 * button is a GET link to /auth/login, which is what actually mints state and PKCE.
 *
 * OIDC mode has no page: /auth/login redirects straight to the company provider, as in v1.2.
 */
import { authMode } from "@/lib/identity";
import { foundryConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Only same-origin paths, so a crafted link cannot bounce someone off-site after login. */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request): Promise<Response> {
  const mode = authMode();
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (mode !== "airtable") {
    return Response.redirect(new URL(mode === "oidc" ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}` : "/", request.url), 302);
  }

  const href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Foundry · sign in</title>
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
  <h1>Sign in</h1>
  <p>Foundry uses your Airtable account. You will be asked to sign in to Airtable and allow Foundry to read your email address.</p>
  <a class="btn" href="${escape(href)}">Sign in with Airtable</a>
  <small>Access is decided by this organisation's Airtable Users table, not by Airtable itself.</small>
</main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
