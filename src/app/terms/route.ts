import { termsPage } from "@/lib/legal";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return termsPage();
}
