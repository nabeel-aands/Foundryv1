/**
 * Client configuration lookup. One deployment serves one client; which one is decided by
 * FOUNDRY_CLIENT at boot. Unset (the laptop default) means the root foundry.config.ts.
 *
 * The candidates are imported statically on purpose: the bundler has to see every client
 * config at build time, and the rest of the app wants `foundryConfig` synchronously. Adding
 * a client means dropping clients/<slug>/foundry.config.ts in and adding one line to CLIENTS.
 */
import { foundryConfig as rootConfig, type FoundryConfig } from "../../foundry.config";
import { foundryConfig as aands } from "../../clients/aands/foundry.config";

const CLIENTS: Record<string, FoundryConfig> = { aands };

export function getConfig(): FoundryConfig {
  const slug = (process.env.FOUNDRY_CLIENT ?? "").trim();
  if (!slug) return rootConfig;
  const hit = CLIENTS[slug];
  if (!hit) {
    throw new Error(`FOUNDRY_CLIENT="${slug}" has no config. Known clients: ${Object.keys(CLIENTS).join(", ") || "none"}. Add clients/${slug}/foundry.config.ts and register it in src/lib/config.ts.`);
  }
  return hit;
}

/** The active config. Resolved once at module load, like the file import it replaces. */
export const foundryConfig: FoundryConfig = getConfig();

export type { FoundryConfig };
