import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillListView } from "../../../src/renderer/components/skill/SkillListView";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function resetStores() {
  useSkillStore.setState({
    selectedSkillId: null,
    selectSkill: vi.fn(),
    toggleFavorite: vi.fn(),
    filterType: "all",
    storeView: "my-skills",
  } as Partial<ReturnType<typeof useSkillStore.getState>>);

  useSettingsStore.setState({
    disabledPlatformIds: [],
  } as Partial<ReturnType<typeof useSettingsStore.getState>>);
}

function installSkillWindowMocks() {
  installWindowMocks({
    api: {
      skill: {
        getSupportedPlatforms: vi.fn().mockResolvedValue([]),
        detectPlatforms: vi.fn().mockResolvedValue([]),
        getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
      },
    },
  });
}

describe("SkillListView actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    installSkillWindowMocks();
  });

  it("exposes the row primary action as a keyboard-activatable button surface", async () => {
    const user = userEvent.setup();
    const selectSkill = vi.fn();
    useSkillStore.setState({
      selectSkill,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);
    const skill = createSkillFixture({
      id: "skill-list-keyboard",
      name: "List Keyboard",
    });

    await act(async () => {
      await renderWithI18n(
        <SkillListView skills={[skill]} onQuickInstall={vi.fn()} />,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("List Keyboard")).toBeInTheDocument();
    });

    const rowAction = screen.getByRole("button", {
      name: "View Details: List Keyboard",
    });
    const hiddenIconContent = rowAction.querySelector('[aria-hidden="true"]');

    expect(rowAction).toHaveAttribute("type", "button");
    expect(hiddenIconContent).toBeInstanceOf(HTMLElement);

    rowAction.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(selectSkill).toHaveBeenCalledTimes(2);
    expect(selectSkill).toHaveBeenCalledWith(skill.id);
  });

  it("keeps row action buttons non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onQuickInstall = vi.fn();
    const onRequestDelete = vi.fn();
    const skill = createSkillFixture({
      id: "skill-list-actions",
      name: "List Actions",
    });

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <SkillListView
            skills={[skill]}
            onQuickInstall={onQuickInstall}
            onRequestDelete={onRequestDelete}
          />
        </form>,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("List Actions")).toBeInTheDocument();
    });

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
    expect(useSkillStore.getState().toggleFavorite).toHaveBeenCalledWith(
      skill.id,
    );
    expect(onRequestDelete).toHaveBeenCalledWith(skill.id, skill.name);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("exposes the row selection toggle as a non-submit pressed control", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onToggleSelection = vi.fn();
    const skill = createSkillFixture({
      id: "skill-list-selected",
      name: "List Selected",
    });

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <SkillListView
            skills={[skill]}
            selectionMode
            selectedSkillIds={new Set([skill.id])}
            onQuickInstall={vi.fn()}
            onToggleSelection={onToggleSelection}
          />
        </form>,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("List Selected")).toBeInTheDocument();
    });

    const selection = screen.getByRole("button", { name: "Selected" });

    expect(selection).toHaveAttribute("aria-label", "Selected");
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
