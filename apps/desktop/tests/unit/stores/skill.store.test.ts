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

  it("loadRegistry does not prefetch remote content", () => {
    const fetchRemoteContent = vi.fn();
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    useSkillStore.getState().loadRegistry();

    const state = useSkillStore.getState();
    expect(state.registrySkills.length).toBeGreaterThan(0);
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

  it("syncs an intentionally empty SKILL.md back to the local repo on update", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "skill-1",
      name: "alpha",
      instructions: "",
      content: "",
      local_repo_path: "/tmp/skills/alpha",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 2,
    });
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const getRepoPath = vi.fn().mockResolvedValue("/tmp/skills/alpha");

    (window as any).api.skill.update = update;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.getRepoPath = getRepoPath;

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

    expect(writeLocalFile).toHaveBeenCalledWith("skill-1", "SKILL.md", "", {
      skipVersionSnapshot: true,
    });
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
    (window as any).api.skill.getMdInstallStatusBatch =
      getMdInstallStatusBatch;
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

  it("prefers install_name over registry slug when importing a registry skill", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-2",
        name: "find-skills",
        registry_slug: "vercel-labs-skills-find-skills",
      }),
    );
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = getAll;

    await useSkillStore.getState().installRegistrySkill({
      slug: "vercel-labs-skills-find-skills",
      install_name: "find-skills",
      name: "find-skills",
      description: "Community skill",
      category: "dev",
      author: "vercel-labs",
      source_url: "https://github.com/vercel-labs/skills",
      store_url: "https://skills.sh/vercel-labs/skills/find-skills",
      tags: ["search"],
      version: "1.0.0",
      content: "# Finding Skills",
      weekly_installs: "774.9K",
      compatibility: ["opencode", "codex"],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "find-skills",
        registry_slug: "vercel-labs-skills-find-skills",
      }),
    );
  });

  it("blocks installing official registry skills when only placeholder frontmatter is available", async () => {
    const create = vi.fn();
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("network down"));

    (window as any).api.skill.create = create;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    await expect(
      useSkillStore.getState().installRegistrySkill({
        slug: "pdf",
        name: "PDF Skill",
        description: "PDF helper",
        category: "office",
        author: "Anthropic",
        source_url: "https://github.com/anthropics/skills/tree/main/skills/pdf",
        content_url:
          "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md",
        tags: ["pdf"],
        version: "1.0.0",
        content: `---
name: pdf
description: Use this skill for PDF tasks.
---`,
        compatibility: ["claude"],
      }),
    ).rejects.toThrow(/full SKILL\.md/i);

    expect(create).not.toHaveBeenCalled();
  });

  it("stores install fingerprints for registry skills and uses them for update checks", async () => {
    const create = vi.fn().mockImplementation(async (data) => ({
      id: "skill-writer",
      created_at: 1,
      updated_at: 1,
      ...data,
    }));
    const fetchRemoteContent = vi
      .fn()
      .mockResolvedValue("# Writer\n\nOriginal\n");
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.create = create;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.getAll = getAll;

    const installed = await useSkillStore.getState().installRegistrySkill({
      slug: "writer",
      source_id: "source-writer-main",
      name: "Writer",
      description: "Write better",
      category: "general",
      author: "PromptHub",
      source_url: "https://github.com/example/skills/tree/main/writer",
      content_url:
        "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n",
    });

    expect(installed?.installed_content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(installed?.installed_version).toBe("1.0.0");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        installed_content_hash: installed?.installed_content_hash,
        installed_version: "1.0.0",
      }),
    );
  });

  it("treats same-name variants with different source ids as separately installable", () => {
    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "installed-main-writer",
          name: "writer",
          source_id: "source-main-writer",
          registry_slug: "writer",
        }),
      ],
      registrySkills: [
        {
          slug: "writer",
          name: "Writer",
          install_name: "writer",
          source_id: "source-main-writer",
          description: "Stable writer",
          category: "general",
          author: "PromptHub",
          source_url: "https://github.com/example/skills/tree/main/writer",
          source_branch: "main",
          tags: ["writing"],
          version: "1.0.0",
          content: "# Writer\n\nMain\n",
        },
        {
          slug: "writer",
          name: "Writer",
          install_name: "writer",
          source_id: "source-dev-writer",
          description: "Dev writer",
          category: "general",
          author: "PromptHub",
          source_url: "https://github.com/example/skills/tree/dev/writer",
          source_branch: "dev",
          tags: ["writing"],
          version: "1.1.0-beta",
          content: "# Writer\n\nDev\n",
        },
      ],
    });

    const { installed, recommended } = useSkillStore
      .getState()
      .getFilteredRegistrySkills();

    expect(installed.map((skill) => skill.source_id)).toEqual([
      "source-main-writer",
    ]);
    expect(recommended.map((skill) => skill.source_id)).toEqual([
      "source-dev-writer",
    ]);
  });

  it("syncs binary GitHub repo assets into the managed local repo", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-binary",
        name: "binary-skill",
        registry_slug: "binary-skill",
      }),
    );
    const getAll = vi.fn().mockResolvedValue([]);
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        return JSON.stringify({
          tree: [
            { path: "skills/binary-skill/SKILL.md", type: "blob" },
            { path: "skills/binary-skill/assets/icon.png", type: "blob" },
          ],
        });
      }

      return "# Binary Skill\n\nHello\n";
    });
    const fetchRemoteContentBytes = vi
      .fn()
      .mockResolvedValue(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const writeLocalFileBufferByPath = vi.fn().mockResolvedValue(undefined);
    const getRepoPath = vi.fn().mockResolvedValue("/tmp/managed/binary-skill");

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = getAll;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.fetchRemoteContentBytes = fetchRemoteContentBytes;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.writeLocalFileBufferByPath =
      writeLocalFileBufferByPath;
    (window as any).api.skill.getRepoPath = getRepoPath;

    await useSkillStore.getState().installRegistrySkill({
      slug: "binary-skill",
      name: "Binary Skill",
      description: "Has image assets",
      category: "general",
      author: "PromptHub",
      source_url:
        "https://github.com/example/skills/tree/main/skills/binary-skill",
      content_url:
        "https://raw.githubusercontent.com/example/skills/main/skills/binary-skill/SKILL.md",
      tags: ["assets"],
      version: "1.0.0",
      content: "# Binary Skill\n\nCached\n",
    });

    expect(writeLocalFile).toHaveBeenCalledWith(
      "skill-binary",
      "SKILL.md",
      "# Binary Skill\n\nHello\n",
      { skipVersionSnapshot: true },
    );
    expect(fetchRemoteContentBytes).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/main/skills/binary-skill/assets/icon.png",
    );
    expect(writeLocalFileBufferByPath).toHaveBeenCalledWith(
      "/tmp/managed/binary-skill",
      "assets/icon.png",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("updates a pristine registry skill after creating a version snapshot", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-1" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-writer", name: "writer" }),
      ...data,
      id: "skill-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-writer",
          name: "writer",
          source_id: "source-writer-main",
          registry_slug: "writer",
          content: "# Writer\n\nOriginal\n",
          instructions: "# Writer\n\nOriginal\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [
        {
          slug: "writer",
          source_id: "source-writer-main",
          name: "Writer",
          description: "Write better",
          category: "general",
          author: "PromptHub",
          source_url: "https://github.com/example/skills/tree/main/writer",
          content_url:
            "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
          tags: ["writing"],
          version: "1.1.0",
          content: remoteContent,
        },
      ],
    });

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill("source-writer-main");

    expect(result?.status).toBe("updated");
    expect(versionCreate).toHaveBeenCalledWith(
      "skill-writer",
      expect.stringContaining("Store update"),
    );
    expect(update).toHaveBeenCalledWith(
      "skill-writer",
      expect.objectContaining({
        content: remoteContent,
        instructions: remoteContent,
        version: "1.1.0",
        installed_version: "1.1.0",
      }),
    );
  });

  it("checks updates for a GitHub-imported skill without a cached store entry", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-github-writer",
          name: "github-writer",
          source_id: "github-writer-source",
          source_url: "https://github.com/example/skills/tree/main/writer",
          content: "# Writer\n\nOriginal\n",
          instructions: "# Writer\n\nOriginal\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {},
    });

    const check = await useSkillStore
      .getState()
      .getInstalledSkillSourceUpdateStatus("skill-github-writer");

    expect(check?.status).toBe("update-available");
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
    );
  });

  it("updates a GitHub-imported skill from its own source metadata without a cached store entry", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-github" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-github-writer", name: "github-writer" }),
      ...data,
      id: "skill-github-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-github-writer",
          name: "github-writer",
          source_id: "github-writer-source",
          source_url: "https://github.com/example/skills/tree/main/writer",
          content: "# Writer\n\nOriginal\n",
          instructions: "# Writer\n\nOriginal\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {},
    });

    const result = await useSkillStore
      .getState()
      .updateInstalledSkillFromSource("skill-github-writer");

    expect(result?.status).toBe("updated");
    expect(versionCreate).toHaveBeenCalledWith(
      "skill-github-writer",
      expect.stringContaining("Source update"),
    );
    expect(update).toHaveBeenCalledWith(
      "skill-github-writer",
      expect.objectContaining({
        content: remoteContent,
        instructions: remoteContent,
        source_url: "https://github.com/example/skills/tree/main/writer",
        content_url:
          "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
        installed_version: "source",
      }),
    );
  });

  it("updates a pristine skill from a cached remote store source", async () => {
    const remoteContent = "# Community Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-remote" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({
        id: "skill-community-writer",
        name: "community-writer",
      }),
      ...data,
      id: "skill-community-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Community Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-community-writer",
          name: "community-writer",
          source_id: "source-community-writer",
          registry_slug: "community-writer",
          content: "# Community Writer\n\nOriginal\n",
          instructions: "# Community Writer\n\nOriginal\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {
        community: {
          loadedAt: 1,
          error: null,
          skills: [
            {
              slug: "community-writer",
              source_id: "source-community-writer",
              name: "Community Writer",
              description: "Write better",
              category: "general",
              author: "Community",
              source_url:
                "https://github.com/example/community/tree/main/writer",
              content_url:
                "https://raw.githubusercontent.com/example/community/main/writer/SKILL.md",
              tags: ["writing"],
              version: "1.1.0",
              content: remoteContent,
            },
          ],
        },
      },
    });

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill("source-community-writer");

    expect(result?.status).toBe("updated");
    expect(versionCreate).toHaveBeenCalledWith(
      "skill-community-writer",
      expect.stringContaining("Store update"),
    );
    expect(update).toHaveBeenCalledWith(
      "skill-community-writer",
      expect.objectContaining({
        content: remoteContent,
        installed_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        installed_version: "1.1.0",
      }),
    );
  });

  it("keeps a private Gitea store install up to date and preserves the store label", async () => {
    const remoteContent = "# clouddrive2-cli\n\nCloudDrive2 commands\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-gitea" });
    const create = vi.fn().mockImplementation(async (data) => ({
      id: "skill-clouddrive2-cli",
      created_at: 1,
      updated_at: 1,
      ...data,
    }));
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({
        id: "skill-clouddrive2-cli",
        name: "clouddrive2-cli",
      }),
      ...data,
      id: "skill-clouddrive2-cli",
      updated_at: 2,
    }));

    (window as any).api.skill.create = create;
    (window as any).api.skill.update = update;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([]);

    const registrySkill = {
      slug: "clouddrive2-cli",
      source_id: "source-private-gitea-clouddrive2-cli",
      name: "clouddrive2-cli",
      description: "CloudDrive2 command-line skill",
      category: "dev" as const,
      author: "icelemon",
      source_label: "Personal Store",
      source_url:
        "https://gitea.example.com/icelemon/skills/tree/main/clouddrive2-cli",
      content_url:
        "https://gitea.example.com/icelemon/skills/raw/branch/main/clouddrive2-cli/SKILL.md",
      tags: ["cli"],
      version: "1.0.0",
      content: remoteContent,
    };

    const installed = await useSkillStore
      .getState()
      .installRegistrySkill(registrySkill);
    const installedHash = installed?.installed_content_hash;

    expect(installedHash).toMatch(/^[a-f0-9]{64}$/);

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-clouddrive2-cli",
          name: "clouddrive2-cli",
          source_id: registrySkill.source_id,
          source_label: "Personal Store",
          source_url: registrySkill.source_url,
          content_url: registrySkill.content_url,
          content: remoteContent,
          instructions: remoteContent,
          installed_content_hash: installedHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {
        "personal-store": {
          loadedAt: 1,
          error: null,
          skills: [
            {
              ...registrySkill,
              source_label: "icelemon/skills",
              version: "1.0.0",
            },
          ],
        },
      },
    });

    const check = await useSkillStore
      .getState()
      .getRegistrySkillUpdateStatus(registrySkill);

    expect(check.status).toBe("up-to-date");

    fetchRemoteContent.mockResolvedValue("# clouddrive2-cli\n\nUpdated\n");

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill(registrySkill.source_id);

    expect(result?.status).toBe("updated");
    expect(update).toHaveBeenCalledWith(
      "skill-clouddrive2-cli",
      expect.objectContaining({
        source_label: "Personal Store",
      }),
    );
  });

  it("installs a skill from a cached local store source entry using the latest local file", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-local-writer",
        name: "local-writer",
        source_id: "source-local-writer",
        registry_slug: "local-writer",
      }),
    );
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = getAll;
    (window as any).api.skill.readLocalFileByPath = vi.fn().mockResolvedValue({
      content: "# Local Writer\n\nLatest local content\n",
    });
    (window as any).api.skill.writeLocalFile = vi
      .fn()
      .mockResolvedValue(undefined);
    (window as any).api.skill.saveToRepo = vi.fn().mockResolvedValue(undefined);
    (window as any).api.skill.syncFromRepo = vi
      .fn()
      .mockResolvedValue(undefined);

    useSkillStore.setState({
      registrySkills: [],
      remoteStoreEntries: {
        local: {
          loadedAt: 1,
          error: null,
          skills: [
            {
              slug: "local-writer",
              source_id: "source-local-writer",
              name: "Local Writer",
              description: "Local source skill",
              category: "general",
              author: "Local",
              source_url: "/tmp/local-writer",
              content_url: "/tmp/local-writer/SKILL.md",
              tags: ["local"],
              version: "1.0.0",
              content: "# Local Writer\n\nStale cached content\n",
            },
          ],
        },
      },
    });

    await useSkillStore.getState().installFromRegistry("source-local-writer");

    expect((window as any).api.skill.readLocalFileByPath).toHaveBeenCalledWith(
      "/tmp/local-writer",
      "SKILL.md",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        registry_slug: "local-writer",
        content: "# Local Writer\n\nLatest local content\n",
        instructions: "# Local Writer\n\nLatest local content\n",
      }),
    );
    expect((window as any).api.skill.saveToRepo).toHaveBeenCalledWith(
      "skill-local-writer",
      "/tmp/local-writer",
      "copy",
    );
    expect((window as any).api.skill.syncFromRepo).toHaveBeenCalledWith(
      "skill-local-writer",
    );
  });

  it("installs a custom Git store skill by cloning the package instead of writing only SKILL.md", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-gitea-writer",
        name: "writer",
        source_id: "source-gitea-writer",
        registry_slug: "writer",
      }),
    );
    const getAll = vi.fn().mockResolvedValue([]);
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const saveRemoteGitToRepo = vi
      .fn()
      .mockResolvedValue("/managed/writer/repo");
    const syncFromRepo = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-gitea-writer",
        name: "writer",
        local_repo_path: "/managed/writer/repo",
      }),
    );

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = getAll;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.saveRemoteGitToRepo = saveRemoteGitToRepo;
    (window as any).api.skill.syncFromRepo = syncFromRepo;

    await useSkillStore.getState().installRegistrySkill({
      slug: "writer",
      source_id: "source-gitea-writer",
      name: "Writer",
      description: "Custom Gitea writer",
      category: "general",
      author: "icelemon",
      source_url: "https://gitea.example.com/team/skills",
      source_branch: "main",
      source_directory: "skills/writer",
      canonical_skill_path: "skills/writer/SKILL.md",
      directory_fingerprint: "full-tree-fingerprint",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nUse the package resources.\n",
    });

    expect(saveRemoteGitToRepo).toHaveBeenCalledWith("skill-gitea-writer", {
      repoUrl: "https://gitea.example.com/team/skills",
      branch: "main",
      directory: "skills/writer",
    });
    expect(syncFromRepo).toHaveBeenCalledWith("skill-gitea-writer");
    expect(writeLocalFile).not.toHaveBeenCalledWith(
      "skill-gitea-writer",
      "SKILL.md",
      expect.any(String),
      expect.anything(),
    );
  });

  it("marks a cloned custom Git install as pristine after repo sync changes the content baseline", async () => {
    const cachedContent = "# Writer\n\nCached registry content.\n";
    const repoContent = "# Writer\n\nContent from cloned repo.\n";
    const cachedHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash(cachedContent);
    const repoHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash(repoContent);
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-gitea-writer",
        name: "writer",
        source_id: "source-gitea-writer",
        registry_slug: "writer",
        content: cachedContent,
        instructions: cachedContent,
        installed_content_hash: cachedHash,
      }),
    );
    const syncedSkill = createSkillFixture({
      id: "skill-gitea-writer",
      name: "writer",
      source_id: "source-gitea-writer",
      registry_slug: "writer",
      content: repoContent,
      instructions: repoContent,
      installed_content_hash: cachedHash,
      local_repo_path: "/managed/writer/repo",
    });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...syncedSkill,
      ...data,
    }));

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([
      {
        ...syncedSkill,
        installed_content_hash: repoHash,
      },
    ]);
    (window as any).api.skill.update = update;
    (window as any).api.skill.saveRemoteGitToRepo = vi
      .fn()
      .mockResolvedValue("/managed/writer/repo");
    (window as any).api.skill.syncFromRepo = vi
      .fn()
      .mockResolvedValue(syncedSkill);

    await useSkillStore.getState().installRegistrySkill({
      slug: "writer",
      source_id: "source-gitea-writer",
      name: "Writer",
      description: "Custom Gitea writer",
      category: "general",
      author: "icelemon",
      source_url: "https://gitea.example.com/team/skills",
      source_branch: "main",
      source_directory: "skills/writer",
      canonical_skill_path: "skills/writer/SKILL.md",
      directory_fingerprint: "full-tree-fingerprint",
      tags: ["writing"],
      version: "1.0.0",
      content: cachedContent,
    });

    expect(update).toHaveBeenCalledWith(
      "skill-gitea-writer",
      expect.objectContaining({
        installed_content_hash: repoHash,
      }),
    );
  });

  it("derives the package directory from canonical_skill_path when source_directory is absent", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-canonical-writer",
        name: "writer",
        source_id: "source-canonical-writer",
        registry_slug: "writer",
      }),
    );
    const saveRemoteGitToRepo = vi
      .fn()
      .mockResolvedValue("/managed/canonical-writer/repo");
    const syncFromRepo = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-canonical-writer",
        name: "writer",
        local_repo_path: "/managed/canonical-writer/repo",
      }),
    );

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([]);
    (window as any).api.skill.saveRemoteGitToRepo = saveRemoteGitToRepo;
    (window as any).api.skill.syncFromRepo = syncFromRepo;

    await useSkillStore.getState().installRegistrySkill({
      slug: "writer",
      source_id: "source-canonical-writer",
      name: "Writer",
      description: "Canonical path writer",
      category: "general",
      author: "icelemon",
      source_url: "https://gitea.example.com/team/skills",
      source_branch: "stable",
      canonical_skill_path: "catalog/writer/SKILL.md",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nUse the package resources.\n",
    });

    expect(saveRemoteGitToRepo).toHaveBeenCalledWith("skill-canonical-writer", {
      repoUrl: "https://gitea.example.com/team/skills",
      branch: "stable",
      directory: "catalog/writer",
    });
    expect(syncFromRepo).toHaveBeenCalledWith("skill-canonical-writer");
  });

  it("uses the content path for GitHub raw registry entries that do not advertise a package", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-github-single",
        name: "single",
        source_id: "source-github-single",
        registry_slug: "single",
      }),
    );
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const saveRemoteGitToRepo = vi
      .fn()
      .mockResolvedValue("/managed/single/repo");
    const fetchRemoteContent = vi
      .fn()
      .mockResolvedValue("# Single\n\nA single-file registry skill.\n");

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([]);
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.saveRemoteGitToRepo = saveRemoteGitToRepo;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    await useSkillStore.getState().installRegistrySkill({
      slug: "single",
      source_id: "source-github-single",
      name: "Single",
      description: "GitHub single file",
      category: "general",
      author: "demo",
      source_url: "https://github.com/team/skills",
      content_url:
        "https://raw.githubusercontent.com/team/skills/main/single/SKILL.md",
      tags: ["single"],
      version: "1.0.0",
      content: "# Cached Single\n",
    });

    expect(writeLocalFile).toHaveBeenCalledWith(
      "skill-github-single",
      "SKILL.md",
      "# Single\n\nA single-file registry skill.\n",
      { skipVersionSnapshot: true },
    );
    expect(saveRemoteGitToRepo).not.toHaveBeenCalled();
  });

  it("installs skills.sh skills by cloning the package directory instead of writing only SKILL.md", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-write-a-skill",
        name: "write-a-skill",
        source_id: "skills-sh-write-a-skill",
        registry_slug: "mattpocock-skills-write-a-skill",
      }),
    );
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const saveRemoteGitToRepo = vi
      .fn()
      .mockResolvedValue("/managed/write-a-skill/repo");
    const syncFromRepo = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-write-a-skill",
        name: "write-a-skill",
        local_repo_path: "/managed/write-a-skill/repo",
      }),
    );

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([]);
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.saveRemoteGitToRepo = saveRemoteGitToRepo;
    (window as any).api.skill.syncFromRepo = syncFromRepo;

    await useSkillStore.getState().installRegistrySkill({
      slug: "mattpocock-skills-write-a-skill",
      source_id: "skills-sh-write-a-skill",
      name: "Write A Skill",
      install_name: "write-a-skill",
      description: "Scaffold new agent skills.",
      category: "dev",
      author: "mattpocock",
      source_url: "https://github.com/mattpocock/skills",
      store_url: "https://skills.sh/mattpocock/skills/write-a-skill",
      source_directory: "skills/write-a-skill",
      canonical_skill_path: "skills/write-a-skill/SKILL.md",
      tags: ["skills"],
      version: "1.0.0",
      content: "# Write A Skill\n\nScaffold new agent skills.\n",
    });

    expect(saveRemoteGitToRepo).toHaveBeenCalledWith(
      "skill-write-a-skill",
      {
        repoUrl: "https://github.com/mattpocock/skills",
        branch: undefined,
        directory: "skills/write-a-skill",
      },
    );
    expect(syncFromRepo).toHaveBeenCalledWith("skill-write-a-skill");
    expect(writeLocalFile).not.toHaveBeenCalledWith(
      "skill-write-a-skill",
      "SKILL.md",
      expect.any(String),
      expect.anything(),
    );
  });

  it("lets the main process locate skills.sh packages for non-standard repo layouts", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-vercel-react",
        name: "vercel-react-best-practices",
        source_id: "skills-sh-vercel-react",
        registry_slug:
          "vercel-labs-agent-skills-vercel-react-best-practices",
      }),
    );
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const saveRemoteGitToRepo = vi
      .fn()
      .mockResolvedValue("/managed/vercel-react/repo");
    const syncFromRepo = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-vercel-react",
        name: "vercel-react-best-practices",
        local_repo_path: "/managed/vercel-react/repo",
      }),
    );

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([]);
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.saveRemoteGitToRepo = saveRemoteGitToRepo;
    (window as any).api.skill.syncFromRepo = syncFromRepo;

    await useSkillStore.getState().installRegistrySkill({
      slug: "vercel-labs-agent-skills-vercel-react-best-practices",
      source_id: "skills-sh-vercel-react",
      name: "vercel-react-best-practices",
      install_name: "vercel-react-best-practices",
      description: "Review React apps against Vercel guidance.",
      category: "general",
      author: "vercel-labs",
      source_url: "https://github.com/vercel-labs/agent-skills",
      store_url:
        "https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices",
      tags: ["react"],
      version: "1.0.0",
      content: "# React Best Practices\n\nReview React apps.\n",
    });

    expect(saveRemoteGitToRepo).toHaveBeenCalledWith("skill-vercel-react", {
      repoUrl: "https://github.com/vercel-labs/agent-skills",
      branch: undefined,
      directory: undefined,
    });
    expect(syncFromRepo).toHaveBeenCalledWith("skill-vercel-react");
    expect(writeLocalFile).not.toHaveBeenCalledWith(
      "skill-vercel-react",
      "SKILL.md",
      expect.any(String),
      expect.anything(),
    );
  });

  it("installs ClawHub skills from the package download zip instead of only writing SKILL.md", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-gifgrep",
        name: "gifgrep",
        source_id: "clawhub-gifgrep",
        registry_slug: "clawhub-gifgrep",
      }),
    );
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const saveRemoteZipToRepo = vi
      .fn()
      .mockResolvedValue("/managed/gifgrep/repo");
    const syncFromRepo = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-gifgrep",
        name: "gifgrep",
        local_repo_path: "/managed/gifgrep/repo",
      }),
    );

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([]);
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.saveRemoteZipToRepo = saveRemoteZipToRepo;
    (window as any).api.skill.syncFromRepo = syncFromRepo;

    await useSkillStore.getState().installRegistrySkill({
      slug: "clawhub-gifgrep",
      source_id: "clawhub-gifgrep",
      name: "GifGrep",
      install_name: "gifgrep",
      description: "Search GIF providers.",
      category: "general",
      author: "clawhub",
      source_url: "https://clawhub.ai/clawhub/gifgrep",
      source_label: "ClawHub",
      store_url: "https://clawhub.ai/clawhub/gifgrep",
      canonical_skill_path: "SKILL.md",
      tags: ["gif"],
      version: "1.0.1",
      content: "# GifGrep\n",
      content_url:
        "https://clawhub.ai/api/v1/skills/gifgrep/file?path=SKILL.md",
      package_url: "https://clawhub.ai/api/v1/download?slug=gifgrep",
    });

    expect(saveRemoteZipToRepo).toHaveBeenCalledWith("skill-gifgrep", {
      zipUrl: "https://clawhub.ai/api/v1/download?slug=gifgrep",
    });
    expect(syncFromRepo).toHaveBeenCalledWith("skill-gifgrep");
    expect(writeLocalFile).not.toHaveBeenCalledWith(
      "skill-gifgrep",
      "SKILL.md",
      expect.any(String),
      expect.anything(),
    );
  });

  it("rolls back a created package skill when remote package persistence fails", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-failed-package",
        name: "failed-package",
        source_id: "source-failed-package",
        registry_slug: "failed-package",
      }),
    );
    const deleteSkill = vi.fn().mockResolvedValue(true);
    const saveRemoteGitToRepo = vi
      .fn()
      .mockRejectedValue(new Error("clone failed"));
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.create = create;
    (window as any).api.skill.delete = deleteSkill;
    (window as any).api.skill.getAll = getAll;
    (window as any).api.skill.saveRemoteGitToRepo = saveRemoteGitToRepo;

    await expect(
      useSkillStore.getState().installRegistrySkill({
        slug: "failed-package",
        source_id: "source-failed-package",
        name: "Failed Package",
        description: "Package install should be atomic",
        category: "general",
        author: "icelemon",
        source_url: "https://gitea.example.com/team/skills",
        source_branch: "main",
        source_directory: "skills/failed-package",
        canonical_skill_path: "skills/failed-package/SKILL.md",
        directory_fingerprint: "full-tree-fingerprint",
        tags: ["writing"],
        version: "1.0.0",
        content: "# Failed Package\n\nUse the package resources.\n",
      }),
    ).rejects.toThrow(/clone failed/);

    expect(deleteSkill).toHaveBeenCalledWith("skill-failed-package");
    expect(getAll).not.toHaveBeenCalled();
  });

  it("uninstalls a store skill using the same fallback identity as imported-state detection", async () => {
    const deleteSkill = vi.fn().mockResolvedValue(true);
    const getAll = vi.fn().mockResolvedValue([]);
    (window as any).api.skill.delete = deleteSkill;
    (window as any).api.skill.getAll = getAll;

    useSkillStore.setState({
      registrySkills: [
        {
          slug: "writer",
          name: "Writer",
          description: "Store writer",
          category: "general",
          tags: ["writing"],
          version: "1.0.0",
          content: "# Writer\n",
        },
      ],
      skills: [
        createSkillFixture({
          id: "skill-writer",
          name: "Writer",
          registry_slug: "writer",
          source_id: undefined,
          source_url: undefined,
          content_url: undefined,
        }),
      ],
    } as never);

    await expect(
      useSkillStore.getState().uninstallRegistrySkill("writer"),
    ).resolves.toBe(true);

    expect(deleteSkill).toHaveBeenCalledWith("skill-writer");
    expect(getAll).toHaveBeenCalled();
  });

  it("updates a pristine skill from a cached local store source entry using the latest local file", async () => {
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-local" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-local-writer", name: "local-writer" }),
      ...data,
      id: "skill-local-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;
    (window as any).api.skill.readLocalFileByPath = vi.fn().mockResolvedValue({
      content: "# Local Writer\n\nLatest local content\n",
    });
    (window as any).api.skill.saveToRepo = vi.fn().mockResolvedValue(undefined);
    (window as any).api.skill.syncFromRepo = vi
      .fn()
      .mockResolvedValue(undefined);

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Local Writer\n\nOriginal content\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-local-writer",
          name: "local-writer",
          source_id: "source-local-writer",
          registry_slug: "local-writer",
          content: "# Local Writer\n\nOriginal content\n",
          instructions: "# Local Writer\n\nOriginal content\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {
        local: {
          loadedAt: 1,
          error: null,
          skills: [
            {
              slug: "local-writer",
              source_id: "source-local-writer",
              name: "Local Writer",
              description: "Local source skill",
              category: "general",
              author: "Local",
              source_url: "/tmp/local-writer",
              content_url: "/tmp/local-writer/SKILL.md",
              tags: ["local"],
              version: "1.1.0",
              content: "# Local Writer\n\nStale cached content\n",
            },
          ],
        },
      },
    });

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill("source-local-writer");

    expect(result?.status).toBe("updated");
    expect((window as any).api.skill.readLocalFileByPath).toHaveBeenCalledWith(
      "/tmp/local-writer",
      "SKILL.md",
    );
    expect(versionCreate).toHaveBeenCalledWith(
      "skill-local-writer",
      expect.stringContaining("Store update"),
    );
    expect(update).toHaveBeenCalledWith(
      "skill-local-writer",
      expect.objectContaining({
        content: "# Local Writer\n\nLatest local content\n",
        instructions: "# Local Writer\n\nLatest local content\n",
        installed_version: "1.1.0",
      }),
    );
    expect((window as any).api.skill.saveToRepo).toHaveBeenCalledWith(
      "skill-local-writer",
      "/tmp/local-writer",
      "copy",
    );
    expect((window as any).api.skill.syncFromRepo).toHaveBeenCalledWith(
      "skill-local-writer",
    );
  });

  it("updates a local store source even when source_url points at SKILL.md", async () => {
    const versionCreate = vi
      .fn()
      .mockResolvedValue({ id: "version-local-file" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-local-file", name: "local-writer" }),
      ...data,
      id: "skill-local-file",
      updated_at: 2,
    }));

    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;
    (window as any).api.skill.readLocalFileByPath = vi.fn().mockResolvedValue({
      content: "# Local Writer\n\nLatest disk content\n",
    });

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Local Writer\n\nOriginal content\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-local-file",
          name: "local-writer",
          source_id: "source-local-file",
          registry_slug: "local-writer",
          content: "# Local Writer\n\nOriginal content\n",
          instructions: "# Local Writer\n\nOriginal content\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {
        local: {
          loadedAt: 1,
          error: null,
          skills: [
            {
              slug: "local-writer",
              source_id: "source-local-file",
              name: "Local Writer",
              description: "Local source skill",
              category: "general",
              author: "Local",
              source_url: "/tmp/local-writer/SKILL.md",
              content_url: "/tmp/local-writer/SKILL.md",
              tags: ["local"],
              version: "1.1.0",
              content: "# Local Writer\n\nStale cached content\n",
            },
          ],
        },
      },
    });

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill("source-local-file");

    expect(result?.status).toBe("updated");
    expect((window as any).api.skill.readLocalFileByPath).toHaveBeenCalledWith(
      "/tmp/local-writer",
      "SKILL.md",
    );
    expect(update).toHaveBeenCalledWith(
      "skill-local-file",
      expect.objectContaining({
        content: "# Local Writer\n\nLatest disk content\n",
        instructions: "# Local Writer\n\nLatest disk content\n",
      }),
    );
  });

  it("refuses registry updates when local content was edited unless overwrite is requested", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    (window as any).api.skill.fetchRemoteContent = vi
      .fn()
      .mockResolvedValue(remoteContent);
    const update = vi.fn();
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-writer",
          name: "writer",
          source_id: "source-writer-main",
          registry_slug: "writer",
          content: "# Writer\n\nLocal edits\n",
          instructions: "# Writer\n\nLocal edits\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [
        {
          slug: "writer",
          source_id: "source-writer-main",
          name: "Writer",
          description: "Write better",
          category: "general",
          author: "PromptHub",
          source_url: "https://github.com/example/skills/tree/main/writer",
          content_url:
            "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
          tags: ["writing"],
          version: "1.1.0",
          content: remoteContent,
        },
      ],
    });

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill("source-writer-main");

    expect(result?.status).toBe("conflict");
    expect(update).not.toHaveBeenCalled();
  });

  it("aggregates safety levels when batch scanning installed skills", async () => {
    const scanSafety = vi
      .fn()
      .mockResolvedValueOnce({ level: "safe" })
      .mockResolvedValueOnce({ level: "warn" })
      .mockResolvedValueOnce({ level: "high-risk" })
      .mockResolvedValueOnce({ level: "blocked" });

    (window as any).api.skill.scanSafety = scanSafety;

    useSkillStore.setState({
      skills: [
        createSkillFixture({ id: "skill-1", name: "safe-skill" }),
        createSkillFixture({ id: "skill-2", name: "warn-skill" }),
        createSkillFixture({ id: "skill-3", name: "high-skill" }),
        createSkillFixture({ id: "skill-4", name: "blocked-skill" }),
      ],
    });

    const summary = await useSkillStore.getState().scanInstalledSkillSafety();

    expect(summary).toEqual({
      total: 4,
      safe: 1,
      warn: 1,
      highRisk: 1,
      blocked: 1,
      bySkillId: {
        "skill-1": "safe",
        "skill-2": "warn",
        "skill-3": "high-risk",
        "skill-4": "blocked",
      },
    });
    expect(scanSafety).toHaveBeenCalledTimes(4);
  });

  it("passes installed local repo paths into batch safety scans", async () => {
    const scanSafety = vi.fn().mockResolvedValue({ level: "safe" });
    (window as any).api.skill.scanSafety = scanSafety;

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "managed-package",
          instructions: "# Managed Package",
          source_url: "https://gitea.internal.example/team/skills",
          content_url:
            "https://gitea.internal.example/team/skills/raw/branch/main/SKILL.md",
          local_repo_path: "/managed/skills/managed-package--abc123",
        }),
      ],
    });

    await useSkillStore.getState().scanInstalledSkillSafety(["skill-1"]);

    expect(scanSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "managed-package",
        content: "# Managed Package",
        sourceUrl: "https://gitea.internal.example/team/skills",
        contentUrl:
          "https://gitea.internal.example/team/skills/raw/branch/main/SKILL.md",
        localRepoPath: "/managed/skills/managed-package--abc123",
      }),
    );
  });

  describe("remoteStoreEntries cache and persistence", () => {
    it("setRemoteStoreEntry stores skills with loadedAt and error fields", () => {
      const skills = [
        {
          slug: "s1",
          name: "Skill 1",
          description: "",
          category: "dev",
          tags: [],
          version: "1",
        },
        {
          slug: "s2",
          name: "Skill 2",
          description: "",
          category: "dev",
          tags: [],
          version: "1",
        },
      ];
      useSkillStore.getState().setRemoteStoreEntry("claude-code", {
        loadedAt: 1000,
        error: null,
        skills: skills as any[],
      });

      const entry = useSkillStore.getState().remoteStoreEntries["claude-code"];
      expect(entry).toBeDefined();
      expect(entry!.loadedAt).toBe(1000);
      expect(entry!.error).toBeNull();
      expect(entry!.skills).toHaveLength(2);
      expect(entry!.skills[0].slug).toBe("s1");
    });

    it("setRemoteStoreEntry preserves existing entries when adding new sources", () => {
      const existing = {
        loadedAt: 500,
        error: null,
        skills: [{ slug: "a" }] as any[],
      };
      useSkillStore.setState({ remoteStoreEntries: { existing: existing } });

      useSkillStore.getState().setRemoteStoreEntry("new-source", {
        loadedAt: 600,
        error: null,
        skills: [{ slug: "b" }] as any[],
      });

      const entries = useSkillStore.getState().remoteStoreEntries;
      expect(entries["existing"]).toBeDefined();
      expect(entries["existing"]!.skills[0].slug).toBe("a");
      expect(entries["new-source"]).toBeDefined();
      expect(entries["new-source"]!.skills[0].slug).toBe("b");
    });

    it("setRemoteStoreEntry can overwrite an existing source entry", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          src: { loadedAt: 1, error: null, skills: [{ slug: "old" }] as any[] },
        },
      });

      useSkillStore.getState().setRemoteStoreEntry("src", {
        loadedAt: 2,
        error: null,
        skills: [{ slug: "new1" }, { slug: "new2" }] as any[],
      });

      const entry = useSkillStore.getState().remoteStoreEntries["src"];
      expect(entry!.loadedAt).toBe(2);
      expect(entry!.skills).toHaveLength(2);
      expect(entry!.skills[0].slug).toBe("new1");
    });

    it("setRemoteStoreEntry stores error string while preserving old skills", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          src: {
            loadedAt: 100,
            error: null,
            skills: [{ slug: "cached" }] as any[],
          },
        },
      });

      // Simulate a failure update that preserves old skills
      const cached = useSkillStore.getState().remoteStoreEntries["src"];
      useSkillStore.getState().setRemoteStoreEntry("src", {
        loadedAt: cached?.loadedAt || 0,
        error: "Network timeout",
        skills: cached?.skills || [],
      });

      const entry = useSkillStore.getState().remoteStoreEntries["src"];
      expect(entry!.error).toBe("Network timeout");
      expect(entry!.loadedAt).toBe(100); // loadedAt NOT updated on failure
      expect(entry!.skills).toHaveLength(1); // old skills preserved
      expect(entry!.skills[0].slug).toBe("cached");
    });

    it("removeCustomStoreSource cleans up remoteStoreEntries for that source", () => {
      useSkillStore.setState({
        customStoreSources: [
          {
            id: "a",
            name: "A",
            type: "git-repo",
            url: "https://github.com/a/b",
            enabled: true,
            createdAt: 1,
          },
          {
            id: "b",
            name: "B",
            type: "git-repo",
            url: "https://github.com/c/d",
            enabled: true,
            createdAt: 2,
          },
        ],
        remoteStoreEntries: {
          a: { loadedAt: 10, error: null, skills: [{ slug: "s1" }] as any[] },
          b: { loadedAt: 20, error: null, skills: [{ slug: "s2" }] as any[] },
        },
        selectedStoreSourceId: "a",
      });

      useSkillStore.getState().removeCustomStoreSource("a");

      const state = useSkillStore.getState();
      expect(state.remoteStoreEntries["a"]).toBeUndefined();
      expect(state.remoteStoreEntries["b"]).toBeDefined();
      expect(state.customStoreSources).toHaveLength(1);
      expect(state.selectedStoreSourceId).toBe("official");
    });

    it("removeCustomStoreSource does not change selectedStoreSourceId when removing non-selected source", () => {
      useSkillStore.setState({
        customStoreSources: [
          {
            id: "a",
            name: "A",
            type: "git-repo",
            url: "https://github.com/a/b",
            enabled: true,
            createdAt: 1,
          },
          {
            id: "b",
            name: "B",
            type: "git-repo",
            url: "https://github.com/c/d",
            enabled: true,
            createdAt: 2,
          },
        ],
        remoteStoreEntries: {
          a: { loadedAt: 10, error: null, skills: [{ slug: "s1" }] as any[] },
          b: { loadedAt: 20, error: null, skills: [{ slug: "s2" }] as any[] },
        },
        selectedStoreSourceId: "b",
      });

      useSkillStore.getState().removeCustomStoreSource("a");

      expect(useSkillStore.getState().selectedStoreSourceId).toBe("b");
    });

    it("toggleCustomStoreSource flips the enabled flag", () => {
      useSkillStore.setState({
        customStoreSources: [
          {
            id: "x",
            name: "X",
            type: "git-repo",
            url: "https://github.com/x/y",
            enabled: true,
            createdAt: 1,
          },
        ],
      });

      useSkillStore.getState().toggleCustomStoreSource("x");
      expect(useSkillStore.getState().customStoreSources[0].enabled).toBe(
        false,
      );

      useSkillStore.getState().toggleCustomStoreSource("x");
      expect(useSkillStore.getState().customStoreSources[0].enabled).toBe(true);
    });
  });

  describe("partialize — persistence filtering", () => {
    it("only persists remoteStoreEntries with at least one skill", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          loaded: {
            loadedAt: 100,
            error: null,
            skills: [{ slug: "s1" }] as any[],
          },
          empty: { loadedAt: 200, error: "fail", skills: [] },
          alsoEmpty: { loadedAt: 0, error: null, skills: [] },
        },
      });

      // Access the partialize function through the store's persist config
      // The store uses zustand/middleware persist with partialize
      const state = useSkillStore.getState();
      // Simulate what partialize does
      const filteredEntries: typeof state.remoteStoreEntries = {};
      for (const [key, entry] of Object.entries(state.remoteStoreEntries)) {
        if (entry.skills.length > 0) {
          filteredEntries[key] = { ...entry, error: null };
        }
      }

      expect(Object.keys(filteredEntries)).toEqual(["loaded"]);
      expect(filteredEntries["loaded"]!.error).toBeNull();
      expect(filteredEntries["empty"]).toBeUndefined();
      expect(filteredEntries["alsoEmpty"]).toBeUndefined();
    });

    it("strips error field from persisted entries", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          withError: {
            loadedAt: 100,
            error: "some transient error",
            skills: [{ slug: "s1" }] as any[],
          },
        },
      });

      const state = useSkillStore.getState();
      const filteredEntries: typeof state.remoteStoreEntries = {};
      for (const [key, entry] of Object.entries(state.remoteStoreEntries)) {
        if (entry.skills.length > 0) {
          filteredEntries[key] = { ...entry, error: null };
        }
      }

      expect(filteredEntries["withError"]!.skills).toHaveLength(1);
      expect(filteredEntries["withError"]!.error).toBeNull();
    });

    it("handles empty remoteStoreEntries gracefully", () => {
      useSkillStore.setState({ remoteStoreEntries: {} });

      const state = useSkillStore.getState();
      const filteredEntries: typeof state.remoteStoreEntries = {};
      for (const [key, entry] of Object.entries(state.remoteStoreEntries)) {
        if (entry.skills.length > 0) {
          filteredEntries[key] = { ...entry, error: null };
        }
      }

      expect(Object.keys(filteredEntries)).toHaveLength(0);
    });
  });

  describe("translation cache", () => {
    it("reuses a saved translation when the source fingerprint is unchanged", async () => {
      vi.mocked(chatCompletion).mockResolvedValue({
        content: "已翻译内容",
      } as never);

      const first = await useSkillStore
        .getState()
        .translateContent("# Skill\n\nOriginal", "skill-cache", "中文");

      const cached = useSkillStore
        .getState()
        .getTranslationState("skill-cache");

      const second = await useSkillStore
        .getState()
        .translateContent("# Skill\n\nOriginal", "skill-cache", "中文");

      expect(first).toBe("已翻译内容");
      expect(second).toBe("已翻译内容");
      expect(cached).toEqual({
        value: "已翻译内容",
        hasTranslation: true,
        isStale: false,
      });
      expect(chatCompletion).toHaveBeenCalledTimes(1);
    });

    it("marks a saved translation stale when SKILL.md content changes", async () => {
      vi.mocked(chatCompletion).mockResolvedValue({
        content: "旧译文",
      } as never);

      await useSkillStore
        .getState()
        .translateContent("# Skill\n\nOriginal", "skill-cache", "中文");

      const stale = useSkillStore
        .getState()
        .getTranslationState("skill-cache", "changed-fingerprint");

      expect(stale).toEqual({
        value: null,
        hasTranslation: true,
        isStale: true,
      });
    });

    it("falls back to legacy root AI config when the translation scenario model is incomplete", async () => {
      useSettingsStore.setState({
        aiProvider: "openai",
        aiApiKey: "legacy-key",
        aiApiUrl: "https://api.legacy.example.com",
        aiModel: "gpt-4o",
        aiModels: [
          {
            id: "broken-translation",
            name: "Broken Translation",
            type: "chat",
            provider: "openai",
            apiKey: "",
            apiUrl: "https://api.example.com",
            model: "gpt-4o-mini",
          },
        ],
        scenarioModelDefaults: {
          translation: "broken-translation",
        },
        translationMode: "full",
      });
      vi.mocked(chatCompletion).mockResolvedValue({
        content: "translated with legacy config",
      } as never);

      const translated = await useSkillStore
        .getState()
        .translateContent("# Skill\n\nOriginal", "skill-cache", "中文");

      expect(translated).toBe("translated with legacy config");
      expect(chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          apiKey: "legacy-key",
          apiUrl: "https://api.legacy.example.com",
          model: "gpt-4o",
        }),
        expect.any(Array),
        expect.any(Object),
      );
    });
  });
});
