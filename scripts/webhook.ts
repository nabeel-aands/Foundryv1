/**
 * Manage the base-wide Airtable webhook that drives incremental refresh.
 *   npm run webhook -- create [--url https://host/api/webhooks/airtable]
 *   npm run webhook -- status
 *   npm run webhook -- delete
 * The PAT needs the webhook:manage scope (plus data.records:read).
 * State lives in the store: data/webhook.json locally, a private blob on Vercel. Creating
 * with --url also prints the two env vars a deployment needs.
 */
import { loadEnv } from "../src/lib/env";
import { Airtable } from "../src/lib/airtable";
import { storeKind } from "../src/lib/store";
import { clearWebhookState, readWebhookState, writeWebhookState } from "../src/lib/worker";

loadEnv();
const [cmd] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const urlFlag = process.argv.indexOf("--url");
const notificationUrl = urlFlag > -1 ? process.argv[urlFlag + 1] : undefined;

const where = () => (storeKind() === "blob" ? "Vercel Blob (foundry/webhook.json)" : "data/webhook.json");

async function main() {
  const at = Airtable.fromEnv();

  if (cmd === "create") {
    const existing = await readWebhookState();
    if (existing) {
      console.log(`A webhook is already registered (${existing.webhookId})${existing.fromEnv ? " via AIRTABLE_WEBHOOK_ID" : ""}. Run delete first to recreate.`);
      return;
    }
    const created = await at.createWebhook(
      { options: { filters: { dataTypes: ["tableData", "tableFields"] } } },
      notificationUrl,
    );
    await writeWebhookState({
      webhookId: created.id,
      macSecretBase64: created.macSecretBase64,
      cursor: 1,
      expirationTime: created.expirationTime,
      createdAt: new Date().toISOString(),
    });
    console.log(`Created webhook ${created.id}${notificationUrl ? ` with pushes to ${notificationUrl}` : " (polling only)"}.`);
    console.log(`Expires ${created.expirationTime} (payload polling keeps extending it). State: ${where()}`);
    console.log("\nFor a deployed instance, paste these into the Vercel project's environment variables:");
    console.log(`  AIRTABLE_WEBHOOK_ID=${created.id}`);
    console.log(`  AIRTABLE_WEBHOOK_SECRET=${created.macSecretBase64}`);
    console.log("They take precedence over stored state, so the deployment drains this webhook even on a fresh store.");
    return;
  }

  if (cmd === "status") {
    const state = await readWebhookState();
    if (!state) {
      console.log(`No webhook registered (nothing in ${where()}, no AIRTABLE_WEBHOOK_ID). Run npm run webhook -- create`);
      return;
    }
    const { webhooks } = await at.listWebhooks();
    const hook = webhooks.find((w) => w.id === state.webhookId);
    if (!hook) {
      console.log(`Webhook ${state.webhookId} is registered locally but no longer exists in Airtable. Run delete, then create.`);
      return;
    }
    const expires = hook.expirationTime ? new Date(hook.expirationTime) : undefined;
    const expired = expires ? expires.getTime() < Date.now() : false;
    console.log(`Webhook ${hook.id}${state.fromEnv ? " (from AIRTABLE_WEBHOOK_ID)" : ` (from ${where()})`}`);
    console.log(`  enabled: ${hook.isHookEnabled} · notifications: ${hook.areNotificationsEnabled} · url: ${hook.notificationUrl ?? "none (polling only)"}`);
    console.log(`  expiration: ${hook.expirationTime ?? "unknown"}${expired ? " · EXPIRED — delete and recreate" : " · not expired"}`);
    console.log(`  cursor (local): ${state.cursor} · next payload cursor (Airtable): ${hook.cursorForNextPayload}`);
    return;
  }

  if (cmd === "delete") {
    const state = await readWebhookState();
    if (!state) {
      console.log("Nothing to delete: no webhook registered.");
      return;
    }
    try {
      await at.deleteWebhook(state.webhookId);
      console.log(`Deleted webhook ${state.webhookId} in Airtable.`);
    } catch (e) {
      console.warn(`Could not delete in Airtable (${e instanceof Error ? e.message : e}); removing stored state anyway.`);
    }
    await clearWebhookState();
    console.log(`Removed the stored state from ${where()}.`);
    if (state.fromEnv) console.log("AIRTABLE_WEBHOOK_ID / AIRTABLE_WEBHOOK_SECRET are still set in the environment — unset them too.");
    return;
  }

  console.log("Usage: npm run webhook -- create [--url https://host/api/webhooks/airtable] | status | delete");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
