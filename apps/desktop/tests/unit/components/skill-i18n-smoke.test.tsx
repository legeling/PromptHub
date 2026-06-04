import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installWindowMocks } from "../../helpers/window";

import en from "../../../src/renderer/i18n/locales/en.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";
import zhTw from "../../../src/renderer/i18n/locales/zh-TW.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import de from "../../../src/renderer/i18n/locales/de.json";
import es from "../../../src/renderer/i18n/locales/es.json";
import type { ScannedSkill, Skill } from "@prompthub/shared/types";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { SkillManager } from "../../../src/renderer/components/skill/SkillManager";
import { SkillPlatformPanel } from "../../../src/renderer/components/skill/SkillPlatformPanel";
import { SkillScanPreview } from "../../../src/renderer/components/skill/SkillScanPreview";
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

function interpolate(
  template: string,
  values: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    String(values[key] ?? ""),
  );
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
  DEFAULT_SKILL_LIST_PAGE_SIZE: 10,
  SKILL_LIST_PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
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

function createSkillStoreState(
  overrides: Partial<Record<string, unknown>> = {},
) {
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
    galleryColumns: "auto",
    setViewMode: vi.fn(),
    setGalleryColumns: vi.fn(),
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
    getInstalledSkillSourceUpdateStatus: vi.fn().mockResolvedValue(null),
    updateInstalledSkillFromSource: vi.fn().mockResolvedValue(null),
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
    projectScanState: {},
    scanProjectSkills: vi.fn().mockResolvedValue([]),
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
    projectSkillImportModePreference: "copy",
    projectSkillImportPreferencesByProjectId: {},
    setProjectSkillImportModePreference: vi.fn(),
    setProjectSkillImportPreferences: vi.fn(),
    skillListPageSize: 10,
    setSkillListPageSize: vi.fn(),
    autoScanInstalledSkills: false,
    aiModels: [],
    updateSkillProject: vi.fn(),
    ...overrides,
  };
}

