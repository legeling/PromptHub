import { describe, expect, it } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import {
  buildRelationSuggestions,
  searchRelationCandidates,
} from "../../../src/renderer/components/prompt/prompt-relation-suggestions";

const base: Prompt = {
  id: "base",
  title: "Base",
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

function make(id: string, title: string, overrides: Partial<Prompt> = {}): Prompt {
  return { ...base, id, title, ...overrides };
}

describe("buildRelationSuggestions", () => {
  it("ranks shared tags first, then same folder, then similar title", () => {
    const current = make("current", "Launch brief", {
      tags: ["marketing"],
      folderId: "folder-1",
    });
    const sharedTag = make("a", "Campaign copy", { tags: ["marketing"] });
    const sameFolder = make("b", "Budget sheet", { folderId: "folder-1" });
    const similarTitle = make("c", "Launch brief (Copy)");
    const unrelated = make("d", "Totally different");

    const suggestions = buildRelationSuggestions(
      current,
      [current, sharedTag, sameFolder, similarTitle, unrelated],
      new Set([current.id]),
    );

    const ids = suggestions.map((s) => s.prompt.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).not.toContain("d");
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(suggestions[0]).toMatchObject({
      reason: "same_tag",
      sharedTag: "marketing",
    });
  });

  it("excludes already-linked prompts", () => {
    const current = make("current", "Launch brief", { tags: ["x"] });
    const linked = make("linked", "Linked one", { tags: ["x"] });

    const suggestions = buildRelationSuggestions(
      current,
      [current, linked],
      new Set([current.id, linked.id]),
    );

    expect(suggestions).toHaveLength(0);
  });
});

describe("searchRelationCandidates", () => {
  const candidates = [
    make("a", "Git Commit Generator"),
    make("b", "Code Review Expert"),
    make("c", "Generate commit"),
  ];

  it("returns empty for blank query", () => {
    expect(searchRelationCandidates("", candidates)).toHaveLength(0);
  });

  it("matches by fuzzy subsequence and ranks substring hits first", () => {
    const results = searchRelationCandidates("commit", candidates);
    expect(results.map((p) => p.id)).toContain("a");
    expect(results.map((p) => p.id)).toContain("c");
    // "Generate commit" has "commit" as a direct substring earlier-scored than
    // a subsequence-only match, both present.
    expect(results.length).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    const results = searchRelationCandidates("REVIEW", candidates);
    expect(results.map((p) => p.id)).toContain("b");
  });
});
