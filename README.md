# Foundry v1

Enterprise governance portal on top of an Airtable admin-panel sync base.

```bash
nvm use 24 && npm install
cp .env.example .env   # add AIRTABLE_PAT and AIRTABLE_BASE_ID
npm run sync
npm run dev            # http://127.0.0.1:3000
```
