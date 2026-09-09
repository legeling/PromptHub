import type {
  AgentIdentityPreference,
  SkillProject,
} from "@prompthub/shared/types";
import { normalizeNetworkProxySettings } from "@prompthub/shared/utils/network-proxy";
import {
  normalizeAgentRootPath,
  normalizeBuiltinAgentOverrides,
  normalizeCustomAgentDraft,
  normalizeCustomAgents,
} from "../../services/agent-root-paths";
import {
  isSkillSafetyChannel,
  isSkillSafetyPolicyValue,
  normalizeSkillSafetyStoreId,
} from "../../services/skill-safety-policy";
import {
  normalizeProjectDeployTargets,
  normalizeProjectRecordPath,
} from "../../services/skill-project-settings";
import type {
  SettingsActionContext,
  SettingsActionGroup,
} from "./settings-action-context";
import {
  areStringArraysEqual,
  createProjectRecordId,
  deriveLegacyCustomPlatformRootPaths,
  getCustomAgentRootPaths,
  normalizeAgentRootPaths,
} from "./settings-normalizers";
import type { ProjectSkillImportPreferences } from "./settings-types";
import { normalizeAgentIdentityPreferences } from "../../services/agent-identity";

type AgentActionKey =
  | "setCustomAgents"
  | "addCustomAgent"
  | "updateCustomAgent"
  | "removeCustomAgent"
  | "setCustomSkillScanPaths"
  | "addCustomSkillScanPath"
  | "removeCustomSkillScanPath"
  | "setProjectSkillImportModePreference"
  | "setProjectSkillImportPreferences"
  | "addSkillProject"
  | "updateSkillProject"
  | "removeSkillProject"
  | "updateBuiltinAgentOverride"
  | "resetBuiltinAgentOverride"
  | "setCodexIdentityPreference"
  | "setCustomPlatformRootPath"
  | "resetCustomPlatformRootPath"
  | "setDisabledPlatformIds"
  | "setRulePlatformTracked"
  | "setCustomSkillPlatformPath"
  | "resetCustomSkillPlatformPath"
  | "setSkillPlatformOrder"
  | "moveSkillPlatformOrder"
  | "resetSkillPlatformOrder"
  | "setSkillInstallMethod"
  | "setSkillSafetyScanEnabled"
  | "setSkillSafetyScanMethod"
  | "setAutoScanInstalledSkills"
  | "setAutoScanStoreSkillsBeforeInstall"
  | "setSkillSafetyChannelPolicy"
  | "setSkillSafetyStorePolicy"
  | "trustSkillUpdateSource"
  | "revokeSkillUpdateSourceTrust"
  | "setGithubToken"
  | "setNetworkProxy";

function normalizeProjectScanPaths(
  scanPaths: string[] | undefined,
  rootPath: string,
): string[] {
  const normalizedRoot = normalizeProjectRecordPath(rootPath);
  return Array.from(
    new Set(
      (scanPaths ?? [])
        .map((entry) => normalizeProjectRecordPath(entry))
        .filter(
          (entry) =>
            entry.length > 0 &&
            entry.toLowerCase() !== normalizedRoot.toLowerCase(),
        ),
    ),
  );
}

function sanitizeGithubToken(token: string): string {
  return token.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
}

function validateCustomAgent(
  context: SettingsActionContext,
  agent: ReturnType<typeof normalizeCustomAgentDraft>,
  existingId?: string,
): void {
  if (!agent.name || !agent.rootPath) {
    throw new Error("Custom agent name and rootPath are required");
  }
  const duplicate = context
    .get()
    .customAgents.some(
      (item) =>
        item.id !== existingId &&
        item.rootPath.toLowerCase() === agent.rootPath.toLowerCase(),
    );
  if (duplicate) throw new Error("Custom agent root path already exists");
}

function createAgentCollectionActions(context: SettingsActionContext) {
  const { get, setTouched, syncSettingsToMainThenRefreshRules } = context;
  return {
    setCustomAgents: (agents) => {
      const customAgents = normalizeCustomAgents(agents);
      const paths = getCustomAgentRootPaths(customAgents);
      setTouched({
        customAgents,
        customAgentRootPaths: paths,
        customSkillScanPaths: paths,
      });
      syncSettingsToMainThenRefreshRules({
        customAgents,
        customAgentRootPaths: paths,
      });
    },
    addCustomAgent: (input) => {
      const agent = normalizeCustomAgentDraft(input);
      validateCustomAgent(context, agent);
      get().setCustomAgents([agent, ...get().customAgents]);
    },
  } satisfies SettingsActionGroup<"setCustomAgents" | "addCustomAgent">;
}

