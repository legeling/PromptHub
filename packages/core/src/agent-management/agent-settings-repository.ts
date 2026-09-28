import type {
  AgentIdentityPreference,
  AgentIdentityPreferences,
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
} from "@prompthub/shared/types";

import {
  normalizeAgentRootPath,
  normalizeBuiltinAgentOverride,
  normalizeCustomAgentDraft,
} from "./agent-root-config";
import {
  AGENT_SETTING_KEYS,
  parseAgentManagementSettings,
} from "./agent-settings-contract";

interface StatementLike {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface AgentSettingsDatabase {
  prepare(sql: string): StatementLike;
  transaction<T extends (...args: unknown[]) => unknown>(operation: T): T;
}

export interface AgentManagementSettings {
  builtinAgentOverrides: Record<string, BuiltinAgentOverrideConfig>;
  customAgents: CustomAgentConfig[];
  disabledPlatformIds: string[];
  agentIdentityPreferences: AgentIdentityPreferences;
}

export class AgentSettingsError extends Error {
  constructor(
    readonly code:
      | "AGENT_ID_CONFLICT"
      | "AGENT_ROOT_CONFLICT"
      | "BUILTIN_AGENT_DELETE_FORBIDDEN"
      | "INVALID_AGENT",
    message: string,
  ) {
    super(message);
    this.name = "AgentSettingsError";
  }
}

function readJsonSetting(
  database: AgentSettingsDatabase,
  key: string,
): unknown {
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value?: unknown } | undefined;
  if (typeof row?.value !== "string") return undefined;
  try {
    return JSON.parse(row.value);
  } catch (cause) {
    throw new Error(`Invalid Agent setting JSON: ${key}`, { cause });
  }
}

export function readAgentManagementSettings(
  database: AgentSettingsDatabase,
): AgentManagementSettings {
  return parseAgentManagementSettings(
    Object.fromEntries(
      AGENT_SETTING_KEYS.map((key) => [key, readJsonSetting(database, key)]),
    ),
  );
}

function validateCustomAgentCollection(
  customAgents: CustomAgentConfig[],
  builtinIds: Set<string>,
): void {
  const ids = new Set<string>();
  const roots = new Set<string>();
  for (const agent of customAgents) {
    if (!agent.id.trim() || !agent.name.trim() || !agent.rootPath.trim()) {
      throw new AgentSettingsError(
        "INVALID_AGENT",
        "Custom Agent id、name 和 root 都不能为空",
      );
    }
    if (builtinIds.has(agent.id) || ids.has(agent.id)) {
      throw new AgentSettingsError(
        "AGENT_ID_CONFLICT",
        `Agent id 已存在: ${agent.id}`,
      );
    }
    const rootKey = normalizeAgentRootPath(agent.rootPath).toLocaleLowerCase();
    if (roots.has(rootKey)) {
      throw new AgentSettingsError(
        "AGENT_ROOT_CONFLICT",
        `Custom Agent root 已存在: ${agent.rootPath}`,
      );
    }
    ids.add(agent.id);
    roots.add(rootKey);
  }
}

export class AgentSettingsRepository {
  constructor(private readonly database: AgentSettingsDatabase) {}

  read(): AgentManagementSettings {
    return readAgentManagementSettings(this.database);
  }

