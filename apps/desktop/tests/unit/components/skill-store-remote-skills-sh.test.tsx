import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

import {
  createDeferred,
  makeRegistrySkill,
  makeSkillsShLeaderboard,
  makeSkillsShDetail,
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

  it.each(["skill-40", "semantic lookup"])(
    "searches the remote skills.sh directory beyond the browse index: %s (#238)",
    async (query) => {
      const fetchRemoteContent = vi.fn(async (url: string) => {
        if (url === "https://skills.sh") return makeSkillsShLeaderboard(3);
        if (new URL(url).pathname === "/api/search") {
          expect(new URL(url).searchParams.get("q")).toBe(query);
          return JSON.stringify({
            skills: [
              {
                id: "demo/skills/skill-40",
                source: "demo/skills",
                skillId: "skill-40",
                name: "skill-40",
                installs: 42,
              },
            ],
          });
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
        storeSearchQuery: query,
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
          query: `all:${query}`,
          totalCount: 1,
        }),
      );
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skills.sh/demo/skills/skill-40",
      );
      expect(fetchRemoteContent).not.toHaveBeenCalledWith(
        "https://skills.sh/demo/skills/skill-1",
      );
      expect(fetchRemoteContent).not.toHaveBeenCalledWith("https://skills.sh");
      expect(screen.getAllByText("skill-40").length).toBeGreaterThan(0);
      expect(
        useSkillStore.getState().remoteStoreEntries.community?.skills[0],
      ).toMatchObject({
        source_url: "https://github.com/demo/skills",
        install_name: "skill-40",
      });
    },
  );

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
});
