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

function createPrompt(
  id: string,
  title: string,
  overrides: Partial<Prompt> = {},
): Prompt {
  return { ...basePrompt, id, title, ...overrides };
}

const currentPrompt = createPrompt("prompt-current", "Launch brief", {
  tags: ["marketing"],
});
const parentPrompt = createPrompt("prompt-parent", "Campaign system");
const childPrompt = createPrompt("prompt-child", "Launch variant", {
  parentId: currentPrompt.id,
});
const rubricPrompt = createPrompt("prompt-rubric", "Review rubric");
const outlinePrompt = createPrompt("prompt-outline", "Outline step");
const relatedPrompt = createPrompt("prompt-related", "Shared context");
const taggedPrompt = createPrompt("prompt-tagged", "Campaign copy", {
  tags: ["marketing"],
});

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
  currentPrompt: panelPrompt = currentPrompt,
  relations = [],
  relationshipCount,
  onCreateRelation = vi.fn(),
  onDeleteRelation = vi.fn(),
  onSelectPrompt = vi.fn(),
  prompts = [
    currentPrompt,
    parentPrompt,
    childPrompt,
    rubricPrompt,
    outlinePrompt,
    relatedPrompt,
    taggedPrompt,
  ],
}: {
  currentPrompt?: Prompt;
  relations?: PromptRelation[];
  relationshipCount?: number;
  onCreateRelation?: Parameters<
    typeof PromptRelationshipPanel
  >[0]["onCreateRelation"];
  onDeleteRelation?: Parameters<
    typeof PromptRelationshipPanel
  >[0]["onDeleteRelation"];
  onSelectPrompt?: Parameters<
    typeof PromptRelationshipPanel
  >[0]["onSelectPrompt"];
  prompts?: Prompt[];
} = {}) {
  await renderWithI18n(
    <PromptRelationshipPanel
      currentPrompt={panelPrompt}
      prompts={prompts}
      relations={relations}
      relationshipCount={relationshipCount}
      onCreateRelation={onCreateRelation}
      onDeleteRelation={onDeleteRelation}
      onSelectPrompt={onSelectPrompt}
    />,
    { language: "en" },
  );
}

describe("PromptRelationshipPanel", () => {
  it("renders existing relations including legacy directional kinds", async () => {
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
      screen.getByRole("button", {
        name: "Open related prompt Shared context",
      }),
    ).toHaveTextContent("Related");

    fireEvent.click(
      screen.getByRole("button", { name: "Open related prompt Review rubric" }),
    );
    expect(onSelectPrompt).toHaveBeenCalledWith(rubricPrompt.id);
  });

  it("counts parent and child hierarchy as prompt relationships", async () => {
    const promptWithParent = { ...currentPrompt, parentId: parentPrompt.id };

    await renderPanel({
      currentPrompt: promptWithParent,
      prompts: [
        promptWithParent,
        parentPrompt,
        childPrompt,
        rubricPrompt,
      ],
      relations: [
        createRelation(
          "relation-related",
          currentPrompt.id,
          rubricPrompt.id,
          "related_to",
        ),
      ],
      relationshipCount: 3,
    });

    expect(screen.getByText("Prompt relationships")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open related prompt Campaign system" }),
    ).toHaveTextContent("Parent");
    expect(
      screen.getByRole("button", { name: "Open related prompt Launch variant" }),
    ).toHaveTextContent("Children");
    expect(
      screen.queryByRole("button", {
        name: "Remove relation to Campaign system",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Remove relation to Launch variant",
      }),
    ).not.toBeInTheDocument();
  });

  it("creates a related_to relation by searching and picking a prompt", async () => {
    const onCreateRelation = vi.fn().mockResolvedValue(undefined);

    await renderPanel({ onCreateRelation });

    fireEvent.change(screen.getByLabelText("Search prompts to link…"), {
      target: { value: "rubric" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Review rubric/ }));
      await Promise.resolve();
    });

    expect(onCreateRelation).toHaveBeenCalledWith({
      sourcePromptId: currentPrompt.id,
      targetPromptId: rubricPrompt.id,
      kind: "related_to",
    });
  });

  it("does not surface already-linked prompts in search results", async () => {
    await renderPanel({
      relations: [
        createRelation(
          "relation-existing",
          currentPrompt.id,
          rubricPrompt.id,
          "related_to",
        ),
      ],
    });

    fireEvent.change(screen.getByLabelText("Search prompts to link…"), {
      target: { value: "rubric" },
    });

    expect(screen.getByText("No matching prompts")).toBeInTheDocument();
  });

  it("suggests prompts that share a tag and links them on click", async () => {
    const onCreateRelation = vi.fn().mockResolvedValue(undefined);

    await renderPanel({ onCreateRelation });

    expect(screen.getByText("Suggested links")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Link Campaign copy" }),
      );
      await Promise.resolve();
    });

    expect(onCreateRelation).toHaveBeenCalledWith({
      sourcePromptId: currentPrompt.id,
      targetPromptId: taggedPrompt.id,
      kind: "related_to",
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
