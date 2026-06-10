import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";

import { EditSkillModal } from "../../../src/renderer/components/skill/EditSkillModal";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => ({
  SkillFileEditor: () => <div>file-editor</div>,
}));

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-edit",
    name: "writer",
    description: "Draft better prose",
    instructions: "# Writer",
    content: "# Writer",
    protocol_type: "skill",
    author: "Local",
    tags: ["user-tag"],
    original_tags: [],
    is_favorite: false,
    currentVersion: 1,
    local_repo_path: "/tmp/writer",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("EditSkillModal", () => {
  beforeEach(() => {
    installWindowMocks();
    useSettingsStore.setState({ isDarkMode: false } as never);
    useSkillStore.setState({
      skills: [
        makeSkill(),
        makeSkill({
          id: "skill-existing-tag",
          name: "existing",
          tags: ["existing-tag"],
        }),
      ],
      updateSkill: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();

    await renderWithI18n(
      <EditSkillModal
        isOpen={true}
        onClose={onClose}
        skill={makeSkill()}
      />,
      { language: "en" },
    );

    const backdrop = screen.getByTestId("edit-skill-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes metadata fields and icon actions with accessible names", async () => {
    await renderWithI18n(
      <EditSkillModal
        isOpen={true}
        onClose={vi.fn()}
        skill={makeSkill()}
      />,
      { language: "en" },
    );

    expect(
      screen.getByRole("textbox", { name: /Skill Name/i }),
    ).toHaveValue("writer");
    expect(
      screen.getByRole("textbox", { name: "Description" }),
    ).toHaveValue("Draft better prose");
    expect(screen.getByRole("textbox", { name: "Author" })).toHaveValue(
      "Local",
    );
    expect(screen.getByRole("textbox", { name: "Tags (Optional)" })).toHaveValue(
      "",
    );

    const fullscreen = screen.getByRole("button", { name: "Fullscreen" });
    expect(fullscreen).toHaveAttribute("type", "button");
    expect(fullscreen.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("type", "button");
    expect(close.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const openFileEditor = screen.getByRole("button", {
      name: "Open File Editor",
    });
    expect(openFileEditor).toHaveAttribute("type", "button");
    expect(openFileEditor.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const removeTag = screen.getByRole("button", {
      name: "Remove tag user-tag",
    });
    expect(removeTag).toHaveAttribute("type", "button");
    expect(removeTag.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const existingTag = screen.getByRole("button", {
      name: "Add existing tag existing-tag",
    });
    expect(existingTag).toHaveAttribute("type", "button");
    expect(existingTag.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps modal actions from submitting a surrounding form and saves metadata", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onClose = vi.fn();
    const updateSkill = vi.fn().mockResolvedValue(undefined);
    useSkillStore.setState({ updateSkill } as never);

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <EditSkillModal
          isOpen={true}
          onClose={onClose}
          skill={makeSkill()}
        />
      </form>,
      { language: "en" },
    );

    await user.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(screen.getByRole("button", { name: "Exit Fullscreen" })).toHaveAttribute(
      "type",
      "button",
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Skill Name/i }), {
      target: { value: "writer-updated" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Updated description" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Author" }), {
      target: { value: "Updated author" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Tags (Optional)" }), {
      target: { value: "release" },
    });
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "type",
      "button",
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSkill).toHaveBeenCalledWith(
        "skill-edit",
        expect.objectContaining({
          name: "writer-updated",
          description: "Updated description",
          author: "Updated author",
          tags: ["user-tag", "release"],
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
