import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  AppWindowIcon,
  ArrowUpRightIcon,
  BlocksIcon,
  BotIcon,
  BriefcaseBusinessIcon,
  CableIcon,
  CircleDashedIcon,
  CommandIcon,
  CpuIcon,
  DatabaseIcon,
  FolderKanbanIcon,
  GlobeIcon,
  ListFilterIcon,
  SearchIcon,
  ServerCogIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WandSparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "../ui/Input";

type WorkbenchSectionId = "library" | "agents" | "mcp" | "operations";

type WorkbenchResource = {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  metric: string;
  chips: string[];
  owner: string;
  updatedAt: string;
  actionLabel: string;
};

type WorkbenchSection = {
  id: WorkbenchSectionId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  summary: Array<{ label: string; value: string; tone: string }>;
  lanes: Array<{ label: string; value: string; hint: string }>;
  resources: WorkbenchResource[];
};

function toneClass(tone: string): string {
  switch (tone) {
    case "good":
      return "text-emerald-300 bg-emerald-500/10 border-emerald-400/20";
    case "warn":
      return "text-amber-200 bg-amber-500/10 border-amber-300/20";
    case "info":
      return "text-sky-200 bg-sky-500/10 border-sky-300/20";
    default:
      return "text-foreground/80 bg-white/5 border-white/10";
  }
}

