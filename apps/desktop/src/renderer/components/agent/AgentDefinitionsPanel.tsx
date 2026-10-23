import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BotIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  TerminalSquareIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type {
  AgentDefinitionEntry,
  AgentDefinitionKind,
  AgentDefinitionListRequest,
  AgentDefinitionListResult,
  AgentDefinitionScope,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import { AgentExtensionsPanel } from "./AgentExtensionsPanel";
import { getAgentExtensionCapability } from "@prompthub/shared/constants/agent-extension-capabilities";

function selectedId(entry: AgentDefinitionEntry): string {
  return `${entry.kind}:${entry.relativePath}`;
}

function warningText(warning: string, t: TFunction): string {
  const fallbacks: Record<string, string> = {
    "file-too-large": "The file exceeds the safe preview size.",
    "invalid-frontmatter": "The YAML frontmatter is invalid.",
    "missing-body": "The Markdown body is empty.",
    "missing-name": "The SubAgent name is missing.",
    "missing-description": "The description is missing.",
    "invalid-metadata": "Some metadata fields are invalid.",
    "metadata-truncated": "Long metadata was truncated.",
    "sensitive-metadata-redacted": "Sensitive-looking metadata was hidden.",
  };
  return t(
    `agents.definitionsPanel.warnings.${warning}`,
    fallbacks[warning] ?? warning,
  );
}

function KindIcon({ kind }: { kind: AgentDefinitionKind }) {
  return kind === "subagent" ? (
    <BotIcon aria-hidden="true" className="h-4 w-4" />
  ) : (
    <TerminalSquareIcon aria-hidden="true" className="h-4 w-4" />
  );
}

function DefinitionDetail({
  entry,
  opening,
  onOpen,
}: {
  entry: AgentDefinitionEntry;
  opening: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      data-testid="agent-definition-detail"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KindIcon kind={entry.kind} />
            <h2 className="truncate text-base font-semibold text-foreground">
              {entry.name}
            </h2>
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                entry.status === "valid"
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 text-amber-700 dark:text-amber-300"
              }`}
            >
              {t(
                `agents.definitionsPanel.status.${entry.status}`,
                entry.status,
              )}
            </span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {entry.relativePath}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={opening}
          aria-label={t("agents.definitionsPanel.openFile", "Open file")}
          title={t("agents.definitionsPanel.openFile", "Open file")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {opening ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLinkIcon className="h-4 w-4" />
          )}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <dl className="divide-y divide-border">
          <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="text-xs font-semibold text-muted-foreground">
              {t("agents.definitionsPanel.description", "Description")}
            </dt>
            <dd className="text-sm leading-6 text-foreground">
              {entry.description ??
                t("agents.definitionsPanel.notDeclared", "Not declared")}
            </dd>
          </div>
          {entry.kind === "subagent" ? (
            <>
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-xs font-semibold text-muted-foreground">
                  {t("agents.definitionsPanel.model", "Model")}
                </dt>
                <dd className="text-sm text-foreground">
                  {entry.model ??
                    t("agents.definitionsPanel.inherit", "Inherit")}
                </dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-xs font-semibold text-muted-foreground">
                  {t("agents.definitionsPanel.approvalMode", "Approval mode")}
                </dt>
                <dd className="text-sm text-foreground">
                  {entry.approvalMode ??
                    t("agents.definitionsPanel.inherit", "Inherit")}
                </dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-xs font-semibold text-muted-foreground">
                  {t("agents.definitionsPanel.tools", "Tools")}
                </dt>
                <dd className="break-words font-mono text-xs text-foreground">
                  {entry.tools.join(", ") ||
                    t("agents.definitionsPanel.inherit", "Inherit")}
                </dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-xs font-semibold text-muted-foreground">
                  {t(
                    "agents.definitionsPanel.disallowedTools",
                    "Disallowed tools",
                  )}
                </dt>
                <dd className="break-words font-mono text-xs text-foreground">
                  {entry.disallowedTools.join(", ") ||
                    t("agents.definitionsPanel.none", "None")}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        {entry.warnings.length > 0 ? (
          <div className="mt-4 space-y-2">
            {entry.warnings.map((warning) => (
              <p
                key={warning}
                className="flex items-start gap-2 border-l-2 border-amber-500 px-3 py-1.5 text-xs leading-5 text-muted-foreground"
              >
                <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {warningText(warning, t)}
              </p>
            ))}
          </div>
        ) : null}
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          {t(
            "agents.definitionsPanel.bodyExcluded",
            "Definition bodies stay in Qwen Code and are not copied into PromptHub, backup, or sync.",
          )}
        </p>
      </div>
    </section>
  );
}

function QwenDefinitionsPanel() {
  const { t } = useTranslation();
  const projects = useSettingsStore((state) => state.skillProjects);
  const [scope, setScope] = useState<AgentDefinitionScope>("user");
  const [kind, setKind] = useState<AgentDefinitionKind>("subagent");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AgentDefinitionListResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (projects.some((project) => project.id === projectId)) return;
    setProjectId(projects[0]?.id ?? "");
  }, [projectId, projects]);

  const load = useCallback(async () => {
    if (scope === "project" && !projectId) {
      setResult(null);
      setError(false);
      setLoading(false);
      return;
    }
    const request: AgentDefinitionListRequest = {
      agentId: "qwen",
      scope,
      ...(scope === "project" ? { projectId } : {}),
    };
    setLoading(true);
    setError(false);
    try {
      const next = await window.api.agent.listDefinitions(request);
      setResult(next);
    } catch {
      setResult(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (result?.entries ?? []).filter(
      (entry) =>
        entry.kind === kind &&
        (!normalizedQuery ||
          entry.name.toLocaleLowerCase().includes(normalizedQuery) ||
          entry.relativePath.toLocaleLowerCase().includes(normalizedQuery) ||
          entry.description?.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [kind, query, result]);

  const selectedEntry =
    filtered.find((entry) => selectedId(entry) === selected) ??
    filtered[0] ??
    null;

  async function openSelected(entry: AgentDefinitionEntry): Promise<void> {
    setOpening(true);
    try {
      await window.api.agent.openDefinition({
        agentId: "qwen",
        scope,
        ...(scope === "project" ? { projectId } : {}),
        kind: entry.kind,
        relativePath: entry.relativePath,
      });
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="inline-flex rounded-md bg-muted p-1">
          {(["user", "project"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={scope === item}
              onClick={() => setScope(item)}
              className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                scope === item
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`agents.definitionsPanel.scope.${item}`, item)}
            </button>
          ))}
        </div>
        {scope === "project" && projects.length > 0 ? (
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label={t("agents.definitionsPanel.project", "Project")}
            className="h-9 max-w-64 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="inline-flex rounded-md bg-muted p-1">
          {(["subagent", "command"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={kind === item}
              onClick={() => {
                setKind(item);
                setSelected(null);
              }}
              className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                kind === item
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(
                `agents.definitionsPanel.kind.${item}`,
                item === "subagent" ? "SubAgents" : "Commands",
              )}
            </button>
          ))}
        </div>
        <label className="relative min-w-48 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <span className="sr-only">
            {t("agents.definitionsPanel.search", "Search definitions")}
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              "agents.definitionsPanel.search",
              "Search definitions",
            )}
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label={t("agents.definitionsPanel.refresh", "Refresh")}
          title={t("agents.definitionsPanel.refresh", "Refresh")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCwIcon
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </header>

      {scope === "project" && projects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {t(
            "agents.definitionsPanel.noProjects",
            "Add a project before browsing project definitions.",
          )}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangleIcon className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-semibold text-foreground">
            {t(
              "agents.definitionsPanel.loadFailed",
              "Definitions could not be loaded.",
            )}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent"
          >
            {t("common.retry", "Retry")}
          </button>
        </div>
      ) : loading && !result ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {result?.truncated ? (
            <p className="shrink-0 border-b border-amber-500/30 bg-amber-500/[0.06] px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
              {t(
                "agents.definitionsPanel.truncated",
                "The inventory reached its safety limit. Narrow the source or search locally.",
              )}
            </p>
          ) : null}
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-r border-border">
              {filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-sm text-muted-foreground">
                  <FileCode2Icon className="h-8 w-8 opacity-50" />
                  {t(
                    "agents.definitionsPanel.empty",
                    "No definitions match this view.",
                  )}
                </div>
              ) : (
                <ul
                  aria-label={t("agents.definitionsPanel.list", "Definitions")}
                >
                  {filtered.map((entry) => {
                    const id = selectedId(entry);
                    const active = selectedId(selectedEntry!) === id;
                    return (
                      <li key={id} className="border-b border-border/60">
                        <button
                          type="button"
                          aria-current={active}
                          onClick={() => setSelected(id)}
                          className={`w-full border-l-2 px-4 py-3 text-left transition-colors ${
                            active
                              ? "border-primary bg-accent"
                              : "border-transparent hover:bg-accent/60"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <KindIcon kind={entry.kind} />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                              {entry.name}
                            </span>
                          </span>
                          <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                            {entry.relativePath}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
            {selectedEntry ? (
              <DefinitionDetail
                entry={selectedEntry}
                opening={opening}
                onOpen={() => void openSelected(selectedEntry)}
              />
            ) : (
              <div className="flex items-center justify-center text-sm text-muted-foreground">
                {t(
                  "agents.definitionsPanel.select",
                  "Select a definition to inspect it.",
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AgentDefinitionsPanel({
  agent,
}: {
  agent: ManagedAgentSummary;
}) {
  return getAgentExtensionCapability(agent.id) ? (
    <AgentExtensionsPanel key={agent.id} agentId={agent.id} />
  ) : agent.id === "qwen" ? (
    <QwenDefinitionsPanel />
  ) : null;
}
