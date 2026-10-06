/**
 * The Terms and Privacy pages. Plain HTML from route handlers, like the sign-in and denial
 * pages, because Airtable's OAuth settings need public URLs and visitors have no session.
 * Wording describes what Foundry actually does; have your own legal team review it.
 */
import { foundryConfig } from "./config";
import { SESSION_TTL_SECONDS } from "./identity/session";

const { brand } = foundryConfig;
const UPDATED = brand.legal.updated;

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function page(title: string, body: string): Response {
  const org = escape(foundryConfig.client.name);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(brand.name)} · ${escape(title)}</title>
<style>
  body { font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; color: ${brand.colors.ink}; background: ${brand.colors.paper}; margin: 0; }
  main { max-width: 42rem; margin: 8vh auto; padding: 0 1.5rem 4rem; }
  .mark { display: flex; align-items: center; gap: .5rem; font-weight: 600; }
  .mark i { width: 14px; height: 14px; border-radius: 3px; background: ${brand.colors.accent}; display: inline-block; }
  h1 { font-size: 1.75rem; margin: 1.5rem 0 .25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .4rem; }
  p, li { color: #444; }
  .meta { color: #8a857c; font-size: 14px; }
  a { color: #1b1b1b; }
  footer { margin-top: 3rem; font-size: 14px; color: #8a857c; }
</style></head>
<body><main>
  <div class="mark">${brand.logo ? `<img src="${escape(brand.logo)}" alt="" height="20">` : "<i aria-hidden></i>"}${escape(brand.name)}</div>
  <h1>${escape(title)}</h1>
  <p class="meta">${org} · Last updated ${UPDATED}</p>
  ${body}
  <footer><a href="${escape(brand.legal.termsUrl || "/terms")}">Terms of service</a> · <a href="${escape(brand.legal.privacyUrl || "/privacy")}">Privacy policy</a> · <a href="/">Back to ${escape(brand.name)}</a></footer>
</main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export function termsPage(): Response {
  const org = escape(foundryConfig.client.name);
  return page("Terms of service", `
  <p>Foundry is an internal portal run by ${org} for people in its Airtable organisation. It helps you find what already exists, see the roadmap, vote on ideas and submit requests. By signing in you agree to these terms.</p>

  <h2>Who may use it</h2>
  <p>Foundry is for members of this organisation's Airtable account. Signing in with Airtable only proves who you are. Whether you can use Foundry, and what you see, is decided by your row in the organisation's Airtable Users table. If you are not listed, or your account is not active, you cannot sign in.</p>

  <h2>What you can do</h2>
  <ul>
    <li>Browse the Airtable Library, the Resources page and the roadmap.</li>
    <li>Upvote roadmap items and submit new requests. These are written to the organisation's Airtable base under your name.</li>
    <li>Ask Foundry questions. Its answers are suggestions based on the organisation's data. Check them before you act.</li>
  </ul>

  <h2>What you agree to</h2>
  <ul>
    <li>Use Foundry only for your work for this organisation.</li>
    <li>Do not put confidential information about customers, partners or colleagues into requests or questions unless the work requires it.</li>
    <li>Do not try to see data you have not been given, or to disrupt the service.</li>
    <li>Your requests and votes are visible to the administrators and, unless restricted, to other members.</li>
  </ul>

  <h2>Admins</h2>
  <p>Administrators can see additional information, including the whole Airtable estate and the people in it, so they can govern it.</p>

  <h2>Availability and changes</h2>
  <p>Foundry is provided as is, without a promise that it will always be available or error-free. Data shown comes from a copy refreshed on a schedule, so it can be a few minutes behind Airtable. We may change or withdraw features, and update these terms. Continued use means you accept the current version.</p>

  <h2>Contact</h2>
  <p>Questions go to the Foundry administrators at ${org}.</p>`);
}

export function privacyPage(): Response {
  const org = escape(foundryConfig.client.name);
  const hours = Math.round(SESSION_TTL_SECONDS / 3600);
  const ai = process.env.ANTHROPIC_API_KEY
    ? `<h2>Ask Foundry and AI</h2>
  <p>When you use Ask Foundry, your question and the library, dataset, resource and roadmap information it looks up are sent to Anthropic's Claude service to write an answer. Email addresses and record IDs are never included, and answers are filtered to remove them. Admins' questions can also include estate details such as base and workspace names. Conversations are kept in the service's short-term memory for about 30 minutes.</p>`
    : "";
  return page("Privacy policy", `
  <p>This explains what Foundry, run by ${org}, collects about you and why.</p>

  <h2>What we receive when you sign in</h2>
  <p>You sign in with your Airtable account. Foundry asks Airtable for one permission only: to read your email address. Airtable tells Foundry your Airtable user ID and email. Foundry uses them to find your row in the organisation's Airtable Users table. Foundry does not receive your password, and it cannot read or change your Airtable bases through your account.</p>
  <p>The access tokens Airtable issues for this step are discarded straight away and are never stored.</p>

  <h2>What we store</h2>
  <ul>
    <li><b>A session cookie</b> that keeps you signed in for ${hours} hours. It contains only an internal reference to your user record, and is signed so it cannot be altered.</li>
    <li><b>A short-lived sign-in cookie</b> that lasts about 10 minutes while you complete sign-in.</li>
    <li><b>Records you create:</b> requests, votes and access requests are written to the organisation's Airtable base, linked to your user record.</li>
    <li><b>A copy of organisation data</b> from Airtable (users, groups, workspaces, bases and interfaces, plus the library, resources and roadmap tables). It is used to decide what each person sees and is refreshed on a schedule.</li>
    <li><b>Server logs</b> that may include your Airtable user ID when a sign-in fails. They do not include your email address.</li>
  </ul>

  <h2>Who can see it</h2>
  <p>Other members see your name next to requests you submit. Administrators can see the organisation's user list, including names, email addresses and account types, in the governance console. Foundry does not sell your data or use it for advertising.</p>
  ${ai}
  <h2>Where it is processed</h2>
  <p>Foundry is hosted on Vercel and stores its data copy with Vercel's storage services. Airtable provides sign-in and the underlying data.</p>

  <h2>Your choices</h2>
  <p>You can sign out at any time, which clears the session cookie. You can revoke Foundry's access from the Integrations item of your Airtable account menu. To correct or remove your information, contact the Foundry administrators at ${org}. Records in the organisation's Airtable base are governed by the organisation's own Airtable policies.</p>

  <h2>Changes</h2>
  <p>We may update this policy and will change the date above when we do.</p>`);
}
