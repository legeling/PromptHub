import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import { ProjectSkillPreviewSidebar } from "../../../src/renderer/components/skill/ProjectSkillPreviewSidebar";
import { createTestI18n, renderWithI18n } from "../../helpers/i18n";

const skill: Skill = {
  id: "project:/tmp/demo/demo-skill",
  name: "demo-skill",
  description: "Demo project helper",
  instructions: "# Demo",
  content: "# Demo",
  protocol_type: "skill",
  author: "Demo",
  local_repo_path: "/tmp/demo/.agents/skills/demo-skill",
  source_url: "/tmp/demo/.agents/skills/demo-skill",
  tags: ["project"],
  is_favorite: false,
  currentVersion: 0,
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe("ProjectSkillPreviewSidebar i18n", () => {
  it("renders the project deployment panel in Simplified Chinese without English fallback text", async () => {
    const i18n = await createTestI18n("zh");

    await renderWithI18n(
      <ProjectSkillPreviewSidebar
        deployTargets={[
          "/tmp/demo/.agents/skills",
          "/tmp/demo/custom-agent-skills",
        ]}
        isDeploying={false}
        isImporting={false}
        isImportAvailable={true}
        onAddDeployTarget={vi.fn()}
        onDeploy={vi.fn()}
        onImport={vi.fn()}
        selectedSkill={skill}
        sourcePath="/tmp/demo/.agents/skills/demo-skill"
        t={i18n.t.bind(i18n)}
      />,
      { language: "zh" },
    );

    expect(screen.getByText("项目分发")).toBeInTheDocument();
    expect(
      screen.getByText(
        "将这个 Skill 直接分发到项目本地 agent 目录。PromptHub 默认使用 .agents/skills，也可以按需添加更多目标文件夹。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("默认 .agents 目标")).toBeInTheDocument();
    expect(screen.getByText("自定义目标")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加文件夹" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "将 demo-skill 分发到项目文件夹",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByText("Project Deployment")).not.toBeInTheDocument();
    expect(screen.queryByText(/Deploy this skill directly/)).not.toBeInTheDocument();
    expect(screen.queryByText("Default .agents target")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom target")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Deploy demo-skill to Project Folders",
      }),
    ).not.toBeInTheDocument();
  });

  it("allows every project deployment target to be deselected", async () => {
    const user = userEvent.setup();
    const i18n = await createTestI18n("en");

    await renderWithI18n(
      <ProjectSkillPreviewSidebar
        deployTargets={[
          "/tmp/demo/.agents/skills",
          "/tmp/demo/custom-agent-skills",
        ]}
        isDeploying={false}
        isImporting={false}
        isImportAvailable={true}
        onAddDeployTarget={vi.fn()}
        onDeploy={vi.fn()}
        onImport={vi.fn()}
        selectedSkill={skill}
        sourcePath="/tmp/demo/.agents/skills/demo-skill"
        t={i18n.t.bind(i18n)}
      />,
      { language: "en" },
    );

    const defaultTarget = screen.getByText("Default .agents target").closest("button");
    const customTarget = screen.getByText("Custom target").closest("button");
    const deployButton = screen.getByRole("button", {
      name: "Deploy demo-skill to Project Folders",
    });

    expect(defaultTarget).toHaveAttribute("aria-pressed", "true");
    expect(customTarget).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(deployButton).toBeEnabled();

    await user.click(defaultTarget as HTMLButtonElement);
    expect(defaultTarget).toHaveAttribute("aria-pressed", "false");
    expect(customTarget).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(customTarget as HTMLButtonElement);
    expect(defaultTarget).toHaveAttribute("aria-pressed", "false");
    expect(customTarget).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(deployButton).toBeDisabled();
  });

  it("selects newly added deploy targets without reselecting user-cleared targets", async () => {
    const user = userEvent.setup();
    const i18n = await createTestI18n("en");
    const baseProps = {
      isDeploying: false,
      isImporting: false,
      isImportAvailable: true,
      onAddDeployTarget: vi.fn(),
      onDeploy: vi.fn(),
      onImport: vi.fn(),
      selectedSkill: skill,
      sourcePath: "/tmp/demo/.agents/skills/demo-skill",
      t: i18n.t.bind(i18n),
    };

    const { rerender } = await renderWithI18n(
      <ProjectSkillPreviewSidebar
        {...baseProps}
        deployTargets={[
          "/tmp/demo/.agents/skills",
          "/tmp/demo/custom-agent-skills",
        ]}
      />,
      { language: "en" },
    );

    const customTarget = screen.getByText("Custom target").closest("button");
    await user.click(customTarget as HTMLButtonElement);

    expect(customTarget).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    rerender(
      <ProjectSkillPreviewSidebar
        {...baseProps}
        deployTargets={[
          "/tmp/demo/.agents/skills",
          "/tmp/demo/custom-agent-skills",
          "/tmp/demo/new-agent-skills",
        ]}
      />,
    );

    const targetButtons = screen.getAllByRole("button", {
      name: /target/,
    });

    expect(targetButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(targetButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(targetButtons[2]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });
});
