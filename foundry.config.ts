/**
 * Per-client Foundry configuration. Human-edited. No secrets here (those live in .env).
 * Table names are matched case-insensitively; field names are matched through aliases in src/lib/fields.ts.
 */
export const foundryConfig = {
  client: {
    name: "Airtable · A&S",
    shortName: "A&S",
    orgDomains: ["airtable.com", "andsundry.co"],
  },
  tables: {
    users: "Airtable Users",
    groups: "Airtable Groups",
    workspaces: "Airtable Workspaces",
    bases: "Airtable Bases",
    interfaces: "Airtable Interfaces",
    verifiedDatasets: "Verified Datasets",
    requests: "Requests",
    votes: "Votes",
  },
  roles: {
    /** Members of these groups are Builders even without owning a workspace. */
    builderGroups: ["Principle Architects"],
    /** email -> 'admin' | 'builder' | 'user' */
    overrides: {} as Record<string, "admin" | "builder" | "user">,
  },
  sandbox: {
    /** Workspaces whose name matches count as sandbox, in addition to the native Bases.Sandbox flag. */
    nameRegex: /sandbox|lab\b|test/i,
  },
  orgUnits: {
    byEmail: {} as Record<string, string>,
    byDomain: { "walmart.com": "Guest · Walmart", "walmartmedia.com": "Guest · Walmart" } as Record<string, string>,
    options: ["Global COE", "Finance Department", "Legal", "Procurement", "Marketing", "IT Services"],
    fallback: "Unassigned",
  },
  votes: { quota: 10 },
  requests: {
    useCases: ["Project management", "Product management", "Marketing ops", "Calendar", "Other"],
    paths: ["Existing app", "DIY sandbox", "Team build"] as const,
    teamLabel: "A&S",
  },
  sensitivity: { levels: ["Public", "Internal", "Confidential", "Restricted"] },
  /**
   * Ask Foundry. Runs on Claude when ANTHROPIC_API_KEY is set, otherwise keyword search.
   * Haiku 4.5 for development (well under a cent per question); switch to "claude-sonnet-5" for demos.
   */
  assistant: {
    model: "claude-haiku-4-5",
    maxToolCalls: 6,
    maxTokens: 1000,
    /** effort applies to Sonnet/Opus/Fable only; ignored on Haiku */
    effort: "low" as "low" | "medium" | "high",
    cacheMinutes: 10,
    /** Chat mode: turns kept per conversation, per-persona hourly message budget, trim threshold. */
    maxTurns: 20,
    messagesPerHour: 30,
    trimAtInputTokens: 40000,
  },
  /** Emails offered as quick picks in the persona switcher. Empty = auto-pick one per role. */
  personas: { quickPicks: [] as string[] },
  urls: {
    base: (appId: string) => `https://airtable.com/${appId}`,
    interface: (appId: string, pbdId: string) => `https://airtable.com/${appId}/${pbdId}`,
  },
};

export type FoundryConfig = typeof foundryConfig;
