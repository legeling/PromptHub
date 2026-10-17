import { fireEvent, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";

import { SkillAssetTopology } from "../../../src/renderer/components/skill/SkillAssetTopology";
import { renderWithI18n } from "../../helpers/i18n";

const baseSkill: Skill = {
  id: "skill-1",
  name: "writer",
  content: "# Writer",
  protocol_type: "skill",
  is_favorite: false,
  created_at: 1,
  updated_at: 2,
};

function TopologyHarness({
  skill,
  onOpenLocalPath = vi.fn(),
}: {
  skill: Skill;
  onOpenLocalPath?: (path: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SkillAssetTopology
      onOpenLocalPath={onOpenLocalPath}
      selectedSkill={skill}
      t={t}
    />
  );
}

describe("SkillAssetTopology", () => {
  it("shows only source and editable package while preserving the local folder action", async () => {
    const onOpenLocalPath = vi.fn();
    await renderWithI18n(
      <TopologyHarness
        skill={{
          ...baseSkill,
          source_url: "https://github.com/example/writer-skill",
          local_repo_path: "/PromptHub/data/skills/writer",
        }}
        onOpenLocalPath={onOpenLocalPath}
      />,
      { language: "en" },
    );

    expect(screen.getByText("Upstream source")).toBeInTheDocument();
    expect(screen.getByText("example/writer-skill")).toBeInTheDocument();
    expect(screen.getByText("PromptHub managed package")).toBeInTheDocument();
    expect(
      screen.getByText("/PromptHub/data/skills/writer"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Distributed targets")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: "/PromptHub/data/skills/writer",
      }),
    );
    expect(onOpenLocalPath).toHaveBeenCalledWith(
      "/PromptHub/data/skills/writer",
    );
  });

  it("labels a linked external package without implying PromptHub ownership", async () => {
    const linkedPath = "/Users/demo/.codex/skills/writer";
    const onOpenLocalPath = vi.fn();
    await renderWithI18n(
      <TopologyHarness
        skill={{
          ...baseSkill,
          source_url: linkedPath,
          local_repo_path: linkedPath,
        }}
        onOpenLocalPath={onOpenLocalPath}
      />,
      { language: "en" },
    );

    expect(screen.getByText("Linked external package")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Edits write directly to this external folder; PromptHub does not replace it with a managed copy.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not distributed")).not.toBeInTheDocument();
    expect(
      screen.queryByText("PromptHub managed package"),
    ).not.toBeInTheDocument();
    for (const pathButton of screen.getAllByRole("button", {
      name: linkedPath,
    })) {
      fireEvent.click(pathButton);
    }
    expect(onOpenLocalPath).toHaveBeenCalledTimes(2);
    expect(onOpenLocalPath).toHaveBeenNthCalledWith(1, linkedPath);
    expect(onOpenLocalPath).toHaveBeenNthCalledWith(2, linkedPath);
  });

  it("labels database-only content without a distribution placeholder", async () => {
    await renderWithI18n(<TopologyHarness skill={baseSkill} />, {
      language: "en",
    });

    expect(screen.getByText("Database content only")).toBeInTheDocument();
    expect(
      screen.getByText("This Skill has no editable package directory."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Distributed targets")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
