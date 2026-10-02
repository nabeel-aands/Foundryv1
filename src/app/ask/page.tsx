import { foundryConfig } from "@/lib/config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { canSee } from "@/lib/requests";
import { assistantMode } from "@/lib/assistant";
import { AskChat } from "@/components/AskChat";
import { Chip } from "@/components/Chip";

export default async function Ask() {
  const data = await getData();
  const me = await getCurrentUser();
  const mode = assistantMode();
  const allRequests = data.requests.filter((r) => r.title).length;
  const visibleRequests = data.requests.filter((r) => r.title && canSee(r, me)).length;

  return (
    <div className="max-w-6xl">
      <div className="eyebrow">Ask Foundry</div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">What's available to me?</h1>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        {mode === "claude"
          ? <><Chip kind="real">Claude · {foundryConfig.assistant.model}</Chip> Read-only tools over the snapshot, bound to your role. Conversations live in memory for 30 minutes. Authority capped at recommending.</>
          : <><Chip kind="modelled">Deterministic search · no model</Chip> Set ANTHROPIC_API_KEY to enable Claude.</>}
      </div>
      <AskChat
        personaId={me.user.id}
        mode={mode}
        model={foundryConfig.assistant.model}
        starters={me.isAdmin ? ["What's available to me?", "Who owns supplier data?", "Show me marketing ops apps", "Meal planning"] : ["What's available to me?", "Is there a project tracker template?", "How do I get started with automations?", "Who owns supplier data?"]}
        pendingAccess={0}
        accessAvailable={false}
        scope={{
          isAdmin: me.isAdmin, basesInEstate: data.bases.length, library: data.catalogItems.length, resources: data.trainingResources.length,
          datasets: data.datasets.length, visibleRequests, hiddenRequests: allRequests - visibleRequests,
          role: me.role, orgUnit: me.orgUnit.value, groups: me.groupNames, external: me.external,
        }}
      />
    </div>
  );
}
