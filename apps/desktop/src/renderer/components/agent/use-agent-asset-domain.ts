import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  AgentAssetAggregate,
  AgentAssetDomainResult,
  AgentAssetTargetState,
} from "@prompthub/core/agent-management/asset-aggregation";
import type { ManagedAgentSummary } from "@prompthub/shared/types";
import {
  agentAssetAggregationService,
  readAgentAssetAggregate,
} from "../../services/agent-asset-domain-adapters";
import { useMcpStore } from "../../stores/mcp.store";
import { usePluginStore } from "../../stores/plugin.store";
import { useRulesStore } from "../../stores/rules.store";
import { useSkillStore } from "../../stores/skill.store";

export type AgentAssetDomain = "skills" | "mcp" | "rules" | "plugins";
export type AgentAssetLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "stale"
  | "failed";

export interface AgentAssetItem {
  id: string;
  label: string;
  meta?: string;
  state: string;
}

export interface AgentAssetInventory {
  items: AgentAssetItem[];
  isLoading: boolean;
  loadState: AgentAssetLoadState;
  status: AgentAssetDomainResult["status"];
  errorCode?: AgentAssetDomainResult["errorCode"];
  refresh: () => void;
}

interface AgentAssetInventoryOptions {
  eagerDomains?: readonly AgentAssetDomain[];
  validate?: boolean;
}

const ALL_ASSET_DOMAINS: readonly AgentAssetDomain[] = [
  "skills",
  "mcp",
  "rules",
  "plugins",
];

const DOMAIN_KIND = {
  skills: "skill",
  mcp: "mcp",
  rules: "rule",
  plugins: "plugin",
} as const;

interface AgentAssetLoadFacts {
  error: string | null | undefined;
  hasLoaded: boolean;
  isLoading: boolean;
}

function resolveLoadState(facts: AgentAssetLoadFacts): AgentAssetLoadState {
  if (facts.hasLoaded) {
    if (facts.isLoading) return "refreshing";
    return facts.error ? "stale" : "ready";
  }
  if (facts.isLoading) return "loading";
  return facts.error ? "failed" : "idle";
}

async function runBoundedSummaryTasks(
  tasks: Array<() => Promise<unknown>>,
  shouldStop: () => boolean,
): Promise<void> {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (!shouldStop()) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index];
      if (!task) return;
      try {
        await task();
      } catch {
        // Owning stores retain the typed lifecycle state surfaced by the UI.
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(2, tasks.length) }, () => worker()),
  );
}

function emptyAggregate(platformId: string): AgentAssetAggregate {
  return {
    platformId,
    total: 0,
    domains: Object.values(DOMAIN_KIND).map((kind) => ({
      kind,
      status: "available",
      items: [],
    })),
  };
}

function failedAggregate(platformId: string): AgentAssetAggregate {
  const aggregate = emptyAggregate(platformId);
  return {
    ...aggregate,
    domains: aggregate.domains.map((domain) => ({
      ...domain,
      errorCode: "asset-domain-list-failed",
      status: "failed",
    })),
  };
}

function itemMeta(
  item: AgentAssetTargetState,
  t: ReturnType<typeof useTranslation>["t"],
): string | undefined {
  if (item.kind === "skill") {
    return item.state === "managed"
      ? t("agents.managed", "Managed")
      : t("agents.external", "External");
  }
  if (item.kind === "mcp") {
    return t("agents.configured", "Configured");
  }
  if (item.kind === "rule") {
    return item.state === "detected"
      ? t("agents.detected", "Detected")
      : t(`rules.syncStatus.${item.state}`, item.state);
  }
  const version = item.metadata?.version;
  return typeof version === "string" && version.trim() ? version : undefined;
}

function mapItems(
  domain: AgentAssetDomainResult | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): AgentAssetItem[] {
  return (domain?.items ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    meta: itemMeta(item, t),
    state: item.state,
  }));
}

