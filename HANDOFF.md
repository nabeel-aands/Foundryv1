# Foundry v1 · run it locally

This file is written so that a person, or Claude Code working for them, can get the app running
from a clean clone in about ten minutes. Follow the steps in order; each has a check.

## What this is

Foundry is a governance portal on top of Airtable's enterprise admin-panel sync. One base per
enterprise: the admin panel syncs Users, Groups, Workspaces, Bases and Interfaces into it, and
Foundry keeps two tables of its own beside them (Requests, Votes). The app reads a snapshot of the
whole base and writes only to those two tables.

For A&S the base is **"Admin Sync Test"**. You need a personal access token that can read it and
write to its Requests and Votes tables.

Design documents:
- Foundry Architecture Plan (full design): https://claude.ai/code/artifact/14572996-a2c8-4fed-873b-bb5bcb72504e
- Foundry Prototype Plan (this v1): https://claude.ai/code/artifact/aa5232c7-ccde-42fd-a090-d5af26066e0e
- Foundry v2 Architecture (mirror, webhooks, AI): https://claude.ai/code/artifact/258e0aae-385b-4a6f-a5a0-a32249d2d3f9

## 1. Prerequisites

- macOS or Linux, Node.js 24 (Node 20.9+ works; 18 does not).
- Access to the Airtable base "Admin Sync Test" (base ID starts with `app`).

Check Node:

```bash
node -v
```

If it prints v18 or lower, install Node 24 with nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 24 && nvm alias default 24 && nvm use 24
node -v    # expect v24.x
```

## 2. Install

From the unzipped folder (or `git clone https://github.com/nabeel-aands/Foundryv1.git`):

```bash
cd Foundryv1
npm install
```

Check: `ls node_modules/.bin | grep -c next` prints `1` or more.

If `npm install` fails behind the company npm firewall, run it again; if it names a blocked
package, tell Nabeel which one. All versions in `package.json` are pinned and were installable on
2026-09-10.

## 3. Airtable token

1. Open https://airtable.com/create/tokens and create a personal access token.
2. Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`.
3. Access: only the base "Admin Sync Test".
4. Copy the token (starts with `pat`). Find the base ID in the base URL (starts with `app`).

Create `.env` from the template and fill in the two values:

```bash
cp .env.example .env
```

`.env` should read:

```
AIRTABLE_PAT=pat…
AIRTABLE_BASE_ID=app…
FOUNDRY_DEMO=1
HOST=127.0.0.1
```

`.env` is git-ignored. Never commit it or paste the token anywhere else.

## 4. Pull the data

```bash
npm run sync
```

Check: the last lines look like

```
Snapshot: users 208 · groups 4 · workspaces 38 · bases 593 · interfaces 1520 · verifiedDatasets 15 · requests N · votes N
```

Numbers will differ as the org changes. If it prints a warning that a table was not found, the
table names in `foundry.config.ts` do not match the base; fix the name there and re-run.

Optional demo data (ten realistic requests and about fifty votes, tagged `Record Source = Seed`):

```bash
npm run seed
```

Remove them later with `npm run seed -- --wipe`.

## 5. Run

```bash
npm run dev
```

Open http://127.0.0.1:3000. Stop with Ctrl+C.

Check: the strip at the top shows the real counts with a green `Real` chip and today's fetch time.

## 6. Using the demo

- **Persona switcher** is in the bottom-left. It lists real users from the sync; pick an admin, a
  builder, or a `walmart.com` guest to see scope change. It only works with `FOUNDRY_DEMO=1`.
- **Refresh from Airtable** is on the Governance console (admin persona only). It re-pulls
  everything in about eight seconds.
- **Votes and requests write to Airtable immediately.** Open the Votes or Requests table in the
  base to see rows appear. Retracting a vote unticks `Active`; nothing is deleted.
- A ten-minute demo script and the rules the code follows are in `README.md`.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run dev` says Node version unsupported | `nvm use 24` in the same terminal |
| Port 3000 in use | `npm run dev -- -p 3001` and open that port |
| Page says "Foundry needs a snapshot" | `npm run sync` has not run yet, or `.env` is missing |
| Sync fails with 401 or 403 | Token scopes or base access are wrong; recreate the token as in step 3 |
| Sync fails with 429 | Wait 30 seconds and re-run; the base's API budget was exhausted |
| Persona switcher missing | `FOUNDRY_DEMO=1` is not set, or the app is not on 127.0.0.1 |
| Counts look stale | Press Refresh from Airtable, or run `npm run sync` |

## 8. Where things are

| Path | Purpose |
|---|---|
| `foundry.config.ts` | Table names, builder groups, sandbox rule, org-unit map, vote quota |
| `src/lib/fields.ts` | Canonical field keys and the Airtable field-name aliases they match |
| `src/lib/sync.ts` | Schema → field IDs → all tables → `data/snapshot.json` |
| `src/lib/scope.ts` | Who can see which bases: union of direct, group and workspace access |
| `src/lib/requests.ts` | Ranking, NDA rule, vote quota, Airtable writes |
| `src/app/` | Home, Build, Library, Roadmap, Resources, Ask Foundry, Admin |
| `scripts/` | `sync.ts`, `seed.ts`, `check-scope.ts` |
