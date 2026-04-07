import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillVersionHistoryModal } from "../../../src/renderer/components/skill/SkillVersionHistoryModal";
import { createSkillFixture, createSkillLocalFileEntryFixture, createSkillVersionFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

describe("SkillVersionHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    installWindowMocks({
      api: {
        skill: {
          versionGetAll: vi.fn().mockResolvedValue([
            createSkillVersionFixture(),
          ]),
          readLocalFiles: vi.fn().mockResolvedValue([
            createSkillLocalFileEntryFixture(),
          ]),
          versionDelete: vi.fn().mockResolvedValue(true),
          versionRollback: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("deletes one skill snapshot from version history", async () => {
    const skill = createSkillFixture();

    await renderWithI18n(
      <SkillVersionHistoryModal
        isOpen
        onClose={vi.fn()}
        skill={skill}
        currentContent={skill.content || ""}
        onReload={vi.fn().mockResolvedValue(undefined)}
      />,
      { language: "zh" },
    );

    await screen.findByText("恢复到此版本");
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await screen.findByText("删除版本快照");
    fireEvent.click(screen.getAllByRole("button", { name: "删除" }).at(-1)!);

    await waitFor(() => {
      expect(window.api.skill.versionDelete).toHaveBeenCalledWith(
        skill.id,
        "version-1",
      );
    });
  });
});
