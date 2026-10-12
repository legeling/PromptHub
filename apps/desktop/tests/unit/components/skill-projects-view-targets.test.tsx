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
      translationMode: "immersive",
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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
