import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Settings2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AgentServiceDomain,
  ManagedAgentSummary,
  SkillProject,
} from "@prompthub/shared/types";
import { useAgentStore } from "../../stores/agent.store";
import { isWebRuntime } from "../../runtime";
import { useSettingsStore } from "../../stores/settings.store";
import { ContextMenu } from "../ui/ContextMenu";
import { PlatformIcon } from "../ui/PlatformIcon";
import { Spinner } from "../ui/Spinner";
import {
  AGENT_WORKSPACE_TABS,
  getAgentWorkspaceTabs,
  getAgentCapabilityGuidance,
  getAgentTabStatus,
  isAgentAssetDomain,
  isAgentTabEnabled,
  type AgentWorkspaceNavigate,
  type AgentWorkspaceTabKey,
} from "./agent-workspace-tabs";

const AgentAppearancePanel = lazy(() =>
  import("./AgentAppearancePanel").then((module) => ({
    default: module.AgentAppearancePanel,
  })),
);
const AgentAssetsWorkspace = lazy(() =>
  import("./AgentAssetsWorkspace").then((module) => ({
    default: module.AgentAssetsWorkspace,
  })),
);
const AgentDeepSeekHarnessPanel = lazy(() =>
  import("./AgentDeepSeekHarnessPanel").then((module) => ({
    default: module.AgentDeepSeekHarnessPanel,
  })),
);
const AgentConfigFilesPanel = lazy(() =>
  import("./AgentConfigFilesPanel").then((module) => ({
    default: module.AgentConfigFilesPanel,
  })),
);
const AgentDefinitionsPanel = lazy(() =>
  import("./AgentDefinitionsPanel").then((module) => ({
    default: module.AgentDefinitionsPanel,
  })),
);
const AgentOverviewPanel = lazy(() =>
  import("./AgentOverviewPanel").then((module) => ({
    default: module.AgentOverviewPanel,
  })),
);
const AgentProviderModelWorkbench = lazy(() =>
  import("./AgentProviderModelWorkbench").then((module) => ({
    default: module.AgentProviderModelWorkbench,
  })),
);
const AgentSessionsPanel = lazy(() =>
  import("./AgentSessionsPanel").then((module) => ({
    default: module.AgentSessionsPanel,
  })),
);
const AgentSettingsDialog = lazy(() =>
  import("./AgentSettingsDialog").then((module) => ({
    default: module.AgentSettingsDialog,
  })),
);
const WebAgentServicesWorkspace = lazy(() =>
  import("./WebAgentServicesWorkspace").then((module) => ({
    default: module.WebAgentServicesWorkspace,
  })),
);

interface AgentWorkspaceTarget {
  tab: AgentWorkspaceTabKey;
}

function AgentPanelFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner size="sm" />
      <span>{t("common.loading", "Loading...")}</span>
    </div>
  );
}

function isWorkspaceTabEnabled(
  agent: ManagedAgentSummary,
  tab: (typeof AGENT_WORKSPACE_TABS)[number],
): boolean {
  return isWebRuntime() || isAgentTabEnabled(agent, tab);
}

function StatusBadge({ agent }: { agent: ManagedAgentSummary }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {agent.isDetected ? (
        <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500" />
      )}
      {t(`agents.${agent.status}`, agent.status)}
    </span>
  );
}

