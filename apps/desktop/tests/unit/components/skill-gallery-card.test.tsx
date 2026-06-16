import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";

import { SkillGalleryCard } from "../../../src/renderer/components/skill/SkillGalleryCard";
import { renderWithI18n } from "../../helpers/i18n";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-gallery",
    name: "Gallery Skill",
    description: "A gallery card skill",
    instructions: "# Gallery Skill",
    content: "# Gallery Skill",
    protocol_type: "skill",
    author: "tester",
    tags: [],
    is_favorite: false,
    currentVersion: 1,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Skill;
}

describe("SkillGalleryCard", () => {
  it("exposes the card primary action as a keyboard-activatable button surface", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const skill = makeSkill();

    await renderWithI18n(
      <SkillGalleryCard
        animationDelayMs={0}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={onOpen}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={skill}
      />,
      { language: "en" },
    );

    const card = screen.getByRole("button", {
      name: "View Details: Gallery Skill",
    });

    expect(card).toHaveAttribute("tabindex", "0");

    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledWith(skill.id);
  });

  it("keeps card action buttons non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onQuickInstall = vi.fn();
    const onToggleFavorite = vi.fn();
    const onDelete = vi.fn();
    const skill = makeSkill();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillGalleryCard
          animationDelayMs={0}
          isSelected={false}
          isSelectionMode={false}
          onDelete={onDelete}
          onOpen={vi.fn()}
          onQuickInstall={onQuickInstall}
          onToggleFavorite={onToggleFavorite}
          onToggleSelection={vi.fn()}
          skill={skill}
        />
      </form>,
      { language: "en" },
    );

    const quickInstall = screen.getByRole("button", {
      name: "Install to Platforms",
    });
    const favorite = screen.getByRole("button", { name: "Add to favorites" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });

    expect(quickInstall).toHaveAttribute("aria-label", "Install to Platforms");
    expect(favorite).toHaveAttribute("aria-label", "Add to favorites");
    expect(deleteButton).toHaveAttribute("aria-label", "Delete");

    for (const button of [quickInstall, favorite, deleteButton]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await user.click(quickInstall);
    await user.click(favorite);
    await user.click(deleteButton);

    expect(onQuickInstall).toHaveBeenCalledWith(skill);
    expect(onToggleFavorite).toHaveBeenCalledWith(skill.id);
    expect(onDelete).toHaveBeenCalledWith(skill);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("wraps distributed platform icons separately from card actions", async () => {
    const skill = makeSkill();

    await renderWithI18n(
      <SkillGalleryCard
        animationDelayMs={0}
        distributedPlatforms={[
          { id: "codex", name: "Codex CLI" },
          { id: "claude", name: "Claude Code" },
          { id: "cursor", name: "Cursor" },
          { id: "vscode", name: "VS Code" },
          { id: "cline", name: "Cline" },
          { id: "gemini", name: "Gemini CLI" },
          { id: "opencode", name: "OpenCode" },
        ]}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={skill}
      />,
      { language: "en" },
    );

    const headerMeta = screen.getByTestId("skill-card-header-meta");
    const distribution = screen.getByTestId("skill-distributed-targets");
    const actions = screen.getByTestId("skill-card-actions");

    expect(headerMeta).toHaveClass("min-w-0", "flex-1", "items-end");
    expect(distribution).toHaveClass("max-w-full", "flex-wrap", "justify-end");
    expect(actions).toHaveClass("w-full", "justify-end");
    expect(actions.contains(distribution)).toBe(false);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("exposes the selection toggle as a non-submit pressed control", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onToggleSelection = vi.fn();
    const skill = makeSkill();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillGalleryCard
          animationDelayMs={0}
          isSelected
          isSelectionMode
          onDelete={vi.fn()}
          onOpen={vi.fn()}
          onQuickInstall={vi.fn()}
          onToggleFavorite={vi.fn()}
          onToggleSelection={onToggleSelection}
          skill={skill}
        />
      </form>,
      { language: "en" },
    );

    const selection = screen.getByRole("button", { name: "Clear" });

    expect(selection).toHaveAttribute("aria-label", "Clear");
    expect(selection).toHaveAttribute("type", "button");
    expect(selection).toHaveAttribute("aria-pressed", "true");
    expect(selection.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await user.click(selection);

    expect(onToggleSelection).toHaveBeenCalledWith(skill.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
