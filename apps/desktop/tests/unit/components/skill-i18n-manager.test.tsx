import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
  });

  it("loads local Skill metadata without preloading remote stores", async () => {
    const loadRegistry = vi.fn().mockResolvedValue(undefined);
    const fetchRemoteContent = vi.fn().mockResolvedValue("{}");
    const getSettings = vi.fn().mockResolvedValue({
      device: { storeAutoSync: true, storeSyncCadence: "1d" },
    });
    const skillStoreState = createSkillStoreState({ loadRegistry });

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(
      bindStoreSelector(createSettingsState()),
    );
    window.api.skill.fetchRemoteContent = fetchRemoteContent;
    window.api.settings.get = getSettings;

    render(<SkillManager />);

    await waitFor(() => expect(loadRegistry).toHaveBeenCalledOnce());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchRemoteContent).not.toHaveBeenCalled();
    expect(getSettings).not.toHaveBeenCalled();
  });

  it("renders skill manager actions in english and updates selection summary", async () => {
    const skillStoreState = createSkillStoreState({
      deployedSkillNames: new Set([baseSkill.id]),
    });
    const settingsState = createSettingsState();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));
    window.api.skill.getMdInstallStatusDetails = vi.fn().mockResolvedValue({
      claude: { installed: true, mode: "copy" },
    });

    render(
      <form onSubmit={onSubmit}>
        <SkillManager />
      </form>,
    );

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
    const batchManage = screen.getByRole("button", { name: "Batch Manage" });
    expect(batchManage).toHaveAttribute("aria-label", "Batch Manage");
    const galleryView = screen.getByTitle("Gallery View");
    const listView = screen.getByTitle("List View");
    const refreshLibrary = screen.getByTitle(
      /Reload the PromptHub Skill library/i,
    );

    for (const button of [batchManage, galleryView, listView, refreshLibrary]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
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

    const selectAll = screen.getByRole("button", { name: "Select All" });
    expect(selectAll).toHaveAttribute("aria-label", "Select All");
    expect(selectAll).toHaveAttribute("type", "button");
    expect(selectAll.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    fireEvent.click(selectAll);

    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument();
    });
    const batchDeleteAction = screen.getByRole("button", { name: "Delete" });
    const batchActions = [
      {
        button: screen.getByRole("button", { name: "Add to favorites" }),
        label: "Add to favorites",
      },
      {
        button: screen.getByRole("button", { name: "Batch Tags" }),
        label: "Batch Tags",
      },
      {
        button: screen.getByRole("button", { name: "Batch Deploy" }),
        label: "Batch Deploy",
      },
      { button: batchDeleteAction, label: "Delete" },
    ];
    for (const { button, label } of batchActions) {
      expect(button).toHaveAttribute("aria-label", label);
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await act(async () => {
      fireEvent.click(batchDeleteAction);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Also delete copied distributions",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Batch Manage" }));

    expect(screen.queryByText("Batch Mode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batch Deploy" }),
    ).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
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

  it("exposes scan preview actions with stable button and icon semantics", () => {
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

    render(
      <SkillScanPreview
        scannedSkills={[scannedSkill]}
        installedPaths={new Set()}
        onImport={vi.fn().mockResolvedValue(0)}
        onRescan={vi.fn().mockResolvedValue(true)}
        onClose={vi.fn()}
      />,
    );

    const pathToggle = screen.getByRole("button", { name: "Add path" });
    expect(pathToggle).toHaveAttribute("type", "button");
    expect(pathToggle).toHaveAttribute("aria-expanded", "false");
    expect(pathToggle.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const rescan = screen.getByRole("button", { name: /Re-?scan/i });
    expect(rescan).toHaveAttribute("type", "button");
    expect(rescan.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("type", "button");
    expect(close.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const tagsToggle = screen.getByRole("button", {
      name: "Add tags when needed",
    });
    expect(tagsToggle).toHaveAttribute("type", "button");
    expect(tagsToggle).toHaveAttribute("aria-expanded", "false");
    expect(tagsToggle.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const selectAll = screen.getByRole("button", { name: "Select All" });
    expect(selectAll).toHaveAttribute("type", "button");

    const importButton = screen.getByRole("button", {
      name: "Import Selected (0)",
    });
    expect(importButton).toHaveAttribute("type", "button");
    expect(importButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const skillToggle = screen.getByRole("button", { name: /local-helper/u });
    expect(skillToggle).toHaveAttribute("type", "button");
    expect(skillToggle.querySelector("input, button")).toBeNull();
    expect(screen.getByRole("checkbox")).not.toBe(skillToggle);

    fireEvent.click(pathToggle);

    expect(pathToggle).toHaveAttribute("aria-expanded", "true");
    const addPath = screen.getByRole("button", { name: "Add" });
    expect(addPath).toHaveAttribute("type", "button");
  });

  it("passes the selected linked import mode from scan preview imports", async () => {
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
    const onImport = vi.fn().mockResolvedValue(1);

    render(
      <SkillScanPreview
        scannedSkills={[scannedSkill]}
        installedPaths={new Set()}
        onImport={onImport}
        onRescan={vi.fn().mockResolvedValue(true)}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: /Import/u }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(
        [expect.objectContaining(scannedSkill)],
        { "/Users/demo/skills/local-helper": [] },
        "symlink",
      );
    });
  });

  it("lets users choose the skill gallery card column count", async () => {
    const setGalleryColumns = vi.fn();
    const skillStoreState = createSkillStoreState({ setGalleryColumns });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    fireEvent.click(screen.getByRole("button", { name: "Skill card columns" }));
    fireEvent.click(screen.getByRole("option", { name: "6 columns" }));

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

  it("keeps the tag filter reachable so a stale active tag can still be cleared", () => {
    // Base skill resolves to no *user* tags (registry-owned), so no candidate
    // options are shown. A left-over active tag (e.g. previously selected then
    // removed from the library) must still keep the header control mounted so
    // the user can clear it instead of being trapped by an invisible filter.
    const clearSkillFilterTags = vi.fn();
    // Force an empty *user-tag* candidate set explicitly (original_tags holds
    // the registry-owned tags), so this regression only proves the control is
    // kept alive because a stale active tag exists — not because candidates do.
    const registryOnlySkill: Skill = {
      ...baseSkill,
      original_tags: ["general"],
    };
    const skillStoreState = createSkillStoreState({
      filterTags: ["ghost"],
      toggleFilterTag: vi.fn(),
      clearFilterTags: clearSkillFilterTags,
      skills: [registryOnlySkill],
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    // Header control is still rendered because an active tag exists, even with
    // an empty candidate list.
    const trigger = screen.getByRole("button", {
      name: /Filter by tag \(1 active\)/i,
    });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("button", { name: /^Clear all tag filters$/i }),
    );

    expect(clearSkillFilterTags).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole("option", { name: "GitHub Import" }));

    expect(screen.queryByText("claude-store-skill")).not.toBeInTheDocument();
    expect(screen.getByText("github-import-skill")).toBeInTheDocument();
    expect(screen.queryByText("agent-import-skill")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skill source" }));
    fireEvent.click(screen.getByRole("option", { name: "Claude Code Store" }));

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

  it("does not show an update pulse after install when another store reuses the slug", () => {
    const installedSkill = {
      ...baseSkill,
      source_id: "source-gitea-write",
      source_url: "https://gitea.example.com/team/skills/src/branch/main/write",
    };
    const skillStoreState = createSkillStoreState({
      skills: [installedSkill],
      remoteStoreEntries: {
        gitea: {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "write",
              source_id: "source-gitea-write",
              name: "Write",
              description: "Write better",
              category: "general",
              author: "Team",
              source_url: installedSkill.source_url,
              tags: ["general"],
              version: "1.0.0",
              content: "# Write",
            },
          ],
        },
        unrelated: {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "write",
              source_id: "source-unrelated-write",
              name: "Write",
              description: "Unrelated Skill with the same slug",
              category: "general",
              author: "Other",
              source_url: "https://github.com/unrelated/skills/tree/main/write",
              tags: ["general"],
              version: "9.0.0",
              content: "# Unrelated Write",
            },
          ],
        },
      },
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    expect(screen.getByText("write")).toBeInTheDocument();
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });

  it("ignores legacy remote store cache entries without skills arrays in the skill manager", async () => {
    const skillStoreState = createSkillStoreState({
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
        },
      },
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    render(<SkillManager />);

    expect(screen.getByText("write")).toBeInTheDocument();
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
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
});
