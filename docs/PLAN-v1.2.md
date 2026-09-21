# Foundry v1.2 build plan: deployable on Vercel

Three features, in this order. Written for an implementing agent working in this repo. Read
`README.md`, `HANDOFF.md`, `docs/PLAN-v1.1.md` (its rules block applies here too) and the files named
under each feature before changing anything. Local development must keep working exactly as today
(`npm run dev` with files under `data/`); Vercel is an additional target, not a replacement.

Stores chosen for Vercel: **Vercel Blob** for the snapshot, schema and webhook state; **Upstash Redis**
(Vercel Marketplace integration) for conversations, rate limits and the sync lock. No database in v1.2.

Run `npm run typecheck` after each step. Commit per feature. Do not push unless told to.

---

## 1. Vercel readiness: Store interface, cron routes, health

### Goal
The app runs on Vercel, where there is no persistent disk and no background process, without changing
behaviour on a laptop.

### Design
- **Store interface** in `src/lib/store.ts`:
  ```ts
  interface Store {
    getJson<T>(key: string): Promise<T | undefined>;
    putJson(key: string, value: unknown): Promise<void>;
    stat(key: string): Promise<{ updatedAt: string } | undefined>;
  }
  interface KV {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    incr(key: string, ttlSeconds?: number): Promise<number>;
    acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
    releaseLock(key: string): Promise<void>;
  }
  ```
  Keys: `snapshot`, `schema`, `webhook`. Implementations: `FileStore` (today's `data/` files, unchanged
  layout), `BlobStore` (`@vercel/blob`, private access, one blob per key, overwrite in place), `MemoryKV`
  (today's `globalThis` maps), `UpstashKV` (`@upstash/redis`). Selection in `src/lib/store.ts`:
  `BLOB_READ_WRITE_TOKEN` present → BlobStore, else FileStore. KV: `REDIS_URL` present → `RedisKV`
  (standard `redis` client, `rediss://` URL; this is what the Vercel Marketplace Redis integration
  provides), else `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` present → `UpstashKV`
  (`@upstash/redis`), else MemoryKV. Export `getStore()` and `getKV()` singletons. On Vercel, create the
  Redis client lazily and reuse it across invocations via `globalThis`.
- **Replace direct fs use** in `src/lib/sync.ts`, `src/lib/snapshot.ts`, `src/lib/schema.ts`,
  `src/lib/worker.ts`, `scripts/webhook.ts` with the store. The snapshot cache in `snapshot.ts` keys on
  `stat().updatedAt` instead of file mtime. Loading becomes async: `getData()` returns a Promise; update
  every caller (pages, actions, tools, scripts). Keep a process-level cache so a request reads Blob at most
  once per snapshot version.
- **Conversations and rate limits** (`src/lib/assistant/conversations.ts`, `src/lib/assistant/index.ts`)
  move onto `KV` with the existing TTLs (conversation 30 min, answer cache 10 min, hourly counter).
- **Worker split.** Extract from `src/lib/worker.ts` two pure functions: `fullSync()` and
  `drainWebhook()`. Both take the KV lock `sync:lock` (TTL 120 s) and skip with a log line if held.
  Local: `src/instrumentation.ts` keeps starting the timers (unchanged behaviour). Vercel: two route
  handlers, `src/app/api/jobs/sync/route.ts` and `src/app/api/jobs/drain/route.ts`, Node runtime,
  `maxDuration = 60`, GET, require header `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron sends it
  automatically). Add `vercel.json`:
  ```json
  { "crons": [
    { "path": "/api/jobs/sync",  "schedule": "*/15 * * * *" },
    { "path": "/api/jobs/drain", "schedule": "* * * * *" } ] }
  ```
  When `VERCEL=1`, `instrumentation.ts` must not start timers.
- **Webhook state from env.** If `AIRTABLE_WEBHOOK_ID` and `AIRTABLE_WEBHOOK_SECRET` are set they win
  over stored state; the cursor lives in the store under `webhook`. `scripts/webhook.ts create --url`
  prints the two values with a note to paste them into Vercel env vars.
- **Push endpoint** `src/app/api/webhooks/airtable/route.ts`: verify HMAC with the env secret, then call
  `drainWebhook()`; respond 200 within a few seconds; Node runtime.
- **Health** `src/app/api/health/route.ts`: `{ ok, fetchedAt, ageSeconds, counts, webhook: { id, expiresAt, expired }, store: "file"|"blob", kv: "memory"|"redis"|"upstash", mode: "demo"|"oidc"|"open" }`. No Airtable call.
- **Node runtime** declared (`export const runtime = "nodejs"`) on every route handler.
- **Boot without snapshot.** On Vercel the first deploy has an empty store: the layout's "needs a snapshot"
  screen shows a button (admin or CRON_SECRET) that calls `/api/jobs/sync`, and `HANDOFF.md` documents
  hitting it once with curl.
- **Client config path.** `foundry.config.ts` stays, but `src/lib/config.ts` exports `getConfig()` reading
  `FOUNDRY_CLIENT` to import `clients/<slug>/foundry.config.ts` when set, else the root file. Create
  `clients/aands/foundry.config.ts` as a copy of today's config.
- Dependencies: `@vercel/blob`, `redis` (node-redis v5), `@upstash/redis`. Pin exact versions.

### Acceptance
- Laptop: `npm run sync`, `npm run dev`, votes, chat and webhook polling all behave as before; `data/` files still written.
- With `BLOB_READ_WRITE_TOKEN` and Upstash vars set locally (from a test Vercel project), `npm run sync` writes to Blob, `npm run dev` serves from it, and `/api/health` reports `store: blob, kv: redis` (or `upstash`).
- `curl -H "Authorization: Bearer $CRON_SECRET" /api/jobs/sync` runs a full sync; without the header it returns 401.
- Two concurrent `/api/jobs/drain` calls: one runs, one logs "lock held".
- `vercel build` succeeds locally.

---

## 2. OIDC login

### Goal
Staff sign in with the company identity provider. Foundry matches the verified email to the synced Users
table; that row is the session. The persona switcher is compiled out unless demo mode on loopback.

### Design
- Library: `openid-client` v6 (exact pin). Authorization Code with PKCE. Config from env: `OIDC_ISSUER`,
  `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `APP_URL` (for the redirect `${APP_URL}/auth/callback`).
- `src/lib/identity/` with an `Identity` interface: `resolve(cookies) → CurrentUser | null`. Two providers:
  `PersonaIdentity` (today's cookie; only when `FOUNDRY_DEMO=1` AND `NODE_ENV !== "production"` AND
  `HOST` is loopback AND no `OIDC_ISSUER`; otherwise it throws at boot) and `OidcIdentity`.
- Routes: `/auth/login` (builds the authorization URL, stores state + PKCE verifier in an HTTP-only cookie
  for 10 minutes, redirects), `/auth/callback` (exchanges the code, validates the ID token, reads `email`
  and `email_verified`), `/auth/logout` (clears the session and redirects to the provider's end-session URL
  when advertised).
- Session: signed, HTTP-only, `SameSite=Lax` cookie `foundry_session` holding `{ userRecordId, exp }`,
  signed with `SESSION_SECRET` (HMAC-SHA256), 8-hour lifetime, refreshed on activity.
- Matching: lower-case the email, look up `data.userByEmail`. Deny with a plain page if: not found,
  Status not active, or Account Type external and `AUTH_ALLOW_EXTERNAL` is not `1`. Log denials without
  the email.
- `getCurrentUser()` in `src/lib/persona.ts` delegates to the active `Identity`; everything downstream is
  unchanged. Unauthenticated requests redirect to `/auth/login` except `/api/health`, `/api/jobs/*`,
  `/api/webhooks/*` and `/auth/*`.
- Layout: footer shows name, role, org unit and a Sign out link in OIDC mode; the switcher only in demo mode.
- `.env.example` gains the OIDC and session variables with comments.

### Acceptance
- Local with an OIDC test app (Okta developer tenant or Entra test app): sign in, land on Home as yourself with the right role and scope; sign out works.
- An email not in Users, or deactivated, gets the denial page.
- `FOUNDRY_DEMO=1` together with `OIDC_ISSUER` set → the process refuses to start with a clear message.
- Production build with no `FOUNDRY_DEMO` → no persona switcher in the DOM.

---

## 3. Activity Log

### Goal
Every governance write records who did what, in Airtable, because Airtable's own history attributes token
writes to the service account.

### Airtable table (created by hand): **Activity Log**
| Field | Type |
|---|---|
| Event | Autonumber (primary) |
| Event type | Single select: request.submit, vote.cast, vote.retract, access.request, access.approve, access.deny, sync.run |
| Actor | Link to Airtable Users |
| Target table | Single line text |
| Target record | Single line text |
| Summary | Long text |
| Channel | Single select: Foundry web, Cron, Webhook |
| At | Created time |

### Design
- Aliases and types for `activityLog` in `src/lib/fields.ts` and `src/lib/snapshot.ts`; optional table (`hasTable`), the app runs without it and logs a warning once.
- `src/lib/activity.ts`: `logActivity({ type, actorRecordId?, targetTable, targetRecordId, summary, channel })`. Fire-and-forget after the primary write succeeds; failures log, never block the user action.
- Call it from `castVote`, `retractVote`, `createRequest`, `requestAccess`, `decideAccess`, and from `fullSync` with `sync.run` (actor empty, channel Cron or Webhook).
- Governance console: a "Recent activity" card listing the last 15 events with actor name and summary.
- Seed: none. Wipe: never touches this table.

### Acceptance
- Cast a vote → a row appears in Activity Log with your persona as Actor within a second.
- Approve an access request → `access.approve` row names the approver.
- Delete the table → app still works, one warning in the log.

---

## Out of scope for v1.2
Database mirror, Enterprise API grants, onboarding CLI, doctor command, Applications registry, tests.
