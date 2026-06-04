import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillPreviewPane } from "../../../src/renderer/components/skill/SkillPreviewPane";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";

describe("SkillPreviewPane", () => {
  it("renders malformed imported skill metadata without crashing the preview", async () => {
    const skill = createSkillFixture({
      author: { broken: true } as any,
      category: { broken: true } as any,
      tags: '["ops","docs"]' as any,
    });

    const t = ((key: string, defaultValue?: string) =>
      defaultValue ?? key) as any;

    await renderWithI18n(
      <SkillPreviewPane
        cachedInstructionsTranslation={null}
        copyStatus={{ instr: false }}
        handleCopy={vi.fn()}
        handleTranslateSkill={vi.fn()}
        hasStaleTranslation={false}
        isTranslating={false}
        resolvedDescription="Imported skill description"
        selectedSkill={skill}
        showTranslation={false}
        skillContent={"# Imported Skill\n\nThis content should still render."}
        t={t}
        translationMode="full"
      />,
    );

    expect(screen.getByText("Imported skill description")).toBeInTheDocument();
    expect(screen.getByText("ops")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("Imported Skill")).toBeInTheDocument();
    expect(
      screen.getByText("This content should still render."),
    ).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("shows a stale translation badge when saved translation needs refresh", async () => {
    const skill = createSkillFixture();
    const t = ((key: string, defaultValue?: string) =>
      defaultValue ?? key) as any;

    await renderWithI18n(
      <SkillPreviewPane
        cachedInstructionsTranslation={null}
        copyStatus={{ instr: false }}
        handleCopy={vi.fn()}
        handleTranslateSkill={vi.fn()}
        hasStaleTranslation={true}
        isTranslating={false}
        resolvedDescription="Original description"
        selectedSkill={skill}
        showTranslation={false}
        skillContent={"# Skill\n\nOriginal body"}
        t={t}
        translationMode="full"
      />,
    );

    expect(
      screen.getByText("Saved translation needs refresh"),
    ).toBeInTheDocument();
  });

  it("shows source and user tags without raw category pills", async () => {
    const skill = createSkillFixture({
      author: "JimLiu",
      category: "dev",
      source_url: "https://github.com/org/skills/tree/main/baoyu-imagine",
      tags: ["image", "测试123"],
      original_tags: ["image"],
    });
    const t = ((key: string, defaultValue?: string) =>
      defaultValue ?? key) as any;

    await renderWithI18n(
      <SkillPreviewPane
        cachedInstructionsTranslation={null}
        copyStatus={{ instr: false }}
        handleCopy={vi.fn()}
        handleTranslateSkill={vi.fn()}
        hasStaleTranslation={false}
        isTranslating={false}
        resolvedDescription="Image generation skill"
        selectedSkill={skill}
        showTranslation={false}
        skillContent={"# Skill\n\nBody"}
        t={t}
        translationMode="full"
      />,
    );

    expect(screen.getByText("GitHub Import")).toBeInTheDocument();
    expect(screen.getByText("JimLiu")).toBeInTheDocument();
    expect(screen.getByText("测试123")).toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
    expect(screen.queryByText("image")).not.toBeInTheDocument();
  });

  it("renders unknown fenced code languages without showing the preview error", async () => {
    const skill = createSkillFixture();
    const t = ((key: string, defaultValue?: string) =>
      defaultValue ?? key) as any;

    await renderWithI18n(
      <SkillPreviewPane
        cachedInstructionsTranslation={null}
        copyStatus={{ instr: false }}
        handleCopy={vi.fn()}
        handleTranslateSkill={vi.fn()}
        hasStaleTranslation={false}
        isTranslating={false}
        resolvedDescription="Preview should survive unknown code languages"
        selectedSkill={skill}
        showTranslation={false}
        skillContent={
          "# CloudDrive2\n\n```powershell\n$paths = @(\"$HOME\\.config\")\n```\n"
        }
        t={t}
        translationMode="full"
      />,
    );

    expect(screen.getByText("CloudDrive2")).toBeInTheDocument();
    expect(screen.getByText(/\$paths = @/)).toBeInTheDocument();
    expect(
      screen.queryByText("Skill 预览暂时无法渲染"),
    ).not.toBeInTheDocument();
  });
});
