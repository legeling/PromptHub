import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import type { FormEvent } from "react";
import type { Skill, SkillProject } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { SkillPlatformPanel } from "../../../src/renderer/components/skill/SkillPlatformPanel";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

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

  return defaultValue.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
    String(options[token] ?? ""),
  );
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 1,
    name: "release-helper",
    description: "Release helper",
    instructions: "Use this skill for releases.",
    content: "Use this skill for releases.",
    protocol_type: "skill",
    author: "tester",
    tags: [],
    is_favorite: false,
    local_repo_path: "/tmp/release-helper",
    versionTrackingEnabled: true,
    currentVersion: 1,
    icon_url: null,
    icon_emoji: null,
    icon_background: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Skill;
}

function makePlatform(overrides: Partial<SkillPlatform> = {}): SkillPlatform {
  return {
    id: "claude",
    name: "Claude Code",
    icon: "Bot",
    rootDir: {
      darwin: "~/.claude",
      win32: "%USERPROFILE%\\.claude",
      linux: "~/.claude",
    },
    skillsRelativePath: "skills",
    ...overrides,
  };
}

function makeProject(overrides: Partial<SkillProject> = {}): SkillProject {
  return {
    id: "project-1",
    name: "Release Workspace",
    rootPath: "/tmp/release-workspace",
    scanPaths: [],
    deployTargets: ["/tmp/release-workspace/.agents/skills"],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

async function renderPanel(
  overrides: Partial<Parameters<typeof SkillPlatformPanel>[0]> = {},
) {
  const props: Parameters<typeof SkillPlatformPanel>[0] = {
    availablePlatforms: [makePlatform()],
    handleExport: vi.fn(),
    installMode: "copy",
    installProgress: null,
    isBatchInstalling: false,
    onBatchInstall: vi.fn(),
    selectedPlatforms: new Set<string>(),
    selectedSkill: makeSkill(),
    selectAllPlatforms: vi.fn(),
    deselectAllPlatforms: vi.fn(),
    setInstallMode: vi.fn(),
    skillMdInstallStatus: {},
    t: translate as TFunction,
    togglePlatformSelection: vi.fn(),
    uninstallFromPlatform: vi.fn(),
    uninstalledPlatforms: [makePlatform()],
    ...overrides,
  };

  return {
    ...(await renderWithI18n(<SkillPlatformPanel {...props} />)),
    props,
  };
}

describe("SkillPlatformPanel", () => {
  it("exposes global install mode selection state", async () => {
    const setInstallMode = vi.fn();

    await renderPanel({
      installMode: "copy",
      setInstallMode,
    });

    expect(screen.getByRole("button", { name: "Copy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Symlink" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Symlink" }));

    expect(setInstallMode).toHaveBeenCalledWith("symlink");
  });

  it("exposes global platform targets as keyboard-toggleable controls", async () => {
    const togglePlatformSelection = vi.fn();

    await renderPanel({
      selectedPlatforms: new Set(["claude"]),
      togglePlatformSelection,
    });

    const platform = screen.getByRole("button", { name: /Claude Code/ });

    expect(platform).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(platform, { key: " " });
    fireEvent.keyDown(platform, { key: "Enter" });

    expect(togglePlatformSelection).toHaveBeenCalledTimes(2);
    expect(togglePlatformSelection).toHaveBeenNthCalledWith(1, "claude");
    expect(togglePlatformSelection).toHaveBeenNthCalledWith(2, "claude");
  });

  it("keeps global action buttons non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onBatchInstall = vi.fn();
    const handleExport = vi.fn();
    const deselectAllPlatforms = vi.fn();
    const { electron } = installWindowMocks();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillPlatformPanel
          availablePlatforms={[makePlatform()]}
          handleExport={handleExport}
          installMode="copy"
          installProgress={null}
          isBatchInstalling={false}
          onBatchInstall={onBatchInstall}
          selectedPlatforms={new Set<string>(["claude"])}
          selectedSkill={makeSkill()}
          selectAllPlatforms={vi.fn()}
          deselectAllPlatforms={deselectAllPlatforms}
          setInstallMode={vi.fn()}
          skillMdInstallStatus={{}}
          t={translate as TFunction}
          togglePlatformSelection={vi.fn()}
          uninstallFromPlatform={vi.fn()}
          uninstalledPlatforms={[makePlatform()]}
        />
      </form>,
      { language: "en" },
    );

    const deselectAll = screen.getByRole("button", { name: "Deselect All" });
    const batchInstall = screen.getByRole("button", { name: "Install All" });
    const exportSkillMd = screen.getByRole("button", { name: "SKILL.md" });
    const exportZip = screen.getByRole("button", { name: "ZIP" });
    const openSource = screen.getByRole("button", {
      name: /Imported from Local Folder/,
    });

    for (const button of [
      deselectAll,
      batchInstall,
      exportSkillMd,
      exportZip,
      openSource,
    ]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await user.click(deselectAll);
    await user.click(batchInstall);
    await user.click(exportSkillMd);
    await user.click(exportZip);
    await user.click(openSource);

    expect(deselectAllPlatforms).toHaveBeenCalledTimes(1);
    expect(onBatchInstall).toHaveBeenCalledTimes(1);
    expect(handleExport).toHaveBeenNthCalledWith(1, "skillmd");
    expect(handleExport).toHaveBeenNthCalledWith(2, "zip");
    expect(electron.openPath).toHaveBeenCalledWith("/tmp/release-helper");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps project selection and project removal as separate buttons", async () => {
    const onRemoveFromProjectTargets = vi.fn();
    const project = makeProject();

    await renderPanel({
      availablePlatforms: [],
      uninstalledPlatforms: [],
      projects: [project],
      onCreateProject: vi.fn(),
      onDeployToProjects: vi.fn(),
      getProjectDeployTargets: () => ["/tmp/release-workspace/.agents/skills"],
      getProjectDeployedTargets: () => [
        {
          targetDir: "/tmp/release-workspace/.agents/skills",
          localPath: "/tmp/release-workspace/.agents/skills/release-helper",
        },
      ],
      onRemoveFromProjectTargets,
    });

    const projectSelection = screen.getByRole("button", {
      name: /Release Workspace/,
    });
    const removeButton = screen.getByRole("button", {
      name: "Remove from Project",
    });
    const advancedSettingsButton = screen.getByRole("button", {
      name: "Advanced Import Settings",
    });

    expect(projectSelection).not.toHaveAccessibleName(/Remove from Project/);
    expect(removeButton.tagName).toBe("BUTTON");
    expect(advancedSettingsButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(advancedSettingsButton);

    expect(advancedSettingsButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Import Mode")).toBeInTheDocument();

    fireEvent.click(removeButton);

    expect(onRemoveFromProjectTargets).toHaveBeenCalledWith("project-1", [
      {
        targetDir: "/tmp/release-workspace/.agents/skills",
        localPath: "/tmp/release-workspace/.agents/skills/release-helper",
      },
    ]);
  });
});