  private writeDatabase(entries: Record<string, unknown>): void {
    const statement = this.database.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    );
    this.database.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        statement.run(key, JSON.stringify(value));
      }
    })();
  }

  patch(entries: Partial<AgentManagementSettings>): AgentManagementSettings {
    const next = parseAgentManagementSettings({ ...this.read(), ...entries });
    this.writeDatabase(
      Object.fromEntries(
        AGENT_SETTING_KEYS.filter((key) =>
          Object.prototype.hasOwnProperty.call(entries, key),
        ).map((key) => [key, next[key]]),
      ),
    );
    return this.read();
  }

  private write(entries: Partial<AgentManagementSettings>): void {
    this.patch(entries);
  }

  setEnabled(
    agentId: string,
    enabled: boolean,
    builtinIds: Set<string>,
  ): AgentManagementSettings {
    const settings = this.read();
    const customIndex = settings.customAgents.findIndex(
      (agent) => agent.id === agentId,
    );
    if (customIndex >= 0) {
      settings.customAgents[customIndex] = {
        ...settings.customAgents[customIndex],
        enabled,
      };
      const disabled = new Set(settings.disabledPlatformIds);
      if (enabled) disabled.delete(agentId);
      else disabled.add(agentId);
      this.write({
        customAgents: settings.customAgents,
        disabledPlatformIds: [...disabled],
      });
      return this.read();
    }
    if (!builtinIds.has(agentId)) {
      throw new AgentSettingsError("INVALID_AGENT", `Agent 不存在: ${agentId}`);
    }
    const disabled = new Set(settings.disabledPlatformIds);
    if (enabled) disabled.delete(agentId);
    else disabled.add(agentId);
    this.write({ disabledPlatformIds: [...disabled] });
    return this.read();
  }

  addCustomAgent(
    input: CustomAgentConfig,
    builtinIds: Set<string>,
  ): AgentManagementSettings {
    const settings = this.read();
    const customAgents = [
      normalizeCustomAgentDraft(input),
      ...settings.customAgents,
    ];
    validateCustomAgentCollection(customAgents, builtinIds);
    this.write({
      customAgents,
      disabledPlatformIds: settings.disabledPlatformIds.filter(
        (platformId) => platformId !== input.id,
      ),
    });
    return this.read();
  }

  updateCustomAgent(
    agentId: string,
    updates: Partial<Omit<CustomAgentConfig, "id">>,
    builtinIds: Set<string>,
  ): AgentManagementSettings {
    const settings = this.read();
    const current = settings.customAgents.find((agent) => agent.id === agentId);
    if (!current) {
      throw new AgentSettingsError(
        "INVALID_AGENT",
        `Custom Agent 不存在: ${agentId}`,
      );
    }
    const next = normalizeCustomAgentDraft({
      ...current,
      ...updates,
      id: current.id,
    });
    const customAgents = settings.customAgents.map((agent) =>
      agent.id === agentId ? next : agent,
    );
    validateCustomAgentCollection(customAgents, builtinIds);
    const disabled = new Set(settings.disabledPlatformIds);
    if (updates.enabled === true) disabled.delete(agentId);
    else if (updates.enabled === false) disabled.add(agentId);
    this.write({
      customAgents,
      disabledPlatformIds: [...disabled],
    });
    return this.read();
  }

  deleteCustomAgent(
    agentId: string,
    builtinIds: Set<string>,
  ): AgentManagementSettings {
    if (builtinIds.has(agentId)) {
      throw new AgentSettingsError(
        "BUILTIN_AGENT_DELETE_FORBIDDEN",
        `不能删除内置 Agent: ${agentId}`,
      );
    }
    const settings = this.read();
    const customAgents = settings.customAgents.filter(
      (agent) => agent.id !== agentId,
    );
    if (customAgents.length === settings.customAgents.length) {
      throw new AgentSettingsError(
        "INVALID_AGENT",
        `Custom Agent 不存在: ${agentId}`,
      );
    }
    this.write({
      customAgents,
      disabledPlatformIds: settings.disabledPlatformIds.filter(
        (platformId) => platformId !== agentId,
      ),
    });
    return this.read();
  }

  setBuiltinOverride(
    agentId: string,
    override: BuiltinAgentOverrideConfig,
    builtinIds: Set<string>,
  ): AgentManagementSettings {
    if (!builtinIds.has(agentId)) {
      throw new AgentSettingsError(
        "INVALID_AGENT",
        `内置 Agent 不存在: ${agentId}`,
      );
    }
    const settings = this.read();
    const nextOverride = normalizeBuiltinAgentOverride(override);
    const builtinAgentOverrides = { ...settings.builtinAgentOverrides };
    if (Object.keys(nextOverride).length === 0) {
      delete builtinAgentOverrides[agentId];
    } else {
      builtinAgentOverrides[agentId] = nextOverride;
    }
    this.write({
      builtinAgentOverrides,
    });
    return this.read();
  }

  resetBuiltinOverride(
    agentId: string,
    builtinIds: Set<string>,
  ): AgentManagementSettings {
    return this.setBuiltinOverride(agentId, {}, builtinIds);
  }

  setCodexIdentity(identity: AgentIdentityPreference): AgentManagementSettings {
    const settings = this.read();
    this.write({
      agentIdentityPreferences: {
        ...settings.agentIdentityPreferences,
        codex: identity,
      },
    });
    return this.read();
  }
}
