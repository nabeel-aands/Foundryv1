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
  /** Look and legal references. Everything a client re-skins lives here; globals.css only reads the resulting variables. */
  brand: {
    name: "Foundry",
    /** Path under /public (e.g. "/logo.svg"). Empty = a colour square beside the name. */
    logo: "",
    colors: {
      paper: "#f7f6f1", card: "#ffffff", card2: "#efede6",
      ink: "#17181b", ink2: "#4b4e56", muted: "#7a7d85",
      line: "#e4e2da", line2: "#cfcdc4",
      side: "#141416", side2: "#202126", sideText: "#d9d8d2",
      accent: "#f5b841", accentDeep: "#c9891a", accentSoft: "#fbefd1",
      sky: "#cfeafb", skyDeep: "#1f6f9a", lilac: "#e5e0f7", lilacDeep: "#5a44a8",
      /** The page background behind the app frame. */
      frame: "#ece9df",
    },
    /** Black outline used on cards, inputs and the frame. */
    border: { color: "#17181b", width: "1.5px" },
    /** Gap between the window edge and the app frame. */
    gutter: "0.375rem",
    radius: { frame: "16px", card: "14px", control: "10px", chip: "9999px", pill: "9999px" },
    fonts: { display: '"Space Grotesk", "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif' },
    legal: {
      /** Set either to point the footer links at the client's own pages instead of /terms and /privacy. */
      termsUrl: "",
      privacyUrl: "",
      updated: "2 October 2026",
    },
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
    accessRequests: "Access Requests",
    catalogItems: "Catalog Items",
    trainingResources: "Training Resources",
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
    /** USD per million tokens, by model id. Cache reads cost 10% of input and cache writes 125%. Add a line when you change model. */
    pricePerMTok: { "claude-haiku-4-5": { input: 1, output: 5 } } as Record<string, { input: number; output: number }>,
  },
  /** Emails offered as quick picks in the persona switcher. Empty = auto-pick one per role. */
  personas: { quickPicks: [] as string[] },
  urls: {
    base: (appId: string) => `https://airtable.com/${appId}`,
    interface: (appId: string, pbdId: string) => `https://airtable.com/${appId}/${pbdId}`,
  },
};

export type FoundryConfig = typeof foundryConfig;
