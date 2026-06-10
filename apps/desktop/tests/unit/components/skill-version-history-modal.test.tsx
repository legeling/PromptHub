import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillVersionHistoryModal } from "../../../src/renderer/components/skill/SkillVersionHistoryModal";
import {
  createSkillFileSnapshotFixture,
  createSkillFixture,
  createSkillLocalFileEntryFixture,
  createSkillVersionFixture,
} from "../../fixtures/skills";
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

  it("exposes history selection state with decorative icons hidden", async () => {
    const skill = createSkillFixture();
    window.api.skill.versionGetAll = vi.fn().mockResolvedValue([
      createSkillVersionFixture({
        id: "version-2",
        version: 2,
        content: "# Write\n\nCurrent draft",
        filesSnapshot: [
          createSkillFileSnapshotFixture({
            relativePath: "SKILL.md",
            content: "# Write\n\nCurrent draft",
          }),
        ],
      }),
      createSkillVersionFixture({
        id: "version-1",
        version: 1,
        content: "# Write\n\nOlder draft",
        filesSnapshot: [
          createSkillFileSnapshotFixture({
            relativePath: "SKILL.md",
            content: "# Write\n\nOlder draft",
          }),
        ],
      }),
    ]);
    window.api.skill.readLocalFiles = vi.fn().mockResolvedValue([
      createSkillLocalFileEntryFixture({
        content: "# Write\n\nCurrent live content",
      }),
    ]);

    const { container } = await renderWithI18n(
      <SkillVersionHistoryModal
        isOpen
        onClose={vi.fn()}
        skill={skill}
        currentContent="# Write\n\nCurrent live content"
        onReload={vi.fn().mockResolvedValue(undefined)}
      />,
      { language: "en" },
    );

    await screen.findByText("Restore to this version");

    const selectedVersion = screen.getByRole("button", { name: /v2/ });
    const olderVersion = screen.getByRole("button", { name: /v1/ });
    const preview = screen.getByRole("button", { name: "Preview" });
    const diff = screen.getByRole("button", { name: "Diff" });

    expect(selectedVersion).toHaveAttribute("aria-pressed", "true");
    expect(olderVersion).toHaveAttribute("aria-pressed", "false");
    expect(preview).toHaveAttribute("aria-pressed", "true");
    expect(diff).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(diff);

    expect(preview).toHaveAttribute("aria-pressed", "false");
    expect(diff).toHaveAttribute("aria-pressed", "true");

    const skillFile = screen.getByRole("button", { name: /SKILL\.md/ });
    expect(skillFile).toHaveAttribute("aria-expanded", "true");

    for (const icon of container.querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });
});
