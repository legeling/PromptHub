import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VersionHistoryModal } from "../../../src/renderer/components/prompt/VersionHistoryModal";
import type { Prompt, PromptVersion } from "../../../src/shared/types";
import { renderWithI18n } from "../../helpers/i18n";

const getPromptVersionsMock = vi.fn();
const deletePromptVersionMock = vi.fn();

vi.mock("../../../src/renderer/services/database", () => ({
  getPromptVersions: (...args: unknown[]) => getPromptVersionsMock(...args),
  deletePromptVersion: (...args: unknown[]) => deletePromptVersionMock(...args),
}));

const prompt: Prompt = {
  id: "prompt-1",
  title: "Demo Prompt",
  systemPrompt: "You are helpful.",
  userPrompt: "Do the thing.",
  variables: [],
  tags: [],
  isFavorite: false,
  isPinned: false,
  version: 3,
  currentVersion: 3,
  usageCount: 0,
  createdAt: new Date("2026-04-07T09:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-04-07T10:00:00.000Z").toISOString(),
};

const historyVersion: PromptVersion = {
  id: "version-1",
  promptId: prompt.id,
  version: 1,
  systemPrompt: "You are older.",
  userPrompt: "Old body.",
  variables: [],
  createdAt: new Date("2026-04-06T10:00:00.000Z").toISOString(),
};

describe("VersionHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPromptVersionsMock.mockResolvedValue([historyVersion]);
    deletePromptVersionMock.mockResolvedValue(undefined);
  });

  it("deletes a historical prompt version but keeps the current pseudo-version protected", async () => {
    const user = userEvent.setup();

    await act(async () => {
      await renderWithI18n(
        <VersionHistoryModal
          isOpen
          onClose={vi.fn()}
          prompt={prompt}
          onRestore={vi.fn()}
        />,
        { language: "en" },
      );
    });

    await screen.findByRole("button", { name: /v1/i });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /v1/i }));
    const deleteButton = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteButton);

    await screen.findByText("Delete version");
    await user.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => {
      expect(deletePromptVersionMock).toHaveBeenCalledWith("version-1");
    });
  });
});