function bindStoreSelector<TState extends Record<string, unknown>>(
  state: TState,
) {
  return (selector?: ((value: TState) => unknown) | undefined) =>
    typeof selector === "function" ? selector(state) : state;
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
    const expectedKeys = flattenKeys(
      (en as TranslationTree).skill as TranslationTree,
    );

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
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
  });

  it("renders skill manager actions in english and updates selection summary", async () => {
    const skillStoreState = createSkillStoreState();
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    expect(screen.getByTestId("skill-view-transition")).toHaveAttribute(
      "data-skill-view",
      "my-skills",
    );
    expect(screen.getByTestId("skill-view-transition")).toHaveClass(
      "animate-in",
      "fade-in",
      "slide-in-from-right-3",
      "duration-smooth",
    );
    expect(
      screen.getByRole("button", { name: "Batch Manage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manage all imported skills in one place, regardless of where they came from.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Batch Manage" }));

    expect(screen.getByText("Batch Mode")).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batch Manage" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Select All" }));

    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Batch Deploy" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Batch Manage" }));

    expect(screen.queryByText("Batch Mode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batch Deploy" }),
    ).not.toBeInTheDocument();
  });

  it("removes legacy toolbar local scan and keeps refresh spinner scoped to refresh", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    const loadSkills = vi.fn().mockResolvedValue(undefined);
    const loadDeployedStatus = vi.fn().mockResolvedValue(undefined);
    const skillStoreState = createSkillStoreState({
      isLoading: true,
      loadSkills,
      loadDeployedStatus,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    expect(screen.queryByTitle(/Scan Local/)).not.toBeInTheDocument();

    const refreshButton = screen.getByTitle(
      /Reload the PromptHub Skill library/i,
    );
    expect(refreshButton.innerHTML).not.toContain("animate-spin");
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(loadSkills).toHaveBeenCalled();
      expect(loadDeployedStatus).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        "Skill library refreshed",
        "success",
      );
    });
  });

  it("keeps the scan preview usable when a modal rescan times out", async () => {
    const scannedSkill: ScannedSkill = {
      name: "local-helper",
      description: "Local helper",
      author: "Local",
      tags: ["local"],
      instructions: "# Local Helper",
      filePath: "/Users/demo/skills/local-helper/SKILL.md",
      localPath: "/Users/demo/skills/local-helper",
      platforms: ["Claude"],
    };
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    const onRescan = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => {
            showToast(
              "Local skill scan timed out. Check whether an agent folder is inaccessible, then try again.",
              "error",
            );
            resolve(false);
          }, 30_000);
        }),
    );

    render(
      <SkillScanPreview
        scannedSkills={[scannedSkill]}
        installedPaths={new Set()}
        onImport={vi.fn().mockResolvedValue(0)}
        onRescan={onRescan}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Scan Preview")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Select All"));
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeChecked();
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: /Re-?scan/i }));

      await act(async () => {
        vi.advanceTimersByTime(30_001);
        await Promise.resolve();
      });

      expect(showToast).toHaveBeenCalledWith(
        "Local skill scan timed out. Check whether an agent folder is inaccessible, then try again.",
        "error",
      );
      expect(onRescan).toHaveBeenCalledWith([]);
      expect(screen.getByRole("checkbox")).toBeChecked();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets users choose the skill gallery card column count", async () => {
    const setGalleryColumns = vi.fn();
    const skillStoreState = createSkillStoreState({ setGalleryColumns });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    fireEvent.click(screen.getByRole("button", { name: "Skill card columns" }));
    fireEvent.click(screen.getByRole("button", { name: "6 columns" }));

    expect(setGalleryColumns).toHaveBeenCalledWith("6");
  });

  it("shows deployed and pending as My Skills header filters", async () => {
    const setFilterType = vi.fn();
    const setStoreView = vi.fn();
    const selectSkill = vi.fn();
    const skillStoreState = createSkillStoreState({
      deployedSkillNames: new Set<string>([baseSkill.id]),
      selectSkill,
      setFilterType,
      setStoreView,
      skills: [
        baseSkill,
        {
          ...baseSkill,
          id: "skill-local",
          name: "local-only",
          is_favorite: true,
          registry_slug: undefined,
          installed_version: undefined,
        },
      ],
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    const allSkillsFilter = screen.getByRole("button", {
      name: /All Skills\s*2/i,
    });
    expect(allSkillsFilter).toBeInTheDocument();
    expect(allSkillsFilter).toHaveClass("h-9", "min-w-[8rem]");
    expect(
      screen.getByRole("button", { name: /Distributed\s*1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pending\s*1/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Distributed\s*1/i }));

    expect(setStoreView).toHaveBeenCalledWith("my-skills");
    expect(setFilterType).toHaveBeenCalledWith("deployed");
    expect(selectSkill).toHaveBeenCalledWith(null);
  });

  it("filters My Skills by source badge from the header dropdown", async () => {
    const skillStoreState = createSkillStoreState({
      skills: [
        {
          ...baseSkill,
          id: "skill-claude",
          name: "claude-store-skill",
          source_label: "anthropics/skills",
          source_url:
            "https://github.com/anthropics/skills/tree/main/skills/writer",
        },
        {
          ...baseSkill,
          id: "skill-github",
          name: "github-import-skill",
          registry_slug: undefined,
          installed_version: undefined,
          source_label: undefined,
          source_url: "https://github.com/demo/skills/tree/main/writer",
        },
        {
          ...baseSkill,
          id: "skill-agent",
          name: "agent-import-skill",
          registry_slug: undefined,
          installed_version: undefined,
          source_label: "Claude Code",
          source_url: "/Users/demo/.claude/skills/agent-import-skill",
        },
      ],
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    expect(screen.getByText("claude-store-skill")).toBeInTheDocument();
    expect(screen.getByText("github-import-skill")).toBeInTheDocument();
    expect(screen.getByText("agent-import-skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skill source" }));
    fireEvent.click(screen.getByRole("button", { name: /GitHub Import\s*1/i }));

    expect(screen.queryByText("claude-store-skill")).not.toBeInTheDocument();
    expect(screen.getByText("github-import-skill")).toBeInTheDocument();
    expect(screen.queryByText("agent-import-skill")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skill source" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Claude Code Store\s*1/i }),
    );

    expect(screen.getByText("claude-store-skill")).toBeInTheDocument();
    expect(screen.queryByText("github-import-skill")).not.toBeInTheDocument();
    expect(screen.queryByText("agent-import-skill")).not.toBeInTheDocument();
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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    expect(
      screen.getByRole("button", { name: "Snapshot" }),
    ).toBeInTheDocument();
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
    const notesCard = screen.getByTestId("skill-user-notes-card");
    expect(notesCard).toBeInTheDocument();
    expect(within(notesCard).queryByText("Personal Notes")).toBeNull();
    expect(skillStoreState.syncSkillFromRepo).toHaveBeenCalledWith(
      baseSkill.id,
    );
    expect(screen.getByText("Imported from Local Folder")).toBeInTheDocument();
    expect(screen.queryByText("源码/内容")).not.toBeInTheDocument();
    expect(screen.queryByText("批量管理")).not.toBeInTheDocument();
  });

  it("saves personal skill notes to .prompthub/user.json without updating skill metadata", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Write helper",
      instructions: "---\ndescription: Write helper\n---\n\n# Write",
      content: "---\ndescription: Write helper\n---\n\n# Write",
    };
    const updateSkill = vi.fn().mockResolvedValue(undefined);
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(syncedSkill),
      updateSkill,
    });
    const settingsState = createSettingsState();
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const createLocalDir = vi.fn().mockResolvedValue(undefined);

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi.fn().mockResolvedValue(baseSkill.local_repo_path),
          readLocalFile: vi.fn().mockResolvedValue(null),
          createLocalDir,
          writeLocalFile,
        },
      },
    });

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    const notesSection = screen.getByText("Personal Notes").closest("section");
    expect(notesSection).not.toBeNull();
    fireEvent.click(
      within(notesSection as HTMLElement).getByTitle("Edit notes"),
    );
    fireEvent.change(
      within(notesSection as HTMLElement).getByPlaceholderText(
        "Add private notes about how you use this skill...",
      ),
      {
        target: {
          value:
            "Use for long-form writing.\n'; DROP TABLE skills; -- <b>safe</b> 📝",
        },
      },
    );
    fireEvent.click(within(notesSection as HTMLElement).getByTitle("Save"));

    await waitFor(() => {
      expect(createLocalDir).toHaveBeenCalledWith(
        baseSkill.id,
        ".prompthub",
      );
      expect(writeLocalFile).toHaveBeenCalledWith(
        baseSkill.id,
        ".prompthub/user.json",
        expect.stringContaining("Use for long-form writing."),
        { skipVersionSnapshot: true },
      );
    });
    expect(updateSkill).not.toHaveBeenCalled();
    expect(skillStoreState.syncSkillFromRepo).toHaveBeenCalledWith(
      baseSkill.id,
    );
  });

  it("checks and applies source updates from installed GitHub skill detail", async () => {
    const githubSkill = {
      ...baseSkill,
      source_url: "https://github.com/example/skills/tree/main/write",
      content_url:
        "https://raw.githubusercontent.com/example/skills/main/write/SKILL.md",
    };
    const updateCheck = {
      status: "update-available",
      installedSkill: githubSkill,
      registrySkill: {
        slug: "write",
        name: "write",
        description: "Write better",
        category: "general",
        author: "PromptHub",
        source_url: githubSkill.source_url,
        content_url: githubSkill.content_url,
        tags: ["general"],
        version: "source",
        content: "# Write\n\nRemote",
      },
      remoteHash: "remote-hash",
      remoteContent: "# Write\n\nRemote",
      localModified: false,
      remoteChanged: true,
    };
    const getInstalledSkillSourceUpdateStatus = vi
      .fn()
      .mockResolvedValue(updateCheck);
    const updateInstalledSkillFromSource = vi.fn().mockResolvedValue({
      status: "updated",
      skill: githubSkill,
      check: { ...updateCheck, status: "up-to-date" },
    });
    const skillStoreState = createSkillStoreState({
      skills: [githubSkill],
      selectedSkillId: githubSkill.id,
      getInstalledSkillSourceUpdateStatus,
      updateInstalledSkillFromSource,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Check Updates" }));

    await waitFor(() => {
      expect(getInstalledSkillSourceUpdateStatus).toHaveBeenCalledWith(
        githubSkill.id,
      );
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Update from Source" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Update from Source" }));

    await waitFor(() => {
      expect(updateInstalledSkillFromSource).toHaveBeenCalledWith(
        githubSkill.id,
      );
    });
  });

  it("shows project deployment actions for normal library skills", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/workspace/.agents/skills/write");
    const getRepoPath = vi.fn().mockResolvedValue("/Users/demo/skills/write");
    const scanProjectSkills = vi.fn().mockResolvedValue([]);
    const syncedSkill = {
      ...baseSkill,
      description: "Write helper",
      instructions: "---\ndescription: Write helper\n---\n\n# Write",
      content: "---\ndescription: Write helper\n---\n\n# Write",
    };
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(syncedSkill),
      projectScanState: {
        "project-1": {
          scannedSkills: [],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills,
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
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [{ id: "claude", name: "Claude Code" }],
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
      uninstalledPlatforms: [{ id: "claude", name: "Claude Code" }],
    });

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));
    installWindowMocks({
      api: {
        skill: {
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
    });

    await act(async () => {
      render(<SkillFullDetailPage />);
    });

    expect(
      screen.getByRole("button", { name: "Project Distribution" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Project Distribution" }),
    );
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    const advancedSettingsButton = screen.getByRole("button", {
      name: /Advanced Import Settings/,
    });
    fireEvent.click(advancedSettingsButton);
    const advancedSettings = advancedSettingsButton.closest("div");
    expect(advancedSettings).not.toBeNull();
    expect(
      within(advancedSettings as HTMLElement).getByRole("button", {
        name: /^Copy$/,
      }),
    ).toBeInTheDocument();
    expect(
      within(advancedSettings as HTMLElement).getByRole("button", {
        name: /^Symlink$/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Workspace"));
    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(getRepoPath).toHaveBeenCalledWith(baseSkill.id);
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/write",
        "write",
        "/tmp/workspace/.agents/skills",
        { ifExists: "skip", mode: "copy" },
      );
      expect(scanProjectSkills).toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-1" }),
      );
    });
  });

  it("renders project skill preview without leaking raw SKILL.md into the preview sidebar", async () => {
    const projectSkill = {
      ...baseSkill,
      id: "project:/tmp/demo/project-skill",
      name: "project-skill",
      local_repo_path: "/tmp/demo/project-skill",
      source_url: "/tmp/demo/project-skill",
      instructions:
        "---\ndescription: Project helper\n---\n\n# Project Helper\n\nDo project work.",
      content:
        "---\ndescription: Project helper\n---\n\n# Project Helper\n\nDo project work.",
      description: "Project helper",
    };
    const onImport = vi.fn();
    const skillStoreState = createSkillStoreState({
      selectedSkillId: null,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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
            },
          }}
          projectActions={{
            onImport,
            onDeployToProjectTargets: vi.fn(),
            onAddDeployTarget: vi.fn(),
          }}
        />,
      );
    });

    expect(
      screen.getByRole("button", { name: "Import to My Skills" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Deploy project-skill to Project Folders",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Project helper")).toBeInTheDocument();
    expect(screen.queryByText("SKILL.md Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Metadata")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Import to My Skills" }),
    );
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("defaults to saved translation and toggles back to original content", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Write helper",
      instructions:
        "---\ndescription: Write helper\n---\n\n# Write\n\nHelp the user write better.",
      content:
        "---\ndescription: Write helper\n---\n\n# Write\n\nHelp the user write better.",
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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));
    window.api.skill.getRepoPath = vi
      .fn()
      .mockResolvedValue(baseSkill.local_repo_path);
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
  }, 15000);

  it("prompts to retranslate when the saved translation is stale", async () => {
    const syncedSkill = {
      ...baseSkill,
      description: "Updated helper",
      instructions:
        "---\ndescription: Updated helper\n---\n\n# Write\n\nUpdated content",
      content:
        "---\ndescription: Updated helper\n---\n\n# Write\n\nUpdated content",
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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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
    expect(
      screen.queryByText("Translated skill content"),
    ).not.toBeInTheDocument();
  });

  it("shows a clear configuration error when no usable translation model is configured", async () => {
    const translateContent = vi
      .fn()
      .mockRejectedValue(new Error("AI_NOT_CONFIGURED"));
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
      translateContent,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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
    const settingsState = createSettingsState({
      skillInstallMethod: "symlink",
    });

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));
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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

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
        projectDeployMode="copy"
        installProgress={null}
        isBatchInstalling={false}
        onBatchInstall={vi.fn()}
        selectedPlatforms={new Set<string>()}
        selectedSkill={baseSkill}
        selectAllPlatforms={vi.fn()}
        deselectAllPlatforms={vi.fn()}
        setInstallMode={vi.fn()}
        setProjectDeployMode={vi.fn()}
        skillMdInstallStatus={{}}
        t={translate as any}
        togglePlatformSelection={vi.fn()}
        uninstallFromPlatform={vi.fn()}
        uninstalledPlatforms={[]}
        projects={[]}
        onCreateProject={vi.fn()}
        onDeployToProjects={vi.fn()}
        getProjectDeployTargets={() => []}
      />,
    );

    expect(
      screen.getByRole("button", { name: /SKILL\.md/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ZIP/i })).toBeInTheDocument();
    expect(screen.queryByText("JSON")).not.toBeInTheDocument();
  });

  it("keeps web runtime skill surfaces visible without forcing My Skills", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;

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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    const { unmount } = render(<SkillManager />);

    expect(setStoreView).not.toHaveBeenCalledWith("my-skills");
    expect(setFilterType).not.toHaveBeenCalledWith("all");
    expect(screen.getByTestId("skill-view-transition")).toHaveAttribute(
      "data-skill-view",
      "store",
    );
    expect(screen.getByTestId("skill-view-transition")).toHaveClass(
      "animate-in",
      "fade-in",
      "slide-in-from-right-3",
      "duration-smooth",
    );
    expect(await screen.findByText("Official Store")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batch Deploy" }),
    ).not.toBeInTheDocument();

    unmount();

    await act(async () => {
      render(<SkillFullDetailPage />);
      await Promise.resolve();
    });

    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("write")).toBeInTheDocument();
  });

  it("paginates large skill lists", async () => {
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

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    expect(screen.getAllByText("1-10 / 129").length).toBeGreaterThan(0);
    expect(screen.getByText("skill-0")).toBeInTheDocument();
    expect(screen.queryByText("skill-10")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getAllByText("11-20 / 129").length).toBeGreaterThan(0);
    expect(screen.getByText("skill-10")).toBeInTheDocument();
  });
});
