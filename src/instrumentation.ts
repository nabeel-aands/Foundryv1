/**
 * Runs once when the Next.js server starts. Checks the auth configuration first — a demo
 * switcher beside real sign-in must fail at boot, not at a request — then boots the
 * background sync timers (a no-op on Vercel, where vercel.json's crons are the clock).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertAuthConfig, authMode } = await import("./lib/identity");
  assertAuthConfig();
  console.log(`[foundry] auth mode: ${authMode()}`);
  const { startWorker } = await import("./lib/worker");
  startWorker();
}
