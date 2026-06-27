import { describe, expect, it } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import {
  flattenPromptTree,
  getPromptHierarchyMeta,
} from "../../../src/renderer/components/prompt/prompt-drag-utils";

const basePrompt: Prompt = {
  id: "prompt-1",
  title: "Parent prompt",
  description: "",
  promptType: "text",
  systemPrompt: "",
  userPrompt: "Write a summary",
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

function createPrompt(id: string, overrides: Partial<Prompt> = {}): Prompt {
  return {
    ...basePrompt,
    id,
    title: `Prompt ${id}`,
    ...overrides,
  };
}

describe("prompt drag hierarchy utils", () => {
  it("builds parent titles and direct child counts for visible prompt hierarchy", () => {
    const parent = createPrompt("parent", { title: "Launch plan" });
    const firstChild = createPrompt("child-1", { parentId: parent.id });
    const secondChild = createPrompt("child-2", { parentId: parent.id });
    const orphan = createPrompt("orphan", { parentId: "missing-parent" });

    const meta = getPromptHierarchyMeta([parent, firstChild, secondChild, orphan]);

    expect(meta.childCountById.get(parent.id)).toBe(2);
    expect(meta.parentTitleById.get(firstChild.id)).toBe(parent.title);
    expect(meta.parentTitleById.get(secondChild.id)).toBe(parent.title);
    expect(meta.childCountById.has("missing-parent")).toBe(false);
    expect(meta.parentTitleById.has(orphan.id)).toBe(false);
  });

  it("omits descendants of collapsed prompts while preserving the collapsed parent", () => {
    const parent = createPrompt("parent");
    const child = createPrompt("child", { parentId: parent.id });
    const grandchild = createPrompt("grandchild", { parentId: child.id });
    const sibling = createPrompt("sibling");

    const flattened = flattenPromptTree(
      [parent, child, grandchild, sibling],
      new Set([parent.id]),
    );

    expect(flattened.map((node) => node.prompt.id)).toEqual([parent.id, sibling.id]);
  });

  it("can preserve the caller's sorted sibling order for display lists", () => {
    const parentA = createPrompt("parent-a", { order: 0 });
    const parentB = createPrompt("parent-b", { order: 1 });
    const childB1 = createPrompt("child-b-1", {
      parentId: parentB.id,
      order: 0,
    });
    const childB2 = createPrompt("child-b-2", {
      parentId: parentB.id,
      order: 1,
    });
    const sortedByChildCount = [parentB, parentA, childB1, childB2];

    const displayFlattened = flattenPromptTree(
      sortedByChildCount,
      new Set(),
      { siblingOrder: "input" },
    );
    const storedFlattened = flattenPromptTree(sortedByChildCount);

    expect(displayFlattened.map((node) => node.prompt.id)).toEqual([
      parentB.id,
      childB1.id,
      childB2.id,
      parentA.id,
    ]);
    expect(storedFlattened.map((node) => node.prompt.id)).toEqual([
      parentA.id,
      parentB.id,
      childB1.id,
      childB2.id,
    ]);
  });

  it("preserves input order independently for root and child sibling groups", () => {
    const parentA = createPrompt("parent-a", { order: 10 });
    const parentB = createPrompt("parent-b", { order: 0 });
    const childA1 = createPrompt("child-a-1", {
      parentId: parentA.id,
      order: 2,
    });
    const childA2 = createPrompt("child-a-2", {
      parentId: parentA.id,
      order: 1,
    });
    const childB1 = createPrompt("child-b-1", {
      parentId: parentB.id,
      order: 5,
    });
    const childB2 = createPrompt("child-b-2", {
      parentId: parentB.id,
      order: 4,
    });
    const sortedForDisplay = [
      parentA,
      childA1,
      childA2,
      parentB,
      childB1,
      childB2,
    ];

    expect(
      flattenPromptTree(sortedForDisplay, new Set(), {
        siblingOrder: "input",
      }).map((node) => node.prompt.id),
    ).toEqual([
      parentA.id,
      childA1.id,
      childA2.id,
      parentB.id,
      childB1.id,
      childB2.id,
    ]);

    expect(flattenPromptTree(sortedForDisplay).map((node) => node.prompt.id)).toEqual([
      parentB.id,
      childB2.id,
      childB1.id,
      parentA.id,
      childA2.id,
      childA1.id,
    ]);
  });
});