export function useAgentAssetInventoryMap(
  agent: ManagedAgentSummary,
  options: AgentAssetInventoryOptions = {},
): Record<AgentAssetDomain, AgentAssetInventory> {
  const { t } = useTranslation();
  const eagerDomains = options.eagerDomains ?? ALL_ASSET_DOMAINS;
  const validate = options.validate ?? true;
  const eagerSkills = eagerDomains.includes("skills");
  const eagerMcp = eagerDomains.includes("mcp");
  const eagerRules = eagerDomains.includes("rules");
  const eagerPlugins = eagerDomains.includes("plugins");
  const assetsEnabled =
    agent.capabilities.assets.status === "supported" ||
    agent.capabilities.assets.status === "partial";
  const skillLibrary = useSkillStore((state) => state.skills);
  const skillScan = useSkillStore((state) => state.agentScanState[agent.id]);
  const mcpPresets = useMcpStore((state) => state.targetPresets);
  const mcpStatus = useMcpStore((state) => state.targetStatus);
  const mcpLoaded = useMcpStore((state) => state.hasLoadedTargetInventory);
  const mcpLoading = useMcpStore((state) => state.isLoadingTargetInventory);
  const mcpError = useMcpStore((state) => state.targetInventoryError);
  const loadMcp = useMcpStore((state) => state.loadTargetInventory);
  const ruleFiles = useRulesStore((state) => state.files);
  const availableRuleFiles = useRulesStore((state) => state.availableFiles);
  const rulesLoaded = useRulesStore((state) => state.hasLoadedFiles);
  const rulesLoading = useRulesStore((state) => state.isLoading);
  const rulesError = useRulesStore((state) => state.error);
  const loadRules = useRulesStore((state) => state.loadFiles);
  const pluginTargets = usePluginStore((state) => state.targetMatrix);
  const pluginsLoaded = usePluginStore(
    (state) => state.hasLoadedTargetInventory,
  );
  const pluginsLoading = usePluginStore(
    (state) => state.isLoadingTargetInventory,
  );
  const pluginsError = usePluginStore((state) => state.targetInventoryError);
  const loadPlugins = usePluginStore((state) => state.loadTargetInventory);
  const [validation, setValidation] = useState<AgentAssetAggregate | null>(
    null,
  );

  useEffect(() => {
    if (!assetsEnabled) return;
    let cancelled = false;
    const tasks: Array<() => Promise<unknown>> = [];

    if (eagerSkills && agent.paths.skills && agent.isDetected) {
      tasks.push(async () => {
        const state = useSkillStore.getState();
        const scan = state.agentScanState[agent.id];
        const requests: Promise<unknown>[] = [];
        if (state.skills.length === 0 && !state.isLoading) {
          requests.push(state.loadSkills({ preferCache: true }));
        }
        if (!scan?.result && !scan?.isScanning && !scan?.error) {
          requests.push(state.scanAgentPlatformSkills(agent.id));
        }
        await Promise.allSettled(requests);
      });
    }
    if (eagerMcp && agent.paths.mcp) {
      tasks.push(() => loadMcp());
    }
    if (eagerRules && agent.paths.rules) {
      tasks.push(() => {
        const state = useRulesStore.getState();
        if (state.hasLoadedFiles || state.isLoading || state.error) {
          return Promise.resolve();
        }
        return loadRules({ selectInitial: false });
      });
    }
    if (eagerPlugins && agent.paths.plugins) {
      tasks.push(() => loadPlugins());
    }

    void runBoundedSummaryTasks(tasks, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [
    agent.id,
    agent.isDetected,
    agent.paths.mcp,
    agent.paths.plugins,
    agent.paths.rules,
    agent.paths.skills,
    assetsEnabled,
    eagerMcp,
    eagerPlugins,
    eagerRules,
    eagerSkills,
    loadMcp,
    loadPlugins,
    loadRules,
  ]);

  const aggregate = useMemo(
    () => readAgentAssetAggregate(agent.id),
    [
      agent.id,
      mcpPresets,
      mcpStatus,
      pluginTargets,
      ruleFiles,
      availableRuleFiles,
      skillLibrary,
      skillScan?.result,
    ],
  );

  useEffect(() => {
    if (!assetsEnabled || !validate) {
      setValidation(null);
      return;
    }
    let active = true;
    void agentAssetAggregationService
      .listForTarget(agent.id)
      .then((next) => {
        if (!active) return;
        const hasFailure = next.domains.some(
          (domain) => domain.status !== "available",
        );
        setValidation((current) =>
          hasFailure ? next : current?.platformId === agent.id ? null : current,
        );
      })
      .catch(() => {
        if (active) setValidation(failedAggregate(agent.id));
      });
    return () => {
      active = false;
    };
  }, [
    agent.id,
    assetsEnabled,
    validate,
    mcpPresets,
    mcpStatus,
    pluginTargets,
    ruleFiles,
    availableRuleFiles,
    skillLibrary,
    skillScan?.result,
  ]);

  const refreshSkills = useCallback(() => {
    if (assetsEnabled && agent.isDetected) {
      void useSkillStore.getState().scanAgentPlatformSkills(agent.id);
    }
  }, [agent.id, agent.isDetected, assetsEnabled]);
  const refreshMcp = useCallback(() => {
    if (assetsEnabled) void loadMcp({ force: true });
  }, [assetsEnabled, loadMcp]);
  const refreshRules = useCallback(() => {
    if (assetsEnabled) void loadRules({ force: true });
  }, [assetsEnabled, loadRules]);
  const refreshPlugins = useCallback(() => {
    if (assetsEnabled) void loadPlugins({ force: true });
  }, [assetsEnabled, loadPlugins]);

  return useMemo(() => {
    const current = aggregate;
    const byKind = new Map(
      current.domains.map((domain) => [domain.kind, domain]),
    );
    const validationByKind =
      validation?.platformId === agent.id
        ? new Map(validation.domains.map((domain) => [domain.kind, domain]))
        : null;
    const build = (
      domain: AgentAssetDomain,
      facts: AgentAssetLoadFacts,
      refresh: () => void,
    ): AgentAssetInventory => {
      const result = byKind.get(DOMAIN_KIND[domain]);
      const validated = validationByKind?.get(DOMAIN_KIND[domain]);
      const loadState = resolveLoadState(facts);
      return {
        items: mapItems(result, t),
        isLoading: loadState === "loading" || loadState === "refreshing",
        loadState,
        status:
          loadState === "failed"
            ? "failed"
            : (validated?.status ?? result?.status ?? "failed"),
        errorCode: validated?.errorCode ?? result?.errorCode,
        refresh,
      };
    };
    return {
      skills: build(
        "skills",
        {
          error: skillScan?.error,
          hasLoaded: Boolean(skillScan?.result),
          isLoading: Boolean(skillScan?.isScanning),
        },
        refreshSkills,
      ),
      mcp: build(
        "mcp",
        { error: mcpError, hasLoaded: mcpLoaded, isLoading: mcpLoading },
        refreshMcp,
      ),
      rules: build(
        "rules",
        {
          error: rulesError,
          hasLoaded: rulesLoaded,
          isLoading: rulesLoading,
        },
        refreshRules,
      ),
      plugins: build(
        "plugins",
        {
          error: pluginsError,
          hasLoaded: pluginsLoaded,
          isLoading: pluginsLoading,
        },
        refreshPlugins,
      ),
    };
  }, [
    agent.id,
    aggregate,
    mcpError,
    mcpLoaded,
    mcpLoading,
    pluginsError,
    pluginsLoaded,
    pluginsLoading,
    refreshMcp,
    refreshPlugins,
    refreshRules,
    refreshSkills,
    rulesError,
    rulesLoaded,
    rulesLoading,
    skillScan?.error,
    skillScan?.isScanning,
    skillScan?.result,
    t,
    validation,
  ]);
}

export function useAgentAssetDomain(
  agent: ManagedAgentSummary,
  domain: AgentAssetDomain,
): AgentAssetInventory {
  return useAgentAssetInventoryMap(agent, { eagerDomains: [domain] })[domain];
}
