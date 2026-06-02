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
      { language: "en" },
    );

    await screen.findByText("Restore to this version");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete version snapshot");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => {
      expect(window.api.skill.versionDelete).toHaveBeenCalledWith(
        skill.id,
        "version-1",
      );
    });
  });

  it("keeps the timeline and content panes independently scrollable", async () => {
    const skill = createSkillFixture();
    window.api.skill.versionGetAll = vi.fn().mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        createSkillVersionFixture({
          id: `version-${index + 1}`,
          version: index + 1,
          note: `Before updating scripts/file-${index + 1}.ts`,
        }),
      ).reverse(),
    );

    await renderWithI18n(
      <SkillVersionHistoryModal
        isOpen
        onClose={vi.fn()}
        skill={skill}
        currentContent={skill.content || ""}
        onReload={vi.fn().mockResolvedValue(undefined)}
      />,
      { language: "en" },
    );

    const timelinePane = await screen.findByTestId(
      "skill-version-timeline-pane",
    );
    const contentPane = screen.getByTestId("skill-version-content-pane");

    expect(timelinePane).toHaveClass("sticky", "min-h-0");
    expect(timelinePane.querySelector(".overflow-y-auto")).not.toBeNull();
    expect(contentPane).toHaveClass("overflow-hidden", "min-h-0");
    expect(contentPane.querySelector(".overflow-y-auto")).not.toBeNull();
  });
});
