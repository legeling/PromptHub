import { describe, expect, it } from "vitest";

import type { Folder, Prompt } from "../../../src/shared/types";
import {
  buildPromptStats,
  filterVisiblePrompts,
  sortVisiblePrompts,
} from "../../../src/renderer/services/prompt-filter";

function createPrompt(index: number): Prompt {
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
});
