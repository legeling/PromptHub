import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { SkillManager } from "../../../src/renderer/components/skill/SkillManager";
import { createSkillFixture, createSkillLocalFileEntryFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSkillStoreMock = vi.fn();
const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const useSkillPlatformMock = vi.fn();

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

vi.mock("../../../src/renderer/components/skill/SkillPreviewPane", () => ({
  SkillPreviewPane: () => <div>preview-pane</div>,
}));

vi.mock("../../../src/renderer/components/skill/SkillPlatformPanel", () => ({
  SkillPlatformPanel: () => <div>platform-panel</div>,
}));

vi.mock("../../../src/renderer/components/skill/SkillCodePane", () => ({
  SkillCodePane: () => <div>code-pane</div>,
}));

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => ({
  SkillFileEditor: () => <div>file-editor</div>,
}));

vi.mock("../../../src/renderer/components/skill/EditSkillModal", () => ({
  EditSkillModal: () => null,
}));

vi.mock("../../../src/renderer/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("../../../src/renderer/components/ui/UnsavedChangesDialog", () => ({
  UnsavedChangesDialog: () => null,
}));

vi.mock("../../../src/renderer/components/skill/SkillVersionHistoryModal", () => ({
  SkillVersionHistoryModal: () => null,
}));

const baseSkill = createSkillFixture();

function createSkillStoreState(overrides: Partial<Record<string, unknown>> = {}) {
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
    deployedSkillNames: new Set<string>(),
    loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
    filterTags: [],
    scanLocalPreview: vi.fn().mockResolvedValue([]),
    importScannedSkills: vi.fn().mockResolvedValue({ importedCount: 0 }),
    translateContent: vi.fn().mockResolvedValue(undefined),
    getTranslation: vi.fn().mockReturnValue(null),
    clearTranslation: vi.fn(),
    ...overrides,
  };
}

function createSettingsState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customSkillScanPaths: [],
    translationMode: "full",
    skillInstallMethod: "symlink",
    ...overrides,
  };
}

describe("skill ui integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    installWindowMocks({
      api: {
        skill: {
          readLocalFiles: vi.fn().mockResolvedValue([
            createSkillLocalFileEntryFixture(),
          ]),
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

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));

    await renderWithI18n(<SkillManager />, { language: "en" });

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

  it("creates a snapshot from the detail page through the in-app modal", async () => {
    const loadSkills = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const skillStoreState = createSkillStoreState({
      selectedSkillId: baseSkill.id,
      loadSkills,
    });
    const settingsState = createSettingsState();

    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));
    useSettingsStoreMock.mockImplementation((selector) => selector(settingsState));
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Snapshot" }));
    });

    expect(screen.getByRole("heading", { name: "Create Snapshot" })).toBeInTheDocument();
    expect(screen.getByText("Enter a note for this snapshot")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("Describe what changed...");
    expect((textarea as HTMLTextAreaElement).value).toContain("Manual snapshot");

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
    expect(showToast).toHaveBeenCalledWith("Version snapshot created", "success");
  });
});
