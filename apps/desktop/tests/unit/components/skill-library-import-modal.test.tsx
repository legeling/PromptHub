import type { ReactNode } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill, SkillProject } from "@prompthub/shared/types";
import { SkillLibraryImportModal } from "../../../src/renderer/components/skill/SkillLibraryImportModal";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

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

const project: SkillProject = {
  id: "project-1",
  name: "Novel",
  rootPath: "/tmp/novel",
  scanPaths: [],
  deployTargets: ["/tmp/novel/.agents/skills"],
  createdAt: 1,
  updatedAt: 1,
};

const skill: Skill = {
  id: "skill-1",
  name: "story-auditor",
  description: "Audit fiction structure",
  instructions: "# story-auditor",
  content: "# story-auditor",
  protocol_type: "skill",
  author: "PromptHub",
  local_repo_path: "/Users/demo/skills/story-auditor",
  source_url: "/Users/demo/skills/story-auditor",
  tags: ["writing"],
  is_favorite: false,
  currentVersion: 0,
  created_at: 1,
  updated_at: 1,
};

describe("SkillLibraryImportModal", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      projectSkillImportModePreference: "copy",
      projectSkillImportPreferencesByProjectId: {},
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("does not overwrite saved project import preferences while closed", async () => {
    const savedPreferences = {
      selectedTargetIds: ["/tmp/novel/custom-targets"],
      customTargets: ["/tmp/novel/custom-targets"],
    };

    useSettingsStore.setState({
      projectSkillImportPreferencesByProjectId: {
        [project.id]: savedPreferences,
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await renderWithI18n(
      <SkillLibraryImportModal
        isOpen={false}
        isDeploying={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        project={project}
        scannedSkills={[]}
        skills={[skill]}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(
        useSettingsStore.getState().projectSkillImportPreferencesByProjectId[
          project.id
        ],
      ).toEqual(savedPreferences);
    });
  });

  it("exposes import settings, mode, target, and skill selection state", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <SkillLibraryImportModal
        isOpen={true}
        isDeploying={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        project={project}
        scannedSkills={[]}
        skills={[skill]}
      />,
      { language: "en" },
    );

    const advancedButton = screen.getByRole("button", {
      name: /Advanced Import Settings/i,
    });
    expect(advancedButton).toHaveAttribute("aria-expanded", "false");

    await user.click(advancedButton);
    expect(advancedButton).toHaveAttribute("aria-expanded", "true");

    const copyButton = screen.getByRole("button", { name: /Copy/i });
    const symlinkButton = screen.getByRole("button", { name: /Symlink/i });
    expect(copyButton).toHaveAttribute("aria-pressed", "true");
    expect(symlinkButton).toHaveAttribute("aria-pressed", "false");

    await user.click(symlinkButton);
    expect(copyButton).toHaveAttribute("aria-pressed", "false");
    expect(symlinkButton).toHaveAttribute("aria-pressed", "true");

    const targetFoldersSection = screen.getByText("Target Folders")
      .parentElement as HTMLElement;
    const defaultTarget = within(targetFoldersSection).getByRole("button", {
      name: /\.agents\/skills/i,
    });
    expect(defaultTarget).toHaveAttribute("aria-pressed", "true");

    await user.click(defaultTarget);
    expect(defaultTarget).toHaveAttribute("aria-pressed", "false");

    const skillButton = screen.getByRole("button", { name: /story-auditor/i });
    await user.click(defaultTarget);
    await user.click(skillButton);
    expect(skillButton).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores repeated confirm clicks while the first import is pending", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    await renderWithI18n(
      <SkillLibraryImportModal
        isOpen={true}
        isDeploying={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        project={project}
        scannedSkills={[]}
        skills={[skill]}
      />,
      { language: "en" },
    );

    await user.click(screen.getByRole("button", { name: /story-auditor/i }));
    const confirmButton = screen.getByRole("button", {
      name: "Import 1 selected skill(s)",
    });

    await user.dblClick(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores repeated custom target picker clicks while a folder picker is pending", async () => {
    const user = userEvent.setup();
    const onPickCustomTarget = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("/tmp/custom"), 50)),
    );

    await renderWithI18n(
      <SkillLibraryImportModal
        isOpen={true}
        isDeploying={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onPickCustomTarget={onPickCustomTarget}
        project={project}
        scannedSkills={[]}
        skills={[skill]}
      />,
      { language: "en" },
    );

    await user.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );
    const addFolderButton = screen.getByRole("button", {
      name: "Add Folder",
    });

    await user.dblClick(addFolderButton);

    expect(onPickCustomTarget).toHaveBeenCalledTimes(1);
    expect(addFolderButton).toBeDisabled();
  });

  it("ignores a custom target picker result after the modal closes and reopens", async () => {
    const user = userEvent.setup();
    let resolvePicker: (path: string) => void = () => undefined;
    const onPickCustomTarget = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvePicker = resolve;
        }),
    );
    const baseProps = {
      isDeploying: false,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      onPickCustomTarget,
      project,
      scannedSkills: [],
      skills: [skill],
    };

    const { rerender } = await renderWithI18n(
      <SkillLibraryImportModal isOpen={true} {...baseProps} />,
      { language: "en" },
    );

    await user.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );
    await user.click(screen.getByRole("button", { name: "Add Folder" }));

    rerender(<SkillLibraryImportModal isOpen={false} {...baseProps} />);
    rerender(<SkillLibraryImportModal isOpen={true} {...baseProps} />);

    await act(async () => {
      resolvePicker("/tmp/stale-target");
    });

    await user.click(
      screen.getByRole("button", { name: /Advanced Import Settings/i }),
    );

    expect(
      screen.queryByRole("button", {
        name: /Custom target.*\/tmp\/stale-target/i,
      }),
    ).not.toBeInTheDocument();
  });
});
