import { describe, expect, it } from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import {
  applyPromptTreeAutoCollapseOnSelect,
  getPromptAncestorPathIds,
} from "../../../src/renderer/components/layout/prompt-tree-collapse";

function makePrompt(id: string, parentId: string | null = null): Prompt {
  return {
    id,
    title: id,
    promptType: "text",
    userPrompt: "x",
    variables: [],
    tags: [],
    images: [],
    videos: [],
    parentId,
    order: 0,
    isFavorite: false,
    isPinned: false,
    usageCount: 0,
    currentVersion: 1,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Prompt;
}

describe("prompt-tree-collapse", () => {
  const prompts = [
    makePrompt("A"),
    makePrompt("A1", "A"),
    makePrompt("A2", "A"),
    makePrompt("B"),
    makePrompt("B1", "B"),
    makePrompt("C"),
  ];

  it("computes ancestor path including self", () => {
    expect([...getPromptAncestorPathIds(prompts, "A1")].sort()).toEqual(["A", "A1"]);
    expect([...getPromptAncestorPathIds(prompts, "B1")].sort()).toEqual(["B", "B1"]);
    expect([...getPromptAncestorPathIds(prompts, "C")]).toEqual(["C"]);
    expect([...getPromptAncestorPathIds(prompts, "missing")]).toEqual(["missing"]);
  });

  it("collapses previously expanded parent branches when another leaf is selected, keeping the new selection's ancestors open", () => {
    const collapsed = applyPromptTreeAutoCollapseOnSelect({
      prompts,
      collapsedIds: new Set<string>(), // A/B/C are expanded
      selectedId: "A1",
    });
    expect(collapsed.has("A")).toBe(false);
    expect(collapsed.has("B")).toBe(true);
    expect(collapsed.has("C")).toBe(false);
  });

  it("expands a selected parent branch and ancestor path even when they were collapsed", () => {
    const collapsed = applyPromptTreeAutoCollapseOnSelect({
      prompts,
      collapsedIds: new Set(["A", "A1"]),
      selectedId: "A1",
    });
    expect(collapsed.has("A")).toBe(false);
    expect(collapsed.has("A1")).toBe(false);
    expect(collapsed.has("B")).toBe(true);
  });

  it("selecting a parent again expands its own branch without leaving that parent collapsed", () => {
    const collapsed = applyPromptTreeAutoCollapseOnSelect({
      prompts,
      collapsedIds: new Set(["A"]),
      selectedId: "A",
    });
    expect(collapsed.has("A")).toBe(false);
    expect(collapsed.has("B")).toBe(true);
  });

  it("collapses all expanded parents when selecting a parent branch not containing them", () => {
    const collapsed = applyPromptTreeAutoCollapseOnSelect({
      prompts,
      collapsedIds: new Set(["C"]), // C already collapsed
      selectedId: "B1",
    });
    expect(collapsed.has("A")).toBe(true);
    expect(collapsed.has("B")).toBe(false);
    expect(collapsed.has("C")).toBe(true);
  });

  it("when selecting a branch root itself, that branch remains open and sibling branches collapse", () => {
    const collapsed = applyPromptTreeAutoCollapseOnSelect({
      prompts,
      collapsedIds: new Set(),
      selectedId: "A",
    });
    expect(collapsed.has("A")).not.toBe(true);
    expect(collapsed.has("B")).toBe(true);
  });

  it("null selection leaves collapse state untouched", () => {
    const keep = new Set(["A"]);
    expect(applyPromptTreeAutoCollapseOnSelect({ prompts, collapsedIds: keep, selectedId: null })).toBe(keep);
  });
});
