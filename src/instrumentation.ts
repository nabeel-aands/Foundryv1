/** Runs once when the Next.js server starts; boots the background sync worker on Node only. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startWorker } = await import("./lib/worker");
  startWorker();
}
