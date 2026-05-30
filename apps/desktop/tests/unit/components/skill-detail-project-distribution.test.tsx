import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { installWindowMocks } from "../../helpers/window";

import en from "../../../src/renderer/i18n/locales/en.json";

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
  source_url: "/Users/demo/skills/write",
  tags: ["general"],
  is_favorite: false,
  currentVersion: 0,
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
    syncSkillFromRepo: vi.fn().mockResolvedValue(baseSkill),
    saveSafetyReport: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    selectedSkillId: baseSkill.id,
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
    clearTranslation: vi.fn(),
    projectScanState: {
      "project-1": {
        scannedSkills: [],
        isScanning: false,
        error: null,
      },
    },
    scanProjectSkills: vi.fn().mockResolvedValue([]),
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
    projectSkillImportModePreference: "copy",
    projectSkillImportPreferencesByProjectId: {},
    setProjectSkillImportModePreference: vi.fn(),
    setProjectSkillImportPreferences: vi.fn(),
    autoScanInstalledSkills: false,
    aiModels: [],
    updateSkillProject: vi.fn(),
    ...overrides,
  };
}

function bindStoreSelector<TState extends Record<string, unknown>>(state: TState) {
  return (selector?: ((value: TState) => unknown) | undefined) =>
    typeof selector === "function" ? selector(state) : state;
}

async function renderProjectDistribution(options?: {
  skillStoreState?: ReturnType<typeof createSkillStoreState>;
  settingsState?: ReturnType<typeof createSettingsState>;
  showToast?: ReturnType<typeof vi.fn>;
  skipProjectTabClick?: boolean;
}) {
  useToastMock.mockReturnValue({ showToast: options?.showToast ?? vi.fn() });
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

  useSkillStoreMock.mockImplementation(
    bindStoreSelector(options?.skillStoreState ?? createSkillStoreState()),
  );
  useSettingsStoreMock.mockImplementation(
    bindStoreSelector(options?.settingsState ?? createSettingsState()),
  );

  await act(async () => {
    render(<SkillFullDetailPage />);
  });

  if (options?.skipProjectTabClick) {
    return;
  }

  fireEvent.click(screen.getByRole("button", { name: "Project Distribution" }));

  const workspaceCards = screen.getAllByText("Workspace");
  const projectCardLabel = workspaceCards.find((node) => node.tagName.toLowerCase() !== "button");
  if (!projectCardLabel) {
    throw new Error("Project card label not found");
  }
  const projectCard = projectCardLabel.closest("button");
  if (!projectCard) {
    throw new Error("Project card button not found");
  }
  fireEvent.click(projectCard);
}

