import path from "node:path";

import { app, dialog, ipcMain } from "electron";

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";
import type {
  AgentPetStoreQuery,
  ApplyAgentThemeInput,
  UpdateAgentPetInput,
} from "@prompthub/shared/types";
import { getDataDir } from "../runtime-paths";
import { AgentAppearanceService } from "../services/agent-appearance-service";
import { AgentPetStoreService } from "../services/agent-pet-store-service";
import { fetchWithNetworkProxy } from "../services/network-proxy";
import { CodexDreamSkinEngine } from "../services/codex-dream-skin-engine";
import { SkillInstaller } from "../services/skill-installer";
import { getPlatformRootDir } from "../services/skill-installer-utils";

interface AgentAppearanceIpcOptions {
  createService?: () => AgentAppearanceService;
  createPetStoreService?: (
    appearanceService: AgentAppearanceService,
  ) => AgentPetStoreService;
}

function requireCodexAgent(agentId: unknown): void {
  if (agentId !== "codex") {
    throw new Error("Agent appearance is currently only supported for Codex");
  }
  if (!isAgentDepthCapabilityAvailable(agentId, "appearance")) {
    throw new Error("AGENT_APPEARANCE_UNSUPPORTED");
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function createDefaultService(): AgentAppearanceService {
  const platform = SkillInstaller.getSupportedPlatforms().find(
    (candidate) => candidate.id === "codex",
  );
  if (!platform) throw new Error("Codex platform is unavailable");
  const dataRoot = getDataDir();
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "codex-dream-skin")
    : path.join(__dirname, "../../resources", "codex-dream-skin");
  return new AgentAppearanceService({
    dataRoot,
    codexRoot: getPlatformRootDir(platform),
    engine: new CodexDreamSkinEngine({
      runtimeRoot,
      stateRoot: path.join(dataRoot, "agent-appearance", "dream-skin-runtime"),
    }),
  });
}

function normalizeApplyInput(value: unknown): ApplyAgentThemeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Theme apply input must be an object");
  }
  const raw = value as Record<string, unknown>;
  requireCodexAgent(raw.agentId);
  const themeId = requireString(raw.themeId, "themeId");
  if (
    raw.restartExisting !== undefined &&
    typeof raw.restartExisting !== "boolean"
  ) {
    throw new Error("restartExisting must be a boolean");
  }
  return {
    agentId: "codex",
    themeId,
    restartExisting: raw.restartExisting as boolean | undefined,
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizePetUpdate(value: unknown): UpdateAgentPetInput {
  const raw = requireObject(value, "Pet update input");
  requireCodexAgent(raw.agentId);
  return {
    agentId: "codex",
    petId: requireString(raw.petId, "Pet id"),
    name: requireString(raw.name, "Pet name"),
    description:
      raw.description === undefined
        ? ""
        : typeof raw.description === "string"
          ? raw.description
          : (() => {
              throw new Error("Pet description must be a string");
            })(),
  };
}

function normalizeStoreQuery(value: unknown): AgentPetStoreQuery {
  const raw = requireObject(value, "Pet store query");
  requireCodexAgent(raw.agentId);
  if (raw.search !== undefined && typeof raw.search !== "string") {
    throw new Error("Pet store search must be a string");
  }
  if (raw.locale !== undefined && typeof raw.locale !== "string") {
    throw new Error("Pet store locale must be a string");
  }
  for (const key of ["page", "pageSize"] as const) {
    if (raw[key] !== undefined && !Number.isFinite(raw[key])) {
      throw new Error(`Pet store ${key} must be a finite number`);
    }
  }
  if (raw.refresh !== undefined && typeof raw.refresh !== "boolean") {
    throw new Error("Pet store refresh must be a boolean");
  }
  return {
    agentId: "codex",
    search: raw.search as string | undefined,
    locale: raw.locale as string | undefined,
    page: raw.page as number | undefined,
    pageSize: raw.pageSize as number | undefined,
    refresh: raw.refresh as boolean | undefined,
  };
}

export function registerAgentAppearanceIPC(
  options: AgentAppearanceIpcOptions = {},
): void {
  const createService = options.createService ?? createDefaultService;
  let petStoreService: AgentPetStoreService | null = null;
  const getPetStoreService = () => {
    requireCodexAgent("codex");
    if (!petStoreService) {
      const appearanceService = createService();
      petStoreService = options.createPetStoreService
        ? options.createPetStoreService(appearanceService)
        : new AgentPetStoreService({
            dataRoot: getDataDir(),
            appearanceService,
            fetchImpl: fetchWithNetworkProxy,
          });
    }
    return petStoreService;
  };

  ipcMain.handle(IPC_CHANNELS.AGENT_APPEARANCE_GET, async (_, agentId) => {
    requireCodexAgent(agentId);
    return createService().getOverview();
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_THEME,
    async (_, agentId) => {
      requireCodexAgent(agentId);
      const result = await dialog.showOpenDialog({
        title: "Import Codex Dream Skin",
        properties: ["openDirectory"],
      });
      const sourcePath = result.filePaths[0];
      if (result.canceled || !sourcePath) return null;
      return createService().importTheme(sourcePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_APPLY_THEME,
    async (_, input) => {
      const payload = normalizeApplyInput(input);
      return createService().applyTheme(
        payload.themeId,
        payload.restartExisting ?? false,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_RESTORE_THEME,
    async (_, agentId) => {
      requireCodexAgent(agentId);
      return createService().restoreTheme();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_DELETE_THEME,
    async (_, agentId, themeId) => {
      requireCodexAgent(agentId);
      return createService().deleteTheme(requireString(themeId, "themeId"));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_THEME,
    async (_, agentId, themeId) => {
      requireCodexAgent(agentId);
      const normalizedThemeId = requireString(themeId, "themeId");
      const result = await dialog.showOpenDialog({
        title: "Export Codex Dream Skin",
        properties: ["openDirectory", "createDirectory"],
      });
      const destinationPath = result.filePaths[0];
      if (result.canceled || !destinationPath) return null;
      return createService().exportTheme(normalizedThemeId, destinationPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_THEME_PREVIEW,
    async (_, agentId, themeId) => {
      requireCodexAgent(agentId);
      return createService().getThemePreview(requireString(themeId, "themeId"));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_PET,
    async (_, agentId) => {
      requireCodexAgent(agentId);
      const result = await dialog.showOpenDialog({
        title: "Import Codex Pet",
        properties: ["openDirectory"],
      });
      const sourcePath = result.filePaths[0];
      if (result.canceled || !sourcePath) return null;
      return createService().importPet(sourcePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_PET,
    async (_, agentId, petId) => {
      requireCodexAgent(agentId);
      const normalizedPetId = requireString(petId, "Pet id");
      const result = await dialog.showOpenDialog({
        title: "Export Codex Pet",
        properties: ["openDirectory", "createDirectory"],
      });
      const destinationPath = result.filePaths[0];
      if (result.canceled || !destinationPath) return null;
      return createService().exportPet(normalizedPetId, destinationPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_DELETE_PET,
    async (_, agentId, petId) => {
      requireCodexAgent(agentId);
      return createService().deletePet(requireString(petId, "Pet id"));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_PET_PREVIEW,
    async (_, agentId, petId) => {
      requireCodexAgent(agentId);
      return createService().getPetPreview(requireString(petId, "Pet id"));
    },
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_APPEARANCE_UPDATE_PET, async (_, input) => {
    return createService().updatePetMetadata(normalizePetUpdate(input));
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_LIST,
    async (_, query) => getPetStoreService().list(normalizeStoreQuery(query)),
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_INSTALL,
    async (_, agentId, petId) => {
      requireCodexAgent(agentId);
      return getPetStoreService().install(
        "codex",
        requireString(petId, "Pet id"),
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_PREVIEW,
    async (_, agentId, petId) => {
      requireCodexAgent(agentId);
      return getPetStoreService().getPreview(
        "codex",
        requireString(petId, "Pet id"),
      );
    },
  );
}
