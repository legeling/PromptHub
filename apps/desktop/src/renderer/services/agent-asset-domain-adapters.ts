import {
  AgentAssetAggregationService,
  type AgentAssetAggregate,
  type AgentAssetActionInput,
  type AgentAssetActionPlan,
  type AgentAssetDomainAdapter,
  type AgentAssetKind,
  type AgentAssetTargetState,
} from "@prompthub/core/agent-management/asset-aggregation";

import { getSkillScanStatus } from "./skill-scan-status";
import { useMcpStore } from "../stores/mcp.store";
import { usePluginStore } from "../stores/plugin.store";
import { useRulesStore } from "../stores/rules.store";
import { useSkillStore } from "../stores/skill.store";
import { useAgentStore } from "../stores/agent.store";
import { findAgentGlobalRule } from "@prompthub/shared/utils/agent-rule-target";

function unsupportedPlan(
  kind: AgentAssetKind,
  input: AgentAssetActionInput,
): AgentAssetActionPlan {
  return {
    operationId: `agent-asset-read-only:${kind}:${input.platformId}:${input.assetId}`,
    input: structuredClone(input),
    status: "unsupported",
    warnings: [],
  };
}

function readOnlyAdapter(
  kind: AgentAssetKind,
  listForTarget: (platformId: string) => AgentAssetTargetState[],
): AgentAssetDomainAdapter {
  return {
    kind,
    listForTarget: async (platformId) => listForTarget(platformId),
    planAction: async (input) => unsupportedPlan(kind, input),
    applyAction: async () => {
      throw new Error(`Inline ${kind} actions are not available`);
    },
  };
}

function listSkills(platformId: string): AgentAssetTargetState[] {
  const state = useSkillStore.getState();
  return (state.agentScanState[platformId]?.result?.scannedSkills ?? []).map(
    (skill) => {
      const status = getSkillScanStatus(skill, state.skills);
      return {
        id: skill.platformSkillPath,
        kind: "skill",
        platformId,
        label: skill.name,
        state: status.managedSkill ? "managed" : "external",
        metadata: {
          installMode: skill.installMode,
          isPlatformBuiltin: Boolean(skill.isPlatformBuiltin),
          isReadOnlyDiscovery: Boolean(skill.isReadOnlyDiscovery),
          managedSkillId: status.managedSkill?.id ?? null,
        },
      };
    },
  );
}

function listMcpServers(platformId: string): AgentAssetTargetState[] {
  const state = useMcpStore.getState();
  const presetIds = new Set(
    state.targetPresets
      .filter((preset) => preset.platformId === platformId)
      .map((preset) => preset.id),
  );
  const serverNames = new Set(
    state.targetStatus
      .filter((status) => presetIds.has(status.presetId))
      .flatMap((status) => status.serverNames),
  );
  return Array.from(serverNames)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      id: name,
      kind: "mcp",
      platformId,
      label: name,
      state: "configured",
    }));
}

function listRules(platformId: string): AgentAssetTargetState[] {
  const { files, availableFiles } = useRulesStore.getState();
  const agent = useAgentStore
    .getState()
    .agents.find((item) => item.id === platformId);
  const shared = agent ? findAgentGlobalRule(agent, availableFiles) : null;
  const targets =
    shared && !files.some((file) => file.id === shared.id)
      ? [...files, shared]
      : files;
  return targets
    .filter(
      (file) =>
        (file.platformId === platformId || file.id === shared?.id) &&
        file.exists,
    )
    .map((file) => ({
      id: file.id,
      kind: "rule",
      platformId,
      label: file.name,
      state: file.syncStatus ?? "detected",
      metadata: {
        exists: file.exists,
        path: file.path,
      },
    }));
}

function listPlugins(platformId: string): AgentAssetTargetState[] {
  const target = usePluginStore
    .getState()
    .targetMatrix.find((candidate) => candidate.id === platformId);
  if (!target) return [];
  return (target.installedPlugins ?? []).map((plugin) => ({
    id: plugin.id,
    kind: "plugin",
    platformId,
    label: plugin.displayName || plugin.name,
    state: "installed",
    metadata: {
      targetStatus: target.status,
      version: plugin.version ?? null,
    },
  }));
}

const DOMAIN_READERS: Array<{
  kind: AgentAssetKind;
  listForTarget: (platformId: string) => AgentAssetTargetState[];
}> = [
  { kind: "skill", listForTarget: listSkills },
  { kind: "mcp", listForTarget: listMcpServers },
  { kind: "rule", listForTarget: listRules },
  { kind: "plugin", listForTarget: listPlugins },
];

export function readAgentAssetAggregate(
  platformId: string,
): AgentAssetAggregate {
  const domains = DOMAIN_READERS.map(({ kind, listForTarget }) => ({
    kind,
    status: "available" as const,
    items: listForTarget(platformId),
  }));
  return {
    platformId,
    total: domains.reduce((total, domain) => total + domain.items.length, 0),
    domains,
  };
}

export function createAgentAssetDomainAdapters(): AgentAssetDomainAdapter[] {
  return DOMAIN_READERS.map(({ kind, listForTarget }) =>
    readOnlyAdapter(kind, listForTarget),
  );
}

export const agentAssetAggregationService = new AgentAssetAggregationService(
  createAgentAssetDomainAdapters(),
);
