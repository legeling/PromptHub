import type { ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillAgentsView } from "../../../src/renderer/components/skill/SkillAgentsView";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
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

const translate = (
  _key: string,
  fallback?: string | Record<string, unknown>,
  options?: Record<string, unknown>,
) => {
  if (typeof fallback === "string") {
    return fallback;
  }
  if (typeof fallback === "object" && fallback && "defaultValue" in fallback) {
    return String(fallback.defaultValue);
  }
  if (options && "defaultValue" in options) {
    return String(options.defaultValue);
  }
  return _key;
};

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();

  return {
    ...actual,
    useTranslation: () => ({
      t: translate,
      i18n: { language: "en" },
    }),
  };
});

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("../../../src/renderer/components/ui/Modal", () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: ReactNode;
    title?: string;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

vi.mock("../../../src/renderer/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onConfirm}>
        confirm-uninstall
      </button>
    ) : null,
}));

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => ({
  SkillFileEditor: ({ localPath }: { localPath?: string }) => (
    <div>file-editor:{localPath}</div>
  ),
}));

const claudePlatform = {
  id: "claude",
  name: "Claude Code",
  icon: "Sparkles",
  rootDir: {
    darwin: "~/.claude",
    win32: "%USERPROFILE%\\.claude",
    linux: "~/.claude",
  },
  skillsRelativePath: "skills",
};

const cherryPlatform = {
  id: "cherry-studio",
  name: "Cherry Studio",
  icon: "Bot",
  rootDir: {
    darwin: "~/Library/Application Support/CherryStudio",
    win32: "%APPDATA%\\CherryStudio",
    linux: "~/.config/CherryStudio",
  },
  skillsRelativePath: "Data/Skills",
};

function scanResult() {
  return {
    platform: claudePlatform,
    skillsDir: "/agents/claude/skills",
    scannedSkills: [
      {
        name: "copy-skill",
        description: "Copied skill",
        author: "PromptHub",
        tags: ["copy"],
        instructions: "# Copy Skill",
        filePath: "/agents/claude/skills/copy-skill/SKILL.md",
        localPath: "/agents/claude/skills/copy-skill",
        platformSkillPath: "/agents/claude/skills/copy-skill",
        platforms: ["Claude Code"],
        installMode: "copy" as const,
      },
      {
        name: "linked-skill",
        description: "Linked skill",
        author: "PromptHub",
        tags: ["symlink"],
        instructions: "# Linked Skill",
        directory_fingerprint: "fingerprint-linked",
        filePath: "/agents/claude/skills/linked-skill/SKILL.md",
        localPath: "/agents/claude/skills/linked-skill",
        platformSkillPath: "/agents/claude/skills/linked-skill",
        platforms: ["Claude Code"],
        installMode: "symlink" as const,
        symlinkTargetPath: "/external/feishu/skills/linked-skill",
        isPromptHubManagedLink: false,
      },
    ],
  };
}

function cherryBuiltinScanResult() {
  return {
    platform: cherryPlatform,
    skillsDir: "/agents/cherry/Data/Skills",
    scannedSkills: [
      {
        name: "find-skills",
        description: "Helps users discover and install skills",
        author: "Cherry Studio",
        tags: [],
        instructions: "# Find Skills",
        filePath: "/agents/cherry/Data/Skills/find-skills/SKILL.md",
        localPath: "/agents/cherry/Data/Skills/find-skills",
        platformSkillPath: "/agents/cherry/Data/Skills/find-skills",
        platforms: ["Cherry Studio"],
        installMode: "copy" as const,
        isPlatformBuiltin: true,
      },
    ],
  };
}

