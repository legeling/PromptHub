import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { SkillManager } from "../../../src/renderer/components/skill/SkillManager";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import {
  createSkillFixture,
  createSkillLocalFileEntryFixture,
} from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSkillStoreMock = vi.fn();
const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const useSkillPlatformMock = vi.fn();
const editSkillModalModuleLoadMock = vi.hoisted(() => vi.fn());
const skillFileEditorModuleLoadMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
  debouncedPromptSaveSync: vi.fn(),
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

vi.mock("../../../src/renderer/components/skill/SkillPreviewPane", () => ({
  SkillPreviewPane: () => <div>preview-pane</div>,
}));

vi.mock("../../../src/renderer/components/skill/SkillPlatformPanel", () => ({
  SkillPlatformPanel: () => <div>platform-panel</div>,
}));

vi.mock("../../../src/renderer/components/skill/SkillCodePane", () => ({
  SkillCodePane: () => <div>code-pane</div>,
}));

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => {
  skillFileEditorModuleLoadMock();
  return {
    SkillFileEditor: () => <div>file-editor</div>,
  };
});

vi.mock("../../../src/renderer/components/skill/EditSkillModal", () => {
  editSkillModalModuleLoadMock();
  return {
    EditSkillModal: () => null,
  };
});

vi.mock("../../../src/renderer/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("../../../src/renderer/components/ui/UnsavedChangesDialog", () => ({
  UnsavedChangesDialog: () => null,
}));

vi.mock(
  "../../../src/renderer/components/skill/SkillVersionHistoryModal",
  () => ({
    SkillVersionHistoryModal: () => null,
  }),
);

const baseSkill = createSkillFixture();

