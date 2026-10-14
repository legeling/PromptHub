import {
  type AgentManagementBackupProfile,
  type McpServerConfig,
  type PluginLibraryEntry,
  type RuleBackupRecord,
  type Skill,
} from "@prompthub/shared";

import { readCanonicalStorageShadow } from "./canonical-storage-shadow";
import fs from "node:fs";
import path from "node:path";
import {
  MCP_STORAGE_SNAPSHOT_FILE,
  readMcpStorageSnapshotLibrary,
} from "./mcp-storage-snapshot";
import {
  parsePortableLogicalEnvelope,
  type PortableLogicalScope,
} from "./portable-logical-snapshot";
import { calculatePromptCanonicalGraphHash } from "./prompt-canonical-catalog";
import type { CanonicalRuleResource } from "./rule-resource-schema";
import { ruleGroupForKnownId } from "./rules-workspace-support";

function compareText(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function assertEquivalent(
  label: string,
  canonical: unknown,
  logical: unknown,
): void {
  if (
    JSON.stringify(stableValue(canonical)) !==
    JSON.stringify(stableValue(logical))
  ) {
    throw new Error(
      `Portable logical snapshot does not match canonical ${label}`,
    );
  }
}

function portableRemoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeSkill(value: Skill): Skill {
  const skill = structuredClone(value);
  delete skill.local_repo_path;
  skill.source_url = portableRemoteUrl(skill.source_url);
  skill.content_url = portableRemoteUrl(skill.content_url);
  skill.icon_url = portableRemoteUrl(skill.icon_url);
  return skill;
}

function normalizePlugin(value: PluginLibraryEntry): PluginLibraryEntry {
  const plugin = structuredClone(value);
  delete plugin.managedPath;
  delete plugin.localRepositoryPath;
  delete plugin.localPackagePath;
  delete plugin.distributedTargetIds;
  delete plugin.source.localRepositoryPath;
  delete plugin.source.localPackagePath;
  plugin.source.repository = portableRemoteUrl(plugin.source.repository);
  plugin.source.rawJsonUrl = portableRemoteUrl(plugin.source.rawJsonUrl);
  plugin.source.url = portableRemoteUrl(plugin.source.url);
  plugin.iconUrl = portableRemoteUrl(plugin.iconUrl);
  plugin.logoUrl = portableRemoteUrl(plugin.logoUrl);
  plugin.homepage = portableRemoteUrl(plugin.homepage);
  plugin.repository = portableRemoteUrl(plugin.repository);
  if (plugin.author) plugin.author.url = portableRemoteUrl(plugin.author.url);
  return plugin;
}

function normalizeMcpServer(value: McpServerConfig): McpServerConfig {
  const server = structuredClone(value);
  delete server.env;
  delete server.headers;
  if (server.oauth) delete server.oauth.clientSecret;
  return server;
}

function normalizeAgentProfile(value: AgentManagementBackupProfile) {
  return {
    id: value.id,
    ...value.profile,
    endpoint: value.profile.endpoint ?? null,
    archived: value.archived,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeRule(value: RuleBackupRecord | CanonicalRuleResource) {
  const projectPlacement = value.id.startsWith("project:")
    ? {
        targetPath: value.targetPath ?? ("path" in value ? value.path : ""),
        projectRootPath: value.projectRootPath ?? null,
      }
    : {};
  return {
    id: value.id,
    platformId: value.platformId,
    platformName: value.platformName,
    platformIcon: value.platformIcon,
    platformDescription: value.platformDescription,
    name: value.name,
    description: value.description,
    group: "group" in value ? value.group : ruleGroupForKnownId(value.id),
    ...projectPlacement,
    content: value.content,
    versions: [...value.versions].sort(
      (left, right) => Date.parse(left.savedAt) - Date.parse(right.savedAt),
    ),
  };
}

function sortedById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareText(left.id, right.id));
}

function assertCompleteDurableScope(scope: PortableLogicalScope): void {
  const required: Array<keyof PortableLogicalScope> = [
    "prompts",
    "folders",
    "versions",
    "images",
    "videos",
    "rules",
    "skills",
    "mcp",
    "plugins",
    "agents",
  ];
  if (required.some((key) => scope[key] !== true)) {
    throw new Error(
      "Canonical consistency requires a complete portable logical scope",
    );
  }
}

export function assertPortableLogicalMatchesCanonicalStorage(
  logicalText: string,
  canonicalPath: string,
): void {
  const logical = parsePortableLogicalEnvelope(logicalText);
  assertCompleteDurableScope(logical.scope);
  const canonical = readCanonicalStorageShadow(canonicalPath);
  const payload = logical.payload;
  const logicalPromptHash = calculatePromptCanonicalGraphHash({
    prompts: payload.prompts,
    promptVersions: payload.versions,
    folders: payload.folders,
    promptRelations: payload.promptRelations ?? [],
    outputFormatItems: payload.outputFormatItems ?? [],
  });
  const canonicalPromptHash = calculatePromptCanonicalGraphHash(
    canonical.promptGraph.snapshot,
  );
  assertEquivalent("Prompt graph", canonicalPromptHash, logicalPromptHash);

  assertEquivalent(
    "Skills",
    sortedById(canonical.skills.map((entry) => normalizeSkill(entry.skill))),
    sortedById((payload.skills ?? []).map(normalizeSkill)),
  );
  assertEquivalent(
    "Skill versions",
    sortedById(canonical.skills.flatMap((entry) => entry.versions)),
    sortedById(payload.skillVersions ?? []),
  );
  assertEquivalent(
    "Rules",
    sortedById(canonical.rules.map((entry) => normalizeRule(entry.rule))),
    sortedById((payload.rules ?? []).map(normalizeRule)),
  );
  assertEquivalent(
    "MCP servers",
    sortedById(
      (fs.existsSync(path.join(canonicalPath, "mcp", MCP_STORAGE_SNAPSHOT_FILE))
        ? readMcpStorageSnapshotLibrary(
            path.join(canonicalPath, "mcp", MCP_STORAGE_SNAPSHOT_FILE),
          ).servers
        : canonical.mcpServers.map((entry) => entry.server)
      ).map(normalizeMcpServer),
    ),
    sortedById(payload.mcpLibrary!.servers.map(normalizeMcpServer)),
  );
  assertEquivalent(
    "Plugins",
    sortedById(canonical.plugins.map((entry) => normalizePlugin(entry.plugin))),
    sortedById((payload.pluginLibrary!.plugins ?? []).map(normalizePlugin)),
  );
  assertEquivalent(
    "Agent profiles",
    sortedById(
      canonical.agentProviders.map((entry) => {
        const { secretRef: _secretRef, ...profile } = structuredClone(
          entry.profile,
        );
        return profile;
      }),
    ),
    sortedById(
      payload.agentManagement!.providerProfiles.map(normalizeAgentProfile),
    ),
  );
  assertEquivalent(
    "Agent model mappings",
    canonical.agentProviders
      .flatMap((entry) =>
        entry.modelMappings.map(({ routeKey, modelId, parameters }) => ({
          profileId: entry.profile.id,
          routeKey,
          modelId,
          parameters,
        })),
      )
      .sort((left, right) =>
        compareText(
          `${left.profileId}\0${left.routeKey}`,
          `${right.profileId}\0${right.routeKey}`,
        ),
      ),
    payload
      .agentManagement!.providerProfiles.flatMap((entry) =>
        entry.modelMappings.map(({ routeKey, modelId, parameters }) => ({
          profileId: entry.id,
          routeKey,
          modelId,
          parameters,
        })),
      )
      .sort((left, right) =>
        compareText(
          `${left.profileId}\0${left.routeKey}`,
          `${right.profileId}\0${right.routeKey}`,
        ),
      ),
  );
}
