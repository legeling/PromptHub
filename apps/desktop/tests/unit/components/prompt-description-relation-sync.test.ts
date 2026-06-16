import { describe, expect, it } from "vitest";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

import {
  MENTION_RELATION_NOTE,
  reconcileDescriptionRelations,
} from "../../../src/renderer/components/prompt/prompt-description-relation-sync";

const basePrompt: Prompt = {
  id: "a",
  title: "A",
  description: "",
  promptType: "text",
  systemPrompt: "",
  userPrompt: "",
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

function p(id: string, description = ""): Prompt {
  return { ...basePrompt, id, title: id.toUpperCase(), description };
}

function mentionRel(
  id: string,
  source: string,
  target: string,
): PromptRelation {
  return {
    id,
    sourcePromptId: source,
    targetPromptId: target,
    kind: "related_to",
    note: MENTION_RELATION_NOTE,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("reconcileDescriptionRelations", () => {
  it("creates links for newly referenced prompts", () => {
    const plan = reconcileDescriptionRelations(
      "a",
      "pair with [[b]] and [[c]]",
      [p("a"), p("b"), p("c")],
      [],
    );
    expect(plan.toCreate.sort()).toEqual(["b", "c"]);
    expect(plan.toDelete).toEqual([]);
  });

  it("does not recreate an existing mention link (undirected)", () => {
    // Link already exists as b->a; editing a's description to mention b again
    // must not create a duplicate.
    const plan = reconcileDescriptionRelations(
      "a",
      "see [[b]]",
      [p("a"), p("b")],
      [mentionRel("r1", "b", "a")],
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("deletes a mention link when neither side references the other", () => {
    const plan = reconcileDescriptionRelations(
      "a",
      "no more refs",
      [p("a"), p("b", "b has no refs")],
      [mentionRel("r1", "a", "b")],
    );
    expect(plan.toDelete).toEqual(["r1"]);
  });

  it("keeps a mention link when the peer still references this prompt", () => {
    // a dropped [[b]], but b's description still mentions [[a]].
    const plan = reconcileDescriptionRelations(
      "a",
      "no more refs",
      [p("a"), p("b", "still pairs with [[a]]")],
      [mentionRel("r1", "a", "b")],
    );
    expect(plan.toDelete).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  it("never touches manually-created relations", () => {
    const manual: PromptRelation = {
      ...mentionRel("manual1", "a", "b"),
      note: null,
    };
    const plan = reconcileDescriptionRelations(
      "a",
      "no refs at all",
      [p("a"), p("b")],
      [manual],
    );
    expect(plan.toDelete).toEqual([]);
  });

  it("ignores references to non-existent prompts", () => {
    const plan = reconcileDescriptionRelations(
      "a",
      "ghost [[zzz]]",
      [p("a")],
      [],
    );
    expect(plan.toCreate).toEqual([]);
  });

  it("ignores self-references", () => {
    const plan = reconcileDescriptionRelations(
      "a",
      "self [[a]]",
      [p("a")],
      [],
    );
    expect(plan.toCreate).toEqual([]);
  });
});
