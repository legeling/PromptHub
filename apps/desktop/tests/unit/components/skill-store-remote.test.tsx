import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function makeRegistrySkill(
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    slug,
    source_id: `source-${slug}`,
    name: slug
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    description: `${slug} description`,
    category: "general",
    author: "PromptHub",
    source_url: `https://example.com/${slug}`,
    tags: [],
    version: "1.0.0",
    content: `# ${slug}`,
    ...overrides,
  } as never;
}

function makeSkillsShLeaderboard(count: number) {
  return `
    <main>
      ${Array.from(
        { length: count },
        (_, index) => `
          <a href="/demo/skills/skill-${index + 1}">
            <span>${index + 1}</span>
            <span>skill-${index + 1}</span>
            <span>demo/skills</span>
            <span>${1000 - index}</span>
          </a>
        `,
      ).join("\n")}
    </main>
    <script>self.__next_f.push([1, '\\"totalSkills\\":${count}'])</script>
  `;
}

function makeSkillsShDetail(skillName: string) {
  return `
    <article>
      <h1>${skillName}</h1>
      <h2>Summary</h2>
      <p>${skillName} helps users run a realistic workflow.</p>
      <h2>SKILL.md</h2>
      <pre><code>---
name: ${skillName}
description: ${skillName} helps users run a realistic workflow.
tags: [demo, test]
---

# ${skillName}
      </code></pre>
    </article>
  `;
}

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

    const { getByText, queryByText } = await renderWithI18n(<SkillStore />, {
      language: "en",
    });

    await waitFor(() => {
      expect(getByText("Failed to load remote store")).toBeInTheDocument();
      expect(
        getByText(
          "GitHub API rate limit reached. Try again in a few minutes, or switch to another network and retry.",
        ),
      ).toBeInTheDocument();
    });

    expect(queryByText(/GitHub token in settings/i)).not.toBeInTheDocument();
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
    expect(
      screen.getByPlaceholderText("Search skills..."),
    ).toBeInTheDocument();
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
      if (url === "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24") {
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
        url === "https://clawhub.ai/api/v1/skills/first-skill/file?path=SKILL.md"
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
      if (url === "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24") {
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
              source_url:
                "https://clawhub.ai/coderclaw/fresh-clawhub-skill",
            }),
          ]),
        }),
      );
    });
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://clawhub.ai/api/v1/skills?sort=recommended&limit=24",
    );
  });

  it("auto-loads more skills.sh results while preserving cached index and existing cards", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(60);
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        const skillNumber = Number(match[1].replace("skill-", ""));
        if (skillNumber === 5 || skillNumber === 12) {
          throw new Error(`Simulated detail failure for ${match[1]}`);
        }
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(22);
    });

    expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
      expect.objectContaining({
        currentCursor: null,
        nextCursor: "24",
        pageCount: 3,
        pageIndex: 0,
        pageSize: 24,
        totalCount: 60,
      }),
    );
    expect(fetchRemoteContent).toHaveBeenCalledWith("https://skills.sh");
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://skills.sh/demo/skills/skill-24",
    );
    expect(fetchRemoteContent).not.toHaveBeenCalledWith(
      "https://skills.sh/demo/skills/skill-25",
    );
    expect(screen.getAllByText("22 / 60").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("skill-store-virtual-catalog")).toBeNull();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Official" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "React" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Office" })).toBeNull();
    expect(screen.getByTestId("skill-store-filter-bar")).toBeInTheDocument();

    const scrollContainer = screen.getByTestId("skill-store-scroll");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 700 },
    });
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(46);
    });

    expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
      expect.objectContaining({
        currentCursor: "24",
        nextCursor: "48",
        pageCount: 3,
        pageIndex: 1,
      }),
    );
    expect(
      useSkillStore
        .getState()
        .remoteStoreEntries.community?.skills.some(
          (skill) => skill.name === "skill-1",
        ),
    ).toBe(true);
    expect(
      useSkillStore.getState().remoteStoreEntries.community?.skills[0],
    ).toEqual(expect.objectContaining({ name: "skill-1" }));
    expect(
      useSkillStore.getState().remoteStoreEntries.community?.skills.at(-1),
    ).toEqual(expect.objectContaining({ name: "skill-48" }));
    const indexRequests = fetchRemoteContent.mock.calls.filter(
      ([url]) => url === "https://skills.sh",
    );
    expect(indexRequests).toHaveLength(1);
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://skills.sh/demo/skills/skill-48",
    );
    expect(screen.queryByRole("button", { name: /Next page/i })).toBeNull();
  });

  it("keeps continued skills.sh scroll loading separate from manual refresh state", async () => {
    const delayedSecondPageDetail = createDeferred<string>();
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(60);
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        if (match[1] === "skill-25") {
          return delayedSecondPageDetail.promise;
        }
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(24);
    });

    const scrollContainer = screen.getByTestId("skill-store-scroll");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 700 },
    });
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skills.sh/demo/skills/skill-25",
      );
      expect(screen.getByText("Loading more...")).toBeInTheDocument();
    });

    expect(screen.queryByText("Refreshing")).toBeNull();

    await act(async () => {
      delayedSecondPageDetail.resolve(makeSkillsShDetail("skill-25"));
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(48);
    });
  });

  it("loads the selected official skills.sh browse filter instead of inferred local categories", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(30);
      }

      if (url === "https://skills.sh/official") {
        return `
          <main>
            <a href="/cloudflare/skills/wrangler"></a>
          </main>
          <script>self.__next_f.push([1, '\\"totalSkills\\":1'])</script>
        `;
      }

      if (url === "https://skills.sh/cloudflare/skills/wrangler") {
        return makeSkillsShDetail("wrangler");
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(24);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Official" }));
    });

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skills.sh/official",
      );
      expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
        expect.objectContaining({
          query: "official:",
          skills: [
            expect.objectContaining({
              store_url: "https://skills.sh/cloudflare/skills/wrangler",
            }),
          ],
          totalCount: 1,
        }),
      );
    });
    expect(screen.queryByRole("button", { name: "Office" })).toBeNull();
  });

  it("switches skills.sh filters immediately without showing stale cards while the new filter loads", async () => {
    const topicIndex = createDeferred<string>();
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(30);
      }

      if (url === "https://skills.sh/topic/nextjs") {
        return topicIndex.promise;
      }

      if (url === "https://skills.sh/vercel/skills/next-routing") {
        return makeSkillsShDetail("next-routing");
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("skill-1")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next.js" }));
    });

    expect(useSkillStore.getState().storeCategory).toBe("topic:nextjs");
    expect(screen.queryByText("skill-1")).toBeNull();
    expect(
      screen.getByText("Loading skills.sh public skill list..."),
    ).toBeInTheDocument();

    await act(async () => {
      topicIndex.resolve(`
        <main>
          <a href="/vercel/skills/next-routing"></a>
        </main>
      `);
    });

    await waitFor(() => {
      expect(screen.getByText("next-routing")).toBeInTheDocument();
    });
    expect(screen.queryByText("skill-1")).toBeNull();
    expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
      expect.objectContaining({
        query: "topic:nextjs:",
        skills: [
          expect.objectContaining({
            store_url: "https://skills.sh/vercel/skills/next-routing",
          }),
        ],
      }),
    );
  });

  it("does not merge inflight skills.sh loads across different filters", async () => {
    const allIndex = createDeferred<string>();
    const topicIndex = createDeferred<string>();
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return allIndex.promise;
      }

      if (url === "https://skills.sh/topic/nextjs") {
        return topicIndex.promise;
      }

      if (url === "https://skills.sh/vercel/skills/next-routing") {
        return makeSkillsShDetail("next-routing");
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith("https://skills.sh");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next.js" }));
    });

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skills.sh/topic/nextjs",
      );
    });

    await act(async () => {
      topicIndex.resolve(`
        <main>
          <a href="/vercel/skills/next-routing"></a>
        </main>
      `);
    });

    await waitFor(() => {
      expect(screen.getByText("next-routing")).toBeInTheDocument();
    });

    await act(async () => {
      allIndex.resolve(makeSkillsShLeaderboard(30));
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community,
      ).toEqual(
        expect.objectContaining({
          query: "topic:nextjs:",
          skills: [
            expect.objectContaining({
              store_url: "https://skills.sh/vercel/skills/next-routing",
            }),
          ],
        }),
      );
    });
    expect(screen.queryByText("skill-1")).toBeNull();
  });

  it("uses skills.sh topic result count instead of the global total for topic filters", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(30);
      }

      if (url === "https://skills.sh/topic/nextjs") {
        return `
          <main>
            <a href="/vercel-labs/agent-skills/vercel-react-best-practices"></a>
            <a href="/vercel-labs/next-skills/next-best-practices"></a>
          </main>
          <script>self.__next_f.push([1, '\\"totalSkills\\":5368'])</script>
        `;
      }

      if (
        url ===
        "https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices"
      ) {
        return makeSkillsShDetail("vercel-react-best-practices");
      }

      if (
        url === "https://skills.sh/vercel-labs/next-skills/next-best-practices"
      ) {
        return makeSkillsShDetail("next-best-practices");
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(24);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next.js" }));
    });

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skills.sh/topic/nextjs",
      );
      expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
        expect.objectContaining({
          nextCursor: null,
          query: "topic:nextjs:",
          skills: expect.arrayContaining([
            expect.objectContaining({ name: "vercel-react-best-practices" }),
            expect.objectContaining({ name: "next-best-practices" }),
          ]),
          totalCount: 2,
        }),
      );
    });

    expect(screen.getByText("2 skills")).toBeInTheDocument();
    expect(screen.queryByText("5368 skills")).toBeNull();
  });

  it("keeps medium store catalogs on the original grid and virtualizes only large catalogs", async () => {
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
      selectedStoreSourceId: "clawhub",
      remoteStoreEntries: {
        clawhub: {
          loadedAt: Date.now(),
          currentCursor: null,
          error: null,
          nextCursor: null,
          pageSize: 24,
          query: "recommended",
          skills: Array.from({ length: 120 }, (_, index) =>
            makeRegistrySkill(`large-clawhub-skill-${index + 1}`, {
              source_id: `clawhub-large-${index + 1}`,
              source_label: "ClawHub",
              source_url: `https://clawhub.ai/demo/large-${index + 1}`,
            }),
          ),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(screen.queryByTestId("skill-store-virtual-catalog")).toBeNull();

    act(() => {
      useSkillStore.setState({
        remoteStoreEntries: {
          clawhub: {
            loadedAt: Date.now(),
            currentCursor: null,
            error: null,
            nextCursor: null,
            pageSize: 24,
            query: "recommended",
            skills: Array.from({ length: 320 }, (_, index) =>
              makeRegistrySkill(`huge-clawhub-skill-${index + 1}`, {
                source_id: `clawhub-huge-${index + 1}`,
                source_label: "ClawHub",
                source_url: `https://clawhub.ai/demo/huge-${index + 1}`,
              }),
            ),
          },
        },
      });
    });

    expect(
      screen.getByTestId("skill-store-virtual-catalog"),
    ).toBeInTheDocument();
  });

  it("searches the skills.sh lightweight index before fetching detail pages", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(60);
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
      storeSearchQuery: "skill-40",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(1);
    });

    expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
      expect.objectContaining({
        matchedCount: 1,
        nextCursor: null,
        query: "all:skill-40",
        totalCount: 60,
      }),
    );
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://skills.sh/demo/skills/skill-40",
    );
    expect(fetchRemoteContent).not.toHaveBeenCalledWith(
      "https://skills.sh/demo/skills/skill-1",
    );
  });

  it("refreshes stale skills.sh cache entries that predate pagination metadata", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://skills.sh") {
        return makeSkillsShLeaderboard(30);
      }

      const match = url.match(
        /^https:\/\/skills\.sh\/demo\/skills\/(skill-\d+)$/,
      );
      if (match) {
        return makeSkillsShDetail(match[1]);
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
      selectedStoreSourceId: "community",
      remoteStoreEntries: {
        community: {
          loadedAt: Date.now(),
          error: null,
          skills: [makeRegistrySkill("stale-skill")],
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills,
      ).toHaveLength(24);
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith("https://skills.sh");
    expect(useSkillStore.getState().remoteStoreEntries.community).toEqual(
      expect.objectContaining({
        nextCursor: "24",
        pageSize: 24,
        totalCount: 30,
      }),
    );
  });

  it("falls back to repository root README when no SKILL.md exists", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/demo/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "demo" },
        });
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
        url === "https://raw.githubusercontent.com/demo/skills/main/README.md"
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
        content_url:
          "https://raw.githubusercontent.com/demo/skills/main/README.md",
      }),
    );
  });

  it("loads git-repo sources from an explicit branch and directory", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/demo/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "demo" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/demo/skills/git/trees/release?recursive=1"
      ) {
        return JSON.stringify({
          tree: [
            { path: "skills/.curated/release-skill/SKILL.md", type: "blob" },
          ],
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

    expect(
      screen.getAllByText("Same Name Source").length,
    ).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Stable")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(screen.getAllByText("dev").length).toBeGreaterThan(0);
  });

  it("opens the store detail when a remote card only has a slug selection id", async () => {
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
      selectedStoreSourceId: "slug-only-source",
      registrySkills: [],
      remoteStoreEntries: {
        "slug-only-source": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "slug-only-writer",
              name: "Slug Only Writer",
              description: "Opens by slug",
              category: "general",
              author: "PromptHub",
              source_url: "https://example.com/slug-only-writer",
              tags: ["writing"],
              version: "1.0.0",
              content: "# Slug Only Writer\n\nDetail body",
            },
          ],
        },
      },
      customStoreSources: [
        {
          id: "slug-only-source",
          name: "Slug Only Source",
          type: "marketplace-json",
          url: "https://example.com/slug-only-store.json",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByText("Slug Only Writer"));

    await waitFor(() => {
      expect(screen.getByText("Detail body")).toBeInTheDocument();
    });
    expect(
      screen.getAllByText("Slug Only Source").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByText("skills/slug-only-writer"),
    ).not.toBeInTheDocument();
    expect(useSkillStore.getState().selectedRegistrySlug).toBe(
      "slug-only-writer",
    );
  });

  it("shows local source badges in store detail", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = {
      slug: "writer",
      name: "Writer",
      source_id: "local-writer",
      source_label: "/tmp/skills",
      source_branch: "dev",
      description: "Local writer",
      category: "general",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nLocal",
      source_url: "/tmp/skills/writer",
      content_url: "/tmp/skills/writer/SKILL.md",
      compatibility: ["claude"],
      author: "Local",
    } as never;

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.getAllByText("Local").length).toBeGreaterThan(0);
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
  });

  it("does not show store versions in store detail", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = {
      slug: "placeholder-version",
      name: "Placeholder Version",
      source_id: "placeholder-version",
      description: "Placeholder version skill",
      category: "general",
      tags: [],
      version: "1.0.0",
      content: "# Placeholder Version\n\nNo display version.",
      source_url: "https://example.com/placeholder-version",
      author: "PromptHub",
    } as never;

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.queryByText("v1.0.0")).not.toBeInTheDocument();

    await renderWithI18n(
      <SkillStoreDetail
        skill={{
          ...skill,
          slug: "explicit-version",
          name: "Explicit Version",
          source_id: "explicit-version",
          version: "v2",
          content: "# Explicit Version\n\nNo display version.",
        }}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.queryByText("v2")).not.toBeInTheDocument();
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
        source_label: "icelemon/skills",
        source_branch: "main",
        source_id: "source-icelemon-gitea",
        description: "Gitea scanned store skill",
        category: "dev",
        author: "icelemon",
        source_url: "https://gitea.example.com/icelemon/skills/tree/main",
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

    await act(async () => {
      screen.getByText("icelemon-skill").click();
    });

    expect(screen.getAllByText("Gitea Repo").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText("Git")).toHaveLength(0);
    expect(screen.queryAllByText("Local")).toHaveLength(0);

    expect(scanRemoteGithub).toHaveBeenCalledWith(
      "https://gitea.example.com/icelemon/skills",
      expect.any(Array),
      undefined,
      undefined,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("shows a spinner on the store card while quick install is pending", async () => {
    let resolveInstall: (value: unknown) => void = () => {};
    const installRegistrySkill = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveInstall = resolve;
        }),
    );
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "icelemon-skill",
        name: "icelemon-skill",
        install_name: "icelemon-skill",
        source_label: "icelemon/skills",
        source_branch: "main",
        source_id: "source-icelemon-gitea",
        description: "Gitea scanned store skill",
        category: "dev",
        author: "icelemon",
        source_url: "https://gitea.example.com/icelemon/skills/tree/main",
        tags: ["dev"],
        version: "1.0.0",
        content: "# icelemon",
        compatibility: ["claude", "cursor"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
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
      installRegistrySkill,
      customStoreSources: [
        {
          id: "gitea-pending-repo",
          name: "Gitea Pending Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-pending-repo",
    } as never);

    const { container } = await renderWithI18n(<SkillStore />, {
      language: "en",
    });

    await waitFor(() => {
      expect(screen.getByText("icelemon-skill")).toBeInTheDocument();
    });

    const card = screen.getByText("icelemon-skill").closest(".group");
    expect(card).not.toBeNull();

    await act(async () => {
      fireEvent.click(within(card as HTMLElement).getByTitle("Import"));
    });

    expect(installRegistrySkill).toHaveBeenCalledWith(
      expect.objectContaining({ source_id: "source-icelemon-gitea" }),
    );
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByTitle("Installing...")).toBeDisabled();

    await act(async () => {
      resolveInstall({ id: "installed", name: "icelemon-skill" });
    });
  });

  it("labels quick-install package persistence errors as install failures", async () => {
    const installRegistrySkill = vi
      .fn()
      .mockRejectedValue(new Error("SKILL.md not found in directory: skills/demo"));
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "demo",
        name: "demo",
        install_name: "demo",
        source_label: "icelemon/skills",
        source_id: "source-demo",
        description: "Demo scanned store skill",
        category: "general",
        author: "icelemon",
        source_url: "https://gitea.example.com/icelemon/skills",
        source_directory: "skills/demo",
        canonical_skill_path: "skills/demo/SKILL.md",
        tags: [],
        version: "1.0.0",
        content: "# Demo",
        compatibility: ["claude"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
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
      installRegistrySkill,
      customStoreSources: [
        {
          id: "gitea-error-repo",
          name: "Gitea Error Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-error-repo",
    } as never);

    await renderWithI18n(<SkillStore />, { language: "en" });

    await waitFor(() => {
      expect(screen.getByText("demo")).toBeInTheDocument();
    });

    const card = screen.getByText("demo").closest(".group");
    expect(card).not.toBeNull();

    await act(async () => {
      fireEvent.click(within(card as HTMLElement).getByTitle("Import"));
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Install failed"),
      "error",
    );
    expect(showToast).not.toHaveBeenCalledWith(
      expect.stringContaining("Safety scan failed"),
      "error",
    );
  });

  it("keeps imported state after refreshing a self-hosted git source", async () => {
    const scanRemoteGithub = vi
      .fn()
      .mockResolvedValueOnce([
        {
          slug: "writer",
          name: "writer",
          install_name: "writer",
          source_label: "icelemon/skills",
          source_branch: "main",
          source_directory: "skills/writer",
          canonical_skill_path: "skills/writer/SKILL.md",
          source_id: "stable-writer-source-id",
          description: "Writer skill",
          category: "dev",
          author: "icelemon",
          source_url:
            "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
          tags: ["dev"],
          version: "1.0.0",
          content: "# writer",
          compatibility: ["claude", "cursor"],
        },
      ])
      .mockResolvedValueOnce([
        {
          slug: "writer",
          name: "writer",
          install_name: "writer",
          source_label: "icelemon/skills",
          source_branch: "main",
          source_directory: "skills/writer",
          canonical_skill_path: "skills/writer/SKILL.md",
          source_id: "stable-writer-source-id",
          description: "Writer skill",
          category: "dev",
          author: "icelemon",
          source_url:
            "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
          tags: ["dev"],
          version: "1.0.0",
          content: "# writer",
          compatibility: ["claude", "cursor"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
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
      skills: [
        {
          id: "installed-writer",
          name: "writer",
          source_id: "stable-writer-source-id",
          source_url:
            "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
          protocol_type: "skill",
          author: "icelemon",
          tags: ["dev"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      customStoreSources: [
        {
          id: "gitea-refresh-repo",
          name: "Gitea Refresh Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-refresh-repo",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["gitea-refresh-repo"]
          ?.skills,
      ).toHaveLength(1);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Imported").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    });

    await waitFor(() => {
      expect(scanRemoteGithub).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Imported").length).toBeGreaterThan(0);
    });
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

    expect(
      screen.queryByPlaceholderText("Search skills..."),
    ).not.toBeInTheDocument();
    expect(useSkillStore.getState().storeSearchQuery).toBe("pdf");
  });

  it("debounces built-in skills.sh and ClawHub store search boxes while keeping submit immediate", async () => {
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
          fetchRemoteContent: vi.fn().mockResolvedValue(makeSkillsShLeaderboard(0)),
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
      selectedStoreSourceId: "community",
      remoteStoreEntries: {
        community: {
          loadedAt: Date.now(),
          error: null,
          nextCursor: null,
          pageSize: 24,
          query: "all:",
          skills: [],
          totalCount: 0,
        },
      },
    });

    const view = await renderWithI18n(<SkillStore />, { language: "en" });

    const skillsShSearchForm = screen.getByTestId(
      "skill-store-local-search-form",
    );
    expect(skillsShSearchForm.className).toContain("w-full");
    expect(skillsShSearchForm.className).not.toContain("max-w-md");
    expect(skillsShSearchForm.className).toContain("bg-card/70");
    expect(skillsShSearchForm.className).not.toContain(
      "focus-within:border-primary",
    );

    const skillsShSearchInput = screen.getByPlaceholderText("Search skills...");
    expect(skillsShSearchInput).toHaveAttribute("type", "text");
    expect(skillsShSearchInput.className).toContain("focus-visible:ring-0");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(skillsShSearchInput, {
        target: { value: "react" },
      });
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(299);
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("react");

    await act(async () => {
      fireEvent.change(skillsShSearchInput, {
        target: { value: "next" },
      });
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("react");

    await act(async () => {
      fireEvent.submit(screen.getByTestId("skill-store-local-search-form"));
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("next");
    vi.useRealTimers();

    await act(async () => {
      useSkillStore.setState({
        selectedStoreSourceId: "clawhub",
        storeSearchQuery: "",
        remoteStoreEntries: {
          clawhub: {
            loadedAt: Date.now(),
            error: null,
            nextCursor: null,
            pageSize: 24,
            query: "recommended",
            skills: [makeRegistrySkill("gif-maker")],
          },
        },
      });
    });
    view.rerender(<SkillStore />);

    const clawHubSearchInput = screen.getByPlaceholderText("Search skills...");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(clawHubSearchInput, {
        target: { value: "gif" },
      });
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("gif");
    vi.useRealTimers();
  });

  it("labels the store detail category instead of showing a raw category token", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = makeRegistrySkill("api-helper", {
      category: "dev",
      content: "# API Helper",
    });

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "zh" },
    );

    expect(screen.getByText("分类：开发工具")).toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
  });

  it("does not show category metadata for external stores without native categories", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = makeRegistrySkill("api-helper", {
      category: "general",
      source_label: "skills.sh",
      store_url: "https://skills.sh/demo/skills/api-helper",
      content: "# API Helper",
    });

    await renderWithI18n(
      <SkillStoreDetail
        skill={skill}
        isInstalled={false}
        storeLabel="skills.sh 商店"
        onClose={vi.fn()}
      />,
      { language: "zh" },
    );

    expect(screen.queryByText(/分类/)).not.toBeInTheDocument();
    expect(screen.queryByText(/通用|General/)).not.toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
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

  it("keeps each quick-install spinner active until that skill install resolves", async () => {
    const firstInstall = createDeferred<{ id: string; name: string }>();
    const secondInstall = createDeferred<{ id: string; name: string }>();
    const installRegistrySkill = vi
      .fn()
      .mockReturnValueOnce(firstInstall.promise)
      .mockReturnValueOnce(secondInstall.promise);

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
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            makeRegistrySkill("first-skill"),
            makeRegistrySkill("second-skill"),
          ],
        },
      },
      installRegistrySkill,
    } as never);
    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: false,
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    const installButtons = screen.getAllByTitle("Import");
    await act(async () => {
      fireEvent.click(installButtons[0]);
      fireEvent.click(installButtons[1]);
    });

    expect(installRegistrySkill).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTitle("Installing...")).toHaveLength(2);

    await act(async () => {
      firstInstall.resolve({ id: "first", name: "First Skill" });
      secondInstall.resolve({ id: "second", name: "Second Skill" });
      await firstInstall.promise;
      await secondInstall.promise;
    });
  });

  it("shows shared install pending state in store detail and blocks duplicate install", async () => {
    const installRegistrySkill = vi.fn();
    useSkillStore.setState({
      installRegistrySkill,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("pending-skill")}
        isInstalled={false}
        isInstalling
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const installingButton = screen.getByRole("button", {
      name: /Adding/i,
    });
    expect(installingButton).toBeDisabled();

    await act(async () => {
      fireEvent.click(installingButton);
    });

    expect(installRegistrySkill).not.toHaveBeenCalled();
  });

  it("shows the update action only after an update check finds a store update", async () => {
    const getRegistrySkillUpdateStatus = vi
      .fn()
      .mockResolvedValue({ status: "update-available" });
    const updateRegistrySkill = vi
      .fn()
      .mockResolvedValue({ status: "updated" });
    useSkillStore.setState({
      getRegistrySkillUpdateStatus,
      updateRegistrySkill,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("update-ready", {
          content_url: "https://example.com/update-ready/SKILL.md",
        })}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: /Check update/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Update$/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Check update/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Recheck update/i }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Update$/i }));
    });

    expect(updateRegistrySkill).toHaveBeenCalledWith("source-update-ready", {
      overwriteLocalChanges: false,
    });
  });

  it("opens the installed My Skills detail from the imported status action", async () => {
    const onClose = vi.fn();
    useSkillStore.setState({
      skills: [
        {
          id: "installed-algorithmic-art",
          name: "algorithmic-art",
          protocol_type: "skill",
          source_id: "source-algorithmic-art",
          source_url: "https://example.com/algorithmic-art",
          content_url: "https://example.com/algorithmic-art/SKILL.md",
          instructions: "# Installed algorithmic art",
          content: "# Installed algorithmic art",
          tags: [],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      storeView: "store",
      selectedSkillId: null,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("algorithmic-art", {
          content_url: "https://example.com/algorithmic-art/SKILL.md",
        })}
        isInstalled
        onClose={onClose}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Open in My Skills/i }),
      );
    });

    expect(useSkillStore.getState().storeView).toBe("my-skills");
    expect(useSkillStore.getState().selectedSkillId).toBe(
      "installed-algorithmic-art",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not collapse store detail when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const { container } = await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("stable-detail")}
        isInstalled={false}
        onClose={onClose}
      />,
      { language: "en" },
    );
    const backdrop = container.querySelector(".absolute.inset-0");
    expect(backdrop).toBeTruthy();

    await act(async () => {
      fireEvent.click(backdrop!);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("defaults to saved translation in store detail and toggles back to original", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value:
          "---\ndescription: Translated store content\n---\n\nTranslated store content",
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

  it("uses batch mode card clicks for selection and keeps detail as an icon action", async () => {
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: { storeAutoSync: false, storeSyncCadence: "1d" },
          }),
        },
        skill: {
          fetchRemoteContent: vi.fn().mockResolvedValue(""),
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

    const alpha = makeRegistrySkill("alpha");
    useSkillStore.setState({
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          skills: [alpha],
        },
      },
    } as never);

    await renderWithI18n(<SkillStore />, { language: "en" });
    await screen.findByText("Alpha");

    fireEvent.click(
      screen.getByRole("button", { name: "Batch manage store" }),
    );
    fireEvent.click(screen.getByText("Alpha"));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(useSkillStore.getState().selectedRegistrySlug).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View detail" }));
    expect(useSkillStore.getState().selectedRegistrySlug).toBe("source-alpha");
  });

  it("toggles select visible back to deselect visible in store batch mode", async () => {
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: { storeAutoSync: false, storeSyncCadence: "1d" },
          }),
        },
        skill: {
          fetchRemoteContent: vi.fn().mockResolvedValue(""),
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
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          skills: [makeRegistrySkill("alpha"), makeRegistrySkill("beta")],
        },
      },
    } as never);

    await renderWithI18n(<SkillStore />, { language: "en" });
    await screen.findByText("Beta");

    fireEvent.click(
      screen.getByRole("button", { name: "Batch manage store" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select visible store skills" }),
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Deselect visible store skills" }),
    );
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Install selected" }),
    ).toBeDisabled();
  });

  it("batch installs only selected store skills that are not already imported", async () => {
    const installRegistrySkill = vi.fn().mockResolvedValue({
      id: "skill-beta",
      name: "Beta",
    });
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: { storeAutoSync: false, storeSyncCadence: "1d" },
          }),
        },
        skill: {
          fetchRemoteContent: vi.fn().mockResolvedValue(""),
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

    const alpha = makeRegistrySkill("alpha");
    const beta = makeRegistrySkill("beta");
    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: false,
    } as never);
    useSkillStore.setState({
      installRegistrySkill,
      selectedStoreSourceId: "claude-code",
      skills: [
        {
          id: "skill-alpha",
          name: "Alpha",
          registry_slug: "alpha",
          source_id: "source-alpha",
          description: "Installed alpha",
          instructions: "# alpha",
          content: "# alpha",
          protocol_type: "skill",
          tags: [],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          skills: [alpha, beta],
        },
      },
    } as never);

    await renderWithI18n(<SkillStore />, { language: "en" });
    await screen.findByText("Beta");

    fireEvent.click(
      screen.getByRole("button", { name: "Batch manage store" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select visible store skills" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Install selected" }));

    await waitFor(() => {
      expect(installRegistrySkill).toHaveBeenCalledTimes(1);
    });
    expect(installRegistrySkill.mock.calls[0][0].slug).toBe("beta");
  });

  it("batch removes only selected imported store skills from My Skills", async () => {
    const uninstallRegistrySkill = vi.fn().mockResolvedValue(true);
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: { storeAutoSync: false, storeSyncCadence: "1d" },
          }),
        },
        skill: {
          fetchRemoteContent: vi.fn().mockResolvedValue(""),
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

    const alpha = makeRegistrySkill("alpha");
    const beta = makeRegistrySkill("beta");
    useSkillStore.setState({
      selectedStoreSourceId: "claude-code",
      uninstallRegistrySkill,
      skills: [
        {
          id: "skill-alpha",
          name: "Alpha",
          registry_slug: "alpha",
          source_id: "source-alpha",
          description: "Installed alpha",
          instructions: "# alpha",
          content: "# alpha",
          protocol_type: "skill",
          tags: [],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          skills: [alpha, beta],
        },
      },
    } as never);

    await renderWithI18n(<SkillStore />, { language: "en" });
    await screen.findByText("Beta");

    fireEvent.click(
      screen.getByRole("button", { name: "Batch manage store" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select visible store skills" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove selected from My Skills",
      }),
    );

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove selected from My Skills",
    });
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() => {
      expect(uninstallRegistrySkill).toHaveBeenCalledTimes(1);
    });
    expect(uninstallRegistrySkill).toHaveBeenCalledWith("source-alpha");
  });

  it("removes an imported store skill from the detail action when it was matched by slug", async () => {
    const deleteSkill = vi.fn().mockResolvedValue(true);
    const getAll = vi.fn().mockResolvedValue([]);
    installWindowMocks({
      api: {
        skill: {
          delete: deleteSkill,
          getAll,
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

    const storeSkill = {
      slug: "aspnet-core",
      name: "ASP.NET Core",
      description: "ASP.NET Core helper",
      category: "development",
      tags: ["dotnet"],
      version: "1.0.0",
      content: "# ASP.NET Core\n",
      compatibility: ["claude"],
    } as never;
    useSkillStore.setState({
      registrySkills: [storeSkill],
      skills: [
        {
          id: "skill-aspnet-core",
          name: "ASP.NET Core",
          registry_slug: "aspnet-core",
          description: "Installed ASP.NET Core helper",
          instructions: "# ASP.NET Core\n",
          content: "# ASP.NET Core\n",
          protocol_type: "skill",
          tags: ["dotnet"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={storeSkill}
        isInstalled={true}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Remove from My Skills" }),
      );
    });

    await waitFor(() => {
      expect(deleteSkill).toHaveBeenCalledWith("skill-aspnet-core");
    });
    expect(getAll).toHaveBeenCalled();
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
