import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installWindowMocks } from "../../helpers/window";

import en from "../../../src/renderer/i18n/locales/en.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";
import zhTw from "../../../src/renderer/i18n/locales/zh-TW.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import de from "../../../src/renderer/i18n/locales/de.json";
import es from "../../../src/renderer/i18n/locales/es.json";
import type { Skill } from "@prompthub/shared/types";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { SkillManager } from "../../../src/renderer/components/skill/SkillManager";
import { SkillPlatformPanel } from "../../../src/renderer/components/skill/SkillPlatformPanel";
import { computeSkillContentFingerprint } from "../../../src/renderer/services/skill-store-update";

type TranslationTree = Record<string, unknown>;

function getPathValue(source: TranslationTree, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as TranslationTree)[segment];
  }, source);
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
}

function flattenKeys(source: TranslationTree, prefix = ""): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as TranslationTree, nextPrefix);
    }
    return [nextPrefix];
  });
}

function translate(
  key: string,
  defaultValueOrOptions?: string | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>,
): string {
  const options =
    typeof defaultValueOrOptions === "object" && defaultValueOrOptions !== null
      ? defaultValueOrOptions
      : maybeOptions || {};
  const defaultValue =
    typeof defaultValueOrOptions === "string"
      ? defaultValueOrOptions
      : typeof options.defaultValue === "string"
        ? options.defaultValue
        : key;
  const value = getPathValue(en as TranslationTree, key);
  const template = typeof value === "string" ? value : defaultValue;
  return interpolate(template, options);
}

const useSkillStoreMock = vi.fn();
const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const useSkillPlatformMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
    i18n: { language: "en" },
  }),
}));

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSkillStoreMock(selector),
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/components/skill/use-skill-platform", () => ({
  useSkillPlatform: (...args: unknown[]) => useSkillPlatformMock(...args),
}));

const baseSkill: Skill = {
  id: "skill-write",
  name: "write",
  description: "Write better",
  instructions: "# Write\n\nHelp the user write better.",
  content: "# Write\n\nHelp the user write better.",
  protocol_type: "skill",
  author: "Local",
  local_repo_path: "/Users/demo/skills/write",
  tags: ["general"],
  is_favorite: false,
  currentVersion: 0,
  registry_slug: "write",
  installed_version: "1.0.0",
  created_at: Date.now(),
  updated_at: Date.now(),
};

function createSkillStoreState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    skills: [baseSkill],
    loadSkills: vi.fn().mockResolvedValue(undefined),
    loadRegistry: vi.fn().mockResolvedValue(undefined),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    updateSkill: vi.fn().mockResolvedValue(undefined),
    syncSkillFromRepo: vi.fn().mockResolvedValue(null),
    isLoading: false,
    selectedSkillId: null,
    selectSkill: vi.fn(),
    filterType: "all",
    searchQuery: "",
    viewMode: "gallery",
    setViewMode: vi.fn(),
    storeView: "my-skills",
    setStoreView: vi.fn(),
    storeCategory: "all",
    setFilterType: vi.fn(),
    setStoreCategory: vi.fn(),
    storeSearchQuery: "",
    setStoreSearchQuery: vi.fn(),
    deployedSkillNames: new Set<string>(),
    loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
    filterTags: [],
    installRegistrySkill: vi.fn().mockResolvedValue(undefined),
    scanLocalPreview: vi.fn().mockResolvedValue([]),
    selectRegistrySkill: vi.fn(),
    selectedRegistrySlug: null,
    registrySkills: [],
    selectedStoreSourceId: "official",
    selectStoreSource: vi.fn(),
    customStoreSources: [],
    addCustomStoreSource: vi.fn(),
    removeCustomStoreSource: vi.fn(),
    toggleCustomStoreSource: vi.fn(),
    remoteStoreEntries: {},
    setRemoteStoreEntry: vi.fn(),
    importScannedSkills: vi.fn().mockResolvedValue({ importedCount: 0 }),
    translateContent: vi.fn().mockResolvedValue(undefined),
    getTranslationState: vi.fn().mockReturnValue({
      value: null,
      hasTranslation: false,
      isStale: false,
    }),
    getTranslation: vi.fn().mockReturnValue(null),
    clearTranslation: vi.fn(),
    ...overrides,
  };
}

function createSettingsState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customAgents: [],
    customAgentRootPaths: [],
    customSkillScanPaths: [],
    translationMode: "full",
    skillInstallMethod: "symlink",
    skillProjects: [],
    updateSkillProject: vi.fn(),
    ...overrides,
  };
}

