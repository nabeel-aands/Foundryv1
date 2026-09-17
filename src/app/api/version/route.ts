/** Data version for the client's live-refresh poll. Reads the snapshot only; never calls Airtable. */
import { getData, hasSnapshot } from "@/lib/snapshot";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (!hasSnapshot()) return Response.json({ fetchedAt: null, counts: {} });
  const data = getData();
  return Response.json({ fetchedAt: data.fetchedAt, counts: data.counts });
}
