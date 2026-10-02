import { privacyPage } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return privacyPage();
}
