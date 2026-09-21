import fs from "node:fs";

/** Load .env for scripts (Next.js loads it itself). Safe to call repeatedly. */
export function loadEnv(): void {
  if (process.env.AIRTABLE_PAT) return;
  try {
    if (fs.existsSync(".env")) {
      (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(".env");
    }
  } catch {
    /* ignore: Next.js already loaded env */
  }
}

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
  return v;
}

