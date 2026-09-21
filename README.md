# Foundry v1

Enterprise governance portal on top of an Airtable admin-panel sync base. One base per enterprise:
the admin panel syncs Users, Groups, Workspaces, Bases and Interfaces into it, and Foundry keeps its
own tables (Requests, Votes) beside them. The app reads everything and writes only to its own tables.

Plans: [Foundry Architecture Plan](https://claude.ai/code/artifact/14572996-a2c8-4fed-873b-bb5bcb72504e) (full design) ·
[Foundry Prototype Plan](https://claude.ai/code/artifact/aa5232c7-ccde-42fd-a090-d5af26066e0e) (this v1).

## Run it

```bash
nvm use 24 && npm install
cp .env.example .env        # AIRTABLE_PAT, AIRTABLE_BASE_ID; keep FOUNDRY_DEMO=1 locally
npm run sync                # pulls every table into data/snapshot.json (about 8 seconds)
npm run seed                # optional: ten demo requests and ~50 votes, Record Source = Seed
npm run dev                 # http://127.0.0.1:3000
```

`npm run seed -- --wipe` removes the seed rows again. `npm run sync -- requests votes` refreshes only those tables.

## Deploy it

Foundry also runs on Vercel with no persistent disk: Vercel Blob holds the snapshot, schema and
webhook state, Redis holds conversations, rate limits and the sync lock, and the two crons in
`vercel.json` replace the background timers. Sign-in is OIDC against the company identity provider;
the verified email is matched to a row in the synced Users table and that row is the session.
`HANDOFF.md` has the step-by-step, including the one curl that seeds the first snapshot.

## What is where

| Path | Purpose |
|---|---|
| `foundry.config.ts` | Per-client config: table names, builder groups, sandbox regex, org-unit map, vote quota |
| `src/lib/config.ts` | Picks the config: `clients/<slug>/foundry.config.ts` when `FOUNDRY_CLIENT` is set, else the root file |
| `src/lib/store.ts` | The storage seam: files under `data/` on a laptop, Vercel Blob + Redis on Vercel |
| `src/lib/fields.ts` | Canonical field keys and the Airtable field-name aliases they match |
| `src/lib/sync.ts` | Schema → field IDs → all tables → snapshot + schema documents in the store |
| `src/lib/snapshot.ts` | Loads the snapshot, builds indexes and joins |
| `src/lib/identity/` | Who the request is: the demo persona cookie, or OIDC sign-in and the session cookie |
| `src/lib/worker.ts` | `fullSync()` and `drainWebhook()` under a shared lock, plus the local timers |
| `src/lib/scope.ts` | Effective access as a union over direct, group and workspace paths; roles; org units |
| `src/lib/persona.ts` | Demo persona cookie → current user (only when `FOUNDRY_DEMO=1`) |
| `src/lib/requests.ts` | Ranking, NDA rule, vote quota, Airtable writes for votes and requests |
| `src/app/` | Home, Build wizard, Library, Roadmap, Resources, Ask Foundry, Admin console |
| `src/app/api/jobs/` | `sync` and `drain`, the cron entry points (Bearer `CRON_SECRET`) |
| `src/proxy.ts` | The auth gate: unauthenticated requests go to `/auth/login` in OIDC mode |
| `vercel.json` | The two cron schedules that replace the local timers |
| `scripts/` | `sync.ts`, `seed.ts`, `webhook.ts`, `check-scope.ts` |

## Rules the code follows

1. No request path calls Airtable; pages read the snapshot. Only the sync and Server Actions touch the API.
2. Never write to a synced table or field. Writes target Requests and Votes only.
3. Links are written as record-ID arrays, never names, never with `typecast`.
4. The actor comes from the persona cookie server-side, never from a form field.
5. One process-wide limiter under 4 requests per second, 30 second back-off on 429.
6. Fields are read by pinned ID from `data/schema.json`; a renamed column fails at sync, not in a page.
7. Every number carries a Real, Seeded, Demo or Modelled chip computed from its source.
8. The persona switcher only works with `FOUNDRY_DEMO=1`, outside production, on loopback, with no OIDC issuer configured. `FOUNDRY_DEMO=1` beside `OIDC_ISSUER` is a boot failure, not a warning.
9. Nothing touches the filesystem outside `src/lib/store.ts`. Everything persisted goes through `Store` (documents) or `KV` (short-lived keys), so the same code runs on Vercel.
10. Both sync jobs take the `sync:lock` key before doing anything, so a cron, a webhook push and an admin pressing Refresh can never overlap.


## Known assumptions

- Interface links use `https://airtable.com/{appId}/{pbdId}`; undocumented, falls back to opening the base.
- The sync's Bases collaborator links already include workspace-inherited users (verified: 100% in this base). The scope union is correct either way.
- No API exposes the sync cadence; the strip shows Foundry's own fetch time.
