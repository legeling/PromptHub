import { describe, expect, it } from "vitest";

import type { Folder, Prompt } from "@prompthub/shared/types";
import {
  buildPromptStats,
  filterVisiblePrompts,
  sortVisiblePrompts,
} from "../../../src/renderer/services/prompt-filter";

function createPrompt(index: number, overrides: Partial<Prompt> = {}): Prompt {
  const iso = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();

  return {
    id: `prompt-${index}`,
    title: `Prompt ${String(index).padStart(4, "0")}`,
    description: index === 777 ? "Special release note" : `Description ${index}`,
    promptType: index % 5 === 0 ? "image" : "text",
    systemPrompt: `System ${index}`,
    systemPromptEn: `System EN ${index}`,
    userPrompt: `User ${index} batch import`,
    userPromptEn: `User EN ${index} batch import`,
    variables: [],
    tags: [
      `group-${index % 10}`,
      ...(index === 777 ? ["focus-tag"] : []),
    ],
    folderId: index % 2 === 0 ? "folder-a" : "folder-b",
    isFavorite: index % 8 === 0,
    isPinned: index === 999,
    version: 1,
    currentVersion: 1,
    usageCount: index,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}

const folders: Folder[] = [
  {
    id: "folder-a",
    name: "Folder A",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "folder-b",
    name: "Folder B",
    order: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const prompts = Array.from({ length: 1000 }, (_, index) => createPrompt(index));

describe("prompt-filter large dataset", () => {
  it("builds aggregate stats for 1000 prompts in one pass", () => {
    const stats = buildPromptStats(prompts);

    expect(stats.totalCount).toBe(1000);
    expect(stats.imageCount).toBe(200);
    expect(stats.textCount).toBe(800);
    expect(stats.favoriteCount).toBe(125);
    expect(stats.uniqueTags).toContain("focus-tag");
    expect(stats.uniqueTags).toContain("group-0");
  });

  it("filters down a large prompt set by folder, search, tag, and type", () => {
    const result = filterVisiblePrompts({
      prompts,
      selectedFolderId: "folder-b",
      folders,
      unlockedFolderIds: new Set<string>(),
      searchQuery: "special release",
      filterTags: ["focus-tag"],
      promptTypeFilter: "text",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("prompt-777");
  });

  it("keeps pinned prompts first while still sorting a large set", () => {
    const sorted = sortVisiblePrompts(prompts, "title", "asc");

    expect(sorted[0]?.id).toBe("prompt-999");
    expect(sorted[1]?.title).toBe("Prompt 0000");
    expect(sorted.at(-1)?.title).toBe("Prompt 0998");
  });

  it("sorts prompts by direct visible child count before pinned tie-breaks", () => {
    const parentA = createPrompt(1, { id: "parent-a", title: "Parent A" });
    const parentB = createPrompt(2, { id: "parent-b", title: "Parent B" });
    const leaf = createPrompt(3, { id: "leaf", title: "Leaf" });
    const pinnedLeaf = createPrompt(4, {
      id: "pinned-leaf",
      title: "Pinned Leaf",
      isPinned: true,
    });
    const childA1 = createPrompt(5, { id: "child-a-1", parentId: "parent-a" });
    const childA2 = createPrompt(6, { id: "child-a-2", parentId: "parent-a" });
    const childB1 = createPrompt(7, { id: "child-b-1", parentId: "parent-b" });
    const orphan = createPrompt(8, {
      id: "orphan",
      parentId: "missing-parent",
    });
    const visiblePrompts = [
      leaf,
      childA1,
      parentB,
      pinnedLeaf,
      childA2,
      parentA,
      childB1,
      orphan,
    ];

    expect(
      sortVisiblePrompts(visiblePrompts, "childCount", "desc").map(
        (prompt) => prompt.id,
      ),
    ).toEqual([
      "parent-a",
      "parent-b",
      "pinned-leaf",
      "leaf",
      "child-a-1",
      "child-a-2",
      "child-b-1",
      "orphan",
    ]);

    expect(
      sortVisiblePrompts(visiblePrompts, "childCount", "asc").map(
        (prompt) => prompt.id,
      ),
    ).toEqual([
      "pinned-leaf",
      "leaf",
      "child-a-1",
      "child-a-2",
      "child-b-1",
      "orphan",
      "parent-b",
      "parent-a",
    ]);
  });

  it("counts only direct visible children for child-count sorting", () => {
    const parent = createPrompt(1, { id: "parent", title: "Parent" });
    const child = createPrompt(2, { id: "child", parentId: parent.id });
    const grandchild = createPrompt(3, {
      id: "grandchild",
      parentId: child.id,
    });
    const hiddenChild = createPrompt(4, {
      id: "hidden-child",
      parentId: parent.id,
      tags: ["hidden"],
    });
    const otherParent = createPrompt(5, {
      id: "other-parent",
      title: "Other Parent",
    });
    const otherChildA = createPrompt(6, {
      id: "other-child-a",
      parentId: otherParent.id,
    });
    const otherChildB = createPrompt(7, {
      id: "other-child-b",
      parentId: otherParent.id,
    });

    const visiblePrompts = [
      parent,
      child,
      grandchild,
      otherParent,
      otherChildA,
      otherChildB,
    ];

    expect(
      sortVisiblePrompts(visiblePrompts, "childCount", "desc").map(
        (prompt) => prompt.id,
      ),
    ).toEqual([
      "other-parent",
      "parent",
      "child",
      "grandchild",
      "other-child-a",
      "other-child-b",
    ]);

    expect(
      sortVisiblePrompts(
        [...visiblePrompts, hiddenChild],
        "childCount",
        "desc",
      ).map((prompt) => prompt.id),
    ).toEqual([
      "parent",
      "other-parent",
      "child",
      "grandchild",
      "other-child-a",
      "other-child-b",
      "hidden-child",
    ]);
  });

  it("uses pinned order only as a child-count tie breaker", () => {
    const parentWithChildren = createPrompt(1, {
      id: "parent-with-children",
      isPinned: false,
    });
    const childA = createPrompt(2, {
      id: "child-a",
      parentId: parentWithChildren.id,
    });
    const childB = createPrompt(3, {
      id: "child-b",
      parentId: parentWithChildren.id,
    });
    const pinnedLeaf = createPrompt(4, {
      id: "pinned-leaf",
      isPinned: true,
    });
    const regularLeaf = createPrompt(5, {
      id: "regular-leaf",
      isPinned: false,
    });

    expect(
      sortVisiblePrompts(
        [pinnedLeaf, regularLeaf, childA, parentWithChildren, childB],
        "childCount",
        "desc",
      ).map((prompt) => prompt.id),
    ).toEqual([
      "parent-with-children",
      "pinned-leaf",
      "regular-leaf",
      "child-a",
      "child-b",
    ]);
  });
});
