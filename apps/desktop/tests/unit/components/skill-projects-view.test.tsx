import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillProjectsView } from "../../../src/renderer/components/skill/SkillProjectsView";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { installWindowMocks } from "../../helpers/window";

const showToastMock = vi.fn();

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

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();

  return {
    ...actual,
    useTranslation: () => ({
      t: (
        _key: string,
        fallback?: string | Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        if (typeof fallback === "string") {
          return fallback;
        }
        if (
          typeof fallback === "object" &&
          fallback &&
          "defaultValue" in fallback
        ) {
          return String(fallback.defaultValue);
        }
        if (options && "defaultValue" in options) {
          return String(options.defaultValue);
        }
        return _key;
      },
      i18n: { language: "en" },
    }),
  };
});

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("../../../src/renderer/components/ui/Modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock("../../../src/renderer/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: ReactNode;
    confirmText?: string;
    cancelText?: string;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <div>{message}</div>
        <button type="button" onClick={onClose}>
          {cancelText}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    ) : null,
}));

vi.mock("../../../src/renderer/components/skill/SkillQuickInstall", () => ({
  SkillQuickInstall: () => null,
}));

describe("SkillProjectsView", () => {
  beforeEach(() => {
    showToastMock.mockReset();

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      translationMode: "basic",
      skillInstallMethod: "copy",
      autoScanInstalledSkills: false,
      aiModels: [],
      skillProjects: [
        {
          id: "project-1",
          name: "Novel",
          rootPath: "/tmp/novel",
          scanPaths: [],
          deployTargets: ["/tmp/novel/.agents/skills"],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      addSkillProject: vi.fn(),
      updateSkillProject: vi.fn(),
      removeSkillProject: vi.fn(),
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "novel-auditor",
              description: "Audit long-form fiction structure",
              author: "PromptHub",
              tags: ["writing"],
              instructions: "# novel-auditor\n\nHelp audit fiction.",
              filePath: "/tmp/novel/.claude/skills/novel-auditor/SKILL.md",
              localPath: "/tmp/novel/.claude/skills/novel-auditor",
              platforms: ["claude"],
            },
            {
              name: "novel-builder",
              description: "Build story arcs and chapter beats",
              author: "PromptHub",
              tags: ["outline"],
              instructions: "# novel-builder\n\nBuild stories.",
              filePath: "/tmp/novel/.claude/skills/novel-builder/SKILL.md",
              localPath: "/tmp/novel/.claude/skills/novel-builder",
              platforms: ["claude"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills: vi.fn().mockResolvedValue([]),
      selectProject: vi.fn(),
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 1,
        importedSkills: [],
        failed: [],
        skipped: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);
  });

  it("shows project skill cards first and opens project detail actions after click", async () => {
    await act(async () => {
      render(<SkillProjectsView />);
    });

    expect(screen.getByTestId("project-skills-list")).toHaveClass("space-y-2");
    expect(screen.getByTestId("project-detail-shell")).toHaveAttribute(
      "data-project-id",
      "project-1",
    );
    expect(screen.getByTestId("project-detail-shell")).toHaveClass(
      "animate-in",
      "fade-in",
      "slide-in-from-right-3",
      "duration-smooth",
    );
    expect(screen.getByRole("button", { name: "Delete project" })).toHaveClass(
      "border-destructive/20",
      "bg-destructive/5",
      "text-destructive",
    );
    expect(screen.getAllByText("Novel")).toHaveLength(2);
    expect(screen.getByText("novel-auditor")).toBeInTheDocument();
    expect(screen.getByText("novel-builder")).toBeInTheDocument();
    expect(screen.queryByText("Open Folder")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open Folder" })).toHaveLength(
      2,
    );
    expect(screen.queryByText("Copy install")).not.toBeInTheDocument();
    expect(screen.getAllByText("External install")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Import from My Skills" }),
    ).toHaveClass("h-10", "w-full");
    expect(
      screen.getByRole("button", { name: "Import from My Skills" }).className,
    ).not.toContain("w-44");
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass(
      "h-9",
      "w-9",
    );
    expect(screen.getByRole("button", { name: "Delete project" })).toHaveClass(
      "h-9",
      "w-9",
    );
    expect(screen.getByRole("button", { name: "Edit" })).toHaveClass(
      "h-9",
      "w-9",
    );

    const projectSkillCards = screen.getAllByTestId("project-skill-card");
    expect(projectSkillCards).toHaveLength(2);
    for (const card of projectSkillCards) {
      expect(card.firstElementChild).toHaveClass("grid", "min-h-[124px]");
      expect(card.firstElementChild?.className).toContain(
        "grid-cols-[minmax(0,1fr)_12rem]",
      );
      expect(card.firstElementChild).toHaveClass("items-stretch");
      expect(card.firstElementChild?.className).toContain(
        "max-[760px]:grid-cols-1",
      );
      expect(card.firstElementChild?.className).not.toContain(
        "max-xl:grid-cols-1",
      );
    }

    for (const actionArea of screen.getAllByTestId("project-skill-actions")) {
      expect(actionArea).toHaveClass(
        "w-full",
        "items-end",
        "justify-end",
        "self-end",
      );
      expect(actionArea.className).not.toContain("max-xl:justify-start");
    }
    for (const importButton of screen.getAllByRole("button", {
      name: "Import to My Skills",
    })) {
      expect(importButton).toHaveClass("h-10", "w-10");
      expect(importButton).not.toHaveTextContent("Import to My Skills");
    }
    expect(screen.queryByText("Source / Content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));

    expect(screen.getByText("Source / Content")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import to My Skills" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("SKILL.md Content")).not.toBeInTheDocument();
    expect(screen.queryByText("SKILL.md")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Register project directories and manage their local skills.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Build story arcs and chapter beats"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Import to My Skills" }),
    );

    await waitFor(() => {
      expect(useSkillStore.getState().importScannedSkills).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            name: "novel-auditor",
            localPath: "/tmp/novel/.claude/skills/novel-auditor",
          }),
        ],
        undefined,
        "copy",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.queryByText("Source / Content")).not.toBeInTheDocument();
    expect(screen.getByText("novel-auditor")).toBeInTheDocument();
    expect(screen.getByText("novel-builder")).toBeInTheDocument();
  });

  it("keeps project action icons decorative and actions non-submit", async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      render(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <SkillProjectsView />
        </form>,
      );
    });

    const addProjectButton = screen.getByRole("button", {
      name: "Add Project",
    });
    expect(addProjectButton).toHaveAttribute("aria-label", "Add Project");

    await act(async () => {
      fireEvent.click(addProjectButton);
    });

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Import to My Skills" })[0],
      );
    });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("marks external symlink project skills distinctly from copied installs", async () => {
    useSkillStore.setState({
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "external-writer",
              description: "External linked writer",
              author: "PromptHub",
              tags: [],
              instructions: "# external-writer",
              filePath: "/tmp/novel/.agents/skills/external-writer/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/external-writer",
              platforms: ["Custom"],
              installMode: "symlink",
              symlinkTargetPath: "/external/feishu/skills/external-writer",
              isPromptHubManagedLink: false,
            },
          ],
          isScanning: false,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    expect(screen.getByText("external-writer")).toBeInTheDocument();
    expect(screen.queryByText("Symlink install")).not.toBeInTheDocument();
    expect(screen.getByText("External install")).toBeInTheDocument();
  });

  it("treats unmatched symlink project skills without managed metadata as external", async () => {
    useSkillStore.setState({
      skills: [],
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "legacy-linked",
              description: "Legacy linked project skill",
              author: "External",
              tags: [],
              instructions: "# legacy-linked",
              filePath: "/tmp/novel/.agents/skills/legacy-linked/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/legacy-linked",
              platforms: ["Custom"],
              installMode: "symlink",
              symlinkTargetPath: "/external/legacy/skills/legacy-linked",
            },
          ],
          isScanning: false,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    expect(screen.getByText("legacy-linked")).toBeInTheDocument();
    expect(screen.queryByText("Symlink install")).not.toBeInTheDocument();
    expect(screen.getByText("External install")).toBeInTheDocument();
  });

  it("shows a source-target action for external symlink project skills", async () => {
    const { electron } = installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# external-writer",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });
    useSkillStore.setState({
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "external-writer",
              description: "External linked writer",
              author: "PromptHub",
              tags: [],
              instructions: "# external-writer",
              filePath: "/tmp/novel/.agents/skills/external-writer/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/external-writer",
              platforms: ["Custom"],
              installMode: "symlink",
              symlinkTargetPath: "/external/feishu/skills/external-writer",
              isPromptHubManagedLink: false,
            },
          ],
          isScanning: false,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByText("external-writer"));

    const sourceTargetButton = await screen.findByRole("button", {
      name: /Open source Skill folder/i,
    });
    expect(sourceTargetButton).toHaveTextContent(
      "/external/feishu/skills/external-writer",
    );

    fireEvent.click(sourceTargetButton);

    await waitFor(() => {
      expect(electron.openPath).toHaveBeenCalledWith(
        "/external/feishu/skills/external-writer",
      );
    });
  });

  it("removes a registered project after confirmation without deleting files", async () => {
    const removeSkillProject = vi.fn();
    const selectProject = vi.fn();

    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project-1",
          name: "Novel",
          rootPath: "/tmp/novel",
          scanPaths: [],
          deployTargets: ["/tmp/novel/.agents/skills"],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "project-2",
          name: "Work",
          rootPath: "/tmp/work",
          scanPaths: [],
          deployTargets: ["/tmp/work/.agents/skills"],
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      removeSkillProject,
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useSkillStore.setState({
      selectedProjectId: "project-1",
      selectProject,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

    expect(
      screen.getByRole("dialog", { name: "Delete project" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Remove project "{{name}}" from PromptHub? This only removes the project workspace record and does not delete any files.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(removeSkillProject).toHaveBeenCalledWith("project-1");
    expect(selectProject).toHaveBeenCalledWith("project-2");
    expect(showToastMock).toHaveBeenCalledWith("Project removed", "success");
  });

  it("keeps the project skill view selected when opening and returning from project detail", async () => {
    const selectSkill = vi.fn((skillId: string | null) => {
      useSkillStore.setState({ selectedSkillId: skillId });
    });
    const setStoreView = vi.fn((storeView: string) => {
      useSkillStore.setState({ storeView: storeView as never });
    });

    useSkillStore.setState({
      filterType: "favorites",
      selectedSkillId: "previous-favorite-skill",
      storeView: "projects",
      selectSkill,
      setStoreView,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));

    expect(setStoreView).toHaveBeenCalledWith("projects");
    expect(selectSkill).toHaveBeenCalledWith(null);
    expect(useSkillStore.getState().storeView).toBe("projects");
    expect(useSkillStore.getState().selectedSkillId).toBeNull();
    expect(screen.getByText("Source / Content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(useSkillStore.getState().storeView).toBe("projects");
    expect(useSkillStore.getState().selectedSkillId).toBeNull();
    expect(screen.queryByText("Source / Content")).not.toBeInTheDocument();
    expect(screen.getByText("novel-auditor")).toBeInTheDocument();
  });

  it("removes a project skill folder directly from the project skill card", async () => {
    const deleteLocalFileByPath = vi.fn().mockResolvedValue(undefined);
    const scanProjectSkills = vi.fn().mockResolvedValue([]);

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          deleteLocalFileByPath,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      scanProjectSkills,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    expect(screen.queryByText("Source / Content")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Remove from Project" })[0],
      );
    });

    await waitFor(() => {
      expect(deleteLocalFileByPath).toHaveBeenCalledWith(
        "/tmp/novel/.claude/skills/novel-auditor",
        ".",
      );
      expect(scanProjectSkills).toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-1" }),
      );
      expect(showToastMock).toHaveBeenCalledWith(
        "Removed from project",
        "success",
      );
    });
  });

  it("prefills project name from the selected root path and auto scans after creation", async () => {
    const selectFolder = vi.fn().mockResolvedValue("/tmp/story-world");
    const addSkillProject = vi.fn().mockReturnValue({
      id: "project-2",
      name: "story-world",
      rootPath: "/tmp/story-world",
      scanPaths: [],
      deployTargets: ["/tmp/story-world/.agents/skills"],
      createdAt: 2,
      updatedAt: 2,
    });
    const scanProjectSkills = vi.fn().mockResolvedValue([]);
    const selectProject = vi.fn();

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
        },
      },
      electron: {
        selectFolder,
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      translationMode: "basic",
      skillInstallMethod: "copy",
      autoScanInstalledSkills: false,
      aiModels: [],
      skillProjects: [],
      addSkillProject,
      updateSkillProject: vi.fn(),
      removeSkillProject: vi.fn(),
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: null,
      projectScanState: {},
      scanProjectSkills,
      selectProject,
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 0,
        importedSkills: [],
        failed: [],
        skipped: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));

    const rootPathLabel = screen.getByText("Project Root Path");
    const projectNameLabel = screen.getByText("Project Name");
    expect(
      rootPathLabel.compareDocumentPosition(projectNameLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.getByTestId("project-root-path-row")).toHaveClass(
      "w-full",
      "items-start",
    );
    expect(screen.getByTestId("project-root-path-input-shell")).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(
      within(screen.getByTestId("project-root-path-row")).getByRole("button", {
        name: "Browse",
      }),
    ).toHaveClass("h-10", "shrink-0");
    expect(
      screen.getByRole("textbox", { name: "Project Root Path" }),
    ).toHaveValue("");
    expect(screen.getByTestId("project-scan-path-row")).toHaveClass(
      "w-full",
      "items-start",
    );
    expect(screen.getByTestId("project-scan-path-input-shell")).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(
      within(screen.getByTestId("project-scan-path-row")).getByRole("button", {
        name: "Add",
      }),
    ).toHaveClass("h-10", "shrink-0");
    expect(
      within(screen.getByTestId("project-scan-path-row")).getByRole("button", {
        name: "Browse",
      }),
    ).toHaveClass("h-10", "shrink-0");
    expect(screen.getByRole("textbox", { name: "Scan Paths" })).toHaveValue(
      "",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Browse" })[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("story-world")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Project" }).at(-1)!,
    );

    await waitFor(() => {
      expect(addSkillProject).toHaveBeenCalledWith({
        name: "story-world",
        rootPath: "/tmp/story-world",
        scanPaths: [],
      });
    });

    expect(selectProject).toHaveBeenCalledWith("project-2");
    expect(scanProjectSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "project-2",
        rootPath: "/tmp/story-world",
      }),
    );
  });

  it("ignores repeated project creation clicks while the first save is pending", async () => {
    const selectFolder = vi.fn().mockResolvedValue("/tmp/story-world");
    const addSkillProject = vi.fn().mockReturnValue({
      id: "project-2",
      name: "story-world",
      rootPath: "/tmp/story-world",
      scanPaths: [],
      deployTargets: ["/tmp/story-world/.agents/skills"],
      createdAt: 2,
      updatedAt: 2,
    });
    const scanProjectSkills = vi.fn(
      () =>
        new Promise<[]>((_resolve) => {
          // Keep the first save pending so a repeated click can be observed.
        }),
    );
    const selectProject = vi.fn();

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
        },
      },
      electron: {
        selectFolder,
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      translationMode: "basic",
      skillInstallMethod: "copy",
      autoScanInstalledSkills: false,
      aiModels: [],
      skillProjects: [],
      addSkillProject,
      updateSkillProject: vi.fn(),
      removeSkillProject: vi.fn(),
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: null,
      projectScanState: {},
      scanProjectSkills,
      selectProject,
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 0,
        importedSkills: [],
        failed: [],
        skipped: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Browse" })[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("story-world")).toBeInTheDocument();
    });

    const createButton = screen.getAllByRole("button", {
      name: "Add Project",
    }).at(-1)!;

    fireEvent.click(createButton);
    fireEvent.click(createButton);

    expect(addSkillProject).toHaveBeenCalledTimes(1);
    expect(scanProjectSkills).toHaveBeenCalledTimes(1);
  });

  it("does not close a reopened project form when an earlier save finishes", async () => {
    const selectFolder = vi.fn().mockResolvedValue("/tmp/story-world");
    const addSkillProject = vi.fn().mockReturnValue({
      id: "project-2",
      name: "story-world",
      rootPath: "/tmp/story-world",
      scanPaths: [],
      deployTargets: ["/tmp/story-world/.agents/skills"],
      createdAt: 2,
      updatedAt: 2,
    });
    let resolveScan: (value: []) => void = () => undefined;
    const scanProjectSkills = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolveScan = resolve;
        }),
    );

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
        },
      },
      electron: {
        selectFolder,
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      translationMode: "basic",
      skillInstallMethod: "copy",
      autoScanInstalledSkills: false,
      aiModels: [],
      skillProjects: [],
      addSkillProject,
      updateSkillProject: vi.fn(),
      removeSkillProject: vi.fn(),
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: null,
      projectScanState: {},
      scanProjectSkills,
      selectProject: vi.fn(),
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 0,
        importedSkills: [],
        failed: [],
        skipped: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Browse" })[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("story-world")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Project" }).at(-1)!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));

    expect(screen.getByText("Project Root Path")).toBeInTheDocument();

    await act(async () => {
      resolveScan([]);
    });

    expect(screen.getByText("Project Root Path")).toBeInTheDocument();
  });

  it("shows imported card shortcuts and keeps project detail actions for imported skills", async () => {
    const selectSkill = vi.fn();
    const setStoreView = vi.fn();

    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "novel-auditor",
          description: "Audit long-form fiction structure",
          instructions: "# novel-auditor\n\nHelp audit fiction.",
          content: "# novel-auditor\n\nHelp audit fiction.",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/tmp/novel/.claude/skills/novel-auditor",
          source_url: "/tmp/novel/.claude/skills/novel-auditor",
          tags: ["writing"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectSkill,
      setStoreView,
      selectedProjectId: "project-1",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    const openInLibraryButton = screen.getByRole("button", {
      name: "Open in My Skills",
    });

    expect(
      screen.getByRole("button", { name: "Distribute" }),
    ).toBeInTheDocument();

    fireEvent.click(openInLibraryButton);

    expect(setStoreView).toHaveBeenCalledWith("my-skills");
    expect(selectSkill).toHaveBeenCalledWith("skill-1");
    setStoreView.mockClear();
    selectSkill.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));

    expect(
      screen.queryByRole("button", { name: "Import to My Skills" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Platform Integration")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Remove from Project" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "This skill is already managed in My Skills. If the project copy changes, you can re-import to refresh it.",
      ),
    ).toBeInTheDocument();
    const detailOpenInLibraryButton = screen.getByRole("button", {
      name: "Open in My Skills",
    });

    fireEvent.click(detailOpenInLibraryButton);

    expect(setStoreView).toHaveBeenCalledWith("my-skills");
    expect(selectSkill).toHaveBeenCalledWith("skill-1");
  });

  it("does not treat same-name project skills as imported when paths differ", async () => {
    const selectSkill = vi.fn();
    const setStoreView = vi.fn();

    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "novel-auditor",
          description: "Audit long-form fiction structure",
          instructions: "# novel-auditor\n\nHelp audit fiction.",
          content: "# novel-auditor\n\nHelp audit fiction.",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/novel-auditor",
          source_url: "/Users/demo/skills/novel-auditor",
          tags: ["writing"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectSkill,
      setStoreView,
      selectedProjectId: "project-1",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    expect(screen.queryByText("In My Skills")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open in My Skills" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));

    expect(await screen.findByText("Platform Integration")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import to My Skills" }),
    ).toBeInTheDocument();
    expect(setStoreView).toHaveBeenCalledWith("projects");
    expect(setStoreView).not.toHaveBeenCalledWith("my-skills");
    expect(selectSkill).toHaveBeenCalledWith(null);
  });

  it("treats a project copy with the same directory fingerprint as a My Skills install", async () => {
    const selectSkill = vi.fn();
    const setStoreView = vi.fn();

    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "claude-api",
          description: "Build Claude API apps",
          instructions: "# claude-api",
          content: "# claude-api",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/PromptHub/skills/claude-api/repo",
          directory_fingerprint: "fingerprint-claude-api",
          tags: ["api"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectSkill,
      setStoreView,
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "claude-api",
              description: "Build Claude API apps",
              author: "PromptHub",
              tags: ["api"],
              instructions: "# claude-api",
              directory_fingerprint: "fingerprint-claude-api",
              filePath: "/tmp/novel/.agents/skills/claude-api/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/claude-api",
              platforms: ["Custom"],
              installMode: "copy",
            },
          ],
          isScanning: false,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    expect(screen.getByText("In My Skills")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import to My Skills" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /claude-api/i }));

    expect(
      screen.queryByRole("button", { name: "Import to My Skills" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        "This skill is already managed in My Skills. If the project copy changes, you can re-import to refresh it.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open in My Skills" }));

    expect(setStoreView).toHaveBeenCalledWith("my-skills");
    expect(selectSkill).toHaveBeenCalledWith("skill-1");
  });

  it("imports project skills into my skills with copy mode", async () => {
    const importScannedSkills = vi.fn().mockResolvedValue({
      importedCount: 1,
      importedSkills: [],
      failed: [],
      skipped: [],
    });

    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "novel-auditor",
              description: "Audit long-form fiction structure",
              author: "PromptHub",
              tags: ["writing"],
              instructions: "# novel-auditor\n\nHelp audit fiction.",
              filePath: "/tmp/novel/.claude/skills/novel-auditor/SKILL.md",
              localPath: "/tmp/novel/.claude/skills/novel-auditor",
              platforms: ["claude"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills: vi.fn().mockResolvedValue([]),
      selectProject: vi.fn(),
      importScannedSkills,
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Import to My Skills" }),
      );
    });

    await waitFor(() => {
      expect(importScannedSkills).toHaveBeenCalledWith(
        [expect.objectContaining({ name: "novel-auditor" })],
        undefined,
        "copy",
      );
    });
  }, 60000);

  it("shows remove from project for already imported project skills", async () => {
    const deleteLocalFileByPath = vi.fn().mockResolvedValue(undefined);
    const scanProjectSkills = vi.fn().mockResolvedValue([]);

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          deleteLocalFileByPath,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "novel-auditor",
          description: "Audit long-form fiction structure",
          instructions: "# novel-auditor\n\nHelp audit fiction.",
          content: "# novel-auditor\n\nHelp audit fiction.",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/tmp/novel/.claude/skills/novel-auditor",
          source_url: "/tmp/novel/.claude/skills/novel-auditor",
          tags: ["writing"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "novel-auditor",
              description: "Audit long-form fiction structure",
              author: "PromptHub",
              tags: ["writing"],
              instructions: "# novel-auditor\n\nHelp audit fiction.",
              filePath: "/tmp/novel/.claude/skills/novel-auditor/SKILL.md",
              localPath: "/tmp/novel/.claude/skills/novel-auditor",
              platforms: ["claude"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills,
      selectProject: vi.fn(),
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 0,
        importedSkills: [],
        failed: [],
        skipped: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Remove from Project" })[0],
      );
    });

    await waitFor(() => {
      expect(deleteLocalFileByPath).toHaveBeenCalledWith(
        "/tmp/novel/.claude/skills/novel-auditor",
        ".",
      );
      expect(scanProjectSkills).toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-1" }),
      );
    });
  });

  it("allows importing selected library skills from the project header", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/library-skill");
    const getRepoPath = vi
      .fn()
      .mockResolvedValue("/Users/demo/skills/library-skill");
    const scanProjectSkills = vi.fn().mockResolvedValue([]);

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-library-1",
          name: "library-skill",
          description: "From my skills",
          instructions: "# library-skill",
          content: "# library-skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/library-skill",
          source_url: "/Users/demo/skills/library-skill",
          directory_fingerprint: "fingerprint-library-skill",
          tags: ["general"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /library-skill/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 selected skill(s)" }),
    );

    await waitFor(() => {
      expect(getRepoPath).toHaveBeenCalledWith("skill-library-1");
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/library-skill",
        "library-skill",
        "/tmp/novel/.agents/skills",
        { ifExists: "overwrite", mode: "copy" },
      );
    });

    expect(scanProjectSkills).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-1" }),
    );
  });

  it("marks library skills already present in the selected project target", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/library-skill");
    const getRepoPath = vi
      .fn()
      .mockResolvedValue("/Users/demo/skills/library-skill");

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-library-1",
          name: "library-skill",
          description: "From my skills",
          instructions: "# library-skill",
          content: "# library-skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/library-skill",
          source_url: "/Users/demo/skills/library-skill",
          directory_fingerprint: "fingerprint-library-skill",
          tags: ["general"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "library-skill",
              description: "From my skills",
              author: "PromptHub",
              tags: ["general"],
              instructions: "# library-skill",
              filePath: "/tmp/novel/.agents/skills/library-skill/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/library-skill",
              directory_fingerprint: "fingerprint-library-skill",
              platforms: ["Custom"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills: vi.fn().mockResolvedValue([]),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );

    expect(screen.getByText("Already Imported")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 0 selected skill(s)" }),
    ).toBeDisabled();
    expect(copyRepoByPathToDirectory).not.toHaveBeenCalled();
  });

  it("replaces a same-name project target when importing a different library variant", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/writer");
    const getRepoPath = vi
      .fn()
      .mockResolvedValue("/Users/demo/skills/writer-dev");

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# writer\n\nHelp write.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-writer-dev",
          name: "writer",
          description: "Dev writer",
          instructions: "# writer dev",
          content: "# writer dev",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/writer-dev",
          directory_fingerprint: "fingerprint-dev",
          tags: ["general"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "writer",
              description: "Stable writer",
              author: "PromptHub",
              tags: ["general"],
              instructions: "# writer stable",
              filePath: "/tmp/novel/.agents/skills/writer/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/writer",
              directory_fingerprint: "fingerprint-stable",
              platforms: ["Custom"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills: vi.fn().mockResolvedValue([]),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    const devWriterButton = screen.getByText("Dev writer").closest("button");
    expect(devWriterButton).not.toBeNull();
    fireEvent.click(devWriterButton!);
    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 selected skill(s)" }),
    );

    await waitFor(() => {
      expect(getRepoPath).toHaveBeenCalledWith("skill-writer-dev");
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/writer-dev",
        "writer",
        "/tmp/novel/.agents/skills",
        { ifExists: "overwrite", mode: "copy" },
      );
    });
  });

  it("supports advanced import targets and custom folders", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.claude/skills/library-skill");
    const getRepoPath = vi
      .fn()
      .mockResolvedValue("/Users/demo/skills/library-skill");
    const selectFolder = vi.fn().mockResolvedValue("/tmp/novel/custom-targets");

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        selectFolder,
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-library-1",
          name: "library-skill",
          description: "From my skills",
          instructions: "# library-skill",
          content: "# library-skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/library-skill",
          source_url: "/Users/demo/skills/library-skill",
          tags: ["general"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills: vi.fn().mockResolvedValue([]),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /library-skill/i }));
    fireEvent.click(screen.getByRole("button", { name: /.claude\/skills/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add Folder" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Custom target.*\/tmp\/novel\/custom-targets/i,
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 selected skill(s)" }),
    );

    await waitFor(() => {
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/library-skill",
        "library-skill",
        "/tmp/novel/.agents/skills",
        { ifExists: "overwrite", mode: "copy" },
      );
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/library-skill",
        "library-skill",
        "/tmp/novel/.claude/skills",
        { ifExists: "overwrite", mode: "copy" },
      );
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/library-skill",
        "library-skill",
        "/tmp/novel/custom-targets",
        { ifExists: "overwrite", mode: "copy" },
      );
    });

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "Imported {{count}} library skill(s) into this project via {{mode}} ({{targets}}).",
        "success",
      );
    });
  }, 60000);

  it("supports symlink mode when importing my skills into a project", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/library-skill");
    const getRepoPath = vi
      .fn()
      .mockResolvedValue("/Users/demo/skills/library-skill");

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-library-1",
          name: "library-skill",
          description: "From my skills",
          instructions: "# library-skill",
          content: "# library-skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/library-skill",
          source_url: "/Users/demo/skills/library-skill",
          tags: ["general"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills: vi.fn().mockResolvedValue([]),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Symlink.*Link the project folder to My Skills/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /library-skill/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 selected skill(s)" }),
    );

    await waitFor(() => {
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/Users/demo/skills/library-skill",
        "library-skill",
        "/tmp/novel/.agents/skills",
        { ifExists: "overwrite", mode: "symlink" },
      );
    });
  }, 15000);

  it("remembers project import preferences after reopening the modal", async () => {
    const selectFolder = vi.fn().mockResolvedValue("/tmp/novel/custom-targets");

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
        },
      },
      electron: {
        selectFolder,
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      projectSkillImportModePreference: "copy",
      projectSkillImportPreferencesByProjectId: {},
    });

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Symlink.*Link the project folder to My Skills/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /.claude\/skills/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add Folder" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Custom target.*\/tmp\/novel\/custom-targets/i,
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );

    expect(
      screen.getByRole("button", {
        name: /Symlink.*Link the project folder to My Skills/i,
      }),
    ).toHaveClass("border-primary/40");
    expect(
      screen.getByRole("button", { name: /.claude\/skills/i }),
    ).toHaveClass("border-primary/40");
    expect(
      screen.getByRole("button", {
        name: /Custom target.*\/tmp\/novel\/custom-targets/i,
      }),
    ).toBeInTheDocument();
  }, 15000);

  it("warns when background rescan fails after a successful import", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/library-skill");
    const getRepoPath = vi
      .fn()
      .mockResolvedValue("/Users/demo/skills/library-skill");
    const scanProjectSkills = vi
      .fn()
      .mockRejectedValue(new Error("scan failed"));

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          getRepoPath,
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "skill-library-1",
          name: "library-skill",
          description: "From my skills",
          instructions: "# library-skill",
          content: "# library-skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/Users/demo/skills/library-skill",
          source_url: "/Users/demo/skills/library-skill",
          tags: ["general"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [],
          isScanning: false,
          error: null,
        },
      },
      scanProjectSkills,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import from My Skills" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /library-skill/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 selected skill(s)" }),
    );

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "Import completed, but PromptHub could not refresh the project list. Please rescan manually.",
        "warning",
      );
    });
  }, 15000);

  it("deploys a project-local skill to the default project target", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/novel-auditor");
    const scanProjectSkills = vi.fn().mockResolvedValue([]);

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSkillStore.setState({
      scanProjectSkills,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Deploy novel-auditor to Project Folders",
      }),
    );

    await waitFor(() => {
      expect(copyRepoByPathToDirectory).toHaveBeenCalledWith(
        "/tmp/novel/.claude/skills/novel-auditor",
        "novel-auditor",
        "/tmp/novel/.agents/skills",
      );
    });

    expect(scanProjectSkills).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-1", rootPath: "/tmp/novel" }),
    );
  });

  it("blocks redeploying a project-local skill into its current target tree", async () => {
    const copyRepoByPathToDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/novel/.agents/skills/novel-auditor");

    installWindowMocks({
      api: {
        skill: {
          readLocalFileByPath: vi.fn().mockResolvedValue({
            content: "# novel-auditor\n\nHelp audit fiction.",
          }),
          listLocalFilesByPath: vi.fn().mockResolvedValue([]),
          copyRepoByPathToDirectory,
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project-1",
          name: "Novel",
          rootPath: "/tmp/novel",
          scanPaths: [],
          deployTargets: ["/tmp/novel/.agents/skills"],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useSkillStore.setState({
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "novel-auditor",
              description: "Audit long-form fiction structure",
              author: "PromptHub",
              tags: ["writing"],
              instructions: "# novel-auditor\n\nHelp audit fiction.",
              filePath: "/tmp/novel/.agents/skills/novel-auditor/SKILL.md",
              localPath: "/tmp/novel/.agents/skills/novel-auditor",
              platforms: ["custom"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    fireEvent.click(screen.getByRole("button", { name: /novel-auditor/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Deploy novel-auditor to Project Folders",
      }),
    );

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "This skill is already inside the selected project target folders.",
        "warning",
      );
    });
    expect(copyRepoByPathToDirectory).not.toHaveBeenCalled();
  });

  it("auto scans the selected project when no cached scan state exists", async () => {
    const scanProjectSkills = vi.fn().mockResolvedValue([]);

    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      searchQuery: "",
      selectedProjectId: "project-1",
      projectScanState: {},
      scanProjectSkills,
      selectProject: vi.fn(),
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 0,
        importedSkills: [],
        failed: [],
        skipped: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
      translateContent: vi.fn().mockResolvedValue("# translated"),
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      clearTranslation: vi.fn(),
      toggleFavorite: vi.fn(),
      deleteSkill: vi.fn(),
      loadSkills: vi.fn().mockResolvedValue(undefined),
      syncSkillFromRepo: vi.fn().mockResolvedValue(null),
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
      selectSkill: vi.fn(),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      render(<SkillProjectsView />);
    });

    await waitFor(() => {
      expect(scanProjectSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "project-1",
          rootPath: "/tmp/novel",
        }),
      );
    });
  });
});
