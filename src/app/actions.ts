"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authMode } from "@/lib/identity";
import { getCurrentUser, PERSONA_COOKIE } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { castVote, createRequest, retractVote } from "@/lib/requests";
import { decideAccess, requestAccess as requestAccessDomain } from "@/lib/access";
import { fullSync } from "@/lib/worker";

export async function setPersona(formData: FormData): Promise<void> {
  if (authMode() !== "demo") return;
  const id = String(formData.get("id") ?? "");
  if (!(await getData()).userById.has(id)) return;
  (await cookies()).set(PERSONA_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function vote(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const back = String(formData.get("back") ?? "/roadmap");
  const me = await getCurrentUser();
  const r = await castVote(await getData(), me, requestId).catch((e: Error) => ({ ok: false as const, reason: e.message }));
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(r.ok ? "Vote recorded in Airtable." : r.reason)}`);
}

export async function retract(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const back = String(formData.get("back") ?? "/roadmap");
  const me = await getCurrentUser();
  const r = await retractVote(await getData(), me, requestId).catch((e: Error) => ({ ok: false as const, reason: e.message }));
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

export async function requestAccess(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "/library");
  const me = await getCurrentUser();
  const r = await requestAccessDomain(await getData(), me, {
    baseId: String(formData.get("baseId") ?? "") || undefined,
    interfaceId: String(formData.get("interfaceId") ?? "") || undefined,
    permission: String(formData.get("permission") ?? "Read"),
    justification: String(formData.get("justification") ?? ""),
  }).catch((e: Error) => ({ ok: false as const, reason: e.message }));
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(r.ok ? "Access request submitted. An admin will review it." : r.reason)}`);
}

export async function decide(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const decision = String(formData.get("decision") ?? "") === "Approved" ? "Approved" as const : "Denied" as const;
  const r = await decideAccess(await getData(), me, String(formData.get("requestId") ?? ""), decision, String(formData.get("note") ?? ""))
    .catch((e: Error) => ({ ok: false as const, reason: e.message }));
  revalidatePath("/", "layout");
  redirect(`/admin/access?msg=${encodeURIComponent(r.ok ? `Request ${decision.toLowerCase()}. ${decision === "Approved" ? "Now grant it in Airtable (Grant method: Manual)." : "The requester sees the note on their Roadmap."}` : r.reason)}`);
}

export async function refreshAll(): Promise<void> {
  const me = await getCurrentUser();
  if (!me.isAdmin) return;
  // Through the worker so a manual refresh and a scheduled one never run at the same time.
  await fullSync();
  revalidatePath("/", "layout");
}
