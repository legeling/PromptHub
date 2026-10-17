import { create } from "zustand";
import type {
  AgentProviderActivationExecutionResult,
  AgentProviderActivationPlan,
  AgentProviderConnectionTestResult,
  AgentProviderCurrentState,
  AgentProviderFieldResolution,
  AgentProviderImportPreview,
  AgentProviderModelTestResult,
  AgentProviderProfileExport,
  AgentProviderProfilePublic,
  AgentProviderSourceCandidate,
  CreateAgentProviderProfileRequest,
  ImportAgentProviderSourceRequest,
  UpdateAgentProviderProfileRequest,
} from "@prompthub/shared";

type AgentProviderAction =
  | "load"
  | "create"
  | "update"
  | "archive"
  | "duplicate"
  | "export"
  | "delete"
  | "import"
  | "adopt-import"
  | "load-sources"
  | "import-source"
  | "restore-official"
  | "test-current-connection"
  | "test-current-model"
  | "test-connection"
  | "test-model"
  | "preview"
  | "activate";

interface AgentProviderState {
  platformId: string | null;
  profiles: AgentProviderProfilePublic[];
  sourceCandidates: AgentProviderSourceCandidate[];
  currentState: AgentProviderCurrentState | null;
  selectedProfileId: string | null;
  importPreview: AgentProviderImportPreview | null;
  activationPlan: AgentProviderActivationPlan | null;
  activationResult: AgentProviderActivationExecutionResult | null;
  connectionResult: AgentProviderConnectionTestResult | null;
  modelTestResult: AgentProviderModelTestResult | null;
  modelTestRequestId: string | null;
  busyAction: AgentProviderAction | null;
  errorCode: string | null;
  load: (platformId: string) => Promise<void>;
  select: (profileId: string | null) => void;
  createProfile: (
    request: CreateAgentProviderProfileRequest,
  ) => Promise<AgentProviderProfilePublic | null>;
  updateProfile: (
    request: UpdateAgentProviderProfileRequest,
  ) => Promise<AgentProviderProfilePublic | null>;
  archiveProfile: (
    id: string,
    expectedUpdatedAt: number,
  ) => Promise<AgentProviderProfilePublic | null>;
  duplicateProfile: (
    id: string,
    name: string,
  ) => Promise<AgentProviderProfilePublic | null>;
  exportProfile: (id: string) => Promise<AgentProviderProfileExport | null>;
  deleteProfile: (id: string) => Promise<boolean>;
  loadSources: (platformId: string) => Promise<AgentProviderSourceCandidate[]>;
  importSource: (
    request: ImportAgentProviderSourceRequest,
  ) => Promise<AgentProviderProfilePublic | null>;
  restoreOfficial: (
    agentId: string,
  ) => Promise<AgentProviderActivationPlan | null>;
  importCurrent: (
    agentId: string,
  ) => Promise<AgentProviderImportPreview | null>;
  adoptImport: () => Promise<AgentProviderProfilePublic | null>;
  testConnection: (
    agentId: string,
    profileId: string,
  ) => Promise<AgentProviderConnectionTestResult | null>;
  testCurrentConnection: (
    agentId: string,
  ) => Promise<AgentProviderConnectionTestResult | null>;
  testModel: (
    agentId: string,
    profileId: string,
  ) => Promise<AgentProviderModelTestResult | null>;
  testCurrentModel: (
    agentId: string,
  ) => Promise<AgentProviderModelTestResult | null>;
  cancelModelTest: () => Promise<boolean>;
  previewActivation: (
    agentId: string,
    profileId: string,
  ) => Promise<AgentProviderActivationPlan | null>;
  activatePreview: (
    agentId: string,
    resolutions?: AgentProviderFieldResolution[],
  ) => Promise<AgentProviderActivationExecutionResult | null>;
  clearTransient: () => void;
}

let loadGeneration = 0;
let modelTestSequence = 0;

function nextModelTestRequestId(): string {
  modelTestSequence += 1;
  return `model-test-${Date.now()}-${modelTestSequence}`;
}

async function cancelModelTestRequest(requestId: string): Promise<boolean> {
  try {
    return await window.api.agent.cancelProviderModelTest({ requestId });
  } catch {
    return false;
  }
}

