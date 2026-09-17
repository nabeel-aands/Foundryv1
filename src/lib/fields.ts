/**
 * Canonical field keys per table, with the Airtable field-name aliases they match.
 * Matching is case-insensitive and ignores punctuation, so "Workspaces (via Owner User IDs)"
 * and "Workspaces via Owner User IDs" both resolve.
 */
export type TableKey =
  | "users" | "groups" | "workspaces" | "bases" | "interfaces" | "verifiedDatasets" | "requests" | "votes" | "accessRequests";

export const TABLE_KEYS: TableKey[] = [
  "users", "groups", "workspaces", "bases", "interfaces", "verifiedDatasets", "requests", "votes", "accessRequests",
];

/** Tables that are synced from the admin panel: read-only for Foundry. */
export const SYNCED_TABLES: TableKey[] = ["users", "groups", "workspaces", "bases", "interfaces"];

/** Tables Foundry writes to. */
export const FOUNDRY_TABLES: TableKey[] = ["requests", "votes", "accessRequests"];

export const FIELD_ALIASES: Record<TableKey, Record<string, string[]>> = {
  users: {
    userId: ["User ID"],
    firstName: ["First Name"],
    lastName: ["Last Name"],
    email: ["Email"],
    seatType: ["Seat Type"],
    status: ["Status"],
    accountType: ["Account Type"],
    admin: ["Admin"],
    lastActive: ["Last Active"],
    twoFactor: ["Two Factor Auth Enabled", "2FA Enabled"],
    ssoRequired: ["SSO Required"],
    emailVerified: ["Email Verified"],
    joined: ["Joined"],
    department: ["Department (SCIM)", "Department"],
    costCenter: ["Cost Center (SCIM)", "Cost Center"],
    division: ["Division (SCIM)"],
    title: ["Title (SCIM)"],
    organization: ["Organization (SCIM)"],
    groups: ["Groups"],
    workspacesOwned: ["Workspaces (via Owner User IDs)", "Workspaces via Owner User IDs"],
    workspacesCollab: ["Workspaces (via Collaborator User IDs)", "Workspaces via Collaborator User IDs"],
    basesCollab: ["Bases (via Collaborator User IDs)", "Bases via Collaborator User IDs"],
    interfacesCollab: ["Interfaces (via Collaborator User IDs)", "Interfaces via Collaborator User IDs"],
    interfacesPortal: ["Interfaces (via Portal Collaborator User IDs)", "Interfaces via Portal Collaborator User IDs"],
    requests: ["Foundry - Requests", "Requests"],
    votes: ["Foundry - Votes", "Votes"],
  },
  groups: {
    groupId: ["Group ID"],
    name: ["Name"],
    created: ["Created"],
    members: ["Member User IDs", "Members"],
    memberCount: ["Member Count"],
    sourceUrl: ["Source URL"],
    seatType: ["Seat Type"],
    workspaces: ["Workspaces (via Collaborator Group IDs)", "Workspaces via Collaborator Group IDs"],
    bases: ["Bases (via Collaborator Group IDs)", "Bases via Collaborator Group IDs"],
    interfaces: ["Interfaces (via Collaborator Group IDs)", "Interfaces via Collaborator Group IDs"],
  },
  workspaces: {
    workspaceId: ["Workspace ID"],
    name: ["Name"],
    system: ["System"],
    aiStatus: ["AI Status"],
    owners: ["Owner User IDs", "Owners"],
    collaborators: ["Collaborator User IDs"],
    groupCollaborators: ["Collaborator Group IDs"],
    created: ["Created"],
    sourceUrl: ["Source URL"],
    bases: ["Bases"],
  },
  bases: {
    baseId: ["Base ID"],
    workspaceId: ["Workspace ID"],
    workspaceName: ["Workspace Name"],
    name: ["Name"],
    created: ["Created"],
    rowCount: ["Row Count"],
    sandbox: ["Sandbox"],
    sourceUrl: ["Source URL"],
    collaborators: ["Collaborator User IDs"],
    groupCollaborators: ["Collaborator Group IDs"],
    sensitivity: ["Sensitivity"],
    collaboratorCount: ["Collaborator Count"],
    interfaces: ["Interfaces"],
    verifiedDatasets: ["Verified Datasets"],
  },
  interfaces: {
    interfaceId: ["Interface ID"],
    baseId: ["Base ID"],
    name: ["Name"],
    created: ["Created"],
    sourceUrl: ["Source URL"],
    portalCollaborators: ["Portal Collaborator User IDs"],
    collaborators: ["Collaborator User IDs"],
    groupCollaborators: ["Collaborator Group IDs"],
    sensitivity: ["Sensitivity"],
    collaboratorCount: ["Collaborator Count"],
  },
  verifiedDatasets: {
    name: ["Data set name", "Dataset name", "Name"],
    description: ["Description"],
    audience: ["Audience"],
    orgUnit: ["Org unit"],
    owner: ["Owner"],
    status: ["Status"],
    verified: ["Verified"],
    notes: ["Notes"],
    publishedBy: ["Published by"],
    sourceBase: ["Source base"],
    sourceTable: ["Source table"],
    sourceView: ["Source view"],
    catalogUpdated: ["Catalog updated on"],
    basesUsing: ["Bases using datasets", "Bases using datsets", "Bases"],
    lastReviewed: ["Last reviewed"],
  },
  requests: {
    title: ["Title", "Name", "Request"],
    description: ["Description", "Long Text", "Details"],
    useCase: ["Use Case"],
    path: ["Path"],
    status: ["Status"],
    requester: ["Requester"],
    requesterEmail: ["Requester email"],
    orgUnit: ["Org unit"],
    teamSize: ["Team Size"],
    timeline: ["Proposed Timeline"],
    budget: ["Budget"],
    nda: ["NDA"],
    visibleToGroups: ["Visible to Groups"],
    relatedBase: ["Related Base"],
    recordSource: ["Record Source"],
    submittedAt: ["Submitted At", "Created"],
    votes: ["Votes", "Foundry - Votes"],
  },
  votes: {
    request: ["Request"],
    voter: ["Voter"],
    voterEmail: ["Voter email"],
    active: ["Active"],
    recordSource: ["Record Source"],
    votedAt: ["Voted at", "Cast at", "Created"],
  },
  accessRequests: {
    request: ["Request"],
    requester: ["Requester"],
    base: ["Base"],
    interface: ["Interface"],
    requestedPermission: ["Requested permission"],
    justification: ["Justification"],
    requesterOrgUnit: ["Requester org unit"],
    status: ["Status"],
    approver: ["Approver"],
    decisionAt: ["Decision at"],
    decisionNote: ["Decision note"],
    // Grant method and Record Source are optional in this base; guard with hasField() before use.
    grantMethod: ["Grant method"],
    recordSource: ["Record Source"],
    requestedAt: ["Requested at", "Created"],
  },
};

/** Canonical keys that must exist for the app to work. Missing ones fail the sync loudly. */
export const REQUIRED_FIELDS: Partial<Record<TableKey, string[]>> = {
  users: ["userId", "email", "status", "accountType", "admin"],
  groups: ["groupId", "name", "members"],
  workspaces: ["workspaceId", "name", "owners", "collaborators", "bases"],
  bases: ["baseId", "workspaceId", "name", "collaborators", "interfaces"],
  interfaces: ["interfaceId", "baseId", "name"],
  verifiedDatasets: ["name"],
  requests: ["title", "status", "requester", "nda", "recordSource"],
  votes: ["request", "voter", "active"],
  // Grant method and Record Source stay out of this list on purpose: the table may omit them.
  accessRequests: ["requester", "requestedPermission", "status"],
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()\[\]_\-–—:·.,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