describe("SkillAgentsView", () => {
  beforeEach(() => {
    showToastMock.mockReset();
    useUIStore.setState({ pendingSettingsSection: null });
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(scanResult()),
          uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
          export: vi.fn().mockResolvedValue("# Library Skill"),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Copy Skill" }),
          installMd: vi.fn().mockResolvedValue(undefined),
          installMdSymlink: vi.fn().mockResolvedValue({
            requestedMode: "symlink",
            effectiveMode: "symlink",
          }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    useSettingsStore.setState({
      skillInstallMethod: "symlink",
      skillPlatformOrder: ["claude"],
      disabledPlatformIds: [],
      projectSkillImportModePreference: "copy",
      projectSkillImportPreferencesByProjectId: {},
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useSkillStore.setState({
      skills: [
        {
          id: "library-linked",
          name: "linked-skill",
          description: "Managed linked skill",
          instructions: "# Linked Skill",
          content: "# Linked Skill",
          protocol_type: "skill",
          author: "PromptHub",
          directory_fingerprint: "fingerprint-linked",
          local_repo_path: "/library/linked-skill",
          tags: ["library"],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectedSkillId: null,
      searchQuery: "",
      storeView: "agents",
      agentScanState: {
        claude: {
          result: scanResult(),
          isScanning: false,
          scannedAt: 1,
          error: null,
        },
      },
      selectSkill: vi.fn((id: string | null) => {
        useSkillStore.setState({ selectedSkillId: id } as never);
      }),
      setStoreView: vi.fn((view: string) => {
        useSkillStore.setState({ storeView: view as never });
      }),
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 1,
        importedSkills: [],
        skipped: [],
        failed: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof useSkillStore.getState>>);
  });

  it("renders the agent skill browser without opening a persistent detail pane", async () => {
    render(<SkillAgentsView />);

    expect((await screen.findAllByText("Claude Code")).length).toBeGreaterThan(
      0,
    );
    const agentPlatformCard = (
      await screen.findAllByRole("button", { name: /Claude Code/i })
    ).find((button) => button.textContent?.includes("skills"));
    expect(agentPlatformCard).toBeTruthy();
    expect(agentPlatformCard).toHaveClass("px-3", "py-3", "bg-primary/10");
    expect(agentPlatformCard).not.toHaveClass("px-4", "bg-primary/5");
    expect(
      within(agentPlatformCard!).getByTestId("agent-platform-icon-shell"),
    ).toHaveClass("h-10", "w-10", "rounded-xl", "bg-muted");
    expect(
      within(agentPlatformCard!).getByText("2 skills"),
    ).toBeInTheDocument();
    expect(await screen.findByAltText("claude icon")).toBeInTheDocument();
    expect((await screen.findAllByText("copy-skill")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("linked-skill").length).toBeGreaterThan(0);
    expect(screen.getAllByText("External install").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In My Skills").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Browse each agent's Skill directory and manage copy or symlink installs.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Manage Agents")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-manage-settings-button")).toHaveClass(
      "h-10",
      "w-10",
    );
    fireEvent.click(screen.getByTestId("agent-manage-settings-button"));
    expect(useUIStore.getState().pendingSettingsSection).toBe("skill");
    expect(screen.getAllByText("2 skills")).toHaveLength(2);
    expect(screen.getByText("1 managed")).toBeInTheDocument();
    expect(screen.getByText("1 unmanaged")).toBeInTheDocument();
    expect(screen.getByText("0 copy")).toBeInTheDocument();
    expect(screen.getByText("0 symlink")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-skill-filter-managed"));
    expect(screen.getByTestId("agent-skill-filter-managed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("agent-skill-card")).toHaveLength(1);
    expect(screen.getByText("linked-skill")).toBeInTheDocument();
    expect(screen.queryByText("copy-skill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-skill-filter-unmanaged"));
    expect(screen.getByTestId("agent-skill-filter-unmanaged")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("agent-skill-card")).toHaveLength(1);
    expect(screen.getByText("copy-skill")).toBeInTheDocument();
    expect(screen.queryByText("linked-skill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-skill-filter-copy"));
    expect(screen.queryAllByTestId("agent-skill-card")).toHaveLength(0);
    expect(screen.getByText("No skills in this agent")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-skill-filter-all"));
    expect(screen.getAllByTestId("agent-skill-card")).toHaveLength(2);
    expect(screen.getByTestId("agent-sidebar-header")).toHaveClass("h-[132px]");
    expect(screen.getByTestId("agent-detail-header")).toHaveClass("h-[132px]");
    expect(screen.getByTestId("agent-detail-shell")).toHaveClass(
      "app-wallpaper-section",
    );
    expect(screen.getByTestId("agent-detail-shell")).toHaveAttribute(
      "data-agent-id",
      "claude",
    );
    expect(screen.getByTestId("agent-detail-shell")).toHaveClass(
      "animate-in",
      "fade-in",
      "slide-in-from-right-3",
      "duration-smooth",
    );
    expect(screen.getByTestId("agent-detail-shell")).not.toHaveClass(
      "app-wallpaper-panel",
    );
    expect(screen.getByTestId("agent-skills-list")).toHaveClass("space-y-2");
    expect(screen.getByTestId("agent-skills-list")).not.toHaveClass("grid");
    expect(screen.getByTestId("agent-skills-list").className).not.toContain(
      "xl:grid-cols-2",
    );
    expect(screen.getAllByTestId("agent-skill-card")).toHaveLength(2);
    for (const card of screen.getAllByTestId("agent-skill-card")) {
      expect(card.firstElementChild).toHaveClass(
        "grid",
        "min-h-[124px]",
        "items-stretch",
      );
      expect(card.firstElementChild?.className).toContain(
        "grid-cols-[minmax(0,1fr)_12rem]",
      );
      expect(card.firstElementChild?.className).not.toContain(
        "grid-cols-[minmax(0,1fr)_9.5rem]",
      );
      expect(within(card).getByTestId("agent-skill-actions")).toHaveClass(
        "items-end",
        "justify-end",
        "self-end",
      );
      expect(
        within(card).getByRole("button", { name: "Open Folder" }),
      ).toHaveClass("h-10", "w-10");
    }
    expect(
      screen.getAllByRole("button", { name: /Uninstall from agent/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("# Copy Skill")).not.toBeInTheDocument();
  });

  it("keeps agent action icons decorative and actions non-submit", async () => {
    const handleSubmit = vi.fn();

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <SkillAgentsView />
      </form>,
    );

    expect(await screen.findByText("copy-skill")).toBeInTheDocument();

    const agentPlatformCard = (
      await screen.findAllByRole("button", { name: /Claude Code/i })
    ).find((button) => button.textContent?.includes("skills"));
    expect(agentPlatformCard).toBeTruthy();
    expect(agentPlatformCard).not.toHaveAccessibleName(/claude icon/i);

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

    fireEvent.click(screen.getByTestId("agent-manage-settings-button"));
    fireEvent.click(screen.getAllByRole("button", { name: "Open Folder" })[0]);

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("shows a source-target action for external symlink agent skills", async () => {
    const { electron } = installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(scanResult()),
          uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
          export: vi.fn().mockResolvedValue("# Linked Skill"),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Linked Skill" }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    render(<SkillAgentsView />);

    fireEvent.click(await screen.findByText("linked-skill"));

    const shortcutButton = await screen.findByRole("button", {
      name: /Open agent shortcut/i,
    });
    expect(shortcutButton).toHaveTextContent(
      "/agents/claude/skills/linked-skill",
    );

    fireEvent.click(shortcutButton);

    await waitFor(() => {
      expect(electron.openPath).toHaveBeenCalledWith(
        "/agents/claude/skills/linked-skill",
      );
    });

    const sourceTargetButton = await screen.findByRole("button", {
      name: /Open source Skill folder/i,
    });
    expect(sourceTargetButton).toHaveTextContent(
      "/external/feishu/skills/linked-skill",
    );

    fireEvent.click(sourceTargetButton);

    await waitFor(() => {
      expect(electron.openPath).toHaveBeenCalledWith(
        "/external/feishu/skills/linked-skill",
      );
    });
  });

  it("treats unmatched symlink agent skills without managed metadata as external", async () => {
    const legacySymlinkScan = {
      platform: claudePlatform,
      skillsDir: "/agents/claude/skills",
      scannedSkills: [
        {
          name: "legacy-linked",
          description: "Legacy linked skill without managed metadata",
          author: "External",
          tags: [],
          instructions: "# Legacy Linked",
          filePath: "/agents/claude/skills/legacy-linked/SKILL.md",
          localPath: "/agents/claude/skills/legacy-linked",
          platformSkillPath: "/agents/claude/skills/legacy-linked",
          platforms: ["Claude Code"],
          installMode: "symlink" as const,
          symlinkTargetPath: "/external/legacy/skills/legacy-linked",
        },
      ],
    };

    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(legacySymlinkScan),
          uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Legacy Linked" }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });
    useSkillStore.setState({
      skills: [],
      agentScanState: {
        claude: {
          result: legacySymlinkScan,
          isScanning: false,
          scannedAt: 1,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    expect(await screen.findByText("legacy-linked")).toBeInTheDocument();
    expect(screen.queryByText("Symlink install")).not.toBeInTheDocument();
    expect(screen.getByText("External install")).toBeInTheDocument();
  });

  it("does not treat same-name agent skills as managed when stable identity differs", async () => {
    useSkillStore.setState({
      skills: [
        {
          id: "same-name-library",
          name: "copy-skill",
          description: "Different library skill with same name",
          instructions: "# Different Copy Skill",
          content: "# Different Copy Skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/library/different-copy-skill",
          directory_fingerprint: "different-fingerprint",
          tags: ["library"],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    expect(await screen.findByText("copy-skill")).toBeInTheDocument();
    const copyCard = screen
      .getAllByTestId("agent-skill-card")
      .find((card) => within(card).queryByText("copy-skill"));
    expect(copyCard).toBeTruthy();
    expect(
      within(copyCard!).queryByText("In My Skills"),
    ).not.toBeInTheDocument();
    expect(within(copyCard!).getByText("External install")).toBeInTheDocument();
    expect(
      within(copyCard!).queryByText("Copy install"),
    ).not.toBeInTheDocument();
  });

  it("keeps entry passive but auto-scans an uncached agent when the user selects it", async () => {
    const { api } = installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(scanResult()),
        },
      },
    });
    useSkillStore.setState({
      agentScanState: {},
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    expect((await screen.findAllByText("Claude Code")).length).toBeGreaterThan(
      0,
    );
    expect(api.skill.scanPlatformSkills).not.toHaveBeenCalled();
    expect(screen.getByText("No skills in this agent")).toBeInTheDocument();

    const agentPlatformCard = (
      await screen.findAllByRole("button", { name: /Claude Code/i })
    ).find((button) => button.textContent?.includes("0 skills"));
    expect(agentPlatformCard).toBeTruthy();
    fireEvent.click(agentPlatformCard!);

    await waitFor(() => {
      expect(api.skill.scanPlatformSkills).toHaveBeenCalledWith("claude");
    });
    expect(await screen.findByText("copy-skill")).toBeInTheDocument();

    api.skill.scanPlatformSkills.mockClear();
    fireEvent.click(screen.getAllByTitle("Refresh")[1]);

    await waitFor(() => {
      expect(api.skill.scanPlatformSkills).toHaveBeenCalledWith("claude");
    });
  });

  it("filters agent skills with the global skill search query instead of a second local search box", async () => {
    useSkillStore.setState({
      searchQuery: "linked",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    expect(await screen.findByText("linked-skill")).toBeInTheDocument();
    expect(screen.queryByText("copy-skill")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search")).not.toBeInTheDocument();
  });

  it("opens a full-width detail view after clicking an agent skill", async () => {
    render(<SkillAgentsView />);

    fireEvent.click((await screen.findAllByText("copy-skill"))[0]);

    expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Uninstall/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Import to My Skills/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Copied skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(
      screen.getAllByRole("button", { name: /Uninstall from agent/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("copy-skill").length).toBeGreaterThan(0);
  });

  it("uninstalls the selected agent skill by platform skill path and refreshes the scan", async () => {
    const { api } = installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(scanResult()),
          uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Copy Skill" }),
        },
      },
    });
    render(<SkillAgentsView />);

    fireEvent.click((await screen.findAllByText("copy-skill"))[0]);
    fireEvent.click(screen.getByRole("button", { name: /Uninstall/i }));
    fireEvent.click(screen.getByText("confirm-uninstall"));

    await waitFor(() => {
      expect(api.skill.uninstallPlatformSkill).toHaveBeenCalledWith(
        "claude",
        "/agents/claude/skills/copy-skill",
      );
    });
    expect(api.skill.scanPlatformSkills).toHaveBeenCalledTimes(1);
  });

  it("uninstalls an agent skill directly from the card action", async () => {
    const { api } = installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(scanResult()),
          uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Copy Skill" }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });
    render(<SkillAgentsView />);

    const copyCard = (await screen.findAllByTestId("agent-skill-card")).find(
      (card) => within(card).queryByText("copy-skill"),
    );
    expect(copyCard).toBeTruthy();

    fireEvent.click(
      within(copyCard!).getByRole("button", { name: /Uninstall from agent/i }),
    );
    fireEvent.click(screen.getByText("confirm-uninstall"));

    await waitFor(() => {
      expect(api.skill.uninstallPlatformSkill).toHaveBeenCalledWith(
        "claude",
        "/agents/claude/skills/copy-skill",
      );
    });
    expect(api.skill.scanPlatformSkills).toHaveBeenCalledTimes(1);
  });

  it("marks Cherry Studio built-in skills and prevents deleting them", async () => {
    const { api } = installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([cherryPlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["cherry-studio"]),
          scanPlatformSkills: vi
            .fn()
            .mockResolvedValue(cherryBuiltinScanResult()),
          uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Find Skills" }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });
    useSettingsStore.setState({
      skillPlatformOrder: ["cherry-studio"],
      disabledPlatformIds: [],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useSkillStore.setState({
      agentScanState: {
        "cherry-studio": {
          result: cherryBuiltinScanResult(),
          isScanning: false,
          scannedAt: 1,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    const builtinCard = (await screen.findAllByTestId("agent-skill-card")).find(
      (card) => within(card).queryByText("find-skills"),
    );
    expect(builtinCard).toBeTruthy();
    expect(within(builtinCard!).getByText("Built-in")).toBeInTheDocument();
    expect(
      within(builtinCard!).getByText("External install"),
    ).toBeInTheDocument();
    expect(
      within(builtinCard!).queryByText("Copy install"),
    ).not.toBeInTheDocument();

    const cardUninstall = within(builtinCard!).getByRole("button", {
      name: /Uninstall from agent/i,
    });
    expect(cardUninstall).toBeDisabled();

    fireEvent.click(cardUninstall);
    expect(screen.queryByText("confirm-uninstall")).not.toBeInTheDocument();
    expect(api.skill.uninstallPlatformSkill).not.toHaveBeenCalled();

    fireEvent.click(within(builtinCard!).getByText("find-skills"));

    const detailUninstall = await screen.findByRole("button", {
      name: /Uninstall/i,
    });
    expect(detailUninstall).toBeDisabled();
  });

  it("imports an unmanaged agent skill into My Skills from the card action", async () => {
    const importScannedSkills = vi.fn().mockResolvedValue({
      importedCount: 1,
      importedSkills: [],
      skipped: [],
      failed: [],
    });
    useSkillStore.setState({
      importScannedSkills,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    const copyCard = (await screen.findAllByTestId("agent-skill-card")).find(
      (card) => within(card).queryByText("copy-skill"),
    );
    expect(copyCard).toBeTruthy();

    fireEvent.click(
      within(copyCard!).getByRole("button", { name: /Import to My Skills/i }),
    );

    await waitFor(() => {
      expect(importScannedSkills).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            filePath: "/agents/claude/skills/copy-skill/SKILL.md",
            localPath: "/agents/claude/skills/copy-skill",
            name: "copy-skill",
          }),
        ],
        undefined,
        "copy",
      );
    });
    expect(showToastMock).toHaveBeenCalledWith(
      "Imported to My Skills ({{mode}})",
      "success",
    );
  });

  it("installs a My Skills entry into the selected agent through the symlink API", async () => {
    const { api } = installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([claudePlatform]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          scanPlatformSkills: vi.fn().mockResolvedValue(scanResult()),
          export: vi.fn().mockResolvedValue("# Linked Skill"),
          readLocalFileByPath: vi
            .fn()
            .mockResolvedValue({ content: "# Linked Skill" }),
          installMdSymlink: vi.fn().mockResolvedValue({
            requestedMode: "symlink",
            effectiveMode: "symlink",
          }),
          installMd: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    useSkillStore.setState({
      skills: [
        {
          id: "library-fresh",
          name: "fresh-skill",
          description: "Fresh library skill",
          instructions: "# Fresh Skill",
          content: "# Fresh Skill",
          protocol_type: "skill",
          author: "PromptHub",
          local_repo_path: "/library/fresh-skill",
          tags: ["library"],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    render(<SkillAgentsView />);

    expect(
      await screen.findByRole("button", { name: /Claude Code/i }),
    ).toHaveTextContent("2 skills");
    const installButton = await screen.findByRole("button", {
      name: /Install My Skill/i,
    });
    expect(installButton).not.toBeDisabled();
    fireEvent.click(installButton);
    const dialog = await screen.findByRole("dialog", {
      name: /Install My Skill/i,
    });
    expect(
      within(dialog).queryByText("Advanced Import Settings"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("Import Mode")).toBeInTheDocument();
    expect(within(dialog).getByText("Select Skills")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /fresh-skill/i }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Symlink/i }));
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /Install 1 selected skill/i,
      }),
    );

    await waitFor(() => {
      expect(api.skill.export).toHaveBeenCalledWith("library-fresh", "skillmd");
      expect(api.skill.installMdSymlink).toHaveBeenCalledWith(
        "library-fresh",
        "# Linked Skill",
        "claude",
      );
    });
    expect(showToastMock).toHaveBeenCalledWith(
      "Installed 1 skill(s) to agent",
      "success",
    );
  });

  it("shows toast feedback for manual agent refresh and skill scan actions", async () => {
    render(<SkillAgentsView />);

    await screen.findByText("copy-skill");
    showToastMock.mockClear();
    const scanPlatformSkills = vi.mocked(window.api.skill.scanPlatformSkills);
    scanPlatformSkills.mockClear();

    const refreshButtons = screen.getAllByTitle("Refresh");
    fireEvent.click(refreshButtons[0]);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "Detected 1 agents",
        "success",
      );
    });
    await waitFor(() => {
      expect(scanPlatformSkills).toHaveBeenCalledWith("claude");
    });

    scanPlatformSkills.mockClear();
    fireEvent.click(refreshButtons[1]);

    await waitFor(() => {
      expect(scanPlatformSkills).toHaveBeenCalledWith("claude");
      expect(showToastMock).toHaveBeenCalledWith("Scanned 2 skills", "success");
    });
  });

  it("opens the managed library skill from an agent-scanned skill", async () => {
    render(<SkillAgentsView />);

    fireEvent.click(await screen.findByText("linked-skill"));
    fireEvent.click(screen.getByRole("button", { name: /Open in My Skills/i }));

    expect(useSkillStore.getState().storeView).toBe("my-skills");
    expect(useSkillStore.getState().selectedSkillId).toBe("library-linked");
  });
});
