import { act, fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ScannedSkill,
  Skill,
  SkillProject,
} from "@prompthub/shared/types";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import type { RegistrySkillUpdateCheck } from "../../../src/renderer/services/skill-store-update";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToast = vi.fn();
const useSkillPlatformMock = vi.fn();

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

const storeState = {
  skills: [] as Skill[],
  selectedSkillId: null as string | null,
  selectSkill: vi.fn(),
  deleteSkill: vi.fn().mockResolvedValue(undefined),
  toggleFavorite: vi.fn().mockResolvedValue(undefined),
  loadSkills: vi.fn().mockResolvedValue(undefined),
  syncSkillFromRepo: vi.fn(),
  saveSafetyReport: vi.fn().mockResolvedValue(undefined),
  projectScanState: {},
  scanProjectSkills: vi.fn().mockResolvedValue([]),
  getInstalledSkillSourceUpdateStatus: vi.fn().mockResolvedValue(null),
  updateInstalledSkillFromSource: vi.fn().mockResolvedValue(null),
  translateContent: vi.fn().mockResolvedValue("# translated"),
  getTranslationState: vi.fn().mockReturnValue({
    value: null,
    hasTranslation: false,
    isStale: false,
  }),
  clearTranslation: vi.fn(),
};

const settingsState = {
  translationMode: "full",
  skillInstallMethod: "symlink",
  autoScanInstalledSkills: false,
  skillProjects: [],
  projectSkillImportModePreference: "copy",
  projectSkillImportPreferencesByProjectId: {},
  setProjectSkillImportModePreference: vi.fn(),
  setProjectSkillImportPreferences: vi.fn(),
  aiModels: [],
  updateSkillProject: vi.fn(),
};

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../../src/renderer/components/skill/use-skill-platform", () => ({
  useSkillPlatform: (...args: unknown[]) => useSkillPlatformMock(...args),
}));

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

function makeSkill(): Skill {
  return {
    id: "skill-async-actions",
    name: "Async Actions",
    description: "Async action regression skill",
    instructions: "# Async Actions\n\nHelp test duplicate clicks.",
    content: "# Async Actions\n\nHelp test duplicate clicks.",
    protocol_type: "skill",
    author: "PromptHub",
    source_url: "https://github.com/example/skills/tree/main/async-actions",
    content_url:
      "https://raw.githubusercontent.com/example/skills/main/async-actions/SKILL.md",
    local_repo_path: "/Users/demo/skills/async-actions",
    tags: [],
    is_favorite: false,
    currentVersion: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  } as Skill;
}

function makeUpdateCheck(skill: Skill): RegistrySkillUpdateCheck {
  return {
    status: "update-available",
    installedSkill: skill,
    registrySkill: {
      slug: "async-actions",
      name: "Async Actions",
      description: "Async action regression skill",
      category: "general",
      author: "PromptHub",
      source_url: skill.source_url || "",
      content_url: skill.content_url || "",
      tags: [],
      version: "source",
      content: "# Async Actions\n\nRemote.",
    },
    remoteHash: "remote-hash",
    remoteContent: "# Async Actions\n\nRemote.",
    localModified: false,
    remoteChanged: true,
  };
}

