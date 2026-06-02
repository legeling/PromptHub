import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VersionHistoryModal } from "../../../src/renderer/components/prompt/VersionHistoryModal";
import type { Prompt, PromptVersion } from "@prompthub/shared/types";
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

const middleVersion: PromptVersion = {
  id: "version-2",
  promptId: prompt.id,
  version: 2,
  systemPrompt: "You are helpful.",
  userPrompt: "Do the older thing.",
  variables: [
    {
      name: "tone",
      type: "text",
      required: false,
      defaultValue: "brief",
    },
  ],
  note: "Adjusted user task",
  aiResponse: "Older response",
  createdAt: new Date("2026-04-07T09:30:00.000Z").toISOString(),
};

describe("VersionHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPromptVersionsMock.mockResolvedValue([historyVersion]);
    deletePromptVersionMock.mockResolvedValue(undefined);
  });

  it(
    "keeps the current pseudo-version and initial v1 snapshot protected",
    async () => {
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

    await screen.findByText("Current Version");
    await screen.findByRole("button", { name: /v1/i });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /v1/i }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(deletePromptVersionMock).not.toHaveBeenCalled();
    },
    15000,
  );

  it(
    "deletes a non-initial historical prompt version",
    async () => {
    const user = userEvent.setup();
    getPromptVersionsMock.mockResolvedValue([middleVersion, historyVersion]);

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

    await user.click(await screen.findByRole("button", { name: /v2/i }));
    const deleteButton = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteButton);

    await screen.findByText("Delete version");
    await user.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => {
      expect(deletePromptVersionMock).toHaveBeenCalledWith("version-2");
    });
    },
    15000,
  );

  it("shows a table view with changed cells and opens a focused field diff", async () => {
    const user = userEvent.setup();
    getPromptVersionsMock.mockResolvedValue([middleVersion, historyVersion]);

    await act(async () => {
      await renderWithI18n(
        <VersionHistoryModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            userPrompt: "Do the thing with citations.",
            lastAiResponse: "Current response",
          }}
          onRestore={vi.fn()}
        />,
        { language: "en" },
      );
    });

    await screen.findByText("Current Version");
    await user.click(screen.getByRole("button", { name: "Table" }));

    expect(screen.getByRole("table", { name: /Version matrix/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Version" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "User Prompt" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /v3/i })).toHaveTextContent(
      "Do the thing with citations.",
    );
    expect(screen.getByRole("row", { name: /v2/i })).toHaveTextContent(
      "Do the older thing.",
    );

    const currentUserPromptCell = screen.getByTestId(
      "version-table-cell-current-userPrompt",
    );
    expect(currentUserPromptCell).toHaveAttribute("data-change-state", "changed");

    await user.click(
      currentUserPromptCell.querySelector("button") as HTMLButtonElement,
    );

    expect(await screen.findByText("User Prompt diff")).toBeInTheDocument();
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Do the older thing.").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Do the thing with citations.").length,
    ).toBeGreaterThan(0);
  });

  it("derives table variables from each version prompt text when the variable snapshot is empty", async () => {
    const user = userEvent.setup();
    getPromptVersionsMock.mockResolvedValue([
      {
        ...historyVersion,
        version: 2,
        userPrompt: "Generate commit message for {{ignored}}.",
        variables: ["snapshot_diff"],
      },
      {
        ...historyVersion,
        id: "version-1-with-token",
        version: 1,
        userPrompt: "Summarize {{release_notes}}.",
        variables: [],
      },
    ]);

    await act(async () => {
      await renderWithI18n(
        <VersionHistoryModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            version: 3,
            currentVersion: 3,
            userPrompt: "生成 {{diff:暂存区变更}} 的 Git 提交信息。",
            variables: [],
          }}
          onRestore={vi.fn()}
        />,
        { language: "zh" },
      );
    });

    await screen.findByText("当前版本");
    await user.click(screen.getByRole("button", { name: "表格" }));

    expect(screen.getByTestId("version-table-cell-current-variables"))
      .toHaveTextContent("diff");
    expect(screen.getByTestId("version-table-cell-v2-variables"))
      .toHaveTextContent("snapshot_diff");
    expect(screen.getByTestId("version-table-cell-v2-variables"))
      .not.toHaveTextContent("ignored");
    expect(screen.getByTestId("version-table-cell-v1-variables"))
      .toHaveTextContent("release_notes");
    expect(screen.getByTestId("version-table-cell-v1-variables"))
      .not.toHaveTextContent("无");
  });
});
