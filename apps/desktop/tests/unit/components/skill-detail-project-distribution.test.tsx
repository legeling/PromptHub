import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { installWindowMocks } from "../../helpers/window";

import en from "../../../src/renderer/i18n/locales/en.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";

type TranslationTree = Record<string, unknown>;
let currentTranslations: TranslationTree = en as TranslationTree;

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
  const value = getPathValue(currentTranslations, key);
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

function bindStoreSelector<TState extends Record<string, unknown>>(
  state: TState,
) {
  return (selector?: ((value: TState) => unknown) | undefined) =>
    typeof selector === "function" ? selector(state) : state;
}

async function renderProjectDistribution(options?: {
  skillStoreState?: ReturnType<typeof createSkillStoreState>;
  settingsState?: ReturnType<typeof createSettingsState>;
  showToast?: ReturnType<typeof vi.fn>;
  skipProjectTabClick?: boolean;
  skillPlatformState?: Record<string, unknown>;
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
    installDetails: {},
    installStatus: {},
    isBatchInstalling: false,
    selectedPlatforms: new Set<string>(),
    selectAllPlatforms: vi.fn(),
    togglePlatformSelection: vi.fn(),
    uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
    uninstalledPlatforms: [{ id: "claude", name: "Claude Code" }],
    ...(options?.skillPlatformState ?? {}),
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
  const projectCardLabel = workspaceCards.find(
    (node) => node.tagName.toLowerCase() !== "button",
  );
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
    currentTranslations = en as TranslationTree;
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi.fn().mockResolvedValue("/Users/demo/skills/write"),
          copyRepoByPathToDirectory: vi
            .fn()
            .mockResolvedValue("/tmp/workspace/.agents/skills/write"),
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
      settingsState: createSettingsState({
        setProjectSkillImportModePreference,
      }),
      skipProjectTabClick: true,
    });

    expect(
      screen.getByRole("button", { name: "Global Distribution" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(setProjectSkillImportModePreference).not.toHaveBeenCalled();
  });

  it("requires confirmation before uninstalling a global platform skill", async () => {
    const uninstallFromPlatform = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();

    await renderProjectDistribution({
      showToast,
      skipProjectTabClick: true,
      skillPlatformState: {
        installDetails: { claude: { installed: true, mode: "symlink" } },
        installStatus: { claude: true },
        uninstallFromPlatform,
        uninstalledPlatforms: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));

    expect(
      screen.getByText(
        "Are you sure you want to uninstall this skill from Claude Code?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This removes the symlink from the platform directory. Your local Skill stays in PromptHub.",
      ),
    ).toBeInTheDocument();
    expect(uninstallFromPlatform).not.toHaveBeenCalled();

    const uninstallButtons = screen.getAllByRole("button", {
      name: "Uninstall",
    });
    fireEvent.click(uninstallButtons[uninstallButtons.length - 1]);

    await waitFor(() => {
      expect(uninstallFromPlatform).toHaveBeenCalledWith("claude");
      expect(showToast).toHaveBeenCalledWith("Uninstall successful", "success");
    });
  });

  it("shows the skill and platform name after a global platform install succeeds", async () => {
    const showToast = vi.fn();

    await renderProjectDistribution({
      showToast,
      skipProjectTabClick: true,
      skillPlatformState: {
        availablePlatforms: [{ id: "cherry-studio", name: "Cherry Studio" }],
        batchInstall: vi.fn().mockResolvedValue({
          successCount: 1,
          totalCount: 1,
          failures: [],
          fallbacks: [],
        }),
        selectedPlatforms: new Set(["cherry-studio"]),
        uninstalledPlatforms: [{ id: "cherry-studio", name: "Cherry Studio" }],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Install All" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "write installed to Cherry Studio successfully",
        "success",
      );
    });
  });

  it("does not mention distributed cleanup when deleting an undistributed skill", async () => {
    await renderProjectDistribution({ skipProjectTabClick: true });

    fireEvent.click(screen.getByTitle("Delete"));

    expect(
      screen.getByText(
        "Only removes this skill from the PromptHub library. Source files are preserved.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Also delete copied distributions"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Symlink distributions will be deleted directly."),
    ).not.toBeInTheDocument();
  });

  it("renders the source-only delete confirmation hint from the active locale", async () => {
    currentTranslations = zh as TranslationTree;

    await renderProjectDistribution({ skipProjectTabClick: true });

    fireEvent.click(screen.getByTitle("删除"));

    expect(
      screen.getByText("只会从 PromptHub 资料库中移除此 Skill。源文件会保留。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Only removes this skill from the PromptHub library. Source files are preserved.",
      ),
    ).not.toBeInTheDocument();
  });

  it("lets users keep copied distributions when deleting from PromptHub", async () => {
    const deleteSkill = vi.fn().mockResolvedValue(true);

    await renderProjectDistribution({
      skipProjectTabClick: true,
      skillStoreState: createSkillStoreState({ deleteSkill }),
      skillPlatformState: {
        installDetails: { claude: { installed: true, mode: "copy" } },
        installStatus: { claude: true },
      },
    });

    fireEvent.click(screen.getByTitle("Delete"));

    expect(
      screen.getByText("Also delete copied distributions"),
    ).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deleteSkill).toHaveBeenCalledWith(baseSkill.id, {
        removeCopyInstallations: false,
      });
    });
  });

  it("warns that symlink distributions are deleted directly", async () => {
    await renderProjectDistribution({
      skipProjectTabClick: true,
      skillPlatformState: {
        installDetails: { claude: { installed: true, mode: "symlink" } },
        installStatus: { claude: true },
      },
    });

    fireEvent.click(screen.getByTitle("Delete"));

    expect(
      screen.getByText("Symlink distributions will be deleted directly."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Also delete copied distributions"),
    ).not.toBeInTheDocument();
  });

  it("deletes project symlink distributions when deleting the PromptHub skill", async () => {
    const deleteSkill = vi.fn().mockResolvedValue(true);
    const deleteLocalFileByPath = vi.fn().mockResolvedValue(undefined);
    window.api.skill.deleteLocalFileByPath = deleteLocalFileByPath;
    window.api.skill.getLocalPathStatus = vi
      .fn()
      .mockResolvedValue({ exists: true, mode: "symlink" });

    await renderProjectDistribution({
      skipProjectTabClick: true,
      skillStoreState: createSkillStoreState({
        deleteSkill,
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

    fireEvent.click(screen.getByTitle("Delete"));

    await waitFor(() => {
      expect(
        screen.getByText("Symlink distributions will be deleted directly."),
      ).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deleteLocalFileByPath).toHaveBeenCalledWith(
        "/tmp/workspace/.agents/skills/write",
        ".",
      );
      expect(deleteSkill).toHaveBeenCalledWith(baseSkill.id, {
        removeCopyInstallations: false,
      });
    });
  }, 60000);

  it("uses repo path and overwrite semantics when distributing from detail page", async () => {
    const getRepoPath = vi.fn().mockResolvedValue("/Users/demo/skills/write");
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/workspace/.agents/skills/write");
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
        { ifExists: "overwrite", mode: "copy" },
      );
      expect(scanProjectSkills).toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-1" }),
      );
    });
  });

  it("supports advanced project target folders from the detail page", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/workspace/.claude/skills/write");
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
        { ifExists: "overwrite", mode: "copy" },
      );
    });
  });

  it("reuses saved project import target preferences from the detail page", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/workspace/.gemini/skills/write");
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
        { ifExists: "overwrite", mode: "copy" },
      );
    });
  });

  it("redeploys already imported project targets with overwrite semantics", async () => {
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
        "Deployed to 1 project folder(s).",
        "success",
      );
    });
    expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
      "/Users/demo/skills/write",
      "write",
      "/tmp/workspace/.agents/skills",
      { ifExists: "overwrite", mode: "copy" },
    );
  });

  it("removes an already distributed project target from the detail page", async () => {
    const deleteLocalFileByPath = vi.fn().mockResolvedValue(undefined);
    const scanProjectSkills = vi.fn().mockResolvedValue([]);
    window.api.skill.deleteLocalFileByPath = deleteLocalFileByPath;

    await renderProjectDistribution({
      skillStoreState: createSkillStoreState({
        scanProjectSkills,
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
      screen.getByRole("button", { name: "Remove from Project" }),
    );
    expect(
      screen.getByText(
        "This removes the distributed copy from the project. Your local Skill stays in PromptHub.",
      ),
    ).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove from Project",
    });
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() => {
      expect(deleteLocalFileByPath).toHaveBeenCalledWith(
        "/tmp/workspace/.agents/skills/write",
        ".",
      );
      expect(scanProjectSkills).toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-1" }),
      );
    });
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
        "Already deployed to this project",
        "warning",
      );
    });
    expect(copyRepoByPathToDirectory).not.toHaveBeenCalled();
  });

  it("supports symlink mode with the same overwrite behavior", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/workspace/.agents/skills/write");
    const setProjectSkillImportModePreference = vi.fn();
    window.api.skill.copyRepoByPathToDirectory = copyRepoByPathToDirectory;

    await renderProjectDistribution({
      settingsState: createSettingsState({
        setProjectSkillImportModePreference,
      }),
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
        { ifExists: "overwrite", mode: "symlink" },
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
    const scanProjectSkills = vi
      .fn()
      .mockRejectedValue(new Error("rescan failed"));

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
