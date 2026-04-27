import { act, waitFor } from "@testing-library/react";
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
            scanMethod: "static",
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
            scanMethod: "static",
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
            scanMethod: "static",
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
            scanMethod: "static",
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
            scanMethod: "static",
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
            scanMethod: "static",
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
            scanMethod: "static",
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

  it("does not block install when only static scan reports high risk", async () => {
    const installFromRegistry = vi.fn().mockResolvedValue({
      id: "installed",
      name: "PDF",
    });

    useSkillStore.setState({
      installFromRegistry,
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
            scanMethod: "static",
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

    expect(installFromRegistry).toHaveBeenCalledWith("pdf");
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Static scan found potentially risky patterns"),
      "warning",
    );
  });
});
