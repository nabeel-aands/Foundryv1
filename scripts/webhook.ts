/**
 * Manage the base-wide Airtable webhook that drives incremental refresh.
 *   npm run webhook -- create [--url https://host/api/webhooks/airtable]
 *   npm run webhook -- status
 *   npm run webhook -- delete
 * The PAT needs the webhook:manage scope (plus data.records:read).
 * State lives in data/webhook.json (git-ignored); the app's poller picks it up within a tick.
 */
import { loadEnv } from "../src/lib/env";
import { Airtable } from "../src/lib/airtable";
import { readWebhookState, writeWebhookState, WEBHOOK_STATE_PATH } from "../src/lib/worker";
import fs from "node:fs";

loadEnv();
const [cmd] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const urlFlag = process.argv.indexOf("--url");
const notificationUrl = urlFlag > -1 ? process.argv[urlFlag + 1] : undefined;

async function main() {
  const at = Airtable.fromEnv();

  if (cmd === "create") {
    const existing = readWebhookState();
    if (existing) {
      console.log(`A webhook is already registered (${existing.webhookId}). Run delete first to recreate.`);
      return;
    }
    const created = await at.createWebhook(
      { options: { filters: { dataTypes: ["tableData", "tableFields"] } } },
      notificationUrl,
    );
    writeWebhookState({
      webhookId: created.id,
      macSecretBase64: created.macSecretBase64,
      cursor: 1,
      expirationTime: created.expirationTime,
      createdAt: new Date().toISOString(),
    });
    console.log(`Created webhook ${created.id}${notificationUrl ? ` with pushes to ${notificationUrl}` : " (polling only)"}.`);
    console.log(`Expires ${created.expirationTime} (payload polling keeps extending it). State: ${WEBHOOK_STATE_PATH}`);
    return;
  }

  if (cmd === "status") {
    const state = readWebhookState();
    if (!state) {
      console.log("No webhook registered (data/webhook.json missing). Run npm run webhook -- create");
      return;
    }
    const { webhooks } = await at.listWebhooks();
    const hook = webhooks.find((w) => w.id === state.webhookId);
    if (!hook) {
      console.log(`Webhook ${state.webhookId} is in data/webhook.json but no longer exists in Airtable. Run delete, then create.`);
      return;
    }
    const expires = hook.expirationTime ? new Date(hook.expirationTime) : undefined;
    const expired = expires ? expires.getTime() < Date.now() : false;
    console.log(`Webhook ${hook.id}`);
    console.log(`  enabled: ${hook.isHookEnabled} · notifications: ${hook.areNotificationsEnabled} · url: ${hook.notificationUrl ?? "none (polling only)"}`);
    console.log(`  expiration: ${hook.expirationTime ?? "unknown"}${expired ? " · EXPIRED — delete and recreate" : " · not expired"}`);
    console.log(`  cursor (local): ${state.cursor} · next payload cursor (Airtable): ${hook.cursorForNextPayload}`);
    return;
  }

  if (cmd === "delete") {
    const state = readWebhookState();
    if (!state) {
      console.log("Nothing to delete: data/webhook.json missing.");
      return;
    }
    try {
      await at.deleteWebhook(state.webhookId);
      console.log(`Deleted webhook ${state.webhookId} in Airtable.`);
    } catch (e) {
      console.warn(`Could not delete in Airtable (${e instanceof Error ? e.message : e}); removing local state anyway.`);
    }
    fs.rmSync(WEBHOOK_STATE_PATH, { force: true });
    console.log(`Removed ${WEBHOOK_STATE_PATH}.`);
    return;
  }

  console.log("Usage: npm run webhook -- create [--url https://host/api/webhooks/airtable] | status | delete");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