function makeProject(): SkillProject {
  return {
    id: "project-async-actions",
    name: "Demo Project",
    rootPath: "/Users/demo/project",
    scanPaths: [],
    deployTargets: ["/Users/demo/project/.agents/skills"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeScannedProjectSkill(
  skill: Skill,
  project: SkillProject,
): ScannedSkill {
  return {
    name: skill.name,
    description: skill.description,
    author: skill.author,
    tags: skill.tags,
    instructions: skill.instructions,
    filePath: `${project.rootPath}/.agents/skills/${skill.name}/SKILL.md`,
    localPath: `${project.rootPath}/.agents/skills/${skill.name}`,
    installMode: "copy",
    platforms: [],
  };
}

function resetState() {
  const skill = makeSkill();
  storeState.skills = [skill];
  storeState.selectedSkillId = skill.id;
  storeState.selectSkill = vi.fn();
  storeState.deleteSkill = vi.fn().mockResolvedValue(undefined);
  storeState.toggleFavorite = vi.fn().mockResolvedValue(undefined);
  storeState.loadSkills = vi.fn().mockResolvedValue(undefined);
  storeState.syncSkillFromRepo = vi.fn().mockResolvedValue(skill);
  storeState.saveSafetyReport = vi.fn().mockResolvedValue(undefined);
  storeState.projectScanState = {};
  storeState.scanProjectSkills = vi.fn().mockResolvedValue([]);
  storeState.getInstalledSkillSourceUpdateStatus = vi
    .fn()
    .mockResolvedValue(null);
  storeState.updateInstalledSkillFromSource = vi.fn().mockResolvedValue(null);
  storeState.translateContent = vi.fn().mockResolvedValue("# translated");
  storeState.getTranslationState = vi.fn().mockReturnValue({
    value: null,
    hasTranslation: false,
    isStale: false,
  });
  storeState.clearTranslation = vi.fn();

  settingsState.translationMode = "full";
  settingsState.skillInstallMethod = "symlink";
  settingsState.autoScanInstalledSkills = false;
  settingsState.skillProjects = [];
  settingsState.projectSkillImportModePreference = "copy";
  settingsState.projectSkillImportPreferencesByProjectId = {};
  settingsState.setProjectSkillImportModePreference = vi.fn();
  settingsState.setProjectSkillImportPreferences = vi.fn();
  settingsState.aiModels = [];
  settingsState.updateSkillProject = vi.fn();
}

describe("SkillFullDetailPage async actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    installWindowMocks();
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
      installDetails: {},
      installStatus: {},
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
      uninstalledPlatforms: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps header and tab actions non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <SkillFullDetailPage />
        </form>,
        { language: "en" },
      );
    });

    const buttons = [
      screen.getByRole("button", { name: "Back" }),
      screen.getByRole("button", { name: "Check Source Updates" }),
      screen.getByRole("button", { name: "Snapshot" }),
      screen.getByRole("button", { name: /add to favorites/i }),
      screen.getByRole("button", { name: "Version History" }),
      screen.getByRole("button", { name: "Edit Skill" }),
      screen.getByRole("button", { name: "Delete" }),
      screen.getByRole("button", { name: "Preview" }),
      screen.getByRole("button", { name: "Source" }),
      screen.getByRole("button", { name: "Safety Assessment" }),
    ];

    for (const button of buttons) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
      fireEvent.click(screen.getByRole("button", { name: "Snapshot" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Source" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Safety Assessment" }),
      );
    });

    const implicitButtonMarkup = Array.from(
      document.body.querySelectorAll("button"),
    )
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores repeated AI translate clicks while the first detail translation is pending", async () => {
    let resolveTranslation: ((value: string) => void) | undefined;
    const translateContent = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveTranslation = resolve;
        }),
    );
    storeState.translateContent = translateContent;

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    const translateButton = screen.getByRole("button", {
      name: "AI Translate",
    });
    await act(async () => {
      fireEvent.click(translateButton);
      fireEvent.click(translateButton);
      await Promise.resolve();
    });

    expect(translateContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveTranslation?.("# translated");
    });
  });

  it("shares one safety scan for repeated safety assessment clicks while the first scan is pending", async () => {
    let resolveScan:
      | ((value: {
          level: "safe";
          summary: string;
          findings: [];
          recommendedAction: "allow";
          scannedAt: number;
          checkedFileCount: number;
          scanMethod: "ai";
        }) => void)
      | undefined;
    const scanSafety = vi.fn(
      () =>
        new Promise<{
          level: "safe";
          summary: string;
          findings: [];
          recommendedAction: "allow";
          scannedAt: number;
          checkedFileCount: number;
          scanMethod: "ai";
        }>((resolve) => {
          resolveScan = resolve;
        }),
    );
    installWindowMocks({
      api: {
        skill: { scanSafety },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    const safetyButton = screen.getByRole("button", {
      name: "Safety Assessment",
    });
    await act(async () => {
      fireEvent.click(safetyButton);
      fireEvent.click(safetyButton);
      await Promise.resolve();
    });

    expect(scanSafety).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveScan?.({
        level: "safe",
        summary: "No obvious malicious patterns were detected.",
        findings: [],
        recommendedAction: "allow",
        scannedAt: Date.now(),
        checkedFileCount: 1,
        scanMethod: "ai",
      });
    });
  });

  it("ignores repeated source update checks while the first check is pending", async () => {
    let resolveCheck: ((value: RegistrySkillUpdateCheck) => void) | undefined;
    const selectedSkill = storeState.skills[0];
    const getInstalledSkillSourceUpdateStatus = vi.fn(
      () =>
        new Promise<RegistrySkillUpdateCheck>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    storeState.getInstalledSkillSourceUpdateStatus =
      getInstalledSkillSourceUpdateStatus;

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    const checkUpdatesButton = screen.getByRole("button", {
      name: "Check Source Updates",
    });
    expect(checkUpdatesButton).toHaveAttribute(
      "aria-label",
      "Check Source Updates",
    );
    await act(async () => {
      fireEvent.click(checkUpdatesButton);
      fireEvent.click(checkUpdatesButton);
      await Promise.resolve();
    });

    expect(getInstalledSkillSourceUpdateStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCheck?.(makeUpdateCheck(selectedSkill));
    });
  });

  it("ignores repeated source update clicks while the first update is pending", async () => {
    let resolveUpdate:
      | ((value: {
          status: "updated";
          skill: Skill;
          check: RegistrySkillUpdateCheck;
        }) => void)
      | undefined;
    const selectedSkill = storeState.skills[0];
    const updateCheck = makeUpdateCheck(selectedSkill);
    const getInstalledSkillSourceUpdateStatus = vi
      .fn()
      .mockResolvedValue(updateCheck);
    const updateInstalledSkillFromSource = vi.fn(
      () =>
        new Promise<{
          status: "updated";
          skill: Skill;
          check: RegistrySkillUpdateCheck;
        }>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    storeState.getInstalledSkillSourceUpdateStatus =
      getInstalledSkillSourceUpdateStatus;
    storeState.updateInstalledSkillFromSource = updateInstalledSkillFromSource;

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Check Source Updates" }),
      );
    });

    const updateButton = await screen.findByRole("button", {
      name: "Update from Source",
    });
    expect(updateButton).toHaveAttribute("aria-label", "Update from Source");
    await act(async () => {
      fireEvent.click(updateButton);
      fireEvent.click(updateButton);
      await Promise.resolve();
    });

    expect(updateInstalledSkillFromSource).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate?.({
        status: "updated",
        skill: selectedSkill,
        check: { ...updateCheck, status: "up-to-date" },
      });
    });
  });

  it("allows explicit source overwrite after a local-modified update check", async () => {
    const selectedSkill = storeState.skills[0];
    const updateCheck: RegistrySkillUpdateCheck = {
      ...makeUpdateCheck(selectedSkill),
      status: "local-modified",
      localModified: true,
      remoteChanged: false,
    };
    const getInstalledSkillSourceUpdateStatus = vi
      .fn()
      .mockResolvedValue(updateCheck);
    const updateInstalledSkillFromSource = vi.fn().mockResolvedValue({
      status: "updated",
      skill: selectedSkill,
      check: { ...updateCheck, status: "up-to-date" },
    });
    storeState.getInstalledSkillSourceUpdateStatus =
      getInstalledSkillSourceUpdateStatus;
    storeState.updateInstalledSkillFromSource = updateInstalledSkillFromSource;

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Check Source Updates" }),
      );
    });

    const overwriteButton = await screen.findByRole("button", {
      name: "Overwrite local changes",
    });
    await act(async () => {
      fireEvent.click(overwriteButton);
    });

    expect(updateInstalledSkillFromSource).toHaveBeenCalledWith(
      selectedSkill.id,
      { overwriteLocalChanges: true },
    );
  });

  it("ignores repeated personal notes saves while the first note write is pending", async () => {
    let resolveWrite: (() => void) | undefined;
    const writeLocalFile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi
            .fn()
            .mockResolvedValue("/Users/demo/skills/async-actions"),
          createLocalDir: vi.fn().mockResolvedValue(undefined),
          readLocalFile: vi.fn().mockResolvedValue(null),
          writeLocalFile,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Personal Notes" }),
      { target: { value: "Use this for release notes." } },
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    await act(async () => {
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
      await Promise.resolve();
    });

    expect(writeLocalFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveWrite?.();
    });
  });

  it("ignores repeated snapshot creation clicks while the first snapshot is pending", async () => {
    let resolveSnapshot: (() => void) | undefined;
    const versionCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    installWindowMocks({
      api: {
        skill: { versionCreate },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Snapshot" }));

    expect(
      (
        screen.getByRole("textbox", {
          name: "Enter a note for this snapshot",
        }) as HTMLTextAreaElement
      ).value,
    ).toMatch(/^Manual snapshot /);

    const createSnapshotButtons = screen.getAllByRole("button", {
      name: "Create Snapshot",
    });
    expect(createSnapshotButtons).toHaveLength(1);
    const createSnapshotButton = createSnapshotButtons[0];
    await act(async () => {
      fireEvent.click(createSnapshotButton);
      fireEvent.click(createSnapshotButton);
      await Promise.resolve();
    });

    expect(versionCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSnapshot?.();
    });
  });

  it("ignores repeated delete confirmations while the first delete is pending", async () => {
    let resolveDelete: (() => void) | undefined;
    const deleteSkill = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    storeState.deleteSkill = deleteSkill;

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    fireEvent.click(screen.getByTitle("Delete"));

    const confirmDeleteButton = screen
      .getAllByRole("button", { name: "Delete" })
      .find((button) => button.textContent?.trim() === "Delete");
    if (!confirmDeleteButton) {
      throw new Error("Confirm delete button not found");
    }

    await act(async () => {
      fireEvent.click(confirmDeleteButton);
      fireEvent.click(confirmDeleteButton);
      await Promise.resolve();
    });

    expect(deleteSkill).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.();
    });
  });

  it("names the copied-distribution delete checkbox by its primary label", async () => {
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
      installDetails: { claude: { installed: true, mode: "copy" } },
      installStatus: { claude: true },
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
      uninstalledPlatforms: [],
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    fireEvent.click(screen.getByTitle("Delete"));

    expect(
      screen.getByRole("checkbox", {
        name: "Also delete copied distributions",
      }),
    ).toBeInTheDocument();
  });

  it("ignores repeated platform install clicks while the first install is pending", async () => {
    let resolveInstall:
      | ((value: {
          successCount: number;
          totalCount: number;
          failures: [];
          fallbacks: [];
        }) => void)
      | undefined;
    const batchInstall = vi.fn(
      () =>
        new Promise<{
          successCount: number;
          totalCount: number;
          failures: [];
          fallbacks: [];
        }>((resolve) => {
          resolveInstall = resolve;
        }),
    );
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [{ id: "claude", name: "Claude Code" }],
      batchInstall,
      deselectAllPlatforms: vi.fn(),
      installProgress: null,
      installDetails: {},
      installStatus: {},
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(["claude"]),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
      uninstalledPlatforms: [{ id: "claude", name: "Claude Code" }],
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    const installButton = screen.getByRole("button", { name: "Install All" });
    await act(async () => {
      fireEvent.click(installButton);
      fireEvent.click(installButton);
      await Promise.resolve();
    });

    expect(batchInstall).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall?.({
        successCount: 1,
        totalCount: 1,
        failures: [],
        fallbacks: [],
      });
    });
  });

  it("ignores repeated platform uninstall confirmations while the first uninstall is pending", async () => {
    let resolveUninstall: (() => void) | undefined;
    const uninstallFromPlatform = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUninstall = resolve;
        }),
    );
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
      installDetails: { claude: { installed: true, mode: "copy" } },
      installStatus: { claude: true },
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform,
      uninstalledPlatforms: [],
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));

    const uninstallButtons = screen.getAllByRole("button", {
      name: "Uninstall",
    });
    const confirmUninstallButton =
      uninstallButtons[uninstallButtons.length - 1];
    if (!confirmUninstallButton) {
      throw new Error("Confirm uninstall button not found");
    }

    await act(async () => {
      fireEvent.click(confirmUninstallButton);
      fireEvent.click(confirmUninstallButton);
      await Promise.resolve();
    });

    expect(uninstallFromPlatform).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUninstall?.();
    });
  });

  it("ignores repeated project deploy clicks while the first project deploy is pending", async () => {
    let resolveCopy: ((value: string) => void) | undefined;
    const copyRepoByPathToDirectory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    settingsState.skillProjects = [makeProject()];
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi
            .fn()
            .mockResolvedValue("/Users/demo/skills/async-actions"),
          copyRepoByPathToDirectory,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Demo Project/ }));

    const deployButton = screen.getByRole("button", {
      name: "Deploy Async Actions to Selected Projects",
    });
    await act(async () => {
      fireEvent.click(deployButton);
      fireEvent.click(deployButton);
      await Promise.resolve();
    });

    expect(copyRepoByPathToDirectory).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCopy?.("/Users/demo/project/.agents/skills/Async Actions");
    });
  });

  it("ignores repeated project removal confirmations while the first removal is pending", async () => {
    let resolveDelete: (() => void) | undefined;
    const selectedSkill = storeState.skills[0];
    const project = makeProject();
    const deleteLocalFileByPath = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    settingsState.skillProjects = [project];
    storeState.projectScanState = {
      [project.id]: {
        scannedSkills: [makeScannedProjectSkill(selectedSkill, project)],
        isScanning: false,
        error: null,
        lastScannedAt: Date.now(),
      },
    };
    installWindowMocks({
      api: {
        skill: { deleteLocalFileByPath },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillFullDetailPage />, { language: "en" });
    });

    const removeFromProjectButton = screen.getByRole("button", {
      name: "Remove from Project",
    });
    fireEvent.click(removeFromProjectButton);

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove from Project",
    });
    const confirmRemoveButton = removeButtons[removeButtons.length - 1];
    if (!confirmRemoveButton) {
      throw new Error("Confirm project removal button not found");
    }

    await act(async () => {
      fireEvent.click(confirmRemoveButton);
      fireEvent.click(confirmRemoveButton);
      await Promise.resolve();
    });

    expect(deleteLocalFileByPath).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.();
    });
  });
});
