# Foundry v1.1 build plan

Three features, in this order. Written for an implementing agent working in this repo. Read
`README.md`, `HANDOFF.md` and the files named under each feature before changing anything.
Do not add a database; everything here works on the JSON snapshot in `data/`.

Rules that apply to all three (they are in `README.md` as well):

- No page render calls Airtable. Only the sync worker and Server Actions or route handlers do.
- Never write to a synced table or field. Foundry writes only to its own tables.
- Links are written as record-ID arrays, never names, never with `typecast`.
- The actor is always derived server-side from the persona cookie (`getCurrentUser()`), never from a form field or request body.
- Field access goes through `src/lib/schema.ts` (`fieldId`, `tableId`, `pickChoice`, `hasField`). New tables and fields get aliases in `src/lib/fields.ts` and are picked up by `npm run sync`.
- Every number on screen carries a Real / Seeded / Demo / Modelled chip from `src/lib/labels.ts`.
- Run `npm run typecheck` after each step. Do not commit `.env` or anything under `data/`.
- Commit per feature with a message that lists what changed. Do not push unless told to.

Verification for all three happens in the browser at http://127.0.0.1:3000 with `npm run dev`. Use the
persona switcher in the footer: an admin (Maria Ada Santos), a builder (Irene Salo), and an external
guest (May Fakhouri, walmart.com). `scripts/check-scope.ts` prints their scope sizes.

---

## 1. Chat mode for Ask Foundry

### Goal
Turn `/ask` from one question per page load into a streamed, multi-turn conversation. The model
keeps context across turns, tool calls show as they happen, sources accumulate in the rail, and a
drafted request can be refined over several turns before being handed to the wizard.

### Design
- **Transport:** `POST /api/ask` route handler on the Node runtime (`export const runtime = "nodejs"`), returning a `ReadableStream` of server-sent events. Body: `{ conversationId?: string, message: string }`. Persona comes from the cookie via `getCurrentUser()`, never from the body.
- **Model call:** `client.beta.messages.toolRunner({ ...params, stream: true })`. Iterate the runner; for each iteration call `stream.finalMessage()` after forwarding text deltas. Text deltas become `event: text` frames; a `tool_use` block becomes `event: tool` with `{name, input}` when it starts and `{resultCount, ms}` when it finishes; the end of a turn emits `event: done` with `{usage, sources, draft}`; any error emits `event: error` and then `done`, so the client never hangs.
- **Conversation store:** `src/lib/assistant/conversations.ts`. In-memory `Map<conversationId, Conversation>` on `globalThis` with a 30-minute TTL and a 20-turn cap. A `Conversation` holds `personaId`, `snapshotFetchedAt`, the full `messages` array as the API expects it (including `tool_use` and `tool_result` blocks), accumulated `sources`, and `createdAt`. Conversation IDs are random UUIDs. The browser only holds the ID and rendered text.
- **Scope safety:** tools are rebuilt per request with `buildTools(data, me, ...)`. If `me.user.id !== conversation.personaId`, discard the conversation and start a new one. If `data.fetchedAt !== conversation.snapshotFetchedAt`, keep the conversation but add a system-style note in the next user message: "Data was refreshed since the last turn."
- **Prompt caching:** system prompt keeps its `cache_control` breakpoint. Add a second breakpoint on the last message of the prior history so the whole earlier conversation is a cached prefix. Persona details stay in the first user message (as now), never in the system prompt. Tool order must stay fixed.
- **Limits:** per persona, 30 messages per rolling hour (in-memory counter). Over the limit, respond with a friendly `event: error` and do not call the model. Trim: when the conversation exceeds roughly 40,000 input tokens (from the last `usage`), drop the oldest turns after the first, keeping tool_use/tool_result pairs intact.
- **Keyword fallback:** if `ANTHROPIC_API_KEY` is unset, or the model call throws, answer the single message with `askKeyword` and stream it as one `text` frame plus `done`. Mark `mode: "keyword"` in `done`.
- **UI:** replace the `/ask` page body with a client component `src/components/AskChat.tsx`: message list (user and assistant bubbles, assistant text rendered with the existing `inline()` helper for bold/code and simple bullet detection), tool chips appearing under the assistant message while it runs, a composer with Enter to send and Shift+Enter for newline, a "New conversation" button, and the suggested prompts from Home as starter chips when the conversation is empty. The right rail stays a server-rendered shell; the client fills "Sources so far" and the tool log from `done` events. The draft card renders when a `draft` arrives and links to `/build?step=4&path=Team+Build&q=<description>`. Show `mode`, model, turn count and cumulative tokens in the rail footer.
- **Persona switch:** the layout's `PersonaSwitcher` already refreshes the page; the chat component must reset its state when the current persona ID prop changes.

