import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PromptDetailModal } from "../../../src/renderer/components/prompt/PromptDetailModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";

const prompt = {
  id: "prompt-1",
  title: "Weekly planner",
  description: "Old description",
  promptType: "text" as const,
  systemPrompt: "You are a helpful planner.",
  userPrompt: "Plan my week.",
  variables: [],
  tags: ["planning"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  notes: "Old notes",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

describe("PromptDetailModal", () => {
  it("shows AI quick edit action in the header", async () => {
    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={prompt}
          onEdit={vi.fn()}
          onQuickRewriteEdit={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByRole("button", { name: "AI Quick Edit" })).toBeInTheDocument();
  });
});