function createSkillStoreState(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    skills: [baseSkill],
    loadSkills: vi.fn().mockResolvedValue(undefined),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    updateSkill: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    selectedSkillId: null,
    selectSkill: vi.fn(),
    filterType: "all",
    searchQuery: "",
    viewMode: "gallery",
    setViewMode: vi.fn(),
    storeView: "my-skills",
    setStoreView: vi.fn(),
    setFilterType: vi.fn(),
    deployedSkillNames: new Set<string>(),
    loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
    filterTags: [],
    scanLocalPreview: vi.fn().mockResolvedValue([]),
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
    projectSkillImportModePreference: "copy",
    setProjectSkillImportModePreference: vi.fn(),
    skillListPageSize: 10,
    setSkillListPageSize: vi.fn(),
    updateSkillProject: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("skill ui integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    installWindowMocks({
      api: {
        skill: {
          readLocalFiles: vi
            .fn()
            .mockResolvedValue([createSkillLocalFileEntryFixture()]),
          versionCreate: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [],
      batchInstall: vi.fn().mockResolvedValue({
        successCount: 0,
        totalCount: 0,
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
  });

  it("renders skill manager with real english locale and updates selection summary", async () => {
    const skillStoreState = createSkillStoreState();
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await renderWithI18n(<SkillManager />, { language: "en" });

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

    fireEvent.click(screen.getByRole("button", { name: "Select All" }));

    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Batch Deploy" }),
    ).toBeInTheDocument();
  }, 60000);

  it("paginates skills and exposes row context actions", async () => {
    const selectSkill = vi.fn();
    const skillStoreState = createSkillStoreState({
      selectSkill,
      skills: Array.from({ length: 12 }, (_, index) =>
        createSkillFixture({
          id: `skill-${index + 1}`,
          name: `Skill ${index + 1}`,
        }),
      ),
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await renderWithI18n(<SkillManager />, { language: "en" });

    expect(screen.getAllByText("1-10 / 12").length).toBeGreaterThan(0);
    expect(screen.getByText("Skill 1")).toBeInTheDocument();
    expect(screen.queryByText("Skill 11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getAllByText("11-12 / 12").length).toBeGreaterThan(0);
    expect(screen.getByText("Skill 11")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText("Skill 11"));
    fireEvent.click(screen.getByRole("button", { name: "View Details" }));

    expect(selectSkill).toHaveBeenCalledWith("skill-11");
  }, 60000);

  it("uses and updates the persisted skill page size preference", async () => {
    const setSkillListPageSize = vi.fn();
    const skillStoreState = createSkillStoreState({
      skills: Array.from({ length: 30 }, (_, index) =>
        createSkillFixture({
          id: `persisted-page-skill-${index + 1}`,
          name: `Persisted Page Skill ${index + 1}`,
        }),
      ),
    });
    const settingsState = createSettingsState({
      skillListPageSize: 25,
      setSkillListPageSize,
    });

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await renderWithI18n(<SkillManager />, { language: "en" });

    expect(screen.getAllByText("1-25 / 30").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByDisplayValue("25"), {
      target: { value: "50" },
    });

    expect(setSkillListPageSize).toHaveBeenCalledWith(50);
  }, 60000);

  it("localizes skill row context actions in chinese", async () => {
    const selectSkill = vi.fn();
    const skillStoreState = createSkillStoreState({
      selectSkill,
      skills: [
        createSkillFixture({
          id: "skill-zh-menu",
          name: "中文菜单技能",
        }),
      ],
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await renderWithI18n(<SkillManager />, { language: "zh" });

    fireEvent.contextMenu(screen.getByText("中文菜单技能"));

    expect(screen.getByRole("button", { name: "查看详情" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "添加收藏" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "批量管理标签" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("View Details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    expect(selectSkill).toHaveBeenCalledWith("skill-zh-menu");
  });

  it("assigns a dragged tag to a dropped skill", async () => {
    const updateSkill = vi.fn().mockResolvedValue(undefined);
    const skillStoreState = createSkillStoreState({
      updateSkill,
      skills: [
        createSkillFixture({
          id: "skill-drop",
          name: "Drop Target Skill",
          tags: [],
        }),
      ],
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await renderWithI18n(<SkillManager />, { language: "en" });

    const target = screen.getByText("Drop Target Skill").closest(".group");
    expect(target).not.toBeNull();

    await act(async () => {
      fireEvent.drop(target!, {
        dataTransfer: {
          types: ["application/x-prompthub-tag"],
          getData: (type: string) =>
            type === "application/x-prompthub-tag" ? "assigned" : "",
        },
      });
    });

    expect(updateSkill).toHaveBeenCalledWith("skill-drop", {
      tags: ["assigned"],
    });
  });

  it("scans the dropped SKILL.md parent directory on the skills screen", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([]);
    const showToast = vi.fn();
    const skillStoreState = createSkillStoreState({
      scanLocalPreview,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );
    useToastMock.mockReturnValue({ showToast });

    installWindowMocks({
      electron: {
        getPathForFile: vi.fn(() => "/tmp/skills/novel-writer/SKILL.md"),
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillManager />, { language: "en" });
    });

    const dropTarget = screen
      .getByText(
        "Manage all imported skills in one place, regardless of where they came from.",
      )
      .closest("div.relative") as HTMLDivElement | null;

    expect(dropTarget).not.toBeNull();

    const file = new File(["# skill"], "SKILL.md", {
      type: "text/markdown",
    });

    await act(async () => {
      fireEvent.drop(dropTarget!, {
        dataTransfer: {
          items: [{ kind: "file", type: file.type }],
          files: [file],
        },
      });
    });

    await waitFor(() => {
      expect(scanLocalPreview).toHaveBeenCalledWith([
        "/tmp/skills/novel-writer",
      ]);
    });
    expect(showToast).toHaveBeenCalledWith(
      "No importable SKILL.md files were found in the dropped items.",
      "error",
    );
  }, 60000);

  it("rejects dropped README.md files on the skills screen", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([]);
    const showToast = vi.fn();
    const skillStoreState = createSkillStoreState({
      scanLocalPreview,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );
    useToastMock.mockReturnValue({ showToast });

    installWindowMocks({
      electron: {
        getPathForFile: vi.fn(() => "/tmp/skills/novel-writer/README.md"),
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillManager />, { language: "en" });
    });

    const dropTarget = screen
      .getByText(
        "Manage all imported skills in one place, regardless of where they came from.",
      )
      .closest("div.relative") as HTMLDivElement | null;

    expect(dropTarget).not.toBeNull();

    const file = new File(["# readme"], "README.md", {
      type: "text/markdown",
    });

    await act(async () => {
      fireEvent.drop(dropTarget!, {
        dataTransfer: {
          items: [{ kind: "file", type: file.type }],
          files: [file],
        },
      });
    });

    expect(scanLocalPreview).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Only local folders or a file named SKILL.md can be imported as skills.",
      "error",
    );
  });

  it("creates a snapshot from the detail page through the in-app modal", async () => {
    const loadSkills = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      loadSkills,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Snapshot" }));
    });

    expect(
      screen.getByRole("heading", { name: "Create Snapshot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter a note for this snapshot"),
    ).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("Describe what changed...");
    expect((textarea as HTMLTextAreaElement).value).toContain(
      "Manual snapshot",
    );

    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: "Save the refreshed SKILL.md copy" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    });

    await waitFor(() => {
      expect(window.api.skill.versionCreate).toHaveBeenCalledWith(
        baseSkill.id,
        "Save the refreshed SKILL.md copy",
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Create Snapshot" }),
      ).not.toBeInTheDocument();
    });
    expect(loadSkills).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "Version snapshot created",
      "success",
    );
  }, 15000);

  it("loads the file editor only after opening the files tab", async () => {
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    expect(screen.getByText("preview-pane")).toBeInTheDocument();
    expect(screen.queryByText("file-editor")).not.toBeInTheDocument();
    expect(editSkillModalModuleLoadMock).not.toHaveBeenCalled();
    expect(skillFileEditorModuleLoadMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Files" }));
    });

    expect(await screen.findByText("file-editor")).toBeInTheDocument();
    expect(skillFileEditorModuleLoadMock).toHaveBeenCalledTimes(1);
  });

  it("imports and updates a local store source skill using the latest local SKILL.md content", async () => {
    const showToast = vi.fn();
    const installFromRegistry = vi.fn();
    const installRegistrySkill = vi.fn();
    const updateRegistrySkill = vi
      .fn()
      .mockResolvedValue({ status: "updated" });
    const getRegistrySkillUpdateStatus = vi.fn().mockResolvedValue({
      status: "update-available",
    });

    const installedLocalSkill = createSkillFixture({
      id: "local-writer-installed",
      name: "local-writer",
      registry_slug: "local-writer",
      instructions: "# Local Writer\n\nInstalled stale content",
      content: "# Local Writer\n\nInstalled stale content",
    });

    const localSourceSkill = {
      slug: "local-writer",
      name: "local-writer",
      description: "Local source skill",
      category: "general",
      author: "Local",
      tags: ["local"],
      version: "1.1.0",
      content: "# Local Writer\n\nFresh source content",
      source_url: "/tmp/local-writer",
      content_url: "/tmp/local-writer/SKILL.md",
      compatibility: ["claude"],
    };

    const translationState = vi.fn().mockReturnValue({
      value: null,
      hasTranslation: false,
      isStale: false,
    });
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(createSettingsState()),
    );
    useToastMock.mockReturnValue({ showToast });

    const installPhaseState = createSkillStoreState({
      skills: [installedLocalSkill],
      installFromRegistry,
      installRegistrySkill,
      updateRegistrySkill,
      getRegistrySkillUpdateStatus,
      getTranslationState: translationState,
    });
    useSkillStoreMock.mockImplementation((selector) =>
      selector(installPhaseState),
    );

    await act(async () => {
      await renderWithI18n(
        <SkillStoreDetail
          skill={localSourceSkill as never}
          isInstalled={false}
          onClose={vi.fn()}
        />,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Fresh source content")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Installed stale content"),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Import to My Skills" }),
      );
    });

    expect(installRegistrySkill).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "local-writer" }),
    );

    cleanup();

    const updatePhaseState = createSkillStoreState({
      skills: [installedLocalSkill],
      installFromRegistry,
      installRegistrySkill,
      updateRegistrySkill,
      getRegistrySkillUpdateStatus,
      getTranslationState: translationState,
    });
    useSkillStoreMock.mockImplementation((selector) =>
      selector(updatePhaseState),
    );

    await act(async () => {
      await renderWithI18n(
        <SkillStoreDetail
          skill={localSourceSkill as never}
          isInstalled={true}
          onClose={vi.fn()}
        />,
        { language: "en" },
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check update" }));
    });
    const updateButton = await screen.findByRole("button", { name: "Update" });
    await act(async () => {
      fireEvent.click(updateButton);
    });

    expect(updateRegistrySkill).toHaveBeenCalledWith("local-writer", {
      overwriteLocalChanges: false,
    });
  }, 15000);

  it("reads project detail SKILL.md content when source_url points to the SKILL.md file", async () => {
    const projectFileSkill = createSkillFixture({
      id: "project-file-skill",
      name: "project-file-skill",
      source_url: "/tmp/project-skill/SKILL.md",
      local_repo_path: null,
      instructions: "# Project Skill\n\nCached content",
      content: "# Project Skill\n\nCached content",
    });

    const skillStoreState = createSkillStoreState({
      skills: [projectFileSkill],
      selectedSkillId: projectFileSkill.id,
      syncSkillFromRepo: vi.fn(),
    });
    const settingsState = createSettingsState();

    installWindowMocks({
      api: {
        skill: {
          readLocalFiles: vi
            .fn()
            .mockResolvedValue([createSkillLocalFileEntryFixture()]),
          readLocalFileByPath: vi.fn().mockResolvedValue({
            path: "SKILL.md",
            content: "# Project Skill\n\nLatest project content",
            isDirectory: false,
          }),
          versionCreate: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    useSkillStoreMock.mockImplementation((selector) =>
      selector(skillStoreState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );

    await act(async () => {
      await renderWithI18n(
        <SkillFullDetailPage
          projectContext={{
            project: {
              id: "project-1",
              name: "Project 1",
              rootPath: "/tmp/project-skill",
              scanPaths: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          }}
        />,
        {
          language: "en",
        },
      );
    });

    await waitFor(() => {
      expect(window.api.skill.readLocalFileByPath).toHaveBeenCalledWith(
        "/tmp/project-skill",
        "SKILL.md",
      );
    });
  });
});
