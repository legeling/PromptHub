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

function mockCompletedPackageOperation(
  skill: ReturnType<typeof createSkillFixture>,
) {
  const runPackageOperation = vi.fn().mockResolvedValue({
    status: "completed",
    operation: "install",
    skill,
  });
  (window as any).api.skill.runPackageOperation = runPackageOperation;
  return runPackageOperation;
}

function mockRemoteGitSnapshot(
  content: string,
  directoryFingerprint = "0".repeat(64),
) {
  const getRemoteGitPackageSnapshot = vi.fn().mockResolvedValue({
    content,
    directoryFingerprint,
  });
  (window as any).api.skill.getRemoteGitPackageSnapshot =
    getRemoteGitPackageSnapshot;
  return getRemoteGitPackageSnapshot;
}

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

  it("prefers install_name over registry slug when importing a registry skill", async () => {
    const installed = createSkillFixture({
      id: "skill-2",
      name: "find-skills",
      registry_slug: "vercel-labs-skills-find-skills",
    });
    const runPackageOperation = mockCompletedPackageOperation(installed);
    const getAll = vi.fn().mockResolvedValue([]);

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

    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "install",
        registrySkill: expect.objectContaining({
          install_name: "find-skills",
          slug: "vercel-labs-skills-find-skills",
        }),
      }),
    );
  });

  it("blocks installing official registry skills when only placeholder frontmatter is available", async () => {
    const create = vi.fn();
    const getRemoteGitPackageSnapshot = vi
      .fn()
      .mockRejectedValue(new Error("network down"));

    (window as any).api.skill.create = create;
    (window as any).api.skill.getRemoteGitPackageSnapshot =
      getRemoteGitPackageSnapshot;

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
    const installedHash = "a".repeat(64);
    const runPackageOperation = mockCompletedPackageOperation(
      createSkillFixture({
        id: "skill-writer",
        name: "writer",
        source_id: "source-writer-main",
        installed_content_hash: installedHash,
        installed_directory_fingerprint: installedHash,
        fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        installed_version: "1.0.0",
        source_binding_state: "bound",
      }),
    );
    const fetchRemoteContent = vi
      .fn()
      .mockResolvedValue("# Writer\n\nOriginal\n");
    const getRemoteGitPackageSnapshot = mockRemoteGitSnapshot(
      "# Writer\n\nOriginal\n",
      installedHash,
    );
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.getAll = getAll;

    const result = await useSkillStore.getState().installRegistrySkill({
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

    expect(result?.status).toBe("installed");
    const installed = result?.status === "installed" ? result.skill : null;
    expect(installed?.installed_content_hash).toBe(installedHash);
    expect(installed?.installed_version).toBe("1.0.0");
    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "install",
        content: "# Writer\n\nOriginal\n",
      }),
    );
    expect(getRemoteGitPackageSnapshot).toHaveBeenCalledWith({
      repoUrl: "https://github.com/example/skills",
      branch: "main",
      directory: "writer",
    });
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("uses the content hash as the baseline for raw content-url installs", async () => {
    const installedHash = "b".repeat(64);
    const runPackageOperation = mockCompletedPackageOperation(
      createSkillFixture({
        id: "skill-raw-url",
        name: "raw-url-skill",
        installed_content_hash: installedHash,
        installed_directory_fingerprint: installedHash,
        directory_fingerprint: installedHash,
        fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      }),
    );
    const fetchRemoteContent = vi
      .fn()
      .mockResolvedValue("# Raw URL Skill\n\nCurrent\n");
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.getAll = getAll;

    const result = await useSkillStore.getState().installRegistrySkill({
      slug: "raw-url-skill",
      source_id: "source-raw-url-skill",
      name: "Raw URL Skill",
      description: "Raw URL source",
      category: "general",
      author: "PromptHub",
      source_url: "",
      content_url: "https://example.com/skills/raw-url/SKILL.md",
      directory_fingerprint: "stale-tree-fingerprint",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Raw URL Skill\n",
    });

    expect(result?.status).toBe("installed");
    const installed = result?.status === "installed" ? result.skill : null;
    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: "content",
          sourceUrl: "https://example.com/skills/raw-url/SKILL.md",
          content: "# Raw URL Skill\n\nCurrent\n",
        },
      }),
    );
    expect(installed?.installed_content_hash).toBe(installedHash);
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
    const runPackageOperation = mockCompletedPackageOperation(
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
    const getRemoteGitPackageSnapshot = mockRemoteGitSnapshot(
      "# Binary Skill\n\nHello\n",
    );

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

    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: "remote-git",
          repoUrl: "https://github.com/example/skills",
          branch: "main",
          directory: "skills/binary-skill",
        },
      }),
    );
    expect(getRemoteGitPackageSnapshot).toHaveBeenCalled();
    expect(fetchRemoteContent).not.toHaveBeenCalled();
    expect(fetchRemoteContentBytes).not.toHaveBeenCalled();
    expect(writeLocalFile).not.toHaveBeenCalled();
    expect(writeLocalFileBufferByPath).not.toHaveBeenCalled();
  });

  it("syncs root GitHub skill packages instead of writing only SKILL.md", async () => {
    const runPackageOperation = mockCompletedPackageOperation(
      createSkillFixture({
        id: "skill-html-ppt",
        name: "html-ppt",
        registry_slug: "html-ppt",
      }),
    );
    const getAll = vi.fn().mockResolvedValue([]);
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        return JSON.stringify({
          tree: [
            { path: "SKILL.md", type: "blob" },
            { path: "assets/runtime.js", type: "blob" },
            { path: "references/themes.md", type: "blob" },
            { path: "scripts/render.sh", type: "blob" },
            { path: ".github/workflows/ci.yml", type: "blob" },
          ],
        });
      }

      return "# HTML PPT\n\nCreate decks.\n";
    });
    const fetchRemoteContentBytes = vi
      .fn()
      .mockResolvedValueOnce(Uint8Array.from([1, 2, 3]))
      .mockResolvedValueOnce(Uint8Array.from([4, 5, 6]))
      .mockResolvedValueOnce(Uint8Array.from([7, 8, 9]))
      .mockResolvedValueOnce(Uint8Array.from([10, 11, 12]));
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const writeLocalFileBufferByPath = vi.fn().mockResolvedValue(undefined);
    const getRepoPath = vi.fn().mockResolvedValue("/tmp/managed/html-ppt");
    const getRemoteGitPackageSnapshot = mockRemoteGitSnapshot(
      "# HTML PPT\n\nCreate decks.\n",
    );

    (window as any).api.skill.getAll = getAll;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.fetchRemoteContentBytes = fetchRemoteContentBytes;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.writeLocalFileBufferByPath =
      writeLocalFileBufferByPath;
    (window as any).api.skill.getRepoPath = getRepoPath;

    await useSkillStore.getState().installRegistrySkill({
      slug: "html-ppt",
      name: "HTML PPT",
      description: "Has root package assets",
      category: "general",
      author: "lewislulu",
      source_url: "https://github.com/lewislulu/html-ppt-skill/tree/main",
      content_url:
        "https://raw.githubusercontent.com/lewislulu/html-ppt-skill/main/SKILL.md",
      tags: ["ppt"],
      version: "1.0.0",
      content: "# HTML PPT\n\nCached\n",
    });

    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: "remote-git",
          repoUrl: "https://github.com/lewislulu/html-ppt-skill",
          branch: "main",
          directory: undefined,
          skillName: "HTML PPT",
        },
      }),
    );
    expect(getRemoteGitPackageSnapshot).toHaveBeenCalled();
    expect(fetchRemoteContent).not.toHaveBeenCalled();
    expect(fetchRemoteContentBytes).not.toHaveBeenCalled();
    expect(writeLocalFile).not.toHaveBeenCalled();
    expect(writeLocalFileBufferByPath).not.toHaveBeenCalled();
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
    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");
    const remoteHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash(remoteContent);
    mockRemoteGitSnapshot(remoteContent, remoteHash);

    const updatedSkill = createSkillFixture({
      id: "skill-writer",
      name: "writer",
      source_id: "source-writer-main",
      content: remoteContent,
      instructions: remoteContent,
      version: "1.1.0",
      installed_content_hash: remoteHash,
      installed_directory_fingerprint: remoteHash,
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      installed_version: "1.1.0",
      source_binding_state: "bound",
    });
    const runPackageOperation = vi.fn().mockResolvedValue({
      status: "completed",
      operation: "update",
      skill: updatedSkill,
    });

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;
    (window as any).api.skill.runPackageOperation = runPackageOperation;

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
    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update",
        skillId: "skill-writer",
        content: remoteContent,
        note: expect.stringContaining("Store update"),
      }),
    );
    expect(versionCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes stale store update baselines when installed content is already current", async () => {
    const remoteContent = "# Writer\n\nAlready current\n";
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-writer", name: "writer" }),
      content: remoteContent,
      instructions: remoteContent,
      ...data,
      id: "skill-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.update = update;

    const staleHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOlder baseline\n");
    const currentHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash(remoteContent);
    mockRemoteGitSnapshot(remoteContent, currentHash);
    const registrySkill: RegistrySkill = {
      slug: "writer",
      source_id: "source-writer-main",
      name: "Writer",
      description: "Write better",
      category: "general" as const,
      author: "PromptHub",
      source_url: "https://github.com/example/skills/tree/main/writer",
      content_url:
        "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
      tags: ["writing"],
      version: "0.5.9-beta.1",
      content: remoteContent,
    };

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-writer",
          name: "writer",
          source_id: "source-writer-main",
          registry_slug: "writer",
          content: remoteContent,
          instructions: remoteContent,
          installed_content_hash: staleHash,
          installed_version: "0.5.9-beta1",
        }),
      ],
      registrySkills: [registrySkill],
    });

    const result = await useSkillStore
      .getState()
      .getRegistrySkillUpdateStatus(registrySkill);

    expect(result.status).toBe("up-to-date");
    expect(update).toHaveBeenCalledWith(
      "skill-writer",
      expect.objectContaining({
        installed_content_hash: currentHash,
        installed_directory_fingerprint: currentHash,
        fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        installed_version: "0.5.9-beta.1",
        source_binding_state: "bound",
        source_last_checked_at: expect.any(Number),
        source_last_error: null,
      }),
    );
  });

  it("checks updates for a GitHub-imported skill without a cached store entry", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    const remoteHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash(remoteContent);
    const getRemoteGitPackageSnapshot = mockRemoteGitSnapshot(
      remoteContent,
      remoteHash,
    );

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
    expect(getRemoteGitPackageSnapshot).toHaveBeenCalledWith({
      repoUrl: "https://github.com/example/skills",
      branch: "main",
      directory: "writer",
    });
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("checks raw content-url sources as single-file packages instead of trusting stale registry package fingerprints", async () => {
    const remoteContent = "# Raw URL Skill\n\nCurrent\n";
    const contentHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash(remoteContent);
    const contentUrl = "https://example.com/skills/raw-url/SKILL.md";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    const registrySkill: RegistrySkill = {
      slug: "raw-url-skill",
      name: "Raw URL Skill",
      install_name: "raw-url-skill",
      source_id: "source-raw-url-skill",
      source_url: "",
      content_url: contentUrl,
      directory_fingerprint: "stale-registry-package-fingerprint",
      description: "Raw URL source",
      category: "general",
      author: "Example",
      version: "1.0.0",
      content: "# Raw URL Skill\n\nCached\n",
      tags: ["general"],
    };

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-raw-url",
          name: "raw-url-skill",
          source_id: "source-raw-url-skill",
          content_url: contentUrl,
          content: remoteContent,
          instructions: remoteContent,
          installed_content_hash: contentHash,
          directory_fingerprint: contentHash,
          installed_directory_fingerprint: contentHash,
          fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        }),
      ],
      registrySkills: [registrySkill],
    });

    const check = await useSkillStore
      .getState()
      .getRegistrySkillUpdateStatus(registrySkill);

    expect(check.status).toBe("up-to-date");
    expect(check.remoteDirectoryFingerprint).toBe(contentHash);
    expect(check.remote?.directoryFingerprint).toBe(contentHash);
    expect(fetchRemoteContent).toHaveBeenCalledWith(contentUrl);
  });
});
