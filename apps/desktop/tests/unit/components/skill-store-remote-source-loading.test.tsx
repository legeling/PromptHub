import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

import {
  createDeferred,
  makeRegistrySkill,
} from "./skill-store-remote.test-fixtures";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const originalSkillStoreActions = {
  installRegistrySkill: useSkillStore.getState().installRegistrySkill,
  uninstallRegistrySkill: useSkillStore.getState().uninstallRegistrySkill,
  updateRegistrySkill: useSkillStore.getState().updateRegistrySkill,
};

const resetSkillStore = () => {
  useSkillStore.setState({
    ...originalSkillStoreActions,
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps each pending source loading when switching away and back", async () => {
    const claude = createDeferred<string>();
    const codex = createDeferred<string>();
    const fetchRemoteContent = vi.fn((url: string) =>
      url.includes("anthropics/skills") ? claude.promise : codex.promise,
    );
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({ device: { storeAutoSync: false } }),
        },
        skill: { fetchRemoteContent },
      },
    });
    await renderWithI18n(<SkillStore />, { language: "en" });
    expect(screen.getByText(/Loading Claude Code skills/)).toBeInTheDocument();
    act(() => useSkillStore.getState().selectStoreSource("openai-codex"));
    expect(screen.getByText(/Loading OpenAI Codex skills/)).toBeInTheDocument();
    act(() => useSkillStore.getState().selectStoreSource("claude-code"));
    expect(screen.getByText(/Loading Claude Code skills/)).toBeInTheDocument();
    expect(screen.queryByText("No skills found")).not.toBeInTheDocument();
    expect(fetchRemoteContent).toHaveBeenCalledTimes(2);
    await act(async () =>
      codex.reject(new Error("HTTP 404: fixture unavailable")),
    );
    expect(screen.getByText(/Loading Claude Code skills/)).toBeInTheDocument();
    await act(async () =>
      claude.reject(new Error("HTTP 404: fixture unavailable")),
    );
    expect(screen.getByText("Failed to load remote store")).toBeInTheDocument();
    expect(screen.queryByText("No skills found")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("renders the populated custom anthropics catalog, count and cached reopen (#141)", async () => {
    const sourceId = "custom-anthropics";
    const names = Array.from(
      { length: 15 },
      (_, index) => `fixture-skill-${index}`,
    );
    useSkillStore.setState({
      selectedStoreSourceId: sourceId,
      customStoreSources: [
        {
          id: sourceId,
          name: "my",
          type: "git-repo",
          url: "https://github.com/anthropics/skills",
          enabled: true,
          order: 0,
          createdAt: 1,
        },
      ],
      remoteStoreEntries: {
        [sourceId]: {
          loadedAt: 1,
          catalogComplete: true,
          error: null,
          skills: names.map((name) => makeRegistrySkill(name)),
        },
      },
    });
    const fetchRemoteContent = vi.fn().mockRejectedValue(new Error("offline"));
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({ device: { storeAutoSync: false } }),
        },
        skill: { fetchRemoteContent },
      },
    });
    const view = await renderWithI18n(<SkillStore />, { language: "en" });
    expect(screen.getByText("Loaded 15")).toBeInTheDocument();
    expect(screen.getByText("Fixture Skill 0")).toBeInTheDocument();
    expect(screen.getByText("Fixture Skill 14")).toBeInTheDocument();
    view.unmount();
    await useSkillStore.persist.rehydrate();
    await renderWithI18n(<SkillStore />, { language: "en" });
    expect(screen.getByText("Fixture Skill 0")).toBeInTheDocument();
    expect(screen.getByText("Fixture Skill 14")).toBeInTheDocument();
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it.each(["claude-code", "openai-codex"])(
    "refreshes an unverified three-item %s cache and preserves it on incomplete downloads",
    async (sourceId) => {
      const cached = ["old-one", "old-two", "old-three"].map((name) =>
        makeRegistrySkill(name),
      );
      useSkillStore.setState({
        selectedStoreSourceId: sourceId,
        remoteStoreEntries: {
          [sourceId]: { loadedAt: 100, skills: cached, error: null },
        },
      });
      let fail = true;
      const names = ["one", "two", "three", "four", "five"];
      const prefix = sourceId === "openai-codex" ? "skills/.curated" : "skills";
      const fetchRemoteContent = vi.fn(async (url: string) => {
        if (url.includes("/git/trees/"))
          return JSON.stringify({
            tree: names.map((name) => ({
              path: `${prefix}/${name}/SKILL.md`,
              type: "blob",
            })),
          });
        if (url.startsWith("https://api.github.com/"))
          return JSON.stringify({ default_branch: "main" });
        if (fail && url.includes("/four/"))
          throw new Error("Request timed out");
        return `---\nname: ${url.split("/").at(-2)}\ndescription: Catalog entry\n---\n# Content`;
      });
      installWindowMocks({
        api: {
          settings: {
            get: vi
              .fn()
              .mockResolvedValue({ device: { storeAutoSync: false } }),
          },
          skill: {
            fetchRemoteContent,
            scanLocalPreview: vi.fn().mockResolvedValue([]),
          },
        },
      });
      await renderWithI18n(<SkillStore />, { language: "en" });
      await waitFor(() =>
        expect(
          useSkillStore.getState().remoteStoreEntries[sourceId]?.error,
        ).toContain("4 of 5"),
      );
      expect(
        useSkillStore.getState().remoteStoreEntries[sourceId].skills,
      ).toEqual(cached);
      expect(
        useSkillStore.getState().remoteStoreEntries[sourceId].loadedAt,
      ).toBe(100);
      fail = false;
      const retry = screen.getByRole("button", { name: "Retry" });
      await waitFor(() => expect(retry).toBeEnabled());
      fireEvent.click(retry);
      await waitFor(() =>
        expect(
          useSkillStore
            .getState()
            .remoteStoreEntries[sourceId].skills.map((skill) => skill.slug),
        ).toEqual(names),
      );
      expect(
        useSkillStore.getState().remoteStoreEntries[sourceId].error,
      ).toBeNull();
      expect(
        useSkillStore.getState().remoteStoreEntries[sourceId].catalogComplete,
      ).toBe(true);
      expect(screen.getByText("four")).toBeInTheDocument();
    },
  );

  it.each(["claude-code", "openai-codex"])(
    "keeps a complete %s catalog through failed refresh and reopen",
    async (sourceId) => {
      useSkillStore.setState({ selectedStoreSourceId: sourceId });
      useSkillStore.getState().setRemoteStoreEntry(sourceId, {
        loadedAt: 123,
        catalogComplete: true,
        error: null,
        skills: [makeRegistrySkill("offline-entry")],
      });
      const fetchRemoteContent = vi
        .fn()
        .mockRejectedValue(new Error("Request timed out"));
      installWindowMocks({
        api: {
          settings: {
            get: vi
              .fn()
              .mockResolvedValue({ device: { storeAutoSync: false } }),
          },
          skill: {
            fetchRemoteContent,
            scanLocalPreview: vi.fn().mockResolvedValue([]),
          },
        },
      });
      const view = await renderWithI18n(<SkillStore />, { language: "en" });
      expect(screen.getByText("Offline Entry")).toBeInTheDocument();
      expect(fetchRemoteContent).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
      await waitFor(() =>
        expect(
          useSkillStore.getState().remoteStoreEntries[sourceId].error,
        ).toBeTruthy(),
      );
      expect(screen.getByText("Offline Entry")).toBeInTheDocument();
      expect(
        useSkillStore.getState().remoteStoreEntries[sourceId],
      ).toMatchObject({
        loadedAt: 123,
        catalogComplete: true,
      });
      view.unmount();
      await useSkillStore.persist.rehydrate();
      fetchRemoteContent.mockClear();
      await renderWithI18n(<SkillStore />, { language: "en" });
      expect(screen.getByText("Offline Entry")).toBeInTheDocument();
      expect(fetchRemoteContent).not.toHaveBeenCalled();
    },
  );

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
        "The Skill source could not be reached. Check your connection and source address, then retry.",
      );
    });

    await waitFor(() => {
      const claudeCodeRepoRequests = fetchRemoteContent.mock.calls.filter(
        ([url]) => url === "https://api.github.com/repos/anthropics/skills",
      );
      expect(claudeCodeRepoRequests).toHaveLength(1);
    });
  });

  it("shows retry and network guidance for GitHub rate-limit failures", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(
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

    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    const { getByText } = await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillStore />
      </form>,
      {
        language: "en",
      },
    );

    await waitFor(() => {
      expect(getByText("Failed to load remote store")).toBeInTheDocument();
      expect(
        getByText(
          "GitHub API rate limit reached. Add a GitHub Access Token in Settings or wait for the limit to reset. Custom repositories can also use SSH with a configured key.",
        ),
      ).toBeInTheDocument();
    });

    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toHaveAttribute("type", "button");

    await act(async () => {
      fireEvent.click(retry);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      getByText(/Add a GitHub Access Token in Settings/),
    ).toBeInTheDocument();
  });

  it("uses user-facing copy for the official store empty state", async () => {
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
      selectedStoreSourceId: "official",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "zh" });
    });

    expect(screen.getAllByText(/官方商店暂未开放/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Claude Code/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/后端|backend/i)).not.toBeInTheDocument();
  });

  it("rejects an unlaunched Cloud source selection without contacting the service", async () => {
    const listFeed = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'cloud:store:feed': Unable to reach PromptHub Cloud",
        ),
      );
    installWindowMocks({
      api: {
        cloud: { store: { listFeed } },
        settings: {
          get: vi.fn().mockResolvedValue({
            device: { storeAutoSync: false, storeSyncCadence: "1d" },
          }),
        },
        skill: {
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
    useSkillStore.getState().selectStoreSource("prompthub-cloud");
    expect(useSkillStore.getState().selectedStoreSourceId).toBe("official");

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(listFeed).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/official store is not open yet/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/Error invoking remote method/i),
    ).not.toBeInTheDocument();
  });

  it("does not expose Electron IPC details when an enabled Cloud source is unavailable", async () => {
    vi.stubEnv("VITE_PROMPTHUB_CLOUD_ENABLED", "true");
    const listFeed = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'cloud:store:feed': Unable to reach PromptHub Cloud",
        ),
      );
    installWindowMocks({
      api: {
        cloud: { store: { listFeed } },
        settings: {
          get: vi.fn().mockResolvedValue({
            device: { storeAutoSync: false, storeSyncCadence: "1d" },
          }),
        },
        skill: {
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
    useSkillStore.setState({ selectedStoreSourceId: "prompthub-cloud" });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["prompthub-cloud"]?.error,
      ).toBe("Failed to load remote store");
    });
    expect(listFeed).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Failed to load remote store")).toHaveLength(2);
    expect(
      screen.queryByText(/Error invoking remote method/i),
    ).not.toBeInTheDocument();
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
        getByText("Skill 下载超时，请检查网络或代理后重试。"),
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
        getByText(
          "仓库、文件或分支不存在，或当前凭据无权访问。请核对地址、分支及 Token／SSH 权限。",
        ),
      ).toBeInTheDocument();
    });
  });

  it("does not auto-sync unrelated remote stores on initial open", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "anthropics" },
        });
      }

      if (url === "https://api.github.com/repos/openai/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "openai" },
        });
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
          tree: [
            { path: "skills/.curated/openai-skill/SKILL.md", type: "blob" },
          ],
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
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "anthropics" },
        });
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
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "openai" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/openai/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [
            { path: "skills/.curated/openai-skill/SKILL.md", type: "blob" },
          ],
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
        source_url:
          "https://github.com/openai/skills/tree/main/skills/.curated/openai-skill",
        content_url:
          "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-skill/SKILL.md",
      }),
    );
  });

  it("loads ClawHub as a preconfigured built-in source", async () => {
    const skillMd = [
      "---",
      "name: smart-api-connector",
      "description: Connect APIs safely",
      "tags: [api, dev]",
      "---",
      "",
      "# Smart API Connector",
      "",
    ].join("\n");
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.startsWith("https://clawhub.ai/api/v1/skills?")) {
        return JSON.stringify({
          skills: [
            {
              slug: "smart-api-connector",
              owner: { username: "coderclaw" },
              displayName: "Smart API Connector",
            },
          ],
        });
      }

      if (
        url ===
        "https://clawhub.ai/api/v1/skills/smart-api-connector/file?path=SKILL.md"
      ) {
        return skillMd;
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
      selectedStoreSourceId: "clawhub",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.clawhub?.skills,
      ).toHaveLength(1);
    });

    expect(screen.getAllByText("ClawHub Store").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Office" })).toBeNull();
    expect(screen.getByTestId("skill-store-filter-bar")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search skills...")).toBeInTheDocument();
    expect(
      useSkillStore.getState().remoteStoreEntries.clawhub?.skills[0],
    ).toEqual(
      expect.objectContaining({
        source_label: "ClawHub",
        source_url: "https://clawhub.ai/coderclaw/smart-api-connector",
        content_url:
          "https://clawhub.ai/api/v1/skills/smart-api-connector/file?path=SKILL.md",
        content: skillMd,
      }),
    );
  });

  it("runs ClawHub store search against the ClawHub search endpoint after debounce", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://clawhub.ai/api/v1/search?q=data&limit=24") {
        return JSON.stringify({
          results: [
            {
              slug: "data-analysis",
              owner: { username: "analyst" },
              displayName: "Data Analysis",
              description: "Analyze structured datasets.",
            },
          ],
        });
      }

      if (
        url ===
        "https://clawhub.ai/api/v1/skills/data-analysis/file?path=SKILL.md"
      ) {
        return [
          "---",
          "name: Data Analysis",
          "description: Analyze structured datasets.",
          "---",
          "",
          "# Data Analysis",
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
      selectedStoreSourceId: "clawhub",
      remoteStoreEntries: {
        clawhub: {
          loadedAt: Date.now(),
          error: null,
          nextCursor: "cursor-2",
          pageSize: 24,
          query: "recommended",
          skills: [makeRegistrySkill("cached-browse-skill")],
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Search skills..."), {
        target: { value: "data" },
      });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://clawhub.ai/api/v1/search?q=data&limit=24",
      );
      expect(useSkillStore.getState().remoteStoreEntries.clawhub).toEqual(
        expect.objectContaining({
          matchedCount: 1,
          nextCursor: null,
          query: "data",
          skills: [
            expect.objectContaining({
              name: "Data Analysis",
              source_url: "https://clawhub.ai/analyst/data-analysis",
            }),
          ],
        }),
      );
    });
  });

  it("auto-loads the next ClawHub cursor page while browsing without faking a total page count", async () => {
    const skillMd = (name: string) => `---
name: ${name}
description: ${name} description
tags: [clawhub]
---

# ${name}
`;
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (
        url === "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24"
      ) {
        return JSON.stringify({
          items: [{ slug: "first-skill", owner: "coderclaw" }],
          nextCursor: "cursor-2",
        });
      }

      if (
        url ===
        "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24&cursor=cursor-2"
      ) {
        return JSON.stringify({
          items: [{ slug: "second-skill", owner: "coderclaw" }],
          nextCursor: null,
        });
      }

      if (
        url ===
        "https://clawhub.ai/api/v1/skills/first-skill/file?path=SKILL.md"
      ) {
        return skillMd("first-skill");
      }

      if (
        url ===
        "https://clawhub.ai/api/v1/skills/second-skill/file?path=SKILL.md"
      ) {
        return skillMd("second-skill");
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
      selectedStoreSourceId: "clawhub",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(useSkillStore.getState().remoteStoreEntries.clawhub).toEqual(
        expect.objectContaining({
          currentCursor: null,
          cursorHistory: [null],
          nextCursor: "cursor-2",
          pageCount: undefined,
          pageIndex: 0,
        }),
      );
    });
    expect(screen.getAllByText("Loaded 1").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("skill-store-virtual-catalog")).toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();

    const scrollContainer = screen.getByTestId("skill-store-scroll");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 700 },
    });
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(useSkillStore.getState().remoteStoreEntries.clawhub).toEqual(
        expect.objectContaining({
          currentCursor: "cursor-2",
          cursorHistory: [null, "cursor-2"],
          nextCursor: null,
          pageIndex: 1,
        }),
      );
    });
    expect(
      useSkillStore.getState().remoteStoreEntries.clawhub?.skills[0],
    ).toEqual(expect.objectContaining({ name: "first-skill" }));
    expect(
      useSkillStore.getState().remoteStoreEntries.clawhub?.skills[1],
    ).toEqual(expect.objectContaining({ name: "second-skill" }));
    expect(screen.queryByText("Page 2")).toBeNull();
  });

  it("refreshes stale ClawHub first-page caches that were loaded without cursor pagination", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (
        url === "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24"
      ) {
        return JSON.stringify({
          items: [{ slug: "fresh-clawhub-skill", owner: "coderclaw" }],
          nextCursor: "fresh-cursor-2",
        });
      }

      if (
        url ===
        "https://clawhub.ai/api/v1/skills/fresh-clawhub-skill/file?path=SKILL.md"
      ) {
        return "# fresh-clawhub-skill";
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
      selectedStoreSourceId: "clawhub",
      remoteStoreEntries: {
        clawhub: {
          loadedAt: Date.now(),
          currentCursor: null,
          error: null,
          nextCursor: null,
          pageSize: 24,
          skills: [makeRegistrySkill("stale-clawhub-skill")],
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(useSkillStore.getState().remoteStoreEntries.clawhub).toEqual(
        expect.objectContaining({
          nextCursor: "fresh-cursor-2",
          query: "recommended",
          skills: expect.arrayContaining([
            expect.objectContaining({
              source_url: "https://clawhub.ai/coderclaw/fresh-clawhub-skill",
            }),
          ]),
        }),
      );
    });
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24",
    );
  });
});