export function PlatformWorkbenchPrototype() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] =
    useState<WorkbenchSectionId>("library");
  const [query, setQuery] = useState("");

  const sections = useMemo<WorkbenchSection[]>(
    () => [
      {
        id: "library",
        label: t("settings.platformWorkbench.libraryLabel", "Library"),
        eyebrow: t("settings.platformWorkbench.libraryEyebrow", "Assets"),
        title: t(
          "settings.platformWorkbench.libraryTitle",
          "Prompts, skills and reusable building blocks",
        ),
        description: t(
          "settings.platformWorkbench.libraryDesc",
          "Content assets and reusable capabilities live in the same workspace, but remain clearly typed and searchable.",
        ),
        summary: [
          {
            label: t("settings.platformWorkbench.summaryReady", "Ready"),
            value: "128",
            tone: "good",
          },
          {
            label: t(
              "settings.platformWorkbench.summaryNeedsReview",
              "Needs review",
            ),
            value: "9",
            tone: "warn",
          },
          {
            label: t("settings.platformWorkbench.summaryShared", "Shared"),
            value: "37",
            tone: "info",
          },
        ],
        lanes: [
          {
            label: t("settings.platformWorkbench.lanePrompts", "Prompts"),
            value: "64",
            hint: t(
              "settings.platformWorkbench.lanePromptsHint",
              "Writing assets, templates, snippets",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneSkills", "Skills"),
            value: "41",
            hint: t(
              "settings.platformWorkbench.laneSkillsHint",
              "Reusable capability packages and project skills",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneResources", "Resources"),
            value: "23",
            hint: t(
              "settings.platformWorkbench.laneResourcesHint",
              "Reference docs, context packs, imported files",
            ),
          },
        ],
        resources: [
          {
            id: "library-skill-orchestrator",
            name: "Multi-Agent Research Orchestrator",
            description:
              "Skill package that coordinates planning, retrieval and answer synthesis across research tasks.",
            type: "Skill",
            status: t("settings.platformWorkbench.statusPublished", "Published"),
            metric: "12 variants",
            chips: ["Skill", "Versioned", "Shared"],
            owner: "PromptHub Team",
            updatedAt: "2h ago",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenSkill",
              "Open skill",
            ),
          },
          {
            id: "library-prompt-launch",
            name: "Launch Announcement Prompt Pack",
            description:
              "Campaign prompts for release notes, social copy and changelog summarization.",
            type: "Prompt Pack",
            status: t("settings.platformWorkbench.statusDraft", "Draft"),
            metric: "18 prompts",
            chips: ["Prompt", "Marketing", "Bilingual"],
            owner: "Growth Ops",
            updatedAt: "Yesterday",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenPrompt",
              "Open prompt pack",
            ),
          },
          {
            id: "library-template-ux",
            name: "UX Audit Delivery Template",
            description:
              "Reusable structure for turning audit findings into customer-facing reports.",
            type: "Template",
            status: t("settings.platformWorkbench.statusReady", "Ready"),
            metric: "7 outputs",
            chips: ["Template", "Docs", "Client-facing"],
            owner: "Design System",
            updatedAt: "3d ago",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenTemplate",
              "Open template",
            ),
          },
        ],
      },
      {
        id: "agents",
        label: t("settings.platformWorkbench.agentsLabel", "Agents"),
        eyebrow: t("settings.platformWorkbench.agentsEyebrow", "Automation"),
        title: t(
          "settings.platformWorkbench.agentsTitle",
          "Agents become first-class managed units",
        ),
        description: t(
          "settings.platformWorkbench.agentsDesc",
          "Agents should sit beside skills, with explicit runtime, ownership and safety metadata instead of being hidden inside loose prompt conventions.",
        ),
        summary: [
          {
            label: t("settings.platformWorkbench.summaryActive", "Active"),
            value: "14",
            tone: "good",
          },
          {
            label: t("settings.platformWorkbench.summaryQueued", "Queued"),
            value: "5",
            tone: "info",
          },
          {
            label: t("settings.platformWorkbench.summaryGuarded", "Guarded"),
            value: "3",
            tone: "warn",
          },
        ],
        lanes: [
          {
            label: t("settings.platformWorkbench.laneResearch", "Research agents"),
            value: "6",
            hint: t(
              "settings.platformWorkbench.laneResearchHint",
              "Discovery, synthesis and evaluation loops",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneCoding", "Coding agents"),
            value: "4",
            hint: t(
              "settings.platformWorkbench.laneCodingHint",
              "Implementation, refactor and test execution",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneOps", "Ops agents"),
            value: "4",
            hint: t(
              "settings.platformWorkbench.laneOpsHint",
              "Release, monitoring and support workflows",
            ),
          },
        ],
        resources: [
          {
            id: "agent-release-conductor",
            name: "Release Conductor",
            description:
              "Coordinates version checks, changelog generation, screenshot refresh and release artifact validation.",
            type: "Agent",
            status: t("settings.platformWorkbench.statusHealthy", "Healthy"),
            metric: "5 pipelines",
            chips: ["Agent", "Ops", "Guardrails"],
            owner: "Release Engineering",
            updatedAt: "45m ago",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenAgent",
              "Open agent",
            ),
          },
          {
            id: "agent-spec-librarian",
            name: "Spec Librarian",
            description:
              "Maintains SSD deltas, stable specs and implementation traces during multi-step product work.",
            type: "Agent",
            status: t(
              "settings.platformWorkbench.statusExperiment",
              "Experiment",
            ),
            metric: "91% trace coverage",
            chips: ["Agent", "Spec", "Workflow"],
            owner: "Product Infra",
            updatedAt: "Today",
            actionLabel: t(
              "settings.platformWorkbench.actionInspectAgent",
              "Inspect workflow",
            ),
          },
          {
            id: "agent-support-router",
            name: "Support Router",
            description:
              "Classifies user issues, maps them to product domains and drafts high-signal triage packets.",
            type: "Agent",
            status: t(
              "settings.platformWorkbench.statusMonitored",
              "Monitored",
            ),
            metric: "312 runs",
            chips: ["Agent", "Support", "Triage"],
            owner: "Customer Success",
            updatedAt: "1d ago",
            actionLabel: t(
              "settings.platformWorkbench.actionReviewRuns",
              "Review runs",
            ),
          },
        ],
      },
      {
        id: "mcp",
        label: t(
          "settings.platformWorkbench.mcpLabel",
          "MCP & Integrations",
        ),
        eyebrow: t("settings.platformWorkbench.mcpEyebrow", "Connections"),
        title: t(
          "settings.platformWorkbench.mcpTitle",
          "External tools are managed as connections, not content",
        ),
        description: t(
          "settings.platformWorkbench.mcpDesc",
          "MCP servers, model gateways and sync endpoints belong in a dedicated integration surface with health, auth and environment context.",
        ),
        summary: [
          {
            label: t(
              "settings.platformWorkbench.summaryConnected",
              "Connected",
            ),
            value: "11",
            tone: "good",
          },
          {
            label: t(
              "settings.platformWorkbench.summaryAttention",
              "Attention",
            ),
            value: "2",
            tone: "warn",
          },
          {
            label: t(
              "settings.platformWorkbench.summaryEnvironments",
              "Environments",
            ),
            value: "4",
            tone: "info",
          },
        ],
        lanes: [
          {
            label: t(
              "settings.platformWorkbench.laneMcpServers",
              "MCP servers",
            ),
            value: "5",
            hint: t(
              "settings.platformWorkbench.laneMcpServersHint",
              "Tool adapters, execution endpoints, repo bridges",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneProviders", "Providers"),
            value: "4",
            hint: t(
              "settings.platformWorkbench.laneProvidersHint",
              "AI gateways, inference vendors, fallback chains",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneSync", "Sync targets"),
            value: "2",
            hint: t(
              "settings.platformWorkbench.laneSyncHint",
              "Backups, publishing targets and workspace mirrors",
            ),
          },
        ],
        resources: [
          {
            id: "mcp-github",
            name: "GitHub MCP Bridge",
            description:
              "Routes repo search, issue reads and PR automation into a guarded MCP endpoint.",
            type: "MCP Server",
            status: t("settings.platformWorkbench.statusStable", "Stable"),
            metric: "2 org scopes",
            chips: ["MCP", "GitHub", "Scoped auth"],
            owner: "Platform",
            updatedAt: "4h ago",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenConnection",
              "Open connection",
            ),
          },
          {
            id: "mcp-self-hosted",
            name: "PromptHub Workspace Sync",
            description:
              "Keeps desktop assets aligned with self-hosted PromptHub workspaces across environments.",
            type: "Sync Target",
            status: t("settings.platformWorkbench.statusHealthy", "Healthy"),
            metric: "3 workspaces",
            chips: ["Sync", "Workspace", "Encrypted"],
            owner: "Infra",
            updatedAt: "30m ago",
            actionLabel: t(
              "settings.platformWorkbench.actionViewHealth",
              "View health",
            ),
          },
          {
            id: "mcp-docs-index",
            name: "Context Docs Index",
            description:
              "Indexes framework docs and internal references for grounded tool-assisted answers.",
            type: "Knowledge Source",
            status: t("settings.platformWorkbench.statusSyncing", "Syncing"),
            metric: "28 sources",
            chips: ["Docs", "RAG", "Index"],
            owner: "Knowledge Ops",
            updatedAt: "Now",
            actionLabel: t(
              "settings.platformWorkbench.actionInspectSource",
              "Inspect source",
            ),
          },
        ],
      },
      {
        id: "operations",
        label: t("settings.platformWorkbench.operationsLabel", "Operations"),
        eyebrow: t("settings.platformWorkbench.operationsEyebrow", "Runs"),
        title: t(
          "settings.platformWorkbench.operationsTitle",
          "Execution becomes observable and reviewable",
        ),
        description: t(
          "settings.platformWorkbench.operationsDesc",
          "Once Prompt, Skill, Agent and MCP all coexist, users need a unified surface for runs, failures, audits and release readiness.",
        ),
        summary: [
          {
            label: t("settings.platformWorkbench.summaryRuns", "Runs today"),
            value: "186",
            tone: "info",
          },
          {
            label: t("settings.platformWorkbench.summaryFailures", "Failures"),
            value: "7",
            tone: "warn",
          },
          {
            label: t(
              "settings.platformWorkbench.summaryRecovered",
              "Recovered",
            ),
            value: "5",
            tone: "good",
          },
        ],
        lanes: [
          {
            label: t("settings.platformWorkbench.laneRuns", "Execution runs"),
            value: "98",
            hint: t(
              "settings.platformWorkbench.laneRunsHint",
              "Recent tasks, jobs and automated sequences",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneAudit", "Audits"),
            value: "21",
            hint: t(
              "settings.platformWorkbench.laneAuditHint",
              "Security checks, publish reviews and quality gates",
            ),
          },
          {
            label: t("settings.platformWorkbench.laneReleases", "Releases"),
            value: "6",
            hint: t(
              "settings.platformWorkbench.laneReleasesHint",
              "Version plans, rollout state and rollback safety",
            ),
          },
        ],
        resources: [
          {
            id: "ops-release",
            name: "0.5.6 Release Readiness",
            description:
              "Tracks blockers, docs sync, upgrade messaging and packaging decisions across the release lane.",
            type: "Release Board",
            status: t("settings.platformWorkbench.statusAtRisk", "At risk"),
            metric: "3 blockers",
            chips: ["Release", "Desktop", "Docs sync"],
            owner: "Maintainer",
            updatedAt: "15m ago",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenBoard",
              "Open board",
            ),
          },
          {
            id: "ops-audit",
            name: "Skill Safety Review Queue",
            description:
              "Pending manual review items generated by static and AI-assisted safety scans.",
            type: "Audit Queue",
            status: t(
              "settings.platformWorkbench.statusNeedsReview",
              "Needs review",
            ),
            metric: "9 items",
            chips: ["Audit", "Safety", "Queue"],
            owner: "Security",
            updatedAt: "2h ago",
            actionLabel: t(
              "settings.platformWorkbench.actionReviewQueue",
              "Review queue",
            ),
          },
          {
            id: "ops-history",
            name: "Execution Timeline",
            description:
              "Unified timeline across prompt tests, agent runs, sync jobs and deployment actions.",
            type: "Timeline",
            status: t("settings.platformWorkbench.statusOnline", "Online"),
            metric: "24h retained",
            chips: ["Timeline", "Observability", "Cross-resource"],
            owner: "Workspace",
            updatedAt: "Live",
            actionLabel: t(
              "settings.platformWorkbench.actionOpenTimeline",
              "Open timeline",
            ),
          },
        ],
      },
    ],
    [t],
  );

  const activeSectionData =
    sections.find((section) => section.id === activeSection) ?? sections[0];

  const filteredResources = activeSectionData.resources.filter((resource) => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) {
      return true;
    }

    return [resource.name, resource.description, resource.type, ...resource.chips]
      .join(" ")
      .toLowerCase()
      .includes(lowered);
  });

  const [selectedResourceId, setSelectedResourceId] = useState(
    activeSectionData.resources[0]?.id ?? "",
  );

  useEffect(() => {
    if (
      !filteredResources.some((resource) => resource.id === selectedResourceId)
    ) {
      setSelectedResourceId(filteredResources[0]?.id ?? "");
    }
  }, [filteredResources, selectedResourceId]);

  const selectedResource =
    filteredResources.find((resource) => resource.id === selectedResourceId) ??
    filteredResources[0] ??
    activeSectionData.resources[0];

  const sectionIcons: Record<WorkbenchSectionId, typeof BlocksIcon> = {
    library: BlocksIcon,
    agents: BotIcon,
    mcp: CableIcon,
    operations: ActivityIcon,
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_24%),linear-gradient(180deg,rgba(8,15,29,0.92),rgba(7,10,20,0.9))] p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
              <AppWindowIcon className="h-3.5 w-3.5" />
              {t("settings.platformWorkbench.badge", "Future Workspace Preview")}
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight xl:text-3xl">
                {t(
                  "settings.platformWorkbench.heroTitle",
                  "From Prompt + Skill manager to an AI operations workspace",
                )}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/70 xl:text-[15px]">
                {t(
                  "settings.platformWorkbench.heroDesc",
                  "This prototype explores how PromptHub could grow into a unified platform for prompts, skills, agents, MCP integrations and execution history without forcing everything into the current two-mode shell.",
                )}
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 xl:max-w-xl">
            {[
              {
                label: t(
                  "settings.platformWorkbench.heroStatObjects",
                  "Managed objects",
                ),
                value: "4",
                hint: t(
                  "settings.platformWorkbench.heroStatObjectsHint",
                  "Prompt · Skill · Agent · MCP",
                ),
                icon: BlocksIcon,
              },
              {
                label: t(
                  "settings.platformWorkbench.heroStatLayers",
                  "Platform layers",
                ),
                value: "3",
                hint: t(
                  "settings.platformWorkbench.heroStatLayersHint",
                  "Assets · Connections · Runs",
                ),
                icon: WorkflowIcon,
              },
              {
                label: t("settings.platformWorkbench.heroStatGoal", "Goal"),
                value: t(
                  "settings.platformWorkbench.heroStatGoalValue",
                  "Clearer IA",
                ),
                hint: t(
                  "settings.platformWorkbench.heroStatGoalHint",
                  "Scale without UI entropy",
                ),
                icon: WandSparklesIcon,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.18em] text-white/55">
                    {stat.label}
                  </span>
                  <stat.icon className="h-4 w-4 text-white/60" />
                </div>
                <div className="text-2xl font-semibold">{stat.value}</div>
                <p className="mt-2 text-xs leading-5 text-white/60">{stat.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside className="rounded-3xl border border-border/70 bg-card/80 p-3 shadow-sm backdrop-blur-sm">
          <div className="mb-3 px-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {t("settings.platformWorkbench.sidebarTitle", "Platform map")}
            </div>
          </div>
          <div className="space-y-2">
            {sections.map((section) => {
              const Icon = sectionIcons[section.id];
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setActiveSection(section.id);
                    setSelectedResourceId(section.resources[0]?.id ?? "");
                  }}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-all ${
                    active
                      ? "border-primary/40 bg-primary/10 shadow-[0_12px_28px_rgba(59,130,246,0.14)]"
                      : "border-transparent bg-muted/35 hover:border-border hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 rounded-xl p-2 ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground"
                      }`}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {section.eyebrow}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {section.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {section.resources.length} {t("settings.platformWorkbench.items", "items")}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BriefcaseBusinessIcon className="h-4 w-4 text-primary" />
              {t("settings.platformWorkbench.sidebarFootTitle", "Design signal")}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {t(
                "settings.platformWorkbench.sidebarFootDesc",
                "Main navigation shifts from object count to domain structure: assets, automations, integrations and operations.",
              )}
            </p>
          </div>
        </aside>

        <section className="rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-4 border-b border-border/70 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {activeSectionData.eyebrow}
                </div>
                <h3 className="mt-1 text-xl font-semibold text-foreground">
                  {activeSectionData.title}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {activeSectionData.description}
                </p>
              </div>

              <div className="flex w-full gap-2 lg:max-w-md">
                <div className="relative flex-1">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    aria-label={t(
                      "settings.platformWorkbench.searchPlaceholder",
                      "Search resources, capabilities or integrations...",
                    )}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t(
                      "settings.platformWorkbench.searchPlaceholder",
                      "Search resources, capabilities or integrations...",
                    )}
                    className="pl-10"
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ListFilterIcon aria-hidden="true" className="h-4 w-4" />
                  {t("settings.platformWorkbench.filter", "Filter")}
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {activeSectionData.summary.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl border px-4 py-3 ${toneClass(item.tone)}`}
                >
                  <div className="text-xs uppercase tracking-[0.16em] opacity-75">
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {activeSectionData.lanes.map((lane) => (
              <div
                key={lane.label}
                className="rounded-2xl border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {lane.label}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {lane.value}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {lane.hint}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {filteredResources.map((resource) => {
              const selected = resource.id === selectedResource?.id;
              return (
                <button
                  key={resource.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedResourceId(resource.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                    selected
                      ? "border-primary/40 bg-primary/5 shadow-[0_16px_30px_rgba(59,130,246,0.08)]"
                      : "border-border/70 bg-background/60 hover:border-primary/20 hover:bg-background"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          {resource.name}
                        </h4>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {resource.type}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {resource.status}
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {resource.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {resource.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground/80"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex min-w-[148px] flex-col items-start gap-2 lg:items-end">
                      <div className="text-sm font-semibold text-foreground">
                        {resource.metric}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {resource.updatedAt}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredResources.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                {t(
                  "settings.platformWorkbench.emptySearch",
                  "No prototype items match the current search.",
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
          {selectedResource ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {t("settings.platformWorkbench.contextTitle", "Context panel")}
                </div>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  {selectedResource.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedResource.description}
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  {
                    icon: selectedResource.type.includes("Agent")
                      ? BotIcon
                      : selectedResource.type.includes("MCP")
                        ? ServerCogIcon
                        : selectedResource.type.includes("Prompt")
                          ? CommandIcon
                          : SparklesIcon,
                    label: t("settings.platformWorkbench.metaType", "Type"),
                    value: selectedResource.type,
                  },
                  {
                    icon: ShieldCheckIcon,
                    label: t("settings.platformWorkbench.metaStatus", "Status"),
                    value: selectedResource.status,
                  },
                  {
                    icon: GlobeIcon,
                    label: t("settings.platformWorkbench.metaOwner", "Owner"),
                    value: selectedResource.owner,
                  },
                  {
                    icon: CircleDashedIcon,
                    label: t("settings.platformWorkbench.metaUpdated", "Updated"),
                    value: selectedResource.updatedAt,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-3"
                  >
                    <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-foreground">
                        {item.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FolderKanbanIcon className="h-4 w-4 text-primary" />
                  {t("settings.platformWorkbench.whyTitle", "Why this matters")}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {activeSection === "library"
                    ? t(
                        "settings.platformWorkbench.whyLibrary",
                        "Prompts and skills can still feel familiar, but they no longer need to shoulder every future object type in the product.",
                      )
                    : activeSection === "agents"
                      ? t(
                          "settings.platformWorkbench.whyAgents",
                          "Agents deserve their own lifecycle, observability and guardrails instead of being buried as prompt conventions or skill metadata hacks.",
                        )
                      : activeSection === "mcp"
                        ? t(
                            "settings.platformWorkbench.whyMcp",
                            "MCP and provider configuration is operational infrastructure. Treating it as a connection surface keeps auth, health and environment concerns explicit.",
                          )
                        : t(
                            "settings.platformWorkbench.whyOperations",
                            "As the platform grows, users need a home for runs, audits and release status that cuts across every resource type.",
                          )}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  <ArrowUpRightIcon aria-hidden="true" className="h-4 w-4" />
                  {selectedResource.actionLabel}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <DatabaseIcon aria-hidden="true" className="h-4 w-4" />
                  {t("settings.platformWorkbench.actionCompare", "Compare model")}
                </button>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CpuIcon className="h-4 w-4 text-primary" />
                  {t("settings.platformWorkbench.noteTitle", "Prototype note")}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t(
                    "settings.platformWorkbench.noteDesc",
                    "This page is intentionally driven by mock structure. The goal is to preview a scalable navigation and workspace shape before migrating the real Prompt / Skill shell.",
                  )}
                </p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
