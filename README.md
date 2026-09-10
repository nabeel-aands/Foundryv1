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

## What is where

| Path | Purpose |
|---|---|
| `foundry.config.ts` | Per-client config: table names, builder groups, sandbox regex, org-unit map, vote quota |
| `src/lib/fields.ts` | Canonical field keys and the Airtable field-name aliases they match |
| `src/lib/sync.ts` | Schema → field IDs → all tables → `data/snapshot.json` + `data/schema.json` |
| `src/lib/snapshot.ts` | Loads the snapshot, builds indexes and joins |
| `src/lib/scope.ts` | Effective access as a union over direct, group and workspace paths; roles; org units |
| `src/lib/persona.ts` | Demo persona cookie → current user (only when `FOUNDRY_DEMO=1`) |
| `src/lib/requests.ts` | Ranking, NDA rule, vote quota, Airtable writes for votes and requests |
| `src/app/` | Home, Build wizard, Library, Roadmap, Resources, Ask Foundry, Admin console |
| `scripts/` | `sync.ts`, `seed.ts`, `check-scope.ts` |

## Rules the code follows

1. No request path calls Airtable; pages read the snapshot. Only the sync and Server Actions touch the API.
2. Never write to a synced table or field. Writes target Requests and Votes only.
3. Links are written as record-ID arrays, never names, never with `typecast`.
4. The actor comes from the persona cookie server-side, never from a form field.
5. One process-wide limiter under 4 requests per second, 30 second back-off on 429.
6. Fields are read by pinned ID from `data/schema.json`; a renamed column fails at sync, not in a page.
7. Every number carries a Real, Seeded, Demo or Modelled chip computed from its source.
8. The persona switcher only works with `FOUNDRY_DEMO=1` outside production.

## Ten-minute demo

1. **Home as an admin.** Real counts in the strip with the fetch time; three path cards; verified datasets with steward dots; roadmap top five.
2. **Switch persona** (footer) to a walmart.com guest: the Library shrinks from 593 bases to their training bases, votes read 10 of 10, the admin menu disappears, and the NDA-flagged "Headcount planning" leaves the roadmap.
3. **Build something:** describe "supplier onboarding tracker", see the matches (existing proposal, a base, interfaces), pick a path, submit. The request appears on the roadmap and in the Requests table.
4. **Roadmap:** vote, watch the rank and the quota move, retract. Open the Votes table in Airtable to show the row.
5. **Ask Foundry:** "meal planning" as the guest versus as the admin. Same question, different answer, scoped by access.
6. **Governance console** as admin: register and estate tiles, Needs your attention, largest bases, Refresh from Airtable.
7. Close on **Open in Airtable**: Airtable stays the system of record.

## Known assumptions

- Interface links use `https://airtable.com/{appId}/{pbdId}`; undocumented, falls back to opening the base.
- The sync's Bases collaborator links already include workspace-inherited users (verified: 100% in this base). The scope union is correct either way.
- No API exposes the sync cadence; the strip shows Foundry's own fetch time.
