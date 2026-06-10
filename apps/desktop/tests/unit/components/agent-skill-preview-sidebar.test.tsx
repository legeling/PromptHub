import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentSkillPreviewSidebar } from "../../../src/renderer/components/skill/AgentSkillPreviewSidebar";
import { renderWithI18n } from "../../helpers/i18n";

const t = ((key: string, defaultValue?: string) =>
  defaultValue ?? key) as any;

describe("AgentSkillPreviewSidebar", () => {
  it("keeps agent source actions as non-submit buttons with decorative icons hidden", async () => {
    await renderWithI18n(
      <AgentSkillPreviewSidebar
        installMode="symlink"
        isImporting={false}
        isManaged={false}
        onImport={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenSymlinkTarget={vi.fn()}
        platformId="claude"
        platformName="Claude Code"
        sourcePath="/agents/claude/skills/linked-skill"
        symlinkTargetPath="/external/skills/linked-skill"
        t={t}
      />,
    );

    for (const name of [
      "Import to My Skills",
      /Open agent shortcut/u,
      /Open source Skill folder/u,
    ]) {
      const action = screen.getByRole("button", { name });
      expect(action).toHaveAttribute("type", "button");
      expect(action.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });
});