describe("skill i18n smoke", () => {
  it("keeps all locale skill keys aligned with english", () => {
    const locales = {
      zh,
      "zh-TW": zhTw,
      ja,
      fr,
      de,
      es,
    } as const;
    const expectedKeys = flattenKeys((en as TranslationTree).skill as TranslationTree);

    for (const [locale, messages] of Object.entries(locales)) {
      const actualKeys = new Set(
        flattenKeys((messages as TranslationTree).skill as TranslationTree),
      );
      const missing = expectedKeys.filter((key) => !actualKeys.has(key));
      expect(missing, `${locale} is missing skill keys`).toEqual([]);
    }
  });

  it("keeps project navigation keys aligned across locales", () => {
    const locales = {
      zh,
      "zh-TW": zhTw,
      ja,
      fr,
      de,
      es,
    } as const;
    const requiredKeys = [
      "nav.projects",
      "header.searchProjectSkills",
      "header.resultsCount",
      "settings.homebrewUpdateHint",
      "settings.homebrewUpdateRequired",
      "settings.openReleasesPage",
    ];

    for (const [locale, messages] of Object.entries(locales)) {
      for (const key of requiredKeys) {
        expect(
          getPathValue(messages as TranslationTree, key),
          `${locale} is missing ${key}`,
        ).toEqual(expect.any(String));
      }
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:skill-export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [],
      batchInstall: vi.fn().mockResolvedValue({
        successCount: 0,
        totalCount: 0,
        failures: [],
        fallbacks: [],
      }),
      deselectAllPlatforms: vi.fn(),
      installProgress: null,
      installStatus: {},
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
      uninstalledPlatforms: [],
    });

    installWindowMocks({
      api: {
        skill: {
          export: vi.fn().mockResolvedValue("---\nname: write\n---\n# Write"),
          exportZip: vi.fn().mockResolvedValue({
            fileName: "write.zip",
            base64: "UEsDBA==",
          }),
          readLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "SKILL.md",
              content: "---\ndescription: Write helper\n---\n\n# Write",
              isDirectory: false,
            },
          ]),
          fetchRemoteContent: vi.fn().mockResolvedValue("{}"),
        },
        settings: {
          get: vi.fn().mockResolvedValue({
            device: {
              storeAutoSync: false,
              storeSyncCadence: "1d",
            },
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__;
  });

  it("renders skill manager actions in english and updates selection summary", async () => {
    const skillStoreState = createSkillStoreState();
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    render(<SkillManager />);

    expect(screen.getByRole("button", { name: "Batch Manage" })).toBeInTheDocument();
    expect(
      screen.getByText("Manage all imported skills in one place, regardless of where they came from."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Batch Manage" }));

    expect(screen.getByText("Batch Mode")).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select All" }));

    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Batch Deploy" })).toBeInTheDocument();
  });

  it("shows an update pulse for store-installed skills when a remote store version is newer", async () => {
    const skillStoreState = createSkillStoreState({
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "write",
              name: "Write",
              description: "Write better",
              category: "general",
              author: "PromptHub",
              source_url: "https://github.com/example/write",
              tags: ["general"],
              version: "1.1.0",
              content: "# Write",
            },
          ],
        },
      },
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    render(<SkillManager />);

    expect(screen.getAllByText("Update available").length).toBeGreaterThan(0);
  });

  it("does not show an update pulse for local-only skills", async () => {
    const skillStoreState = createSkillStoreState({
      skills: [
        {
          ...baseSkill,
          registry_slug: undefined,
          installed_version: undefined,
        },
      ],
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "write",
              name: "Write",
              description: "Write better",
              category: "general",
              author: "PromptHub",
              source_url: "https://github.com/example/write",
              tags: ["general"],
              version: "1.1.0",
              content: "# Write",
            },
          ],
        },
      },
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    render(<SkillManager />);

    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });

  it("renders skill detail page chrome in english without chinese fallback text", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Write helper",
      instructions: "---\ndescription: Write helper\n---\n\n# Write",
      content: "---\ndescription: Write helper\n---\n\n# Write",
    };
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(syncedSkill),
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    expect(screen.getByRole("button", { name: "Snapshot" })).toBeInTheDocument();
    expect(screen.getByText("Current Version v0")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Platform Integration")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Write helper")).toBeInTheDocument();
    });
    expect(skillStoreState.syncSkillFromRepo).toHaveBeenCalledWith(baseSkill.id);
    expect(screen.getByText("Imported from Local Folder")).toBeInTheDocument();
    expect(screen.queryByText("源码/内容")).not.toBeInTheDocument();
    expect(screen.queryByText("批量管理")).not.toBeInTheDocument();
  });

  it("shows project deployment actions for normal library skills", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Write helper",
      instructions: "---\ndescription: Write helper\n---\n\n# Write",
      content: "---\ndescription: Write helper\n---\n\n# Write",
    };
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(syncedSkill),
    });
    const settingsState = createSettingsState({
      skillProjects: [
        {
          id: "project-1",
          name: "Workspace",
          rootPath: "/tmp/workspace",
          scanPaths: [],
          deployTargets: ["/tmp/workspace/.agents/skills"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    });

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    expect(screen.getByText("Project Deployment")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    ).toBeInTheDocument();
  });

  it("renders project skill preview without leaking raw SKILL.md into the preview sidebar", async () => {
    const projectSkill = {
      ...baseSkill,
      id: "project:/tmp/demo/project-skill",
      name: "project-skill",
      local_repo_path: "/tmp/demo/project-skill",
      source_url: "/tmp/demo/project-skill",
      instructions: "---\ndescription: Project helper\n---\n\n# Project Helper\n\nDo project work.",
      content: "---\ndescription: Project helper\n---\n\n# Project Helper\n\nDo project work.",
      description: "Project helper",
    };
    const onImport = vi.fn();
    const skillStoreState = createSkillStoreState({
      selectedSkillId: null,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: projectSkill.instructions,
          }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    await act(async () => {
      render(
        <SkillFullDetailPage
          overrideSkill={projectSkill}
          projectContext={{
            projectName: "Demo Project",
            projectRootPath: "/tmp/demo",
            projectDeployTargets: ["/tmp/demo/.agents/skills"],
            scannedSkill: {
              name: "project-skill",
              description: "Project helper",
              author: "Demo Project",
              tags: [],
              instructions: projectSkill.instructions,
              filePath: "/tmp/demo/project-skill/SKILL.md",
              localPath: "/tmp/demo/project-skill",
              platforms: [],
            }}
          }
          projectActions={{ onImport, onDeployToProjectTargets: vi.fn(), onAddDeployTarget: vi.fn() }}
        />,
      );
    });

    expect(screen.getByRole("button", { name: "Import to My Skills" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deploy project-skill to Project Folders" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Project helper")).toBeInTheDocument();
    expect(screen.queryByText("SKILL.md Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Metadata")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import to My Skills" }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("defaults to saved translation and toggles back to original content", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Write helper",
      instructions: "---\ndescription: Write helper\n---\n\n# Write\n\nHelp the user write better.",
      content: "---\ndescription: Write helper\n---\n\n# Write\n\nHelp the user write better.",
    };
    const sourceFingerprint = computeSkillContentFingerprint(
      syncedSkill.instructions,
    );
    const getTranslationState = vi.fn().mockReturnValue({
      value: null,
      hasTranslation: false,
      isStale: false,
    });
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(syncedSkill),
      getTranslationState,
    });
    const settingsState = createSettingsState({ translationMode: "full" });

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));
    window.api.skill.getRepoPath = vi.fn().mockResolvedValue(baseSkill.local_repo_path);
    window.api.skill.readLocalFile = vi.fn(async (_skillId, relativePath) => {
      if (relativePath === ".prompthub/translations/English/full/meta.json") {
        return {
          path: relativePath,
          isDirectory: false,
          content: JSON.stringify({
            schemaVersion: 1,
            sourceFile: "SKILL.md",
            sourceFingerprint,
            targetLanguage: "English",
            translationMode: "full",
            translatedAt: Date.now(),
          }),
        };
      }

      if (relativePath === ".prompthub/translations/English/full/SKILL.md") {
        return {
          path: relativePath,
          isDirectory: false,
          content:
            "---\ndescription: Write helper\n---\n\n# Write\n\nTranslated skill content from sidecar",
        };
      }

      return null;
    });

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Translated skill content from sidecar"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Write helper")).toBeInTheDocument();

    const toggleButton = screen.getByRole("button", { name: "Show Original" });
    expect(toggleButton.className).toContain("bg-primary/10");

    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Show Translation" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Help the user write better.")).toBeInTheDocument();
  });

  it("prompts to retranslate when the saved translation is stale", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Updated helper",
      instructions: "---\ndescription: Updated helper\n---\n\n# Write\n\nUpdated content",
      content: "---\ndescription: Updated helper\n---\n\n# Write\n\nUpdated content",
    };
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(syncedSkill),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: true,
        isStale: true,
      }),
    });
    const settingsState = createSettingsState({ translationMode: "full" });

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Saved translation is outdated"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "This skill's SKILL.md changed after the last translation. Retranslate now?",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Translated skill content")).not.toBeInTheDocument();
  });

  it("shows a clear configuration error when no usable translation model is configured", async () => {
    const translateContent = vi.fn().mockRejectedValue(new Error("AI_NOT_CONFIGURED"));
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
      translateContent,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: "AI Translate" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "No usable AI translation model is configured. Please configure a chat model in Settings, or fix the selected translation model.",
        "error",
      );
    });
  });

  it("shows a clear timeout error when translation request returns 504", async () => {
    const translateContent = vi
      .fn()
      .mockRejectedValue(new Error("API 请求失败 (504)"));
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
      translateContent,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: "AI Translate" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "The AI service timed out while translating. Please try again in a moment, or switch to a faster / more stable model endpoint.",
        "error",
      );
    });
  });

  it("warns when symlink install falls back to copy mode", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
    });
    const settingsState = createSettingsState({ skillInstallMethod: "symlink" });

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [{ id: "claude", name: "Claude Code" }],
      batchInstall: vi.fn().mockResolvedValue({
        successCount: 1,
        totalCount: 1,
        failures: [],
        fallbacks: [
          {
            platformId: "claude",
            requestedMode: "symlink",
            effectiveMode: "copy",
            reason: "EPERM: operation not permitted",
          },
        ],
      }),
      deselectAllPlatforms: vi.fn(),
      installProgress: null,
      installStatus: {},
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(["claude"]),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
      uninstalledPlatforms: [{ id: "claude", name: "Claude Code" }],
    });

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Install All" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Symlink was not available for some platforms. PromptHub used copy install instead.\nClaude Code: switched to copy install (EPERM: operation not permitted)",
        "warning",
      );
    });
  });

  it("exports a full local repo zip from the detail panel", async () => {
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
    });
    const settingsState = createSettingsState();
    const originalCreateElement = document.createElement.bind(document);

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    const anchor = originalCreateElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName) => {
        if (tagName === "a") {
          return anchor;
        }
        return originalCreateElement(tagName);
      });

    fireEvent.click(screen.getByRole("button", { name: "ZIP" }));

    await waitFor(() => {
      expect(window.api.skill.exportZip).toHaveBeenCalledWith(baseSkill.id);
    });
    expect(anchor.download).toBe("write.zip");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(removeChild).toHaveBeenCalledWith(anchor);

    createElementSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("renders zip as the primary archive export in the platform panel", () => {
    render(
      <SkillPlatformPanel
        availablePlatforms={[]}
        handleExport={vi.fn()}
        installMode="symlink"
        installProgress={null}
        isBatchInstalling={false}
        onBatchInstall={vi.fn()}
        selectedPlatforms={new Set<string>()}
        selectedSkill={baseSkill}
        selectAllPlatforms={vi.fn()}
        deselectAllPlatforms={vi.fn()}
        setInstallMode={vi.fn()}
        skillMdInstallStatus={{}}
        t={translate as any}
        togglePlatformSelection={vi.fn()}
        uninstallFromPlatform={vi.fn()}
        uninstalledPlatforms={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /SKILL\.md/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ZIP/i })).toBeInTheDocument();
    expect(screen.queryByText("JSON")).not.toBeInTheDocument();
  });

  it("hides desktop-only skill surfaces in web runtime", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ = true;

    const setStoreView = vi.fn();
    const setFilterType = vi.fn();
    const skillStoreState = createSkillStoreState({
      storeView: "store",
      filterType: "pending",
      setStoreView,
      setFilterType,
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    const { unmount } = render(<SkillManager />);

    await waitFor(() => {
      expect(setStoreView).toHaveBeenCalledWith("my-skills");
    });
    await waitFor(() => {
      expect(setFilterType).toHaveBeenCalledWith("all");
    });
    expect(screen.queryByText("Skill Store")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Batch Deploy" })).not.toBeInTheDocument();

    unmount();

    await act(async () => {
      render(<SkillFullDetailPage />);
      await Promise.resolve();
    });

    expect(screen.queryByText("Files")).not.toBeInTheDocument();
    expect(screen.queryByText("Platform Integration")).not.toBeInTheDocument();
    expect(screen.getByText("Skill Workspace")).toBeInTheDocument();
  });

  it("finishes progressive rendering for large skill lists", async () => {
    const manySkills: Skill[] = Array.from({ length: 129 }, (_, index) => ({
      ...baseSkill,
      id: `skill-${index}`,
      name: `skill-${index}`,
      description: `Skill ${index}`,
      created_at: Date.now() + index,
      updated_at: Date.now() + index,
    }));

    const skillStoreState = createSkillStoreState({
      skills: manySkills,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    render(<SkillManager />);

    expect(screen.getByText("Rendering 120/129 in chunks")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.queryByText("Rendering 120/129 in chunks"),
      ).not.toBeInTheDocument();
    });
  });
});