function AgentIdentity({ agent }: { agent: ManagedAgentSummary }) {
  const { t } = useTranslation();
  const isEnterpriseLegacy = agent.lifecycle === "enterprise-legacy";

  return (
    <div className="flex min-w-0 max-w-full flex-1 basis-[20rem] items-center gap-4">
      <span
        data-testid="agent-identity-icon"
        className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md"
      >
        <PlatformIcon platformId={agent.displayIconId || agent.id} size={52} />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold text-foreground">
            {agent.name}
          </h1>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge agent={agent} />
          <span aria-hidden="true" className="text-muted-foreground/45">
            •
          </span>
          <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {agent.paths.root}
          </p>
        </div>
        {isEnterpriseLegacy ? (
          <p className="mt-2 max-w-2xl text-xs leading-5 text-amber-800 dark:text-amber-200">
            {t(
              "agents.geminiConsumerRetired",
              "Consumer access ended on June 18, 2026. Use Antigravity unless you have an enterprise license or paid API key.",
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AgentOverflowMenu({
  onRefresh,
  onEdit,
}: {
  onRefresh: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={position !== null}
        aria-label={t("agents.moreActions", "More actions")}
        title={t("agents.moreActions", "More actions")}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition((current) =>
            current ? null : { x: rect.right, y: rect.bottom + 4 },
          );
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontalIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      {position ? (
        <ContextMenu
          x={position.x}
          y={position.y}
          onClose={() => setPosition(null)}
          items={[
            {
              label: t("agents.refresh", "Refresh"),
              icon: <RefreshCwIcon className="h-4 w-4" />,
              onClick: onRefresh,
            },
            {
              label: t("agents.editAgent", "Edit Agent"),
              icon: <Settings2Icon className="h-4 w-4" />,
              onClick: onEdit,
            },
          ]}
        />
      ) : null}
    </>
  );
}

function AgentHeaderActions({
  agent,
  onLaunch,
  onRefresh,
  onEdit,
}: {
  agent: ManagedAgentSummary;
  onLaunch: () => void;
  onRefresh: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
      {agent.isDetected && agent.launchable ? (
        <button
          type="button"
          onClick={onLaunch}
          aria-label={t("agents.openAgent", { agent: agent.name })}
          className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <ExternalLinkIcon aria-hidden="true" className="h-4 w-4" />
          {t("common.open", "Open")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        aria-label={t("agents.refresh", "Refresh")}
        title={t("agents.refresh", "Refresh")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      {agent.isDetected || isWebRuntime() ? (
        <AgentOverflowMenu onRefresh={onRefresh} onEdit={onEdit} />
      ) : null}
    </div>
  );
}

function AgentTabs({
  activeTab,
  agent,
  onSelect,
}: {
  activeTab: AgentWorkspaceTabKey;
  agent: ManagedAgentSummary;
  onSelect: (tab: AgentWorkspaceTabKey) => void;
}) {
  const { t } = useTranslation();
  const tabRefs = useRef(new Map<AgentWorkspaceTabKey, HTMLButtonElement>());
  const tabs = getAgentWorkspaceTabs(agent);
  const enabledTabs = tabs.filter((tab) => isWorkspaceTabEnabled(agent, tab));

  useEffect(() => {
    const focusedElement = document.activeElement;
    const focusWasInTablist = [...tabRefs.current.values()].some(
      (element) => element === focusedElement,
    );
    if (focusWasInTablist) tabRefs.current.get(activeTab)?.focus();
  }, [activeTab, agent.id]);

  function selectAndFocus(tab: AgentWorkspaceTabKey) {
    onSelect(tab);
    tabRefs.current.get(tab)?.focus();
  }

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    tab: AgentWorkspaceTabKey,
  ) {
    const currentIndex = enabledTabs.findIndex((item) => item.key === tab);
    if (currentIndex < 0) return;

    let targetIndex: number | null = null;
    if (event.key === "ArrowRight") {
      targetIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (event.key === "ArrowLeft") {
      targetIndex =
        (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = enabledTabs.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    selectAndFocus(enabledTabs[targetIndex].key);
  }

  return (
    <div
      role="tablist"
      aria-label={t("agents.workspaceTabs", "Agent workspace")}
      className="flex gap-4 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const enabled = isWorkspaceTabEnabled(agent, tab);
        const selected = activeTab === tab.key;
        const guidance = enabled
          ? null
          : getAgentCapabilityGuidance(getAgentTabStatus(agent, tab));
        return (
          <button
            key={tab.key}
            ref={(element) => {
              if (element) tabRefs.current.set(tab.key, element);
              else tabRefs.current.delete(tab.key);
            }}
            id={`agent-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="agent-workspace-panel"
            disabled={!enabled}
            tabIndex={selected ? 0 : -1}
            title={guidance ? t(guidance.key, guidance.fallback) : undefined}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
            className={`shrink-0 border-b-2 px-0.5 py-3.5 text-sm font-medium transition-colors ${selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"} disabled:cursor-not-allowed disabled:opacity-35`}
          >
            {t(tab.labelKey, tab.fallback)}
          </button>
        );
      })}
    </div>
  );
}

function AgentWorkspacePanel({
  agent,
  agents,
  projects,
  onNavigate,
  onAssetDetailOpenChange,
  target,
}: {
  agent: ManagedAgentSummary;
  agents: ManagedAgentSummary[];
  projects: SkillProject[];
  onNavigate: AgentWorkspaceNavigate;
  onAssetDetailOpenChange: (isOpen: boolean) => void;
  target: AgentWorkspaceTarget;
}) {
  const { t } = useTranslation();
  const meta =
    AGENT_WORKSPACE_TABS.find((tab) => tab.key === target.tab) ||
    AGENT_WORKSPACE_TABS[0];
  const webDomain =
    target.tab === "overview" ? undefined : (target.tab as AgentServiceDomain);
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div
        id="agent-workspace-panel"
        role="tabpanel"
        aria-labelledby={`agent-tab-${meta.key}`}
        className="flex h-full min-h-0 flex-col"
      >
        <Suspense fallback={<AgentPanelFallback />}>
          {isWebRuntime() ? (
            target.tab === "configFiles" ? (
              <AgentConfigFilesPanel agent={agent} />
            ) : target.tab === "provider" ? (
              <AgentProviderModelWorkbench key={agent.id} agent={agent} />
            ) : target.tab === "sessions" ? (
              <AgentSessionsPanel
                key={agent.id}
                agent={agent}
                agents={agents}
                projects={projects}
              />
            ) : (
              <WebAgentServicesWorkspace agent={agent} domain={webDomain} />
            )
          ) : (
            <>
              {target.tab === "overview" ? (
                <AgentOverviewPanel agent={agent} onNavigate={onNavigate} />
              ) : null}
              {target.tab === "plugins" &&
              agent.workspaceKind === "plugin-harness" ? (
                <AgentDeepSeekHarnessPanel key={agent.id} />
              ) : null}
              {isAgentAssetDomain(target.tab) &&
              agent.workspaceKind !== "plugin-harness" ? (
                <AgentAssetsWorkspace
                  agent={agent}
                  domain={target.tab}
                  onDetailOpenChange={onAssetDetailOpenChange}
                />
              ) : null}
              {target.tab === "definitions" ? (
                <AgentDefinitionsPanel key={agent.id} agent={agent} />
              ) : null}
              {target.tab === "provider" ? (
                <AgentProviderModelWorkbench key={agent.id} agent={agent} />
              ) : null}
              {target.tab === "appearance" ? (
                <AgentAppearancePanel key={agent.id} agent={agent} />
              ) : null}
              {target.tab === "configFiles" ? (
                <AgentConfigFilesPanel agent={agent} />
              ) : null}
              {target.tab === "sessions" ? (
                <AgentSessionsPanel
                  key={agent.id}
                  agent={agent}
                  agents={agents}
                  projects={projects}
                />
              ) : null}
            </>
          )}
        </Suspense>
      </div>
    </main>
  );
}

export function AgentsWorkspace() {
  const { t } = useTranslation();
  const agents = useAgentStore((state) => state.agents);
  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const ensureLoaded = useAgentStore((state) => state.ensureLoaded);
  const refresh = useAgentStore((state) => state.refresh);
  const projects = useSettingsStore((state) => state.skillProjects);
  const [target, setTarget] = useState<AgentWorkspaceTarget>({
    tab: "overview",
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);
  const agent = useMemo(
    () => agents.find((item) => item.id === selectedAgentId) || agents[0],
    [agents, selectedAgentId],
  );

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    const tab = AGENT_WORKSPACE_TABS.find((item) => item.key === target.tab);
    if (agent && tab && !isWorkspaceTabEnabled(agent, tab))
      setTarget({ tab: "overview" });
  }, [target.tab, agent]);

  useEffect(() => {
    setIsSettingsOpen(false);
  }, [agent?.id]);

  useEffect(() => {
    setIsAssetDetailOpen(false);
  }, [agent?.id, agent?.paths.root, target.tab]);

  if (!agent) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("agents.noAgents", "No Agents are available.")}
      </div>
    );
  }

  const handleNavigate: AgentWorkspaceNavigate = (tab) => setTarget({ tab });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {!isAssetDetailOpen ? (
        <header className="border-b border-border bg-card px-5 pb-0 pt-6 shadow-sm app-wallpaper-panel-strong">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <AgentIdentity agent={agent} />
            <AgentHeaderActions
              agent={agent}
              onLaunch={() => void window.api.agent.launch(agent.id)}
              onRefresh={() => void refresh()}
              onEdit={() => setIsSettingsOpen(true)}
            />
          </div>
          <AgentTabs
            activeTab={target.tab}
            agent={agent}
            onSelect={(tab) => setTarget({ tab })}
          />
        </header>
      ) : null}
      <AgentWorkspacePanel
        key={JSON.stringify([agent.id, agent.paths.root])}
        target={target}
        agent={agent}
        agents={agents}
        projects={projects}
        onNavigate={handleNavigate}
        onAssetDetailOpenChange={setIsAssetDetailOpen}
      />
      {isSettingsOpen ? (
        <Suspense fallback={null}>
          <AgentSettingsDialog
            agent={agent}
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
