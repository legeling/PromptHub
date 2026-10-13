import path from "node:path";
import { access } from "node:fs/promises";
import { app, ipcMain, safeStorage, shell } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";
import type {
  AgentPiCustomModelInput,
  AgentPiCustomModelUpdateInput,
  AgentPiCustomProviderInput,
  AgentPiCustomProviderUpdateInput,
  AgentUsageQueryOptions,
  AgentUsageQuota,
} from "@prompthub/shared/types";
import { SkillInstaller } from "../services/skill-installer";
import {
  getAgentConfigContext,
  resolveAgentProviderContext,
} from "../services/agent-platform-context";
import {
  addPiCustomModel,
  addPiCustomProvider,
  removePiCustomModel,
  removePiCustomProvider,
  setPiCredential,
  updatePiCustomModel,
  updatePiCustomProvider,
} from "../services/agent-pi-model-writes";
import { createAgentUserConfigFileService } from "../services/agent-user-config-files";
import { testPiModel } from "../services/agent-pi-model-test";
import { importCurrentPiProvider } from "../services/agent-pi-current-provider-import";
import {
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../services/agent-model-config";
import { type AgentUsageService } from "../services/agent-usage-service";
import { agentUsageService as defaultAgentUsageService } from "../services/agent-usage-runtime";
import { validateKimiConfigFile } from "../services/agent-kimi-config-validator";
import { launchAgentPlatform } from "../services/agent-launch-service";

interface RegisterAgentIPCOptions {
  usageService?: AgentUsageService;
}

function piBackupRoot(): string {
  return path.join(app.getPath("userData"), "agent-config-backups");
}

function requirePiAgentId(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent Pi write requires an object payload");
  }
  const agentId = Reflect.get(value, "agentId");
  if (agentId !== "pi") {
    throw new Error("Agent Pi writes only apply to the pi platform");
  }
  if (!isAgentDepthCapabilityAvailable(agentId, "providerModel")) {
    throw new Error("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  }
  return agentId;
}

function requirePiProviderInput(value: unknown): AgentPiCustomProviderInput {
  requirePiAgentId(value);
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.providerId !== "string" ||
    typeof payload.baseUrl !== "string" ||
    typeof payload.api !== "string" ||
    !Array.isArray(payload.models)
  ) {
    throw new Error(
      "Agent Pi provider requires providerId, baseUrl, api and models",
    );
  }
  if (
    payload.apiKeyRef !== undefined &&
    typeof payload.apiKeyRef !== "string"
  ) {
    throw new Error("Agent Pi provider apiKeyRef must be a string");
  }
  return {
    providerId: payload.providerId,
    baseUrl: payload.baseUrl,
    api: payload.api as AgentPiCustomProviderInput["api"],
    apiKeyRef: payload.apiKeyRef as string | undefined,
    models: payload.models as AgentPiCustomProviderInput["models"],
  };
}

function requirePiProviderUpdate(
  value: unknown,
): AgentPiCustomProviderUpdateInput {
  requirePiAgentId(value);
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.providerId !== "string" ||
    typeof payload.baseUrl !== "string" ||
    typeof payload.api !== "string"
  ) {
    throw new Error(
      "Agent Pi provider update requires providerId, baseUrl and api",
    );
  }
  return {
    providerId: payload.providerId,
    baseUrl: payload.baseUrl,
    api: payload.api as AgentPiCustomProviderUpdateInput["api"],
  };
}

function requirePiProviderTarget(value: unknown): {
  agentId: string;
  providerId: string;
} {
  requirePiAgentId(value);
  const providerId = Reflect.get(value as object, "providerId");
  if (typeof providerId !== "string" || !providerId.trim()) {
    throw new Error("Agent Pi provider target requires a providerId");
  }
  return { agentId: "pi", providerId };
}

function requirePiModelTarget(
  value: unknown,
  requireModel: true,
): { agentId: string; providerId: string; model: AgentPiCustomModelInput };
function requirePiModelTarget(
  value: unknown,
  requireModel: false,
): { agentId: string; providerId: string; modelId: string };
function requirePiModelTarget(
  value: unknown,
  requireModel: boolean,
): {
  agentId: string;
  providerId: string;
  model?: AgentPiCustomModelInput;
  modelId?: string;
} {
  requirePiAgentId(value);
  const payload = value as Record<string, unknown>;
  if (typeof payload.providerId !== "string" || !payload.providerId.trim()) {
    throw new Error("Agent Pi model target requires a providerId");
  }
  if (requireModel) {
    if (!payload.model || typeof payload.model !== "object") {
      throw new Error("Agent Pi model add requires a model object");
    }
    return {
      agentId: "pi",
      providerId: payload.providerId,
      model: payload.model as AgentPiCustomModelInput,
    };
  }
  if (typeof payload.modelId !== "string" || !payload.modelId.trim()) {
    throw new Error("Agent Pi model remove requires a modelId");
  }
  return {
    agentId: "pi",
    providerId: payload.providerId,
    modelId: payload.modelId,
  };
}

