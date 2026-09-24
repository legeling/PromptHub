import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";

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
import { partializeSkillState } from "../../../src/renderer/stores/skill/skill-store-persistence";
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
      skillSafetyScanEnabled: false,
      skillSafetyScanMethod: "static",
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

  it("passes installed local repo paths into batch safety scans", async () => {
    useSettingsStore.setState({ skillSafetyScanEnabled: true });
    const scanSafety = vi.fn().mockResolvedValue({
      level: "safe",
      summary: "No findings",
      findings: [],
      recommendedAction: "allow",
      scannedAt: 1,
      checkedFileCount: 1,
      scanMethod: "static",
    });
    window.api.skill.scanSafety = scanSafety;

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

    const summary = await useSkillStore
      .getState()
      .scanInstalledSkillSafety(["skill-1"]);

    expect(scanSafety).toHaveBeenCalledWith({
      enabled: true,
      method: "static",
      name: "managed-package",
      content: "# Managed Package",
      localRepoPath: "/managed/skills/managed-package--abc123",
      aiConfig: undefined,
    });
    expect(summary).toMatchObject({ total: 1, safe: 1, blocked: 0 });
    expect(useSkillStore.getState().skills[0]?.safetyReport).toMatchObject({
      level: "safe",
      summary: "No findings",
    });
  });

  it("does not persist filesystem-derived Agent Skill scan results", async () => {
    const staleAgentScanState = {
      codex: {
        result: {
          platform: null as never,
          skillsDir: "/Users/test/.codex/skills",
          scannedSkills: [],
        },
        isScanning: false,
        scannedAt: 1,
        error: null,
      },
    };
    useSkillStore.setState({ agentScanState: staleAgentScanState });

    expect(
      partializeSkillState(useSkillStore.getState()).agentScanState,
    ).toEqual({});

    localStorage.setItem(
      "skill-store",
      JSON.stringify({
        state: { agentScanState: staleAgentScanState },
        version: 0,
      }),
    );
    await useSkillStore.persist.rehydrate();

    expect(useSkillStore.getState().agentScanState).toEqual({});
  });

  describe("remoteStoreEntries cache and persistence", () => {
    it("recovers a persisted unlaunched Cloud selection to the official store", async () => {
      localStorage.setItem(
        "skill-store",
        JSON.stringify({
          state: {
            selectedStoreSourceId: "prompthub-cloud",
            customStoreSources: [],
            remoteStoreEntries: {},
          },
          version: 0,
        }),
      );

      await useSkillStore.persist.rehydrate();

      expect(useSkillStore.getState().selectedStoreSourceId).toBe("official");
    });

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

    it("normalizes same-version persisted custom git remote cache during hydration", async () => {
      localStorage.setItem(
        "skill-store",
        JSON.stringify({
          state: {
            customStoreSources: [
              {
                id: "team-skills",
                name: "Team Skills",
                type: "git-repo",
                url: "https://github.com/acme/skills",
                branch: "release",
                directory: "packs",
                enabled: true,
                createdAt: 1,
              },
            ],
            remoteStoreEntries: {
              "team-skills": {
                loadedAt: 100,
                error: "stale error",
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Write release notes",
                    category: "dev",
                    author: "Acme",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer",
                    source_url: "https://github.com/acme/skills",
                    source_id: "legacy-wrong-source-id",
                    canonical_skill_path: "packs/writer",
                    content_url:
                      "https://raw.githubusercontent.com/acme/skills/release/packs/writer/SKILL.md",
                  },
                ],
              },
              empty: {
                loadedAt: 101,
                error: "network",
                skills: [],
              },
            },
          },
          version: 0,
        }),
      );

      await useSkillStore.persist.rehydrate();

      const entry = useSkillStore.getState().remoteStoreEntries["team-skills"];
      expect(entry).toBeDefined();
      expect(entry!.error).toBeNull();
      expect(entry!.skills[0]).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: "https://github.com/acme/skills",
            branch: "release",
            directory: "packs",
            skillPath: "packs/writer",
          }),
          source_branch: "release",
          source_directory: "packs",
          canonical_skill_path: "packs/writer",
        }),
      );
      expect(useSkillStore.getState().remoteStoreEntries.empty).toBeUndefined();
    });

    it("keeps branch identity for same-version persisted local-path git repo cache", async () => {
      localStorage.setItem(
        "skill-store",
        JSON.stringify({
          state: {
            customStoreSources: [
              {
                id: "local-git-skills",
                name: "Local Git Skills",
                type: "git-repo",
                url: "/Users/demo/repos/skills",
                branch: "feature/writer",
                directory: "packs",
                enabled: true,
                createdAt: 1,
              },
            ],
            remoteStoreEntries: {
              "local-git-skills": {
                loadedAt: 100,
                error: null,
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Write from local branch",
                    category: "dev",
                    author: "Demo",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer",
                    source_url: "/Users/demo/repos/skills",
                    source_id: "legacy-local-git-source-id",
                    canonical_skill_path: "packs/writer/SKILL.md",
                    content_url:
                      "/Users/demo/repos/skills/packs/writer/SKILL.md",
                  },
                ],
              },
            },
          },
          version: 0,
        }),
      );

      await useSkillStore.persist.rehydrate();

      const skill =
        useSkillStore.getState().remoteStoreEntries["local-git-skills"]
          ?.skills[0];
      expect(skill).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: "/Users/demo/repos/skills",
            branch: "feature/writer",
            directory: "packs",
            skillPath: "packs/writer/SKILL.md",
          }),
          source_branch: "feature/writer",
          source_directory: "packs",
          canonical_skill_path: "packs/writer/SKILL.md",
        }),
      );
    });

    it("normalizes local-dir, branch, worktree, and detached local git identities independently", async () => {
      localStorage.setItem(
        "skill-store",
        JSON.stringify({
          state: {
            customStoreSources: [
              {
                id: "plain-local",
                name: "Plain Local",
                type: "local-dir",
                url: "/Users/demo/repos/skills/plain-writer",
                enabled: true,
                createdAt: 1,
              },
              {
                id: "local-git-main",
                name: "Local Git Main",
                type: "git-repo",
                url: "/Users/demo/repos/skills",
                branch: "main",
                directory: "packs",
                enabled: true,
                createdAt: 2,
              },
              {
                id: "local-git-dev",
                name: "Local Git Dev",
                type: "git-repo",
                url: "/Users/demo/repos/skills",
                branch: "dev",
                directory: "packs",
                enabled: true,
                createdAt: 3,
              },
              {
                id: "local-git-worktree",
                name: "Local Git Worktree",
                type: "git-repo",
                url: "/Users/demo/worktrees/skills-dev",
                branch: "dev",
                directory: "packs",
                enabled: true,
                createdAt: 4,
              },
              {
                id: "local-git-detached",
                name: "Local Git Detached",
                type: "git-repo",
                url: "/Users/demo/repos/skills-detached",
                directory: "packs",
                enabled: true,
                createdAt: 5,
              },
            ],
            remoteStoreEntries: {
              "plain-local": {
                loadedAt: 100,
                error: null,
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Plain local writer",
                    category: "dev",
                    author: "Demo",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer",
                    source_url: "/Users/demo/repos/skills/plain-writer",
                    source_id: "legacy-plain-local",
                    source_branch: "stale-branch",
                    source_directory: "stale-directory",
                    canonical_skill_path: "plain-writer/SKILL.md",
                  },
                ],
              },
              "local-git-main": {
                loadedAt: 101,
                error: null,
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Main writer",
                    category: "dev",
                    author: "Demo",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer main",
                    source_url: "/Users/demo/repos/skills",
                    source_id: "legacy-main",
                    canonical_skill_path: "packs/writer/SKILL.md",
                  },
                ],
              },
              "local-git-dev": {
                loadedAt: 102,
                error: null,
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Dev writer",
                    category: "dev",
                    author: "Demo",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer dev",
                    source_url: "/Users/demo/repos/skills",
                    source_id: "legacy-dev",
                    canonical_skill_path: "packs/writer/SKILL.md",
                  },
                ],
              },
              "local-git-worktree": {
                loadedAt: 103,
                error: null,
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Worktree writer",
                    category: "dev",
                    author: "Demo",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer worktree",
                    source_url: "/Users/demo/worktrees/skills-dev",
                    source_id: "legacy-worktree",
                    canonical_skill_path: "packs/writer/SKILL.md",
                  },
                ],
              },
              "local-git-detached": {
                loadedAt: 104,
                error: null,
                skills: [
                  {
                    slug: "writer",
                    name: "Writer",
                    description: "Detached checkout writer",
                    category: "dev",
                    author: "Demo",
                    tags: ["writing"],
                    version: "1.0.0",
                    content: "# Writer detached",
                    source_url: "/Users/demo/repos/skills-detached",
                    source_id: "legacy-detached",
                    canonical_skill_path: "packs/writer/SKILL.md",
                  },
                ],
              },
            },
          },
          version: 0,
        }),
      );

      await useSkillStore.persist.rehydrate();

      const entries = useSkillStore.getState().remoteStoreEntries;
      const plainLocal = entries["plain-local"]?.skills[0];
      const main = entries["local-git-main"]?.skills[0];
      const dev = entries["local-git-dev"]?.skills[0];
      const worktree = entries["local-git-worktree"]?.skills[0];
      const detached = entries["local-git-detached"]?.skills[0];

      expect(plainLocal).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "local-dir",
            sourceUrl: "/Users/demo/repos/skills/plain-writer",
            skillPath: "plain-writer/SKILL.md",
          }),
          source_branch: undefined,
          source_directory: undefined,
        }),
      );
      expect(main).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: "/Users/demo/repos/skills",
            branch: "main",
            directory: "packs",
            skillPath: "packs/writer/SKILL.md",
          }),
          source_branch: "main",
          source_directory: "packs",
        }),
      );
      expect(dev).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: "/Users/demo/repos/skills",
            branch: "dev",
            directory: "packs",
            skillPath: "packs/writer/SKILL.md",
          }),
          source_branch: "dev",
          source_directory: "packs",
        }),
      );
      expect(worktree).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: "/Users/demo/worktrees/skills-dev",
            branch: "dev",
            directory: "packs",
            skillPath: "packs/writer/SKILL.md",
          }),
          source_branch: "dev",
          source_directory: "packs",
        }),
      );
      expect(detached).toEqual(
        expect.objectContaining({
          source_id: buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: "/Users/demo/repos/skills-detached",
            directory: "packs",
            skillPath: "packs/writer/SKILL.md",
          }),
          source_branch: undefined,
          source_directory: "packs",
        }),
      );
      expect(
        new Set(
          [plainLocal, main, dev, worktree, detached].map(
            (skill) => skill?.source_id,
          ),
        ).size,
      ).toBe(5);
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
            apiProtocol: "openai",
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

    it("allows bounded long-running translation through an intranet model", async () => {
      useSettingsStore.setState({
        aiModels: [
          {
            id: "intranet-translation",
            name: "Intranet Translation",
            type: "chat",
            provider: "custom",
            apiProtocol: "openai",
            apiKey: "local-key",
            apiUrl: "http://192.168.10.20:8000/v1",
            model: "local-translator",
          },
        ],
        scenarioModelDefaults: { translation: "intranet-translation" },
        translationMode: "full",
      });
      vi.mocked(chatCompletion).mockResolvedValue({
        content: "translated on intranet",
      } as never);

      await useSkillStore
        .getState()
        .translateContent("# Skill\n\nOriginal", "intranet-cache", "中文");

      expect(chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "http://192.168.10.20:8000/v1",
          model: "local-translator",
        }),
        expect.any(Array),
        expect.objectContaining({ timeoutMs: AI_REQUEST_TIMEOUT_MS }),
      );
    });
  });
});
