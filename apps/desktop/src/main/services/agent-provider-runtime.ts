import path from "node:path";

import {
  AgentAdapterRegistry,
  AgentProviderActivationService,
} from "@prompthub/core";
import {
  AgentConversationDB,
  AgentProviderProfileDB,
  AgentSessionIndexDB,
} from "@prompthub/db";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import Database from "../database/sqlite";
import { createAgentClaudeProviderAdapter } from "./agent-claude-provider-adapter";
import {
  createAgentManagementBackupService,
  type AgentManagementBackupService,
} from "./agent-management-backup-service";
import { createAgentCodexProviderAdapter } from "./agent-codex-provider-adapter";
import {
  createAgentCodexAccountService,
  type AgentCodexAccountService,
} from "./agent-codex-account-service";
import { createAgentCodexProviderService } from "./agent-codex-provider-service";
import {
  AGENT_MODEL_PROVIDER_PLATFORM_IDS,
  createAgentModelProviderAdapter,
} from "./agent-model-provider-adapter";
import { createAgentOpenCodeProviderAdapter } from "./agent-opencode-provider-adapter";
import {
  getAgentConfigContext,
  resolveAgentProviderContext,
} from "./agent-platform-context";
import { createAgentProviderActivationRepository } from "./agent-provider-activation-repository";
import { AgentProviderProfileService } from "./agent-provider-profile-service";
import { resolveAgentSessionIndexSource } from "./agent-session-index-operations";
import {
  createAgentSecretStore,
  type AgentSecretStore,
  type AgentSecretStoreEncryption,
} from "./agent-secret-store";
import {
  createAgentProviderTrayService,
  type AgentProviderTrayService,
} from "./agent-provider-tray-service";

interface CreateAgentProviderRuntimeOptions {
  database: Database.Database;
  encryption: AgentSecretStoreEncryption;
  userDataPath: string;
}

export interface AgentProviderRuntime {
  activationService: AgentProviderActivationService;
  codexAccountService: AgentCodexAccountService;
  backupService: AgentManagementBackupService;
  legacyProviderService: ReturnType<typeof createAgentCodexProviderService>;
  profileDb: AgentProviderProfileDB;
  conversationDb: AgentConversationDB;
  sessionIndexDb: AgentSessionIndexDB;
  profileService: AgentProviderProfileService;
  secretStore: AgentSecretStore;
  trayService: AgentProviderTrayService;
}

export function createAgentProviderRuntime({
  database,
  encryption,
  userDataPath,
}: CreateAgentProviderRuntimeOptions): AgentProviderRuntime {
  const backupRoot = path.join(userDataPath, "agent-config-backups");
  const profileDb = new AgentProviderProfileDB(database);
  const conversationDb = new AgentConversationDB(database);
  const sessionIndexDb = new AgentSessionIndexDB(database);
  const secretStore = createAgentSecretStore({
    userDataPath,
    encryption,
  });
  const codexRoot = getAgentConfigContext("codex").rootPath;
  const codexAccountService = createAgentCodexAccountService({
    authPath: path.join(codexRoot, "auth.json"),
    vaultPath: path.join(userDataPath, "agent-codex-accounts.json"),
    encryption,
  });
  const profileService = new AgentProviderProfileService(
    profileDb,
    secretStore,
  );
  const backupService = createAgentManagementBackupService({
    profiles: profileDb,
    secrets: secretStore,
    sessions: sessionIndexDb,
    resolveSessionSource: resolveAgentSessionIndexSource,
    transaction: (operation) => database.transaction(operation)(),
  });
  const legacyProviderService = createAgentCodexProviderService({
    backupRoot,
    secretStore,
  });
  const registry = new AgentAdapterRegistry();

  for (const platformId of AGENT_MODEL_PROVIDER_PLATFORM_IDS) {
    registry.register(platformId, {
      provider:
        platformId === "codex"
          ? createAgentCodexProviderAdapter({
              backupRoot,
              backupEncryption: encryption,
              secretStore,
            })
          : platformId === "claude"
            ? createAgentClaudeProviderAdapter({
                backupRoot,
                backupEncryption: encryption,
                secretStore,
              })
            : platformId === "opencode"
              ? createAgentOpenCodeProviderAdapter({
                  backupRoot,
                  backupEncryption: encryption,
                  secretStore,
                })
              : createAgentModelProviderAdapter(platformId, { backupRoot }),
    });
  }

  const activationService = new AgentProviderActivationService(
    registry,
    createAgentProviderActivationRepository(profileDb),
  );
  const trayService = createAgentProviderTrayService({
    activate: activationService.activate.bind(activationService),
    getLatestVerifiedSnapshot: (platformId) =>
      profileDb.getLatestVerifiedSnapshot(platformId),
    importCurrent: activationService.importCurrent.bind(activationService),
    listProfiles: () => profileService.list(),
    preview: activationService.preview.bind(activationService),
    resolveContext: resolveAgentProviderContext,
    resolvePlatformName: (platformId) => getPlatformById(platformId)!.name,
    supportedPlatformIds: AGENT_MODEL_PROVIDER_PLATFORM_IDS,
  });

  return {
    activationService,
    codexAccountService,
    backupService,
    conversationDb,
    legacyProviderService,
    profileDb,
    sessionIndexDb,
    profileService,
    secretStore,
    trayService,
  };
}