function requirePiModelUpdate(value: unknown): {
  agentId: "pi";
  providerId: string;
  model: AgentPiCustomModelUpdateInput;
} {
  requirePiAgentId(value);
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.providerId !== "string" ||
    !payload.providerId.trim() ||
    !payload.model ||
    typeof payload.model !== "object" ||
    Array.isArray(payload.model) ||
    typeof Reflect.get(payload.model, "originalId") !== "string"
  ) {
    throw new Error(
      "Agent Pi model update requires providerId and a model with originalId",
    );
  }
  return {
    agentId: "pi",
    providerId: payload.providerId,
    model: payload.model as AgentPiCustomModelUpdateInput,
  };
}

function requirePiCredentialInput(value: unknown): {
  agentId: string;
  providerId: string;
  secret: string;
} {
  requirePiAgentId(value);
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.providerId !== "string" ||
    !payload.providerId.trim() ||
    typeof payload.secret !== "string"
  ) {
    throw new Error("Agent Pi credential requires providerId and secret");
  }
  return {
    agentId: "pi",
    providerId: payload.providerId,
    secret: payload.secret,
  };
}

function parseAgentUsageQueryOptions(value: unknown): AgentUsageQueryOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent usage query options must be an object");
  }
  const forceRefresh = Reflect.get(value, "forceRefresh");
  if (forceRefresh !== undefined && typeof forceRefresh !== "boolean") {
    throw new Error("Agent usage query forceRefresh must be a boolean");
  }
  return forceRefresh === undefined ? {} : { forceRefresh };
}

