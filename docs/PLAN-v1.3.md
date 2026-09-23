# Foundry v1.3 build plan: sign in with Airtable

One feature. Written for an implementing agent working in this repo. Read `README.md`, `HANDOFF.md`,
`docs/PLAN-v1.2.md` (feature 2 built the identity seam this extends) and these files before changing
anything: `src/lib/identity/index.ts`, `src/lib/identity/oidc.ts`, `src/lib/identity/session.ts`,
`src/app/auth/*/route.ts`, `src/proxy.ts`, `src/app/api/health/route.ts`.

Local development, demo mode and OIDC must keep working exactly as today. This adds a third provider.
Run `npm run typecheck` after each step. Commit when done. Do not push unless told to.

---

## Goal
Users sign in with their Airtable account. Foundry receives their Airtable user ID from Airtable, looks
it up in the synced Users table, and admits them only if that row exists and is active. Identity comes
from Airtable; authorisation stays in Foundry's Users table. The provider is selected by env var so a
client can choose Airtable, corporate OIDC, or (locally only) demo personas.

## Airtable OAuth facts to build against
- Authorization endpoint: `https://airtable.com/oauth2/v1/authorize`. Token endpoint:
  `https://airtable.com/oauth2/v1/token`. Authorization Code flow, **PKCE required** (`S256`),
  `state` required. Token requests authenticate with HTTP Basic (`client_id:client_secret`) when a
  secret exists.
- Scope for identity: `user.email:read`. With it, `GET https://api.airtable.com/v0/meta/whoami`
  returns `{ id: "usr…", email, scopes }`. Without it only `id` is returned.
- Redirect URIs are exact-match and registered in the integration; `http://127.0.0.1:3000/auth/callback`
  is allowed for local use. Register the production and staging URLs there too.
- Access tokens are short-lived with a refresh token. Foundry needs the token only for `whoami`, so it
  discards both tokens after the lookup and never stores them.
- The client's Airtable admin may block third-party OAuth integrations org-wide or require an allowlist;
  document this as a client prerequisite.

## Environment variables
```
AUTH_PROVIDER=airtable            # airtable | oidc | (unset = demo if allowed, else open)
AIRTABLE_OAUTH_CLIENT_ID=
AIRTABLE_OAUTH_CLIENT_SECRET=
APP_URL=http://127.0.0.1:3000     # already used by OIDC; redirect is ${APP_URL}/auth/callback
SESSION_SECRET=                   # already used; required for any real sign-in
AUTH_ALLOW_EXTERNAL=0             # already used; 1 admits Account Type = external
```
`OIDC_ISSUER` continues to imply `AUTH_PROVIDER=oidc` when `AUTH_PROVIDER` is unset, so existing
deployments keep working. Setting `AUTH_PROVIDER=airtable` with `OIDC_ISSUER` also set is an error at boot.

## Design
- **New provider** `src/lib/identity/airtable.ts`:
  `buildAuthorizationRequest()` (generates state and PKCE verifier, returns the authorize URL and the
  values to store in the existing `foundry_oidc` login-state cookie, renamed `foundry_login` in
  `session.ts` with the old name accepted for one release), `completeCallback(url, verifier, state)`
  (validates state, exchanges the code with Basic auth and `code_verifier`, calls `whoami`, returns
  `{ airtableUserId, email }`, discards tokens), `logoutUrl()` returns undefined (Airtable has no
  end-session endpoint; logout is local).
- **Matching** in `src/lib/identity/index.ts`: add `matchUserById(data, airtableUserId)` using the Users
  `userId` field (the `usr…` value), falling back to `matchUser` by email only if no ID match and
  `AUTH_MATCH_EMAIL_FALLBACK=1` (default off). Deny reasons as today: `not_found`, `deactivated`,
  `external` (unless allowed). Log denials with the `usr…` ID, never the email.
- **Dispatch**: `authMode()` returns `"airtable" | "oidc" | "demo" | "open"`. `/auth/login` and
  `/auth/callback` call the provider that `authMode()` names; `/auth/logout` clears the session and, for
  Airtable, redirects to `/`. `src/proxy.ts` gates when mode is `airtable` or `oidc`. `assertAuthConfig()`
  requires both Airtable OAuth vars and `SESSION_SECRET` when `AUTH_PROVIDER=airtable`, and refuses demo
  mode alongside either provider.
- **UI**: the sign-in page (or the redirect from `/auth/login` when unauthenticated) shows a single
  "Sign in with Airtable" button in Airtable mode; the footer shows name, role, org unit and Sign out.
  Persona switcher renders only in demo mode, as now.
- **Health**: `mode` reports `airtable`; add `provider: { airtable: boolean, oidc: boolean }` so operators
  can see what is configured without exposing values.
- **Docs**: `.env.example` gains the variables with comments; `HANDOFF.md` gains a "Sign in with Airtable"
  section: how to register the integration (airtable.com/create/oauth → name, redirect URIs, scope
  `user.email:read`), where the client ID and secret appear, and the client-admin prerequisite about
  third-party integrations.
- **Tests** (vitest, add as a dev dependency with an exact pin if not present): unit tests for
  `matchUserById` covering active member, deactivated, unknown ID, external denied, external allowed;
  and for `completeCallback` with a stubbed token endpoint and stubbed `whoami` (inject `fetch`), covering
  state mismatch, token error, and success. No network in tests.

## Acceptance
- Local: `AUTH_PROVIDER=airtable`, `FOUNDRY_DEMO` unset, `npm run dev` → visiting `/` redirects to
  sign-in; "Sign in with Airtable" completes and lands on Home as the signed-in person with the role and
  scope the Users table gives them; `/api/health` shows `mode: "airtable"`.
- Sign in with an Airtable account that is not in the Users table → denial page, `not_found`; a
  deactivated user → `deactivated`; an external account with `AUTH_ALLOW_EXTERNAL` unset → `external`.
- Tampered `state` on the callback → rejected, no session.
- Sign out → session cleared; next visit requires sign-in again.
- `FOUNDRY_DEMO=1` together with `AUTH_PROVIDER=airtable` → process refuses to start with a clear message.
- `OIDC_ISSUER` set and `AUTH_PROVIDER` unset → behaves exactly as v1.2 (OIDC).
- Production build has no persona switcher in the DOM.
- `npm test` passes offline.

## Out of scope
Storing Airtable tokens for later API calls on the user's behalf; per-login membership re-check against
the Enterprise API; account linking between OIDC and Airtable identities.