function publicErrorCode(error: unknown): string {
  return error instanceof Error &&
    /^AGENT_PROVIDER_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "AGENT_PROVIDER_OPERATION_FAILED";
}

function upsertProfile(
  profiles: AgentProviderProfilePublic[],
  profile: AgentProviderProfilePublic,
): AgentProviderProfilePublic[] {
  const next = profiles.filter((candidate) => candidate.id !== profile.id);
  next.push(profile);
  return next.sort(
    (left, right) =>
      Number(left.archived) - Number(right.archived) ||
      right.updatedAt - left.updatedAt ||
      left.name.localeCompare(right.name),
  );
}

function importedCreateRequest(
  preview: AgentProviderImportPreview,
): CreateAgentProviderProfileRequest {
  const { secretRef: _secretRef, ...profile } = preview.profile;
  return {
    profile,
    modelMappings: preview.modelMappings,
  };
}

async function readCurrentState(
  platformId: string,
): Promise<AgentProviderCurrentState | null> {
  try {
    return await window.api.agent.getProviderCurrentState(platformId);
  } catch {
    return null;
  }
}

export const useAgentProviderStore = create<AgentProviderState>((set, get) => ({
  platformId: null,
  profiles: [],
  sourceCandidates: [],
  currentState: null,
  selectedProfileId: null,
  importPreview: null,
  activationPlan: null,
  activationResult: null,
  connectionResult: null,
  modelTestResult: null,
  modelTestRequestId: null,
  busyAction: null,
  errorCode: null,
  load: async (platformId) => {
    const activeModelTest = get().modelTestRequestId;
    if (activeModelTest) void cancelModelTestRequest(activeModelTest);
    const generation = ++loadGeneration;
    set({
      platformId,
      profiles: [],
      sourceCandidates: [],
      currentState: null,
      selectedProfileId: null,
      importPreview: null,
      activationPlan: null,
      activationResult: null,
      connectionResult: null,
      modelTestResult: null,
      modelTestRequestId: null,
      busyAction: "load",
      errorCode: null,
    });
    try {
      const [profiles, currentState] = await Promise.all([
        window.api.agent.listProviderProfiles({ platformId }),
        readCurrentState(platformId),
      ]);
      if (generation !== loadGeneration || get().platformId !== platformId) {
        return;
      }
      set({
        profiles,
        currentState,
        selectedProfileId:
          currentState?.officialService?.status === "active"
            ? "builtin:official"
            : (currentState?.currentProfileId ??
              (currentState?.nativeConfig
                ? null
                : (profiles[0]?.id ??
                  (currentState?.officialService
                    ? "builtin:official"
                    : null)))),
        busyAction: null,
      });
    } catch (error) {
      if (generation !== loadGeneration || get().platformId !== platformId) {
        return;
      }
      set({ busyAction: null, errorCode: publicErrorCode(error) });
    }
  },
  select: (selectedProfileId) => {
    const activeModelTest = get().modelTestRequestId;
    if (activeModelTest) void cancelModelTestRequest(activeModelTest);
    set((state) => ({
      selectedProfileId,
      activationPlan: null,
      activationResult: null,
      connectionResult: null,
      modelTestResult: null,
      modelTestRequestId: null,
      busyAction:
        state.busyAction === "test-model" ||
        state.busyAction === "test-current-model"
          ? null
          : state.busyAction,
      errorCode: null,
    }));
  },
  createProfile: async (request) => {
    set({ busyAction: "create", errorCode: null });
    try {
      const profile = await window.api.agent.createProviderProfile(request);
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        selectedProfileId: profile.id,
        busyAction: null,
        connectionResult: null,
        modelTestResult: null,
      }));
      return profile;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  updateProfile: async (request) => {
    set({ busyAction: "update", errorCode: null });
    try {
      const profile = await window.api.agent.updateProviderProfile(request);
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        busyAction: null,
        activationPlan: null,
        activationResult: null,
        connectionResult: null,
        modelTestResult: null,
      }));
      return profile;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  archiveProfile: async (id, expectedUpdatedAt) => {
    set({ busyAction: "archive", errorCode: null });
    try {
      const profile = await window.api.agent.archiveProviderProfile(
        id,
        expectedUpdatedAt,
      );
      const platformId = get().platformId;
      const currentState =
        platformId && get().currentState?.currentProfileId === id
          ? await readCurrentState(platformId)
          : get().currentState;
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        currentState:
          state.platformId === platformId ? currentState : state.currentState,
        selectedProfileId:
          state.selectedProfileId === id
            ? (state.profiles.find(
                (candidate) => candidate.id !== id && !candidate.archived,
              )?.id ?? null)
            : state.selectedProfileId,
        busyAction: null,
      }));
      return profile;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  duplicateProfile: async (id, name) => {
    set({ busyAction: "duplicate", errorCode: null });
    try {
      const profile = await window.api.agent.duplicateProviderProfile(id, name);
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        selectedProfileId: profile.id,
        busyAction: null,
        connectionResult: null,
        modelTestResult: null,
      }));
      return profile;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  exportProfile: async (id) => {
    set({ busyAction: "export", errorCode: null });
    try {
      const exported = await window.api.agent.exportProviderProfile(id);
      set({ busyAction: null });
      return exported;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  deleteProfile: async (id) => {
    set({ busyAction: "delete", errorCode: null });
    try {
      await window.api.agent.deleteProviderProfile(id);
      const platformId = get().platformId;
      const currentState =
        platformId && get().currentState?.currentProfileId === id
          ? await readCurrentState(platformId)
          : get().currentState;
      set((state) => {
        const profiles = state.profiles.filter(
          (candidate) => candidate.id !== id,
        );
        return {
          profiles,
          currentState:
            state.platformId === platformId ? currentState : state.currentState,
          selectedProfileId:
            state.selectedProfileId === id
              ? (profiles[0]?.id ?? null)
              : state.selectedProfileId,
          busyAction: null,
          activationPlan: null,
          activationResult: null,
          connectionResult: null,
          modelTestResult: null,
        };
      });
      return true;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return false;
    }
  },
  loadSources: async (platformId) => {
    set({ busyAction: "load-sources", errorCode: null, sourceCandidates: [] });
    try {
      const sourceCandidates =
        await window.api.agent.listProviderSources(platformId);
      if (get().platformId !== platformId) return [];
      set({ busyAction: null, sourceCandidates });
      return sourceCandidates;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return [];
    }
  },
  importSource: async (request) => {
    set({ busyAction: "import-source", errorCode: null });
    try {
      const profile = await window.api.agent.importProviderSource(request);
      if (get().platformId !== request.platformId) return profile;
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        selectedProfileId: profile.id,
        busyAction: null,
      }));
      return profile;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  restoreOfficial: async (agentId) => {
    set({
      busyAction: "restore-official",
      errorCode: null,
      activationPlan: null,
      activationResult: null,
    });
    try {
      const profile =
        await window.api.agent.ensureOfficialProviderProfile(agentId);
      const plan = await window.api.agent.previewProviderActivation({
        agentId,
        profileId: profile.id,
      });
      if (get().platformId !== agentId) return plan;
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        selectedProfileId: profile.id,
        activationPlan: plan,
        busyAction: null,
      }));
      return plan;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  importCurrent: async (agentId) => {
    set({
      busyAction: "import",
      errorCode: null,
      importPreview: null,
    });
    try {
      const preview = await window.api.agent.importCurrentProvider({ agentId });
      set({ busyAction: null, importPreview: preview });
      return preview;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  adoptImport: async () => {
    const preview = get().importPreview;
    if (!preview) {
      set({ errorCode: "AGENT_PROVIDER_IMPORT_REQUIRED" });
      return null;
    }
    set({ busyAction: "adopt-import", errorCode: null });
    try {
      const profile = await window.api.agent.createProviderProfile(
        importedCreateRequest(preview),
      );
      set((state) => ({
        profiles: upsertProfile(state.profiles, profile),
        selectedProfileId: profile.id,
        importPreview: null,
        busyAction: null,
      }));
      return profile;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  testConnection: async (agentId, profileId) => {
    set({
      busyAction: "test-connection",
      errorCode: null,
      connectionResult: null,
    });
    try {
      const connectionResult = await window.api.agent.testProviderConnection({
        agentId,
        profileId,
      });
      set({ busyAction: null, connectionResult });
      return connectionResult;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  testCurrentConnection: async (agentId) => {
    set({
      busyAction: "test-current-connection",
      errorCode: null,
      connectionResult: null,
    });
    try {
      const connectionResult =
        await window.api.agent.testCurrentProviderConnection({ agentId });
      if (get().platformId !== agentId) return connectionResult;
      set({ busyAction: null, connectionResult });
      return connectionResult;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  testModel: async (agentId, profileId) => {
    const requestId = nextModelTestRequestId();
    set({
      busyAction: "test-model",
      errorCode: null,
      modelTestResult: null,
      modelTestRequestId: requestId,
    });
    try {
      const modelTestResult = await window.api.agent.testProviderModel({
        agentId,
        profileId,
        requestId,
      });
      if (get().modelTestRequestId !== requestId) return null;
      set({
        busyAction: null,
        modelTestRequestId: null,
        modelTestResult,
      });
      return modelTestResult;
    } catch (error) {
      if (get().modelTestRequestId !== requestId) return null;
      set({
        busyAction: null,
        modelTestRequestId: null,
        errorCode: publicErrorCode(error),
      });
      return null;
    }
  },
  testCurrentModel: async (agentId) => {
    const requestId = nextModelTestRequestId();
    set({
      busyAction: "test-current-model",
      errorCode: null,
      modelTestResult: null,
      modelTestRequestId: requestId,
    });
    try {
      const modelTestResult = await window.api.agent.testCurrentProviderModel({
        agentId,
        requestId,
      });
      if (get().modelTestRequestId !== requestId) return null;
      set({
        busyAction: null,
        modelTestRequestId: null,
        modelTestResult,
      });
      return modelTestResult;
    } catch (error) {
      if (get().modelTestRequestId !== requestId) return null;
      set({
        busyAction: null,
        modelTestRequestId: null,
        errorCode: publicErrorCode(error),
      });
      return null;
    }
  },
  cancelModelTest: async () => {
    const requestId = get().modelTestRequestId;
    if (!requestId) return false;
    try {
      return await cancelModelTestRequest(requestId);
    } catch (error) {
      set({ errorCode: publicErrorCode(error) });
      return false;
    }
  },
  previewActivation: async (agentId, profileId) => {
    set({
      busyAction: "preview",
      errorCode: null,
      activationPlan: null,
      activationResult: null,
    });
    try {
      const activationPlan = await window.api.agent.previewProviderActivation({
        agentId,
        profileId,
      });
      set({ busyAction: null, activationPlan });
      return activationPlan;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  activatePreview: async (agentId, resolutions) => {
    const activationPlan = get().activationPlan;
    if (!activationPlan) {
      set({ errorCode: "AGENT_PROVIDER_PREVIEW_REQUIRED" });
      return null;
    }
    set({ busyAction: "activate", errorCode: null, activationResult: null });
    try {
      const activationResult = await window.api.agent.activateProvider({
        agentId,
        profileId: activationPlan.profileId,
        expectedCurrentDigest: activationPlan.currentDigest,
        ...(resolutions ? { resolutions } : {}),
      });
      const currentState =
        activationResult.status === "verified"
          ? await readCurrentState(agentId)
          : get().currentState;
      const activePlatformId = get().platformId;
      if (activePlatformId !== null && activePlatformId !== agentId) {
        return activationResult;
      }
      set({
        busyAction: null,
        activationPlan: activationResult.plan,
        activationResult,
        currentState,
        ...(activationResult.status === "verified" &&
        currentState?.officialService?.status === "active"
          ? { selectedProfileId: "builtin:official" }
          : {}),
      });
      return activationResult;
    } catch (error) {
      set({ busyAction: null, errorCode: publicErrorCode(error) });
      return null;
    }
  },
  clearTransient: () => {
    const activeModelTest = get().modelTestRequestId;
    if (activeModelTest) void cancelModelTestRequest(activeModelTest);
    set((state) => ({
      importPreview: null,
      activationPlan: null,
      activationResult: null,
      connectionResult: null,
      modelTestResult: null,
      modelTestRequestId: null,
      busyAction:
        state.busyAction === "test-model" ||
        state.busyAction === "test-current-model"
          ? null
          : state.busyAction,
      errorCode: null,
    }));
  },
}));
