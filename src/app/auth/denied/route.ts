/**
 * The denial page. A route handler rather than a page on purpose: whoever lands here has
 * no session, so it must not go through the app layout that requires one.
 */
import { DENIAL_TEXT, type DenialReason } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTRA: Record<string, string> = {
  expired: "That sign-in attempt timed out or was started in another browser. Try again.",
  provider: "Foundry could not complete the exchange with your identity provider. If this keeps happening, tell whoever runs the deployment.",
};

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function GET(request: Request): Promise<Response> {
  const reason = new URL(request.url).searchParams.get("reason") ?? "not-found";
  const text = EXTRA[reason] ?? DENIAL_TEXT[reason as DenialReason] ?? DENIAL_TEXT["not-found"];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Foundry · cannot sign you in</title>
<style>
  body { font: 16px/1.55 ui-sans-serif, system-ui, sans-serif; color: #1b1b1b; background: #faf9f7; margin: 0; }
  main { max-width: 34rem; margin: 12vh auto; padding: 0 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
  p { color: #555; }
  code { font: 13px ui-monospace, monospace; background: #efece7; padding: .1rem .3rem; border-radius: 3px; }
  a { color: #1b1b1b; font-weight: 600; }
</style></head>
<body><main>
  <h1>Foundry cannot sign you in</h1>
  <p>${escape(text)}</p>
  <p><a href="/auth/login">Try again</a></p>
  <p style="margin-top:2rem;font-size:13px;color:#888">Reason code: <code>${escape(reason)}</code></p>
</main></body></html>`;
  return new Response(html, { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
