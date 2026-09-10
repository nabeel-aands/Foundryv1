/** Sanity check: scope sizes for a few real personas, and the three-case collaborator test. */
import { loadEnv } from "../src/lib/env";
import { getData } from "../src/lib/snapshot";
import { defaultPersona, quickPicks, resolveUser } from "../src/lib/persona";

loadEnv();
const data = getData();
console.log(`Snapshot ${data.fetchedAt}: users ${data.users.length}, bases ${data.bases.length}, interfaces ${data.interfaces.length}`);
console.log(`Default persona: ${defaultPersona(data)?.email}`);
for (const u of quickPicks(data)) {
  const me = resolveUser(data, u);
  const via = new Map<string, number>();
  for (const s of me.scope.bases.values()) for (const v of s) via.set(v.split(":")[0], (via.get(v.split(":")[0]) ?? 0) + 1);
  console.log(`- ${me.name} <${u.email}> role=${me.role} org=${me.orgUnit.value} groups=[${me.groupNames.join(", ")}] bases=${me.scope.bases.size} interfaces=${me.scope.interfaces.size} via=${JSON.stringify(Object.fromEntries(via))}`);
}
// Three-case test: does Bases.collaborators already include workspace-inherited users?
let inherited = 0, total = 0;
for (const w of data.workspaces) {
  for (const uid of w.collaborators ?? []) {
    for (const bid of data.workspaceBaseIds.get(w.id) ?? []) {
      total++;
      if ((data.baseById.get(bid)?.collaborators ?? []).includes(uid)) inherited++;
    }
  }
}
console.log(`Workspace collaborators appearing directly in Bases.collaborators: ${inherited}/${total} (${total ? Math.round((100 * inherited) / total) : 0}%)`);
const groupOnly = data.groups.map((g) => `${g.name}: ${g.members?.length ?? 0} members, ${g.bases?.length ?? 0} bases, ${g.workspaces?.length ?? 0} workspaces, ${g.interfaces?.length ?? 0} interfaces`);
console.log(groupOnly.join("\n"));