export function registerAgentIPC(options: RegisterAgentIPCOptions = {}): void {
  const usageService = options.usageService ?? defaultAgentUsageService;
  const configFileService = createAgentUserConfigFileService({
    backupRoot: path.join(app.getPath("userData"), "agent-config-backups"),
    encryption: safeStorage,
  });
  ipcMain.handle(IPC_CHANNELS.AGENT_LAUNCH, async (_, agentId: unknown) => {
    if (typeof agentId !== "string" || !agentId.trim()) {
      return { success: false, errorCode: "unsupported" };
    }
    const platform = SkillInstaller.getSupportedPlatforms().find(
      (candidate) => candidate.id === agentId,
    );
    if (!platform) return { success: false, errorCode: "unsupported" };
    return launchAgentPlatform(platform, {
      platform: process.platform,
      homePath: app.getPath("home"),
      localAppDataPath: process.env.LOCALAPPDATA,
      pathExists: async (candidate) => {
        try {
          await access(candidate);
          return true;
        } catch {
          return false;
        }
      },
      openPath: (candidate) => shell.openPath(candidate),
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_CONFIG_FILES_LIST,
    async (_, agentId: string) => {
      const context = getAgentConfigContext(agentId);
      return configFileService.list(context);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_CONFIG_FILE_READ,
    async (_, agentId: string, relativePath: string) => {
      const context = getAgentConfigContext(agentId);
      return configFileService.read(context, relativePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_CONFIG_FILE_WRITE,
    async (
      _,
      agentId: string,
      relativePath: string,
      content: unknown,
      expectedRevision: unknown,
    ) => {
      if (typeof content !== "string") {
        throw new Error("Agent config content must be a string");
      }
      if (
        expectedRevision !== undefined &&
        typeof expectedRevision !== "string"
      ) {
        throw new Error("Agent config revision must be a string");
      }
      const revision =
        typeof expectedRevision === "string" ? expectedRevision : undefined;
      const context = getAgentConfigContext(agentId);
      return configFileService.write(context, relativePath, content, revision);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_MODEL_CONFIG_GET,
    async (_, agentId: string) => {
      const context = resolveAgentProviderContext(agentId);
      return inspectAgentModelConfig({ agentId, rootPath: context.rootPath });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_MODEL_CONFIG_SET,
    async (_, input: unknown) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Agent model update requires an object payload");
      }
      const payload = input as Record<string, unknown>;
      if (
        typeof payload.agentId !== "string" ||
        typeof payload.model !== "string"
      ) {
        throw new Error(
          "Agent model update requires agentId and model strings",
        );
      }
      if (
        payload.secondaryModel !== undefined &&
        payload.secondaryModel !== null &&
        typeof payload.secondaryModel !== "string"
      ) {
        throw new Error(
          "Agent model update secondaryModel must be a string or null",
        );
      }
      const thinkingLevels = [
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ];
      if (
        payload.thinkingLevel !== undefined &&
        (payload.agentId !== "pi" ||
          typeof payload.thinkingLevel !== "string" ||
          !thinkingLevels.includes(payload.thinkingLevel))
      ) {
        throw new Error("Agent model update thinkingLevel is invalid");
      }
      const context = resolveAgentProviderContext(payload.agentId);
      return updateAgentModelConfig(
        {
          agentId: payload.agentId,
          rootPath: context.rootPath,
          model: payload.model,
          secondaryModel: payload.secondaryModel as string | null | undefined,
          thinkingLevel: payload.thinkingLevel as
            | "off"
            | "minimal"
            | "low"
            | "medium"
            | "high"
            | "xhigh"
            | "max"
            | undefined,
        },
        {
          backupRoot: path.join(
            app.getPath("userData"),
            "agent-config-backups",
          ),
          ...(payload.agentId === "kimi"
            ? {
                validateNativeConfig: (_agentId: string, targetPath: string) =>
                  validateKimiConfigFile(targetPath),
              }
            : {}),
        },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_PROVIDER_ADD,
    async (_, input: unknown) => {
      const context = resolveAgentProviderContext(requirePiAgentId(input));
      return addPiCustomProvider(
        context.rootPath,
        requirePiProviderInput(input),
        { backupRoot: piBackupRoot() },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_PROVIDER_IMPORT_CURRENT,
    async (_, input: unknown) => {
      const context = resolveAgentProviderContext(requirePiAgentId(input));
      return importCurrentPiProvider(context.rootPath, {
        backupRoot: piBackupRoot(),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_PROVIDER_UPDATE,
    async (_, input: unknown) => {
      const payload = requirePiProviderUpdate(input);
      const context = resolveAgentProviderContext("pi");
      return updatePiCustomProvider(context.rootPath, payload, {
        backupRoot: piBackupRoot(),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_PROVIDER_REMOVE,
    async (_, input: unknown) => {
      const payload = requirePiProviderTarget(input);
      const context = resolveAgentProviderContext(payload.agentId);
      return removePiCustomProvider(context.rootPath, payload.providerId, {
        backupRoot: piBackupRoot(),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_PI_MODEL_ADD, async (_, input: unknown) => {
    const payload = requirePiModelTarget(input, true);
    const context = resolveAgentProviderContext(payload.agentId);
    return addPiCustomModel(
      context.rootPath,
      payload.providerId,
      payload.model,
      { backupRoot: piBackupRoot() },
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_MODEL_UPDATE,
    async (_, input: unknown) => {
      const payload = requirePiModelUpdate(input);
      const context = resolveAgentProviderContext(payload.agentId);
      return updatePiCustomModel(
        context.rootPath,
        payload.providerId,
        payload.model,
        { backupRoot: piBackupRoot() },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_MODEL_REMOVE,
    async (_, input: unknown) => {
      const payload = requirePiModelTarget(input, false);
      const context = resolveAgentProviderContext(payload.agentId);
      return removePiCustomModel(
        context.rootPath,
        payload.providerId,
        payload.modelId!,
        { backupRoot: piBackupRoot() },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_MODEL_TEST,
    async (_, input: unknown) => {
      const payload = requirePiModelTarget(input, false);
      const context = resolveAgentProviderContext(payload.agentId);
      return testPiModel(
        context.rootPath,
        { providerId: payload.providerId, modelId: payload.modelId },
        new AbortController().signal,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PI_CREDENTIAL_SET,
    async (_, input: unknown) => {
      const payload = requirePiCredentialInput(input);
      const context = resolveAgentProviderContext(payload.agentId);
      return setPiCredential(
        context.rootPath,
        payload.providerId,
        payload.secret,
        { backupRoot: piBackupRoot() },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_USAGE_GET,
    async (_, agentId: unknown, query: unknown) => {
      if (typeof agentId !== "string" || agentId.trim().length === 0) {
        throw new Error("Agent usage query requires a non-empty agentId");
      }
      const queryOptions = parseAgentUsageQueryOptions(query);
      try {
        return await usageService.getUsage(agentId, queryOptions);
      } catch (error) {
        console.error(
          `Agent usage query failed for "${agentId}":`,
          error instanceof Error ? error.message : error,
        );
        const fallback: AgentUsageQuota = {
          schemaVersion: 2,
          agentId,
          adapter: "unknown",
          status: "unavailable",
          source: "provider",
          metrics: [],
          plan: null,
          fetchedAt: Date.now(),
          errorCode: "internal-error",
        };
        return fallback;
      }
    },
  );
}
