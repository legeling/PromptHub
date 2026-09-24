import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/ai", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

import { chatCompletion } from "../../../src/renderer/services/ai";
import { scheduleAllSaveSync } from "../../../src/renderer/services/webdav-save-sync";
import {
  getProjectScanPaths,
  useSkillStore,
} from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";
import { SKILL_PACKAGE_FINGERPRINT_ALGORITHM } from "@prompthub/shared/utils/skill-source-update";
import type { RegistrySkill } from "@prompthub/shared/types";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

const resetSkillStore = () => {
  useSkillStore.setState({
    skills: [],
    selectedSkillId: null,
    isLoading: false,
    error: null,
    viewMode: "gallery",
    searchQuery: "",
    filterType: "all",
    filterTags: [],
    deployedSkillNames: new Set<string>(),
    storeView: "my-skills",
    registrySkills: [],
    isLoadingRegistry: false,
    storeCategory: "all",
    storeSearchQuery: "",
    selectedRegistrySlug: null,
    customStoreSources: [],
    selectedStoreSourceId: "official",
    remoteStoreEntries: {},
    pendingPluginChildDeploySkillIds: [],
    translationCache: {},
  });
  localStorage.clear();
};

describe("skill store", () => {
  beforeEach(() => {
    resetSkillStore();
    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiKey: "test-key",
      aiApiUrl: "https://example.com/v1",
      aiModel: "gpt-4o-mini",
      aiModels: [],
      scenarioModelDefaults: {},
      translationMode: "full",
    });
    installWindowMocks({
      api: {
        skill: {
          getAll: vi.fn(),
          update: vi.fn(),
          writeLocalFile: vi.fn(),
          writeLocalFileBufferByPath: vi.fn(),
          getRepoPath: vi.fn(),
          getRemoteGitPackageFingerprint: vi.fn(),
          fetchRemoteContentBytes: vi.fn(),
          saveSafetyReport: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("applies deployed and tag filters in getFilteredSkills", () => {
    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
          tags: ["team", "ops"],
        }),
        createSkillFixture({
          id: "skill-2",
          name: "beta",
          tags: ["docs"],
        }),
      ],
      filterType: "deployed",
      filterTags: ["team"],
      deployedSkillNames: new Set(["skill-1"]),
    });

    expect(
      useSkillStore
        .getState()
        .getFilteredSkills()
        .map((skill) => skill.id),
    ).toEqual(["skill-1"]);
  });

  it("falls back to official source when removing the selected custom source", () => {
    useSkillStore.setState({
      customStoreSources: [
        {
          id: "custom-1",
          name: "Custom",
          type: "marketplace-json",
          url: "https://example.com/skills.json",
          enabled: true,
          createdAt: 1,
        },
      ],
      selectedStoreSourceId: "custom-1",
      remoteStoreEntries: {
        "custom-1": {
          loadedAt: 1,
          skills: [],
        },
      },
    });

    useSkillStore.getState().removeCustomStoreSource("custom-1");

    const state = useSkillStore.getState();
    expect(state.selectedStoreSourceId).toBe("official");
    expect(state.customStoreSources).toHaveLength(0);
    expect(state.remoteStoreEntries["custom-1"]).toBeUndefined();
  });

  it("loadRegistry loads the built-in registry asynchronously without prefetching remote content", async () => {
    const fetchRemoteContent = vi.fn();
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    const loadPromise = useSkillStore.getState().loadRegistry();
    expect(useSkillStore.getState().isLoadingRegistry).toBe(true);
    await loadPromise;

    const state = useSkillStore.getState();
    expect(state.registrySkills.length).toBeGreaterThan(0);
    expect(state.isLoadingRegistry).toBe(false);
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("stores branch and directory when adding a git repo custom source", () => {
    useSkillStore
      .getState()
      .addCustomStoreSource(
        "Release Store",
        "https://github.com/openai/skills/tree/main/skills/.curated",
        "git-repo",
        {
          branch: "release",
          directory: "skills/release",
        },
      );

    const source = useSkillStore.getState().customStoreSources[0];
    expect(source).toEqual(
      expect.objectContaining({
        name: "Release Store",
        url: "https://github.com/openai/skills",
        branch: "release",
        directory: "skills/release",
      }),
    );
  });

  it("keeps Plugin child Skill deploy requests as one-time UI handoff state", () => {
    useSkillStore
      .getState()
      .requestPluginChildSkillDeploy(["skill-a", "", "skill-a", "skill-b"]);

    expect(useSkillStore.getState().pendingPluginChildDeploySkillIds).toEqual([
      "skill-a",
      "skill-b",
    ]);
    expect(
      useSkillStore.getState().consumePluginChildSkillDeployRequest(),
    ).toEqual(["skill-a", "skill-b"]);
    expect(useSkillStore.getState().pendingPluginChildDeploySkillIds).toEqual(
      [],
    );

    const persisted = JSON.parse(localStorage.getItem("skill-store") ?? "{}");
    expect(persisted.state.pendingPluginChildDeploySkillIds).toBeUndefined();
  });

  it("stores project scan errors and rethrows them to the caller", async () => {
    const scanLocalPreview = vi
      .fn()
      .mockRejectedValue(new Error("Project scan failed"));
    installWindowMocks({
      api: {
        skill: {
          scanLocalPreview,
        },
      },
    });

    useSkillStore.setState({
      error: null,
      projectScanState: {},
    } as Partial<ReturnType<typeof useSkillStore.getState>>);
    useSettingsStore.setState({
      aiModels: [
        {
          id: "safety-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://api.example.com/v1",
          model: "gpt-4o-mini",
          isDefault: true,
        },
      ],
    });

    await expect(
      useSkillStore.getState().scanProjectSkills({
        id: "project-1",
        name: "Workspace",
        rootPath: "/tmp/workspace",
        scanPaths: ["/tmp/workspace/.skills"],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).rejects.toThrow("Project scan failed");

    expect(useSkillStore.getState().projectScanState["project-1"]).toEqual(
      expect.objectContaining({
        scannedSkills: [],
        isScanning: false,
        error: "Project scan failed",
      }),
    );
  });

  it("expands default project skill directories when scanning a project", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([]);
    installWindowMocks({
      api: {
        skill: {
          scanLocalPreview,
        },
      },
    });

    useSkillStore.setState({
      error: null,
      projectScanState: {},
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await useSkillStore.getState().scanProjectSkills({
      id: "project-1",
      name: "Workspace",
      rootPath: "/tmp/workspace",
      scanPaths: ["/tmp/workspace/custom-skills"],
      createdAt: 1,
      updatedAt: 1,
    });

    expect(scanLocalPreview).toHaveBeenCalledWith([
      "/tmp/workspace/.claude/skills",
      "/tmp/workspace/.agents/skills",
      "/tmp/workspace/skills",
      "/tmp/workspace/.gemini",
      "/tmp/workspace/custom-skills",
    ]);
  });

  it("builds effective project scan paths from default folders without scanning the whole project root", () => {
    expect(
      getProjectScanPaths({
        id: "project-1",
        name: "Workspace",
        rootPath: "/tmp/workspace",
        scanPaths: [],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toEqual([
      "/tmp/workspace/.claude/skills",
      "/tmp/workspace/.agents/skills",
      "/tmp/workspace/skills",
      "/tmp/workspace/.gemini",
    ]);
  });

  it("clears selected skill when switching store views", () => {
    useSkillStore.setState({
      selectedSkillId: "skill-1",
      storeView: "projects",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    useSkillStore.getState().setStoreView("my-skills");

    expect(useSkillStore.getState().storeView).toBe("my-skills");
    expect(useSkillStore.getState().selectedSkillId).toBeNull();
  });

  it("keeps the project root only when it is explicitly configured as an extra scan path", () => {
    expect(
      getProjectScanPaths({
        id: "project-1",
        name: "Workspace",
        rootPath: "/tmp/workspace",
        scanPaths: ["/tmp/workspace", "/tmp/workspace/custom-skills"],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toEqual([
      "/tmp/workspace/.claude/skills",
      "/tmp/workspace/.agents/skills",
      "/tmp/workspace/skills",
      "/tmp/workspace/.gemini",
      "/tmp/workspace",
      "/tmp/workspace/custom-skills",
    ]);
  });

  it("submits empty instructions through update and adopts the published result", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "skill-1",
      name: "alpha",
      instructions: "---\nname: alpha\n---\n",
      content: "---\nname: alpha\n---\n",
      local_repo_path: "/tmp/skills/alpha",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 2,
    });
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const getRepoPath = vi.fn().mockResolvedValue("/tmp/skills/alpha");

    window.api.skill.update = update;
    window.api.skill.writeLocalFile = writeLocalFile;
    window.api.skill.getRepoPath = getRepoPath;

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
          instructions: "old content",
          content: "old content",
        }),
      ],
    });

    await useSkillStore.getState().updateSkill("skill-1", {
      instructions: "",
      content: "",
    });

    expect(update).toHaveBeenCalledWith("skill-1", {
      instructions: "",
      content: "",
    });
    expect(writeLocalFile).not.toHaveBeenCalled();
    expect(useSkillStore.getState().skills[0]?.instructions).toBe(
      "---\nname: alpha\n---\n",
    );
    expect(useSkillStore.getState().skills[0]?.local_repo_path).toBe(
      "/tmp/skills/alpha",
    );
    expect(scheduleAllSaveSync).toHaveBeenCalledWith("skill:update");
  });

  it("does not rewrite SKILL.md when updating metadata only", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "skill-1",
      name: "alpha",
      instructions: "same content",
      content: "same content",
      tags: ["ops"],
      local_repo_path: "/tmp/skills/alpha",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 2,
    });

    (window as any).api.skill.update = update;

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
          instructions: "same content",
          content: "same content",
          tags: ["docs"],
        }),
      ],
    });

    await useSkillStore.getState().updateSkill("skill-1", {
      tags: ["ops"],
    });

    expect((window as any).api.skill.writeLocalFile).not.toHaveBeenCalled();
    expect((window as any).api.skill.getRepoPath).not.toHaveBeenCalled();
  });

  it("normalizes legacy skill payloads when loading skills", async () => {
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([
      {
        id: "skill-1",
        name: "alpha",
        tags: '["ops","docs"]',
        original_tags: "seed, legacy",
        protocol_type: "skill",
        is_favorite: false,
        currentVersion: "2",
        created_at: "1",
        updated_at: "2",
      },
    ]);

    await useSkillStore.getState().loadSkills();

    expect(useSkillStore.getState().skills).toEqual([
      expect.objectContaining({
        id: "skill-1",
        tags: ["ops", "docs"],
        original_tags: ["seed", "legacy"],
        currentVersion: 2,
        created_at: 1,
        updated_at: 2,
      }),
    ]);
  });

  it("keeps cached skills visible while refreshing with preferCache", async () => {
    let resolveGetAll: (value: unknown[]) => void = () => undefined;
    (window as any).api.skill.getAll = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveGetAll = resolve;
        }),
    );
    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "cached-skill",
          name: "cached",
        }),
      ],
      isLoading: false,
    });

    const loadPromise = useSkillStore
      .getState()
      .loadSkills({ preferCache: true });

    expect(useSkillStore.getState().isLoading).toBe(false);
    expect(useSkillStore.getState().skills[0].id).toBe("cached-skill");

    resolveGetAll([
      createSkillFixture({
        id: "fresh-skill",
        name: "fresh",
      }),
    ]);
    await loadPromise;

    expect(useSkillStore.getState().isLoading).toBe(false);
    expect(useSkillStore.getState().skills[0].id).toBe("fresh-skill");
  });

  it("deduplicates deployed-status refreshes and keeps force refresh explicit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T08:00:00.000Z"));
    let resolveStatus: (
      value: Record<string, Record<string, boolean>>,
    ) => void = () => undefined;
    const getMdInstallStatusBatch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );
    (window as any).api.skill.getMdInstallStatusBatch = getMdInstallStatusBatch;
    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
        }),
      ],
      deployedSkillNames: new Set<string>(),
    });

    const firstRefresh = useSkillStore.getState().loadDeployedStatus();
    const secondRefresh = useSkillStore.getState().loadDeployedStatus();

    expect(getMdInstallStatusBatch).toHaveBeenCalledTimes(1);
    resolveStatus({ "skill-1": { claude: true } });
    await Promise.all([firstRefresh, secondRefresh]);
    expect(useSkillStore.getState().deployedSkillNames.has("skill-1")).toBe(
      true,
    );

    await useSkillStore.getState().loadDeployedStatus();
    expect(getMdInstallStatusBatch).toHaveBeenCalledTimes(1);

    getMdInstallStatusBatch.mockResolvedValueOnce({
      "skill-1": { claude: false },
    });
    await useSkillStore.getState().loadDeployedStatus({ force: true });
    expect(getMdInstallStatusBatch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
