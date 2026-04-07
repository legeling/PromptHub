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

    const t = ((key: string, defaultValue?: string) => defaultValue ?? key) as any;

    await renderWithI18n(
      <SkillPreviewPane
        cachedDescriptionTranslation={null}
        cachedInstructionsTranslation={null}
        copyStatus={{ instr: false }}
        handleCopy={vi.fn()}
        handleTranslateSkill={vi.fn()}
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
});