function buildUpdatedCustomAgent(
  current: ReturnType<typeof normalizeCustomAgentDraft>,
  updates: Parameters<
    SettingsActionGroup<"updateCustomAgent">["updateCustomAgent"]
  >[1],
) {
  return normalizeCustomAgentDraft({
    id: current.id,
    name: updates.name ?? current.name,
    rootPath: updates.rootPath ?? current.rootPath,
    enabled: updates.enabled ?? current.enabled,
    skillsRelativePath:
      updates.skillsRelativePath ?? current.skillsRelativePath,
    mcpRelativePath: updates.mcpRelativePath ?? current.mcpRelativePath,
    pluginsRelativePath:
      updates.pluginsRelativePath ?? current.pluginsRelativePath,
    rulesRelativePath: updates.rulesRelativePath ?? current.rulesRelativePath,
    agentsRelativePath:
      updates.agentsRelativePath ?? current.agentsRelativePath,
    commandsRelativePath:
      updates.commandsRelativePath ?? current.commandsRelativePath,
    configRelativePaths:
      updates.configRelativePaths ?? current.configRelativePaths,
  });
}

function createCustomAgentMutationActions(context: SettingsActionContext) {
  const { get } = context;
  return {
    updateCustomAgent: (agentId, updates) => {
      const agents = get().customAgents;
      const current = agents.find((agent) => agent.id === agentId);
      if (!current) return;
      const agent = buildUpdatedCustomAgent(current, updates);
      validateCustomAgent(context, agent, agentId);
      get().setCustomAgents(
        agents.map((item) => (item.id === agentId ? agent : item)),
      );
    },
    removeCustomAgent: (agentId) =>
      get().setCustomAgents(
        get().customAgents.filter((agent) => agent.id !== agentId),
      ),
  } satisfies SettingsActionGroup<"updateCustomAgent" | "removeCustomAgent">;
}

function createLegacyAgentPathActions(context: SettingsActionContext) {
  const { get } = context;
  return {
    setCustomSkillScanPaths: (paths) =>
      get().setCustomAgents(
        normalizeAgentRootPaths(paths).map((rootPath, index) => ({
          id: `legacy_agent_${index}_${rootPath}`,
          name: `Custom Agent ${index + 1}`,
          rootPath,
        })),
      ),
    addCustomSkillScanPath: (rootPath) =>
      get().addCustomAgent({
        name: `Custom Agent ${get().customAgents.length + 1}`,
        rootPath,
      }),
    removeCustomSkillScanPath: (rootPath) =>
      get()
        .customAgents.filter(
          (agent) => agent.rootPath === normalizeAgentRootPath(rootPath),
        )
        .forEach((agent) => get().removeCustomAgent(agent.id)),
  } satisfies SettingsActionGroup<
    | "setCustomSkillScanPaths"
    | "addCustomSkillScanPath"
    | "removeCustomSkillScanPath"
  >;
}

function createCustomAgentActions(context: SettingsActionContext) {
  return {
    ...createAgentCollectionActions(context),
    ...createCustomAgentMutationActions(context),
    ...createLegacyAgentPathActions(context),
  };
}

