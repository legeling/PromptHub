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
      .mockImplementation((tagName: string) => {
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

  it("clears detail page copy feedback timers when unmounted after copying", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
      const setTimeoutSpy = vi.spyOn(window, "setTimeout");
      const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
      const skillStoreState = createSkillStoreState({
        selectedSkillId: baseSkill.id,
        syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
      });
      const settingsState = createSettingsState();

      useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
      useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

      const { unmount } = render(<SkillFullDetailPage />);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy MD" }));
        await Promise.resolve();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        baseSkill.instructions,
      );
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      clearTimeoutSpy.mockClear();
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
    } finally {
      vi.useRealTimers();
    }
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

  it("uses the browser-safe library fallback before a stale detail selection", async () => {
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

    render(<SkillManager />);

    expect(setStoreView).not.toHaveBeenCalledWith("my-skills");
    expect(setFilterType).not.toHaveBeenCalledWith("all");
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
      screen.queryByRole("button", { name: "Batch Deploy" }),
    ).not.toBeInTheDocument();
  });

  it("keeps web runtime detail metadata visible without local file controls", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation(bindStoreSelector(skillStoreState));
    useSettingsStoreMock.mockImplementation(bindStoreSelector(settingsState));

    await act(async () => {
      render(<SkillFullDetailPage />);
      await Promise.resolve();
    });

    expect(
      screen.queryByRole("button", { name: "Files" }),
    ).not.toBeInTheDocument();
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
