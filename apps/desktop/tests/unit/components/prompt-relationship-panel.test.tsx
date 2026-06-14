import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

import { PromptRelationshipPanel } from "../../../src/renderer/components/prompt/PromptRelationshipPanel";
import { renderWithI18n } from "../../helpers/i18n";

const basePrompt: Prompt = {
  id: "prompt-current",
  title: "Launch brief",
  description: "Main prompt",
  promptType: "text",
  systemPrompt: "",
  userPrompt: "Write a launch brief.",
  variables: [],
  tags: [],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function createPrompt(id: string, title: string): Prompt {
  return {
    ...basePrompt,
    id,
    title,
  };
}

const currentPrompt = basePrompt;
const rubricPrompt = createPrompt("prompt-rubric", "Review rubric");
const outlinePrompt = createPrompt("prompt-outline", "Outline step");
const relatedPrompt = createPrompt("prompt-related", "Shared context");

function createRelation(
  id: string,
  sourcePromptId: string,
  targetPromptId: string,
  kind: PromptRelation["kind"],
): PromptRelation {
  return {
    id,
    sourcePromptId,
    targetPromptId,
    kind,
    note: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

async function renderPanel({
  relations = [],
  onCreateRelation = vi.fn(),
  onDeleteRelation = vi.fn(),
  onSelectPrompt = vi.fn(),
}: {
  relations?: PromptRelation[];
  onCreateRelation?: Parameters<
    typeof PromptRelationshipPanel
  >[0]["onCreateRelation"];
  onDeleteRelation?: Parameters<
    typeof PromptRelationshipPanel
  >[0]["onDeleteRelation"];
  onSelectPrompt?: Parameters<
    typeof PromptRelationshipPanel
  >[0]["onSelectPrompt"];
} = {}) {
  await renderWithI18n(
    <PromptRelationshipPanel
      currentPrompt={currentPrompt}
      prompts={[currentPrompt, rubricPrompt, outlinePrompt, relatedPrompt]}
      relations={relations}
      onCreateRelation={onCreateRelation}
      onDeleteRelation={onDeleteRelation}
      onSelectPrompt={onSelectPrompt}
    />,
    { language: "en" },
  );
}

describe("PromptRelationshipPanel", () => {
  it("shows outgoing, incoming, and neutral prompt relations", async () => {
    const onSelectPrompt = vi.fn();

    await renderPanel({
      relations: [
        createRelation(
          "relation-depends",
          currentPrompt.id,
          rubricPrompt.id,
          "depends_on",
        ),
        createRelation(
          "relation-previous",
          outlinePrompt.id,
          currentPrompt.id,
          "next_step",
        ),
        createRelation(
          "relation-related",
          currentPrompt.id,
          relatedPrompt.id,
          "related_to",
        ),
      ],
      onSelectPrompt,
    });

    expect(screen.getByText("Prompt relationships")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open related prompt Review rubric" }),
    ).toHaveTextContent("Depends on");
    expect(
      screen.getByRole("button", { name: "Open related prompt Outline step" }),
    ).toHaveTextContent("Previous step");
    expect(
      screen.getByRole("button", {
        name: "Open related prompt Shared context",
      }),
    ).toHaveTextContent("Related");

    fireEvent.click(
      screen.getByRole("button", { name: "Open related prompt Review rubric" }),
    );

    expect(onSelectPrompt).toHaveBeenCalledWith(rubricPrompt.id);
  });

  it("creates a semantic relation from the current prompt to the selected target", async () => {
    const onCreateRelation = vi.fn().mockResolvedValue(undefined);

    await renderPanel({ onCreateRelation });

    fireEvent.change(screen.getByLabelText("Relation type"), {
      target: { value: "variant_of" },
    });
    fireEvent.change(screen.getByLabelText("Target prompt"), {
      target: { value: rubricPrompt.id },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add relation" }));
      await Promise.resolve();
    });

    expect(onCreateRelation).toHaveBeenCalledWith({
      sourcePromptId: currentPrompt.id,
      targetPromptId: rubricPrompt.id,
      kind: "variant_of",
    });
  });

  it("deletes a relation inline", async () => {
    const onDeleteRelation = vi.fn().mockResolvedValue(undefined);

    await renderPanel({
      relations: [
        createRelation(
          "relation-depends",
          currentPrompt.id,
          rubricPrompt.id,
          "depends_on",
        ),
      ],
      onDeleteRelation,
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Remove relation to Review rubric",
        }),
      );
      await Promise.resolve();
    });

    expect(onDeleteRelation).toHaveBeenCalledWith("relation-depends");
  });
});
