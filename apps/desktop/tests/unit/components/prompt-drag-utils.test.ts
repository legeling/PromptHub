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
});
