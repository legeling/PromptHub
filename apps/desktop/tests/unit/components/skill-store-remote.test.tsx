import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

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
    storeView: "store",
    registrySkills: [],
    isLoadingRegistry: false,
    storeCategory: "all",
    storeSearchQuery: "",
    selectedRegistrySlug: null,
    customStoreSources: [],
    selectedStoreSourceId: "claude-code",
    remoteStoreEntries: {},
    translationCache: {},
  });
};

describe("SkillStore remote loading", () => {
  beforeEach(() => {
    showToast.mockReset();
    localStorage.clear();
    resetSkillStore();
    useSettingsStore.setState({
      device: {
        storeAutoSync: false,
        storeSyncCadence: "1d",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("does not retry indefinitely after a remote fetch failure", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(
        new Error("Access to internal network addresses is not allowed"),
      );

    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: {
              storeAutoSync: false,
              storeSyncCadence: "1d",
            },
          }),
        },
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["claude-code"]?.error,
      ).toContain(
        "Failed to reach GitHub. Check your network connection or switch to another network and retry.",
      );
    });

    await waitFor(() => {
      const claudeCodeRepoRequests = fetchRemoteContent.mock.calls.filter(
        ([url]) =>
          url === "https://api.github.com/repos/anthropics/skills",
      );
      expect(claudeCodeRepoRequests).toHaveLength(1);
    });
  });

  it("shows retry and network guidance for GitHub rate-limit failures", async () => {
    const fetchRemoteContent = vi.fn().mockRejectedValue(
      new Error(
        "GitHub API rate limit reached. Try again in a few minutes, or switch to another network and retry.",
      ),
    );

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    const { getByText, queryByText } = await renderWithI18n(<SkillStore />, {
      language: "en",
    });

    await waitFor(() => {
      expect(
        getByText("Failed to load remote store"),
      ).toBeInTheDocument();
      expect(
        getByText(
          "GitHub API rate limit reached. Try again in a few minutes, or switch to another network and retry.",
        ),
      ).toBeInTheDocument();
    });

    expect(queryByText(/GitHub token in settings/i)).not.toBeInTheDocument();
  });

  it("shows network guidance when GitHub cannot be reached", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("Remote content request timed out"));

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    const { getByText } = await renderWithI18n(<SkillStore />, {
      language: "zh",
    });

    await waitFor(() => {
      expect(getByText("拉取远程商店失败")).toBeInTheDocument();
      expect(
        getByText("无法连接到 GitHub，请检查当前网络，或切换网络后再试。"),
      ).toBeInTheDocument();
    });
  });

  it("shows invalid repository guidance when the GitHub repo is missing", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("HTTP 404 fetching remote content"));

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    const { getByText } = await renderWithI18n(<SkillStore />, {
      language: "zh",
    });

    await waitFor(() => {
      expect(getByText("拉取远程商店失败")).toBeInTheDocument();
      expect(
        getByText("仓库不存在，或仓库地址无效，请检查 GitHub 仓库地址后重试。"),
      ).toBeInTheDocument();
    });
  });

  it("does not auto-sync unrelated remote stores on initial open", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "anthropics" } });
      }

      if (url === "https://api.github.com/repos/openai/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "openai" } });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
            tree: [{ path: "demo-skill/SKILL.md", type: "blob" }],
          });
      }

      if (
        url ===
        "https://api.github.com/repos/openai/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "skills/.curated/openai-skill/SKILL.md", type: "blob" }],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/demo-skill/SKILL.md"
      ) {
        return [
          "---",
          "name: demo-skill",
          "description: Demo skill",
          "tags: [demo]",
          "---",
          "",
          "# Demo",
        ].join("\n");
      }

      if (
        url ===
        "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-skill/SKILL.md"
      ) {
        return [
          "---",
          "name: openai-skill",
          "description: OpenAI demo skill",
          "tags: [openai]",
          "---",
          "",
          "# OpenAI Demo",
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: {
              storeAutoSync: true,
              storeSyncCadence: "manual",
            },
          }),
        },
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["claude-code"]?.skills,
      ).toHaveLength(1);
    });

    const claudeCodeRepoRequests = fetchRemoteContent.mock.calls.filter(
      ([url]) => url === "https://api.github.com/repos/anthropics/skills",
    );
    expect(claudeCodeRepoRequests).toHaveLength(1);

    const communityRequests = fetchRemoteContent.mock.calls.filter(
      ([url]) => url === "https://skills.sh",
    );
    expect(communityRequests).toHaveLength(0);

    const openAiRepoRequests = fetchRemoteContent.mock.calls.filter(
      ([url]) => url === "https://api.github.com/repos/openai/skills",
    );
    expect(openAiRepoRequests).toHaveLength(0);
  });

  it("does not preload all remote stores when auto sync is disabled", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "anthropics" } });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "demo-skill/SKILL.md", type: "blob" }],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/demo-skill/SKILL.md"
      ) {
        return [
          "---",
          "name: demo-skill",
          "description: Demo skill",
          "tags: [demo]",
          "---",
          "",
          "# Demo",
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: {
              storeAutoSync: false,
              storeSyncCadence: "1d",
            },
          }),
        },
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["claude-code"]?.skills,
      ).toHaveLength(1);
    });

    const communityRequests = fetchRemoteContent.mock.calls.filter(
      ([url]) => url === "https://skills.sh",
    );
    expect(communityRequests).toHaveLength(0);

    const openAiRepoRequests = fetchRemoteContent.mock.calls.filter(
      ([url]) => url === "https://api.github.com/repos/openai/skills",
    );
    expect(openAiRepoRequests).toHaveLength(0);
  });

  it("loads the built-in OpenAI Codex store from the curated subdirectory", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/openai/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "openai" } });
      }

      if (
        url ===
        "https://api.github.com/repos/openai/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "skills/.curated/openai-skill/SKILL.md", type: "blob" }],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-skill/SKILL.md"
      ) {
        return [
          "---",
          "name: openai-skill",
          "description: OpenAI demo skill",
          "tags: [openai]",
          "---",
          "",
          "# OpenAI Demo",
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: {
              storeAutoSync: false,
              storeSyncCadence: "manual",
            },
          }),
        },
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      selectedStoreSourceId: "openai-codex",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["openai-codex"]?.skills,
      ).toHaveLength(1);
    });

    expect(
      useSkillStore.getState().remoteStoreEntries["openai-codex"]?.skills[0],
    ).toEqual(
      expect.objectContaining({
        source_url: "https://github.com/openai/skills/tree/main/skills/.curated/openai-skill",
        content_url:
          "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-skill/SKILL.md",
      }),
    );
  });

  it("falls back to repository root README when no SKILL.md exists", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/demo/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "demo" } });
      }

      if (
        url ===
        "https://api.github.com/repos/demo/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "README.md", type: "blob" }],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/demo/skills/main/README.md"
      ) {
        return "# Demo skills\n\n![cover](./images/demo.png)";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      customStoreSources: [
        {
          id: "demo-repo",
          name: "Demo Repo",
          type: "git-repo",
          url: "https://github.com/demo/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "demo-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["demo-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(
      useSkillStore.getState().remoteStoreEntries["demo-repo"]?.skills[0],
    ).toEqual(
      expect.objectContaining({
        source_url: "https://github.com/demo/skills/tree/main",
        content_url: "https://raw.githubusercontent.com/demo/skills/main/README.md",
      }),
    );
  });

  it("loads git-repo sources from an explicit branch and directory", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/demo/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "demo" } });
      }

      if (
        url ===
        "https://api.github.com/repos/demo/skills/git/trees/release?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "skills/.curated/release-skill/SKILL.md", type: "blob" }],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/demo/skills/release/skills/.curated/release-skill/SKILL.md"
      ) {
        return "---\nname: release-skill\ndescription: Release skill\n---\n\n# Release";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      customStoreSources: [
        {
          id: "release-repo",
          name: "Release Repo",
          type: "git-repo",
          url: "https://github.com/demo/skills",
          branch: "release",
          directory: "skills/.curated",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "release-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["release-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(
      useSkillStore.getState().remoteStoreEntries["release-repo"]?.skills[0],
    ).toEqual(
      expect.objectContaining({
        source_url:
          "https://github.com/demo/skills/tree/release/skills/.curated/release-skill",
        content_url:
          "https://raw.githubusercontent.com/demo/skills/release/skills/.curated/release-skill/SKILL.md",
      }),
    );
  });

  it("shows same-name variants from different source ids in the same store", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      selectedStoreSourceId: "same-name-source",
      registrySkills: [],
      remoteStoreEntries: {
        "same-name-source": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "writer",
              name: "Writer",
              install_name: "writer",
              source_id: "writer-main",
              source_branch: "main",
              description: "Stable writer",
              category: "general",
              author: "PromptHub",
              source_url: "https://github.com/example/skills/tree/main/writer",
              tags: ["writing"],
              version: "1.0.0",
              content: "# Writer\n\nMain\n",
            },
            {
              slug: "writer",
              name: "Writer",
              install_name: "writer",
              source_id: "writer-dev",
              source_branch: "dev",
              description: "Dev writer",
              category: "general",
              author: "PromptHub",
              source_url: "https://github.com/example/skills/tree/dev/writer",
              tags: ["writing"],
              version: "1.1.0-beta",
              content: "# Writer\n\nDev\n",
            },
          ],
        },
      },
      customStoreSources: [
        {
          id: "same-name-source",
          name: "Same Name Source",
          type: "marketplace-json",
          url: "https://example.com/same-name-store.json",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Writer")).toHaveLength(2);
    });
  });

  it("loads git-repo store sources through SSH scan when given git@github.com URLs", async () => {
    const fetchRemoteContent = vi.fn();
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "superpowers",
        name: "superpowers",
        install_name: "superpowers",
        source_id: "source-superpowers-ssh",
        description: "SSH scanned store skill",
        category: "dev",
        author: "obra",
        source_url: "/tmp/ssh-store/superpowers",
        content_url: "/tmp/ssh-store/superpowers",
        tags: ["dev"],
        version: "1.0.0",
        content: "# superpowers",
        compatibility: ["claude", "cursor"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      customStoreSources: [
        {
          id: "ssh-repo",
          name: "SSH Repo",
          type: "git-repo",
          url: "git@github.com:obra/superpowers.git",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "ssh-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["ssh-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(scanRemoteGithub).toHaveBeenCalledWith(
      "git@github.com:obra/superpowers.git",
      expect.any(Array),
      undefined,
      undefined,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("loads self-hosted HTTPS git-repo store sources through clone-based scan", async () => {
    const fetchRemoteContent = vi.fn();
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "icelemon-skill",
        name: "icelemon-skill",
        install_name: "icelemon-skill",
        source_id: "source-icelemon-gitea",
        description: "Gitea scanned store skill",
        category: "dev",
        author: "icelemon",
        source_url: "/tmp/gitea-store/icelemon-skill",
        content_url: "/tmp/gitea-store/icelemon-skill",
        tags: ["dev"],
        version: "1.0.0",
        content: "# icelemon",
        compatibility: ["claude", "cursor"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      customStoreSources: [
        {
          id: "gitea-repo",
          name: "Gitea Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["gitea-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(scanRemoteGithub).toHaveBeenCalledWith(
      "https://gitea.example.com/icelemon/skills",
      expect.any(Array),
      undefined,
      undefined,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("binds the catalog search box to storeSearchQuery", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn().mockResolvedValue("{}"),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      selectedStoreSourceId: "official",
      registrySkills: [
        {
          slug: "pdf-skill",
          source_id: "source-pdf-skill",
          name: "PDF Skill",
          description: "Use this whenever you work with PDFs",
          category: "office",
          author: "PromptHub",
          source_url: "https://example.com/pdf-skill",
          tags: ["pdf"],
          version: "1.0.0",
          content: "# PDF Skill",
        },
        {
          slug: "canvas-design",
          source_id: "source-canvas-design",
          name: "Canvas Design",
          description: "Create beautiful visual layouts",
          category: "design",
          author: "PromptHub",
          source_url: "https://example.com/canvas-design",
          tags: ["design"],
          version: "1.0.0",
          content: "# Canvas Design",
        },
      ],
      storeSearchQuery: "pdf",
      storeCategory: "all",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(screen.queryByPlaceholderText("Search skills...")).not.toBeInTheDocument();
    expect(useSkillStore.getState().storeSearchQuery).toBe("pdf");
  });

  it("requires explicit confirmation before installing a high-risk skill", async () => {
    const installFromRegistry = vi.fn().mockResolvedValue({
      id: "installed",
      name: "PDF",
    });
    const installRegistrySkill = vi.fn().mockResolvedValue({
      id: "installed",
      name: "PDF",
    });

    useSkillStore.setState({
      installFromRegistry,
      installRegistrySkill,
      skills: [],
    } as never);

    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: true,
      aiModels: [],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    installWindowMocks({
      api: {
        skill: {
          scanSafety: vi.fn().mockResolvedValue({
            level: "high-risk",
            summary: "static false positive",
            findings: [
              {
                code: "system-persistence",
                severity: "high",
                title: "Touches persistence or system service mechanisms",
                detail: "false positive",
              },
            ],
            recommendedAction: "review",
            scannedAt: Date.now(),
            checkedFileCount: 2,
            scanMethod: "ai",
          }),
        },
      },
    });

    const skill = {
      slug: "pdf",
      name: "PDF",
      description: "PDF helper",
      category: "office",
      tags: ["pdf"],
      version: "1.0.0",
      content: "# PDF",
      compatibility: ["claude"],
    } as never;

    const { getByText } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      getByText("Import to My Skills").click();
    });

    expect(installRegistrySkill).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText("High-Risk Skill Detected")).toBeInTheDocument();
      expect(screen.getByText("static false positive")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add Anyway" }));
    });

    expect(installRegistrySkill).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "pdf" }),
    );
  });

  it("defaults to saved translation in store detail and toggles back to original", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: "---\ndescription: Translated store content\n---\n\nTranslated store content",
        hasTranslation: true,
        isStale: false,
      }),
    } as never);

    const skill = {
      slug: "writer",
      name: "Writer",
      description: "Original description",
      category: "general",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nOriginal content",
      compatibility: ["claude"],
    } as never;

    const { getByRole, getByText } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.getAllByText("Translated store content")).toHaveLength(2);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Show Original" }));
    });

    expect(getByText("Original content")).toBeInTheDocument();
  });

  it("prefers local source content over installed stale content in store detail", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      skills: [
        {
          id: "installed-local-writer",
          name: "local-writer",
          registry_slug: "local-writer",
          description: "Installed stale skill",
          instructions: "# Local Writer\n\nInstalled stale content",
          content: "# Local Writer\n\nInstalled stale content",
          protocol_type: "skill",
          author: "Local",
          local_repo_path: "/tmp/local-writer",
          tags: ["local"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as never);

    const skill = {
      slug: "local-writer",
      name: "local-writer",
      description: "Original description",
      category: "general",
      author: "Local",
      tags: ["local"],
      version: "1.1.0",
      content: "# Local Writer\n\nFresh source content",
      source_url: "/tmp/local-writer",
      content_url: "/tmp/local-writer/SKILL.md",
      compatibility: ["claude"],
    } as never;

    const { getByText, queryByText } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(getByText("Fresh source content")).toBeInTheDocument();
    });
    expect(queryByText("Installed stale content")).not.toBeInTheDocument();
  });

  it("prompts for retranslation when store translation is stale", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: true,
        isStale: true,
      }),
    } as never);

    const skill = {
      slug: "writer",
      name: "Writer",
      description: "Original description",
      category: "general",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nOriginal content",
      compatibility: ["claude"],
    } as never;

    const { getByText } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(getByText("Saved translation is outdated")).toBeInTheDocument();
    });
  });

  it("shows a clear timeout error when store translation request returns 504", async () => {
    const translateContent = vi
      .fn()
      .mockRejectedValue(new Error("API 请求失败 (504)"));
    useSkillStore.setState({
      translateContent,
    } as never);

    const skill = {
      slug: "writer",
      name: "Writer",
      description: "Original description",
      category: "general",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nOriginal content",
      compatibility: ["claude"],
    } as never;

    const { getByRole } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "AI Translate" }));
    });

    expect(showToast).toHaveBeenCalledWith(
      "The AI service timed out while translating. Please try again in a moment, or switch to a faster / more stable model endpoint.",
      "error",
    );
  });
});