function normalizeImportTargets(entries: string[]): string[] {
  return Array.from(
    new Set(
      entries
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function createProjectPreferenceActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setProjectSkillImportModePreference: (method) => {
      if (get().projectSkillImportModePreference !== method) {
        setTouched({ projectSkillImportModePreference: method });
      }
    },
    setProjectSkillImportPreferences: (projectId, preferences) => {
      const id = projectId.trim();
      if (!id) return;
      const next: ProjectSkillImportPreferences = {
        selectedTargetIds: normalizeImportTargets(
          preferences.selectedTargetIds,
        ),
        customTargets: normalizeImportTargets(preferences.customTargets),
      };
      const current = get().projectSkillImportPreferencesByProjectId[id];
      if (areProjectPreferencesEqual(current, next)) return;
      setTouched({
        projectSkillImportPreferencesByProjectId: {
          ...get().projectSkillImportPreferencesByProjectId,
          [id]: next,
        },
      });
    },
  } satisfies SettingsActionGroup<
    "setProjectSkillImportModePreference" | "setProjectSkillImportPreferences"
  >;
}

function areProjectPreferencesEqual(
  current: ProjectSkillImportPreferences | undefined,
  next: ProjectSkillImportPreferences,
): boolean {
  return Boolean(
    current &&
    areStringArraysEqual(current.selectedTargetIds, next.selectedTargetIds) &&
    areStringArraysEqual(current.customTargets, next.customTargets),
  );
}

function buildSkillProject(
  input: Parameters<
    SettingsActionGroup<"addSkillProject">["addSkillProject"]
  >[0],
): SkillProject {
  const name = input.name.trim();
  const rootPath = normalizeProjectRecordPath(input.rootPath);
  if (!name || !rootPath) {
    throw new Error("Skill project name and rootPath are required");
  }
  const now = Date.now();
  return {
    id: createProjectRecordId(),
    name,
    rootPath,
    scanPaths: normalizeProjectScanPaths(input.scanPaths, rootPath),
    deployTargets: normalizeProjectDeployTargets(input.deployTargets, rootPath),
    createdAt: now,
    updatedAt: now,
  };
}

function assertUniqueProjectPath(
  projects: SkillProject[],
  rootPath: string,
  excludedId?: string,
): void {
  const duplicate = projects.some(
    (project) =>
      project.id !== excludedId &&
      project.rootPath.toLowerCase() === rootPath.toLowerCase(),
  );
  if (duplicate) throw new Error("Skill project root path already exists");
}

function createSkillProjectActions(context: SettingsActionContext) {
  const { get, setTouched, syncSettingsToMain } = context;
  return {
    addSkillProject: (input) => {
      const project = buildSkillProject(input);
      const current = get().skillProjects;
      assertUniqueProjectPath(current, project.rootPath);
      const skillProjects = [project, ...current];
      setTouched({ skillProjects });
      void syncSettingsToMain({ skillProjects });
      return project;
    },
    updateSkillProject: (projectId, updates) => {
      const projects = get().skillProjects;
      const current = projects.find((project) => project.id === projectId);
      if (!current) return;
      const next = buildUpdatedSkillProject(current, updates);
      assertUniqueProjectPath(projects, next.rootPath, projectId);
      const skillProjects = projects.map((project) =>
        project.id === projectId ? next : project,
      );
      setTouched({ skillProjects });
      void syncSettingsToMain({ skillProjects });
    },
    removeSkillProject: (projectId) => {
      const skillProjects = get().skillProjects.filter(
        (project) => project.id !== projectId,
      );
      const preferences = { ...get().projectSkillImportPreferencesByProjectId };
      delete preferences[projectId];
      setTouched({
        skillProjects,
        projectSkillImportPreferencesByProjectId: preferences,
      });
      void syncSettingsToMain({ skillProjects });
    },
  } satisfies SettingsActionGroup<
    "addSkillProject" | "updateSkillProject" | "removeSkillProject"
  >;
}

function buildUpdatedSkillProject(
  current: SkillProject,
  updates: Parameters<
    SettingsActionGroup<"updateSkillProject">["updateSkillProject"]
  >[1],
): SkillProject {
  const rootPath =
    typeof updates.rootPath === "string"
      ? normalizeProjectRecordPath(updates.rootPath)
      : current.rootPath;
  const name =
    typeof updates.name === "string" ? updates.name.trim() : current.name;
  if (!name || !rootPath) {
    throw new Error("Skill project name and rootPath are required");
  }
  return {
    ...current,
    name,
    rootPath,
    scanPaths:
      updates.scanPaths === undefined
        ? current.scanPaths
        : normalizeProjectScanPaths(updates.scanPaths, rootPath),
    deployTargets: normalizeProjectDeployTargets(
      updates.deployTargets ?? current.deployTargets,
      rootPath,
    ),
    lastScannedAt:
      updates.lastScannedAt === undefined
        ? current.lastScannedAt
        : updates.lastScannedAt,
    updatedAt: Date.now(),
  };
}

function createProjectActions(context: SettingsActionContext) {
  return {
    ...createProjectPreferenceActions(context),
    ...createSkillProjectActions(context),
  };
}

function writeBuiltinOverrides(
  context: SettingsActionContext,
  overrides: ReturnType<typeof normalizeBuiltinAgentOverrides>,
): void {
  const customPlatformRootPaths =
    deriveLegacyCustomPlatformRootPaths(overrides);
  context.setTouched({
    builtinAgentOverrides: overrides,
    customPlatformRootPaths,
  });
  context.syncSettingsToMainThenRefreshRules({
    builtinAgentOverrides: overrides,
    customPlatformRootPaths,
  });
}

function createBuiltinOverrideActions(context: SettingsActionContext) {
  const { get } = context;
  return {
    updateBuiltinAgentOverride: (platformId, updates) =>
      writeBuiltinOverrides(
        context,
        normalizeBuiltinAgentOverrides({
          ...get().builtinAgentOverrides,
          [platformId]: updates,
        }),
      ),
    resetBuiltinAgentOverride: (platformId) => {
      const next = { ...get().builtinAgentOverrides };
      delete next[platformId];
      writeBuiltinOverrides(context, normalizeBuiltinAgentOverrides(next));
    },
    setCustomPlatformRootPath: (platformId, rootPath) =>
      get().updateBuiltinAgentOverride(platformId, { rootPath }),
    resetCustomPlatformRootPath: (platformId) =>
      get().resetBuiltinAgentOverride(platformId),
    setCustomSkillPlatformPath: (platformId, rootPath) =>
      get().setCustomPlatformRootPath(platformId, rootPath),
    resetCustomSkillPlatformPath: (platformId) =>
      get().resetCustomPlatformRootPath(platformId),
  } satisfies SettingsActionGroup<
    | "updateBuiltinAgentOverride"
    | "resetBuiltinAgentOverride"
    | "setCustomPlatformRootPath"
    | "resetCustomPlatformRootPath"
    | "setCustomSkillPlatformPath"
    | "resetCustomSkillPlatformPath"
  >;
}

function refreshManagedAgentIdentities(
  preferences: ReturnType<typeof normalizeAgentIdentityPreferences>,
): void {
  void import("../agent.store").then(({ useAgentStore }) => {
    useAgentStore.getState().applyIdentityPreferences(preferences);
  });
}

function createAgentIdentityActions(context: SettingsActionContext) {
  const { get, setTouched, syncSettingsToMain } = context;
  return {
    setCodexIdentityPreference: (updates: Partial<AgentIdentityPreference>) => {
      const current = normalizeAgentIdentityPreferences(
        get().agentIdentityPreferences,
      ).codex!;
      const agentIdentityPreferences = normalizeAgentIdentityPreferences({
        codex: { ...current, ...updates },
      });
      setTouched({ agentIdentityPreferences });
      void syncSettingsToMain({ agentIdentityPreferences });
      refreshManagedAgentIdentities(agentIdentityPreferences);
    },
  } satisfies SettingsActionGroup<"setCodexIdentityPreference">;
}

function syncDisabledPlatforms(
  context: SettingsActionContext,
  disabledPlatformIds: string[],
): void {
  context.setTouched({ disabledPlatformIds });
  context.syncSettingsToMainThenRefreshRules({ disabledPlatformIds });
}

function createPlatformTrackingActions(context: SettingsActionContext) {
  const { get } = context;
  return {
    setDisabledPlatformIds: (platformIds) =>
      syncDisabledPlatforms(
        context,
        Array.from(
          new Set(
            platformIds.filter((id) => typeof id === "string" && id.trim()),
          ),
        ),
      ),
    setRulePlatformTracked: (platformId, tracked) => {
      const disabled = new Set(get().disabledPlatformIds);
      if (tracked) disabled.delete(platformId);
      else disabled.add(platformId);
      syncDisabledPlatforms(context, Array.from(disabled));
    },
  } satisfies SettingsActionGroup<
    "setDisabledPlatformIds" | "setRulePlatformTracked"
  >;
}

function createPlatformOrderActions(context: SettingsActionContext) {
  const { get, setTouched, syncSettingsToMain } = context;
  const syncOrder = (skillPlatformOrder: string[]) => {
    setTouched({ skillPlatformOrder });
    void syncSettingsToMain({ skillPlatformOrder });
  };
  return {
    setSkillPlatformOrder: (order) =>
      syncOrder(
        order.filter(
          (id, index) =>
            typeof id === "string" && id.trim() && order.indexOf(id) === index,
        ),
      ),
    moveSkillPlatformOrder: (platformId, direction) => {
      const order = [...get().skillPlatformOrder];
      const currentIndex = order.indexOf(platformId);
      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= order.length)
        return;
      [order[currentIndex], order[targetIndex]] = [
        order[targetIndex],
        order[currentIndex],
      ];
      syncOrder(order);
    },
    resetSkillPlatformOrder: () => syncOrder([]),
  } satisfies SettingsActionGroup<
    | "setSkillPlatformOrder"
    | "moveSkillPlatformOrder"
    | "resetSkillPlatformOrder"
  >;
}

