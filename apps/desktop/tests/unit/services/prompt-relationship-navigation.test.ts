import { describe, expect, it } from "vitest";
import type { Folder, PromptSummary } from "@prompthub/shared/types";
import { getPromptRevealPlan } from "../../../src/renderer/services/prompt-relationship-navigation";
import { filterVisiblePrompts } from "../../../src/renderer/services/prompt-filter";

const parent: PromptSummary = {
  id: "parent", title: "Parent", description: "", tags: ["focus"],
  folderId: "a", parentId: null, promptType: "text", isFavorite: false,
  isPinned: false, usageCount: 0, version: 1, currentVersion: 1,
  createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z",
};
const child: PromptSummary = { ...parent, id: "child", title: "Child", folderId: "b", parentId: parent.id };
const folders: Folder[] = [
  { id: "a", name: "A", order: 0, createdAt: parent.createdAt, updatedAt: parent.updatedAt },
  { id: "b", name: "B", order: 1, createdAt: parent.createdAt, updatedAt: parent.updatedAt },
];
const scope = { prompts: [parent, child], folders, selectedFolderId: "a", unlockedFolderIds: new Set<string>() };

describe("relationship reveal planning", () => {
  it("reveals a cross-folder child in All without changing its folder or hierarchy", () => {
    const plan = getPromptRevealPlan(child.id, scope);
    expect(plan).toEqual({ folderId: null, ancestorIds: [parent.id] });
    const visible = filterVisiblePrompts({ ...scope, selectedFolderId: plan!.folderId, promptTypeFilter: "all" });
    expect(visible.map((prompt) => prompt.id)).toEqual([parent.id, child.id]);
    expect(child.folderId).toBe("b");
    expect(child.parentId).toBe(parent.id);
  });

  it("keeps a folder containing the target", () => {
    expect(getPromptRevealPlan(child.id, { ...scope, selectedFolderId: "b" })?.folderId).toBe("b");
  });

  it("does not reveal a locked private child or a child under a private ancestor", () => {
    const privateFolders = [{ ...folders[0], isPrivate: true }, { ...folders[1], parentId: "a" }];
    expect(getPromptRevealPlan(child.id, { ...scope, folders: privateFolders })).toBeNull();
  });

  it("keeps an unlocked private scope, but never switches to it from All", () => {
    const privateFolders = [folders[0], { ...folders[1], isPrivate: true }];
    const unlocked = { ...scope, folders: privateFolders, unlockedFolderIds: new Set(["b"]) };
    expect(getPromptRevealPlan(child.id, { ...unlocked, selectedFolderId: "b" })?.folderId).toBe("b");
    expect(getPromptRevealPlan(child.id, { ...unlocked, selectedFolderId: null })).toBeNull();
  });

  it("returns no plan for a missing target", () => {
    expect(getPromptRevealPlan("missing", scope)).toBeNull();
  });
});
