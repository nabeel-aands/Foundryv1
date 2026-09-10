"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/env";
import { getCurrentUser, PERSONA_COOKIE } from "@/lib/persona";
import { getData, invalidateSnapshot } from "@/lib/snapshot";
import { castVote, createRequest, retractVote } from "@/lib/requests";
import { runSync } from "@/lib/sync";

export async function setPersona(formData: FormData): Promise<void> {
  if (!isDemoMode()) return;
  const id = String(formData.get("id") ?? "");
  if (!getData().userById.has(id)) return;
  (await cookies()).set(PERSONA_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function vote(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const back = String(formData.get("back") ?? "/roadmap");
  const me = await getCurrentUser();
  const r = await castVote(getData(), me, requestId).catch((e: Error) => ({ ok: false as const, reason: e.message }));
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(r.ok ? "Vote recorded in Airtable." : r.reason)}`);
}

export async function retract(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const back = String(formData.get("back") ?? "/roadmap");
  const me = await getCurrentUser();
  const r = await retractVote(getData(), me, requestId).catch((e: Error) => ({ ok: false as const, reason: e.message }));
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(r.ok ? "Vote retracted. The record is kept, Active is off." : r.reason)}`);
}

export async function submitRequest(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/build?step=4&msg=" + encodeURIComponent("A title is required."));
  const num = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v ? Number(v) : undefined; };
  try {
    await createRequest(me, {
      title,
      description: String(formData.get("description") ?? "").trim() || undefined,
      useCase: String(formData.get("useCase") ?? "") || undefined,
      path: String(formData.get("path") ?? "") || undefined,
      teamSize: num("teamSize"),
      timeline: String(formData.get("timeline") ?? "") || undefined,
      budget: num("budget"),
      nda: formData.get("nda") === "on",
      visibleToGroups: formData.getAll("visibleToGroups").map(String).filter(Boolean),
      relatedBase: String(formData.get("relatedBase") ?? "") || undefined,
    });
  } catch (e) {
    redirect("/build?step=4&msg=" + encodeURIComponent(`Airtable rejected the write: ${(e as Error).message}`));
  }
  revalidatePath("/", "layout");
  redirect("/roadmap?msg=" + encodeURIComponent("Request submitted. It is now in Airtable and on the roadmap."));
}

export async function refreshAll(): Promise<void> {
  const me = await getCurrentUser();
  if (!me.isAdmin) return;
  await runSync();
  invalidateSnapshot();
  revalidatePath("/", "layout");
}