function createPlatformActions(context: SettingsActionContext) {
  return {
    ...createAgentIdentityActions(context),
    ...createBuiltinOverrideActions(context),
    ...createPlatformTrackingActions(context),
    ...createPlatformOrderActions(context),
  };
}

function createSkillUpdateSettingsActions(context: SettingsActionContext) {
  const { get, set, setTouched } = context;
  return {
    setSkillInstallMethod: (skillInstallMethod) =>
      setTouched({ skillInstallMethod }),
    setSkillSafetyScanEnabled: (skillSafetyScanEnabled) =>
      setTouched({ skillSafetyScanEnabled }),
    setSkillSafetyScanMethod: (skillSafetyScanMethod) =>
      setTouched({ skillSafetyScanMethod }),
    setAutoScanInstalledSkills: (autoScanInstalledSkills) =>
      setTouched({ autoScanInstalledSkills }),
    setAutoScanStoreSkillsBeforeInstall: (autoScanStoreSkillsBeforeInstall) =>
      setTouched({ autoScanStoreSkillsBeforeInstall }),
    setSkillSafetyChannelPolicy: (channel, policy) => {
      if (!isSkillSafetyChannel(channel)) return;
      set((state) => {
        const next = { ...state.skillSafetyChannelPolicies };
        if (isSkillSafetyPolicyValue(policy)) next[channel] = policy;
        else delete next[channel];
        return {
          skillSafetyChannelPolicies: next,
          settingsUpdatedAt: new Date().toISOString(),
        };
      });
    },
    setSkillSafetyStorePolicy: (storeId, policy) => {
      const normalizedStoreId = normalizeSkillSafetyStoreId(storeId);
      if (!normalizedStoreId) return;
      set((state) => {
        const next = { ...state.skillSafetyStorePolicies };
        if (isSkillSafetyPolicyValue(policy)) next[normalizedStoreId] = policy;
        else delete next[normalizedStoreId];
        const boundedEntries = Object.entries(next).slice(-512);
        return {
          skillSafetyStorePolicies: Object.fromEntries(boundedEntries),
          settingsUpdatedAt: new Date().toISOString(),
        };
      });
    },
    trustSkillUpdateSource: (sourceKey) => {
      const normalized = sourceKey.trim().slice(0, 512);
      if (!normalized) return;
      set((state) => ({
        trustedSkillUpdateSourceKeys: Array.from(
          new Set([...state.trustedSkillUpdateSourceKeys, normalized]),
        ).slice(-512),
      }));
    },
    revokeSkillUpdateSourceTrust: (sourceKey) =>
      set((state) => ({
        trustedSkillUpdateSourceKeys: state.trustedSkillUpdateSourceKeys.filter(
          (key) => key !== sourceKey,
        ),
      })),
    setGithubToken: (token) => {
      const githubToken = sanitizeGithubToken(token);
      setTouched({ githubToken });
      void context.syncSettingsToMain({ githubToken });
    },
    setNetworkProxy: (updates) => {
      const networkProxy = normalizeNetworkProxySettings({
        ...get().networkProxy,
        ...updates,
      });
      setTouched({ networkProxy });
      void context.syncSettingsToMain({ networkProxy });
    },
  } satisfies SettingsActionGroup<
    | "setSkillInstallMethod"
    | "setSkillSafetyScanEnabled"
    | "setSkillSafetyScanMethod"
    | "setAutoScanInstalledSkills"
    | "setAutoScanStoreSkillsBeforeInstall"
    | "setSkillSafetyChannelPolicy"
    | "setSkillSafetyStorePolicy"
    | "trustSkillUpdateSource"
    | "revokeSkillUpdateSourceTrust"
    | "setGithubToken"
    | "setNetworkProxy"
  >;
}

export function createAgentSettingsActions(
  context: SettingsActionContext,
): SettingsActionGroup<AgentActionKey> {
  return {
    ...createCustomAgentActions(context),
    ...createProjectActions(context),
    ...createPlatformActions(context),
    ...createSkillUpdateSettingsActions(context),
  };
}
