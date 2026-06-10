import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";
import { SkillBatchTagDialog } from "../../../src/renderer/components/skill/SkillBatchTagDialog";
import { renderWithI18n } from "../../helpers/i18n";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 1,
    name: "skill-a",
    description: "",
    instructions: "",
    content: "",
    protocol_type: "skill",
    author: "tester",
    tags: ["ops"],
    is_favorite: false,
    local_repo_path: "/tmp/skill-a",
    versionTrackingEnabled: true,
    currentVersion: 1,
    icon_url: null,
    icon_emoji: null,
    icon_background: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Skill;
}

describe("SkillBatchTagDialog", () => {
  it("renders the dialog with the existing tags from selected skills", async () => {
    await renderWithI18n(
      <SkillBatchTagDialog
        skills={[
          makeSkill({ tags: ["ops", "docs"] }),
          makeSkill({ tags: ["docs", "release"] }),
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // Existing tag chips appear (suggestedTags). Tags are normalized + sorted.
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("ops")).toBeInTheDocument();
    expect(screen.getByText("release")).toBeInTheDocument();
  });

  it("invokes onSubmit with the tag and 'add' mode by default", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    await renderWithI18n(
      <SkillBatchTagDialog
        skills={[makeSkill({ tags: ["ops"] })]}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByRole("textbox");
    await user.type(input, "release");
    // Press the apply button (last action button = "Add tag" when mode=add).
    const buttons = screen.getAllByRole("button");
    // Last button is the apply / submit button.
    const submitButton = buttons[buttons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("release", "add");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("switches to remove mode when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    await renderWithI18n(
      <SkillBatchTagDialog
        skills={[makeSkill({ tags: ["ops"] })]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    // The mode picker has two "Add tag" / "Remove tag" buttons. Find the
    // "Remove tag" mode button by its text.
    const modeButtons = screen.getAllByText(/^Remove tag$/);
    // The first match is the mode picker button (appears before the apply
    // button at the bottom).
    await user.click(modeButtons[0]);

    const input = screen.getByRole("textbox");
    await user.type(input, "ops");

    // Pressing Enter inside the input submits.
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("ops", "remove");
    });
  });

  it("disables the submit button when input is empty", async () => {
    await renderWithI18n(
      <SkillBatchTagDialog
        skills={[makeSkill()]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const submit = buttons[buttons.length - 1];
    expect(submit).toBeDisabled();
  });

  it("exposes the tag input and selected tag mode to assistive technology", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <SkillBatchTagDialog
        skills={[makeSkill()]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Tag" })).toBeInTheDocument();

    const addMode = screen.getAllByRole("button", { name: "Add tag" })[0];
    const removeMode = screen.getAllByRole("button", {
      name: "Remove tag",
    })[0];

    expect(addMode).toHaveAttribute("aria-pressed", "true");
    expect(removeMode).toHaveAttribute("aria-pressed", "false");

    await user.click(removeMode);

    expect(addMode).toHaveAttribute("aria-pressed", "false");
    expect(removeMode).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking an existing-tag chip prefills the input", async () => {
    const user = userEvent.setup();
    await renderWithI18n(
      <SkillBatchTagDialog
        skills={[makeSkill({ tags: ["docs"] })]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByText("docs"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("docs");
  });
});
