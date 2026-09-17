/**
 * Seed realistic demo Requests and Votes into the Foundry tables (Record Source = Seed).
 *   npm run seed          create seed rows (skips if seed rows already exist)
 *   npm run seed -- --wipe   delete every row whose Record Source is Seed
 * Never touches synced tables. Links use real record IDs from the snapshot.
 */
import { loadEnv } from "../src/lib/env";
import { Airtable } from "../src/lib/airtable";
import { choicesFor, fieldId, hasField, pickChoice, tableId } from "../src/lib/schema";
import { getData, invalidateSnapshot, type Base, type User } from "../src/lib/snapshot";
import { isExternal, orgUnitFor } from "../src/lib/scope";
import { requestFields } from "../src/lib/requests";
import { runSync } from "../src/lib/sync";

loadEnv();
const wipe = process.argv.includes("--wipe");

function accessRequestsReady(): boolean {
  try { tableId("accessRequests"); } catch { return false; }
  // Without Record Source, --wipe cannot tell seed rows apart; without Status choices, writes are rejected.
  return hasField("accessRequests", "recordSource") && choicesFor("accessRequests", "status").length > 0;
}

async function main() {
  const at = Airtable.fromEnv();
  let data = getData();

  if (wipe) {
    const seeded = (rows: { id: string; recordSource?: string }[]) => rows.filter((r) => /seed/i.test(r.recordSource ?? "")).map((r) => r.id);
    for (const [key, ids] of [["votes", seeded(data.votes)], ["requests", seeded(data.requests)]] as const) {
      for (let i = 0; i < ids.length; i += 10) await at.deleteRecords(tableId(key), ids.slice(i, i + 10));
      console.log(`Deleted ${ids.length} seed rows from ${key}`);
    }
    if (accessRequestsReady()) {
      const ids = seeded(data.accessRequests);
      for (let i = 0; i < ids.length; i += 10) await at.deleteRecords(tableId("accessRequests"), ids.slice(i, i + 10));
      console.log(`Deleted ${ids.length} seed rows from accessRequests`);
      await runSync({ only: ["requests", "votes", "accessRequests"] });
    } else {
      console.warn("Warning: Access Requests has no Record Source field (or is missing); skipping it in --wipe.");
      await runSync({ only: ["requests", "votes"] });
    }
    return;
  }

  if (data.requests.some((r) => /seed/i.test(r.recordSource ?? ""))) {
    console.log("Seed rows already exist. Run with --wipe first to recreate.");
    return;
  }

  const org = data.users.filter((u) => (u.status ?? "").toLowerCase() === "active" && !isExternal(u));
  const pick = (i: number): User => org[(i * 7) % org.length];
  const baseNamed = (needle: string): Base | undefined => data.bases.find((b) => (b.name ?? "").toLowerCase().includes(needle));
  const group = (name: string) => data.groups.find((g) => (g.name ?? "").toLowerCase() === name.toLowerCase())?.id;

  const plan = [
    { title: "Supplier onboarding tracker", desc: "Intake through contract signature for new suppliers, with document checklist and approver routing.", useCase: "Project Management", path: "Team Build", status: "In Build", base: "bid tracker", team: 12, budget: 18000, votes: 14 },
    { title: "Campaign brief intake", desc: "One form for creative briefs that routes to the right pod and tracks revisions.", useCase: "Marketing Ops", path: "DIY Sandbox", status: "Proposed", base: "product roadmap", team: 6, votes: 9 },
    { title: "Headcount planning", desc: "Requisitions, backfills and budget by cost center. Restricted to the architecture group while comp data is involved.", useCase: "Project Management", path: "Team Build", status: "Proposed", nda: true, groups: ["Principle Architects"], team: 4, budget: 25000, votes: 7 },
    { title: "Initiative tracker v2", desc: "Quarterly initiatives, owners, RAG status and a calendar view leads can scan on Mondays.", useCase: "Project Management", path: "DIY Sandbox", status: "Proposed", base: "resource allocation", team: 15, votes: 6 },
    { title: "Store remodel scheduler", desc: "Calendar of remodel phases per site with contractor availability and blackout dates.", useCase: "Calendar", path: "Team Build", status: "In Review", team: 9, budget: 12000, votes: 5 },
    { title: "Vendor scorecards", desc: "Quarterly supplier performance scoring rolled up from delivery and quality data.", useCase: "Product Management", path: "Existing App", status: "Shipped", base: "spend approval", team: 5, votes: 4 },
    { title: "Weekly ops digest", desc: "Automated Monday summary of everything that changed status, posted to Slack.", useCase: "Other", path: "DIY Sandbox", status: "In Build", team: 3, votes: 3 },
    { title: "Meal planning template consolidation", desc: "Merge the training cohort meal-planning bases into one governed template with a verified grocery dataset.", useCase: "Other", path: "Existing App", status: "Proposed", base: "meal planning", team: 2, votes: 2 },
    { title: "Training cohort attendance", desc: "Session calendar, attendance and completion tracking for the Walmart platform cohorts.", useCase: "Calendar", path: "DIY Sandbox", status: "Submitted", team: 4, votes: 1 },
    { title: "Legal hold request intake", desc: "Intake and approval trail for legal holds. Visible to admins only until counsel reviews.", useCase: "Other", path: "Team Build", status: "Submitted", nda: true, groups: ["Admin"], team: 2, budget: 9000, votes: 0 },
  ];

  const reqRecords = plan.map((p, i) => {
    const requester = pick(i + 1);
    return {
      fields: requestFields(requester.id, orgUnitFor(requester).value, {
        title: p.title, description: p.desc, useCase: p.useCase, path: p.path, teamSize: p.team,
        timeline: new Date(Date.now() + (30 + i * 12) * 86400000).toISOString().slice(0, 10),
        budget: p.budget, nda: !!p.nda,
        visibleToGroups: (p.groups ?? []).map(group).filter((g): g is string => !!g),
        relatedBase: p.base ? baseNamed(p.base)?.id : undefined,
      }, { status: p.status, recordSource: "Seed" }),
    };
  });
  const created: string[] = [];
  for (let i = 0; i < reqRecords.length; i += 10) {
    const recs = await at.createRecords(tableId("requests"), reqRecords.slice(i, i + 10));
    created.push(...recs.map((r) => r.id));
  }
  console.log(`Created ${created.length} requests`);

  const voteRecords: { fields: Record<string, unknown> }[] = [];
  plan.forEach((p, i) => {
    for (let v = 0; v < p.votes; v++) {
      const voter = pick(100 + i * 3 + v * 5);
      voteRecords.push({ fields: {
        [fieldId("votes", "request")]: [created[i]],
        [fieldId("votes", "voter")]: [voter.id],
        [fieldId("votes", "active")]: true,
        [fieldId("votes", "recordSource")]: "Seed",
      } });
    }
  });
  for (let i = 0; i < voteRecords.length; i += 10) await at.createRecords(tableId("votes"), voteRecords.slice(i, i + 10));
  console.log(`Created ${voteRecords.length} votes`);

  if (accessRequestsReady()) {
    // Five access requests: three Pending across sensitivities, one Approved, one Denied.
    const bySensitivity = (want: RegExp) => data.bases.find((b) => want.test(b.sensitivity ?? "")) ?? data.bases[0];
    const admin = data.users.find((u) => u.admin && (u.status ?? "").toLowerCase() === "active");
    const arPlan: { base: Base; permission: string; justification: string; status: string; note?: string }[] = [
      { base: bySensitivity(/public|internal/i), permission: "Read", justification: "Need to check the supplier list before onboarding a new vendor.", status: "Pending" },
      { base: bySensitivity(/confidential/i), permission: "Comment", justification: "Reviewing campaign spend for the quarterly close.", status: "Pending" },
      { base: bySensitivity(/restricted/i), permission: "Read", justification: "Auditing headcount data for the finance review.", status: "Pending" },
      { base: bySensitivity(/internal/i), permission: "Edit", justification: "Our pod maintains this tracker and I joined it last week.", status: "Approved", note: "Team membership confirmed with the workspace owner." },
      { base: bySensitivity(/confidential/i), permission: "Edit", justification: "Want to explore the data.", status: "Denied", note: "Too broad; ask for Read on the specific view you need." },
    ];
    const arRecords = arPlan.map((p, i) => {
      const requester = pick(50 + i * 11);
      const fields: Record<string, unknown> = {
        [fieldId("accessRequests", "requester")]: [requester.id],
        [fieldId("accessRequests", "base")]: [p.base.id],
        [fieldId("accessRequests", "requestedPermission")]: pickChoice("accessRequests", "requestedPermission", [p.permission, "Read"]),
        [fieldId("accessRequests", "justification")]: p.justification,
        [fieldId("accessRequests", "status")]: pickChoice("accessRequests", "status", [p.status]),
        [fieldId("accessRequests", "recordSource")]: pickChoice("accessRequests", "recordSource", ["Seed"]),
      };
      if (hasField("accessRequests", "requesterOrgUnit")) fields[fieldId("accessRequests", "requesterOrgUnit")] = orgUnitFor(requester).value;
      if (p.status !== "Pending") {
        if (admin) fields[fieldId("accessRequests", "approver")] = [admin.id];
        fields[fieldId("accessRequests", "decisionAt")] = new Date(Date.now() - (i + 1) * 86400000).toISOString();
        if (p.note && hasField("accessRequests", "decisionNote")) fields[fieldId("accessRequests", "decisionNote")] = p.note;
        if (hasField("accessRequests", "grantMethod")) {
          const c = pickChoice("accessRequests", "grantMethod", ["Manual"]);
          if (c) fields[fieldId("accessRequests", "grantMethod")] = c;
        }
      }
      return { fields };
    });
    await at.createRecords(tableId("accessRequests"), arRecords);
    console.log(`Created ${arRecords.length} access requests`);
  } else {
    console.warn("Warning: Access Requests table or its Record Source field is missing; skipped seeding it.");
  }

  await runSync({ only: accessRequestsReady() ? ["requests", "votes", "accessRequests"] : ["requests", "votes"], log: (l) => console.log(l) });
  invalidateSnapshot();
  data = getData();
  console.log(`Snapshot now has ${data.requests.length} requests, ${data.votes.length} votes and ${data.accessRequests.length} access requests.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
