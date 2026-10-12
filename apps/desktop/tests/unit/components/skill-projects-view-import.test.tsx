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
});