describe("Skill detail project distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi.fn().mockResolvedValue("/Users/demo/skills/write"),
          copyRepoByPathToDirectory: vi.fn().mockResolvedValue(
            "/tmp/workspace/.agents/skills/write",
          ),
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: baseSkill.instructions,
          }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });
  });

  it("defaults to global distribution when opening a skill detail", async () => {
    const setProjectSkillImportModePreference = vi.fn();

    await renderProjectDistribution({
      settingsState: createSettingsState({ setProjectSkillImportModePreference }),
      skipProjectTabClick: true,
    });

    expect(
      screen.getByRole("button", { name: "Global Distribution" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(setProjectSkillImportModePreference).not.toHaveBeenCalled();
  });

  it("uses repo path and skip semantics when distributing from detail page", async () => {
    const getRepoPath = vi.fn().mockResolvedValue("/Users/demo/skills/write");
    const copyRepoByPathToDirectory = vi.fn().mockResolvedValue(
      "/tmp/workspace/.agents/skills/write",
    );
    const scanProjectSkills = vi.fn().mockResolvedValue([]);

    window.api.skill.getRepoPath = getRepoPath;
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution({
      skillStoreState: createSkillStoreState({ scanProjectSkills }),
    });

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

  it("supports advanced project target folders from the detail page", async () => {
    const copyRepoByPathToDirectory = vi.fn().mockResolvedValue(
      "/tmp/workspace/.claude/skills/write",
    );
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution();

    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Import Settings/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /\.claude\/skills/ }));

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/write",
        "write",
        "/tmp/workspace/.claude/skills",
        { ifExists: "skip", mode: "copy" },
      );
    });
  });

  it("reuses saved project import target preferences from the detail page", async () => {
    const copyRepoByPathToDirectory = vi.fn().mockResolvedValue(
      "/tmp/workspace/.gemini/skills/write",
    );
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution({
      settingsState: createSettingsState({
        projectSkillImportPreferencesByProjectId: {
          "project-1": {
            selectedTargetIds: ["/tmp/workspace/.gemini/skills"],
            customTargets: [],
          },
        },
      }),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/write",
        "write",
        "/tmp/workspace/.gemini/skills",
        { ifExists: "skip", mode: "copy" },
      );
    });
  });

  it("skips already imported project targets", async () => {
    const copyRepoByPathToDirectory = vi.fn();
    const getRepoPath = vi.fn().mockResolvedValue("/Users/demo/skills/write");
    const showToast = vi.fn();

    window.api.skill.getRepoPath = getRepoPath;
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution({
      showToast,
      skillStoreState: createSkillStoreState({
        projectScanState: {
          "project-1": {
            scannedSkills: [
              {
                name: "write",
                description: "Write better",
                author: "Local",
                tags: ["general"],
                instructions: "# Write",
                filePath: "/tmp/workspace/.agents/skills/write/SKILL.md",
                localPath: "/tmp/workspace/.agents/skills/write",
                platforms: ["Custom"],
              },
            ],
            isScanning: false,
            error: null,
          },
        },
      }),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Selected skills are already imported into the selected project folders.",
        "warning",
      );
    });
    expect(copyRepoByPathToDirectory).not.toHaveBeenCalled();
  });

  it("warns instead of copying when the selected target is the source location", async () => {
    const copyRepoByPathToDirectory = vi.fn();
    const showToast = vi.fn();

    window.api.skill.getRepoPath = vi
      .fn()
      .mockResolvedValue("/tmp/workspace/.agents/skills/write");
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution({ showToast });

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "This skill is already inside the selected project target folders.",
        "warning",
      );
    });
    expect(copyRepoByPathToDirectory).not.toHaveBeenCalled();
  });

  it("supports symlink mode with the same skip behavior", async () => {
    const copyRepoByPathToDirectory = vi.fn().mockResolvedValue(
      "/tmp/workspace/.agents/skills/write",
    );
    const setProjectSkillImportModePreference = vi.fn();
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution({
      settingsState: createSettingsState({ setProjectSkillImportModePreference }),
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Import Settings/ }),
    );
    const symlinkButton = screen.getByRole("button", { name: /Symlink/ });
    fireEvent.click(symlinkButton);

    await waitFor(() => {
      expect(symlinkButton.className).toContain("bg-primary");
    });
    expect(setProjectSkillImportModePreference).toHaveBeenCalledWith("symlink");

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/write",
        "write",
        "/tmp/workspace/.agents/skills",
        { ifExists: "skip", mode: "symlink" },
      );
    });
  });

  it("shows an error when selected projects have no deploy targets", async () => {
    const showToast = vi.fn();

    await renderProjectDistribution({
      showToast,
      settingsState: createSettingsState({
        skillProjects: [
          {
            id: "project-1",
            name: "Workspace",
            rootPath: "",
            scanPaths: [],
            deployTargets: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }),
      skillStoreState: createSkillStoreState({
        projectScanState: {
          "project-1": {
            scannedSkills: [],
            isScanning: false,
            error: null,
          },
        },
      }),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Selected projects do not have any deploy target folders yet.",
        "error",
      );
    });
  });

  it("warns when background rescan fails after a successful distribution", async () => {
    const showToast = vi.fn();
    const scanProjectSkills = vi.fn().mockRejectedValue(new Error("rescan failed"));

    await renderProjectDistribution({
      showToast,
      skillStoreState: createSkillStoreState({ scanProjectSkills }),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Deploy write to Selected Projects" }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Deployed to 1 project folder(s).",
        "success",
      );
    });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Import completed, but PromptHub could not refresh the project list. Please rescan manually.",
        "warning",
      );
    });
  });
});