### Files
- New: `src/app/api/ask/route.ts`, `src/lib/assistant/conversations.ts`, `src/lib/assistant/stream.ts` (SSE encoding helpers), `src/components/AskChat.tsx`.
- Change: `src/lib/assistant/claude.ts` (export a streaming variant that accepts prior `messages` and returns the new turn's blocks, usage and tool calls), `src/lib/assistant/index.ts` (route both modes), `src/app/ask/page.tsx` (shell + client component), `foundry.config.ts` (`assistant.maxTurns: 20`, `assistant.messagesPerHour: 30`, `assistant.trimAtInputTokens: 40000`).
- Keep: `src/lib/assistant/tools.ts` unchanged except that `buildTools` may accept the running `sources` array so they accumulate.

### Acceptance
- Ask "what can I use for supplier onboarding", then "who owns the second one" → the second answer refers to the earlier result without re-asking.
- Tool chips appear during a turn; text streams rather than arriving at once.
- Switch persona mid-conversation → the chat resets and the next answer reflects the new scope (guest sees fewer bases).
- Unset `ANTHROPIC_API_KEY`, restart → chat still answers in keyword mode with the Modelled chip.
- Send 31 messages in an hour as one persona → the 31st is refused politely without a model call.
- `console.log` shows per-turn usage; the second turn shows `cache_read_input_tokens > 0`.

---

## 2. Access requests end to end

### Goal
Every disabled "Request access" button becomes real. A person asks for a base or interface they cannot open; an admin sees the queue with the resource's sensitivity, approves or denies with their identity recorded; the grant itself is done by hand in Airtable for now (Grant method = Manual) with a link to the admin panel.

### Airtable table (created by hand in the UI, in the same base)
Table name: **Access Requests**

| Field | Type | Notes |
|---|---|---|
| Request | Autonumber (primary) | |
| Requester | Link to Airtable Users | single |
| Base | Link to Airtable Bases | single, optional |
| Interface | Link to Airtable Interfaces | single, optional |
| Requested permission | Single select: Read, Comment, Edit | |
| Justification | Long text | |
| Requester org unit | Single line text | copied at request time |
| Status | Single select: Pending, Approved, Denied, Granted | |
| Approver | Link to Airtable Users | single |
| Decision at | Date (with time) | |
| Decision note | Long text | |
| Grant method | Single select: Manual, Enterprise API | **optional** — if absent, the UI shows the constant "Manual" and no value is written |
| Record Source | Single select: Seed, Demo, User-entered | **optional but recommended** — without it, rows carry no Seeded/Demo chip and `seed --wipe` must skip this table (log a warning) |
| Requested at | Created time | |

Sensitivity is not stored on the request; it is read from the linked base or interface at render time (inherited).

The table as first created by Nabeel omits Grant method and Record Source. Code must use `hasField("accessRequests", ...)` before writing or reading either, exactly as `src/lib/requests.ts` does for `recordSource`. Do not add them to `REQUIRED_FIELDS`.

### Design
- **Aliases:** add `accessRequests` to `TableKey`, `TABLE_KEYS`, `FOUNDRY_TABLES`, `FIELD_ALIASES` and `REQUIRED_FIELDS` in `src/lib/fields.ts`; add `accessRequests: "Access Requests"` to `foundryConfig.tables`. Add the `AccessRequestRow` type and `accessRequests` array plus `accessRequestById` index to `src/lib/snapshot.ts`.
- **Domain:** `src/lib/access.ts` with `requestAccess(data, me, {baseId?, interfaceId?, permission, justification})`, `decideAccess(data, me, requestId, "Approved"|"Denied", note)`, `pendingFor(data, me)`, `myRequests(data, me)`, `effectiveSensitivity(data, row)` (interface value else base value else "Unclassified"). Rules: a requester cannot have two Pending requests for the same resource; only admins may decide (v1 approver rule; workspace owners come later); a decision writes Approver = `me.user.id`, Decision at = now, Status, Decision note, Grant method = Manual. Writes use `Airtable.createRecords` / `updateRecords` by field ID, then `runSync({ only: ["accessRequests"] })` and `invalidateSnapshot()`.
- **Actions:** `requestAccess` and `decideAccess` Server Actions in `src/app/actions.ts`, same shape as `vote`: identity from cookie, redirect back with `?msg=`.
- **Request entry points:** Library locked rows, Ask Foundry locked sources, and Build wizard matches marked "Access required" open a small `<details>`-based form (permission select + justification textarea) and submit `requestAccess`. If a Pending request already exists, show "Requested · pending" instead of the button.
- **Admin queue:** new page `src/app/admin/access/page.tsx` (admin-only, same redirect as `/admin`): a table of Pending requests with requester name, org unit, resource, workspace, inherited sensitivity chip, justification, age in days, and Approve / Deny buttons (deny requires a note). Below it, decided requests for the last 30 days. Approve shows a follow-up line: "Grant it in Airtable: <Open in admin panel>" using the base's Source URL (admin-only field) or the base URL. Add "Access requests" to the admin nav in `src/app/layout.tsx` and a "Pending access requests: N" item to Needs your attention on `/admin`.
- **Requester view:** Roadmap's "Your submissions" card gains a sibling "Your access requests" list with status chips; Ask Foundry's rail shows pending count.
- **Ask Foundry tool:** add `draft_access_request({ resourceName, reason })` to `src/lib/assistant/tools.ts`: it resolves the resource by name among locked items, returns a draft, and the chat renders a card with a "Request access" button that submits the real action. It never writes by itself.
- **Seed:** extend `scripts/seed.ts` with 5 access requests (Record Source = Seed): three Pending across sensitivities, one Approved, one Denied; `--wipe` removes them too.

### Acceptance
- As the guest, request access to a locked base from the Library → row appears in Airtable with Requester and Base as links, Status Pending, Record Source Demo.
- Same guest, same base again → button shows "Requested · pending", no duplicate row.
- As the admin, `/admin/access` lists it with the inherited sensitivity; Approve → Approver, Decision at and Status update in Airtable; the guest's Roadmap shows "Approved".
- Deny without a note is refused; with a note it records.
- A non-admin persona hitting `/admin/access` is redirected.
- `npm run seed` then `--wipe` adds and removes the five seeded rows.

---

## 3. Timed refresh and webhook polling

### Goal
Changes in Airtable reach the UI without anyone pressing Refresh: a scheduled full pull as the safety net, and Airtable webhook payloads polled every 30 seconds to refresh only the tables that changed. A deployed instance can accept webhook pushes on the same handler. The open page updates itself when the data version changes.

### Airtable facts to build against
- Create webhook: `POST /v0/bases/{baseId}/webhooks` with `specification.options.filters.dataTypes: ["tableData","tableFields"]` and no `recordChangeScope` (base-wide). Requires scope `webhook:manage` plus `data.records:read`. Max 10 webhooks per base. Response includes `id`, `macSecretBase64`, `expirationTime` (7 days).
- List payloads: `GET /v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor=N` returns `payloads[]` (each with `changedTablesById`), `cursor`, `mightHaveMore`. Calling it refreshes the webhook's expiration. Page until `mightHaveMore` is false.
- Push: Airtable POSTs `{ base: {id}, webhook: {id}, timestamp }` to `notificationUrl` when a payload is available; the handler then lists payloads as above. The body is signed with HMAC-SHA256 using `macSecretBase64`; header `X-Airtable-Content-MAC` as `hmac-sha256=<hex>`.
- Refresh webhook: `POST /v0/bases/{baseId}/webhooks/{webhookId}/refresh` extends expiration (payload listing already does this).
- All of these count toward the 5 requests per second per base limit; route them through the existing limiter in `src/lib/airtable.ts`.

### Design
- **Airtable client:** add `createWebhook(spec, notificationUrl?)`, `listWebhooks()`, `listWebhookPayloads(webhookId, cursor)`, `refreshWebhook(webhookId)`, `deleteWebhook(webhookId)` to `src/lib/airtable.ts`.
- **Webhook state:** `data/webhook.json` (git-ignored, under `data/`): `{ webhookId, macSecretBase64, cursor, expirationTime, createdAt }`. Written by `npm run webhook -- create`, read by the poller.
- **CLI:** `scripts/webhook.ts` with `create` (creates the base-wide webhook, optionally with `--url https://host/api/webhooks/airtable`), `status`, `delete`. Add `"webhook": "tsx scripts/webhook.ts"` to `package.json`. The PAT needs the `webhook:manage` scope; document it in `.env.example` and `HANDOFF.md`.
- **Sync worker:** `src/lib/worker.ts`, started once from `instrumentation.ts` (`register()` runs on the Node runtime only; guard with `process.env.NEXT_RUNTIME === "nodejs"` and a `globalThis` flag so dev hot reloads do not start it twice). It runs two loops: a full `runSync()` every `SYNC_INTERVAL_MINUTES` (default 15, `0` disables), and, when `data/webhook.json` exists, a payload poll every `WEBHOOK_POLL_SECONDS` (default 30). For each batch of payloads, collect `changedTablesById`, map table IDs to `TableKey`s via `data/schema.json`, and call `runSync({ only: keys })`. Persist the new `cursor` after a successful refresh. After any refresh call `invalidateSnapshot()`. Log one line per refresh: which tables, how many calls, how long. Never overlap two syncs (a simple in-flight promise guard).
- **Push endpoint:** `src/app/api/webhooks/airtable/route.ts` (Node runtime). Verify the HMAC with the stored secret using a constant-time compare; on success trigger the same payload-drain function the poller uses; always respond 200 quickly. If `data/webhook.json` is missing, respond 404.
- **Data version:** `src/app/api/version/route.ts` returns `{ fetchedAt, counts }` from the snapshot (no Airtable call). Add a small client component `src/components/LiveRefresh.tsx` mounted in the layout: it polls `/api/version` every 15 seconds, and when `fetchedAt` changes it calls `router.refresh()` and briefly shows "Updated just now" in the control strip. Respect `document.visibilityState` (do not poll hidden tabs).
- **Control strip:** show "auto-refresh every N min · webhook polling on/off" next to the fetch time, computed from env and the presence of `data/webhook.json`.
- **Doctor line:** if `npm run doctor` exists by then, add a check that the webhook is not expired; otherwise print the expiration in `npm run webhook -- status`.

### Acceptance
- `npm run webhook -- create` prints a webhook ID and writes `data/webhook.json`; `status` shows it not expired.
- With the app running, change a base's Sensitivity in Airtable → within about 30 seconds the server logs a refresh of `bases` only, and the open Library page updates without a manual reload.
- Vote from a second browser profile as another persona → the first browser's Roadmap updates within the poll interval.
- Stop the network → the poller logs the error once per interval and the app keeps serving the last snapshot; no crash.
- Set `SYNC_INTERVAL_MINUTES=1` → a full sync line appears every minute; set `0` → none.
- Two rapid changes → syncs run sequentially, never concurrently.

---

## Out of scope for v1.1
SQLite mirror, Activity Log table, OIDC, Docker, the onboarding CLI and Metadata-API bootstrap, Enterprise API grants. Access approvals record Grant method = Manual only.
