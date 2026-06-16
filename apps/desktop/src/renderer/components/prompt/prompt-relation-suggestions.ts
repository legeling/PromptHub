import type { Prompt } from "@prompthub/shared/types";
import { isSubsequence } from "../../services/prompt-filter";

export type SuggestionReason = "same_tag" | "same_folder" | "similar_title";

export interface RelationSuggestion {
  prompt: Prompt;
  reason: SuggestionReason;
  /** Shared tag when reason is same_tag, used for the explanation chip. */
  sharedTag?: string;
}

const MAX_SUGGESTIONS = 6;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function titlesAreSimilar(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b || a === b) {
    return false;
  }

  // Treat one title containing the other (or a long common prefix) as similar.
  // Covers "Test Prompt" vs "Test Prompt (Copy)" without fuzzy noise.
  if (a.includes(b) || b.includes(a)) {
    return true;
  }

  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  return shorter.length >= 4 && isSubsequence(shorter, longer);
}

/**
 * Rank prompts likely related to the current one: shared tags first, then same
 * folder, then similar titles. Excludes the current prompt, prompts that are
 * already related, and the current prompt's parent/children (those are the
 * tree relationship, surfaced separately).
 */
export function buildRelationSuggestions(
  currentPrompt: Prompt,
  prompts: Prompt[],
  excludedIds: Set<string>,
): RelationSuggestion[] {
  const currentTags = new Set(currentPrompt.tags ?? []);
  const suggestions: RelationSuggestion[] = [];
  const seen = new Set<string>();

  const add = (suggestion: RelationSuggestion) => {
    if (seen.has(suggestion.prompt.id)) {
      return;
    }
    seen.add(suggestion.prompt.id);
    suggestions.push(suggestion);
  };

  const candidates = prompts.filter(
    (prompt) =>
      prompt.id !== currentPrompt.id && !excludedIds.has(prompt.id),
  );

  // 1) Shared tag.
  if (currentTags.size > 0) {
    for (const prompt of candidates) {
      const sharedTag = (prompt.tags ?? []).find((tag) => currentTags.has(tag));
      if (sharedTag) {
        add({ prompt, reason: "same_tag", sharedTag });
      }
    }
  }

  // 2) Same folder.
  if (currentPrompt.folderId) {
    for (const prompt of candidates) {
      if (prompt.folderId === currentPrompt.folderId) {
        add({ prompt, reason: "same_folder" });
      }
    }
  }

  // 3) Similar title.
  for (const prompt of candidates) {
    if (titlesAreSimilar(currentPrompt.title, prompt.title)) {
      add({ prompt, reason: "similar_title" });
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

/**
 * Fuzzy-search candidate prompts by title for the relation search box. Returns
 * up to `limit` matches ordered by how early the query matches.
 */
export function searchRelationCandidates(
  query: string,
  candidates: Prompt[],
  limit = 8,
): Prompt[] {
  const normalized = normalize(query);
  if (!normalized) {
    return [];
  }

  return candidates
    .filter((prompt) => isSubsequence(normalized, normalize(prompt.title)))
    .sort((left, right) => {
      const leftIndex = normalize(left.title).indexOf(normalized);
      const rightIndex = normalize(right.title).indexOf(normalized);
      // Exact substring matches (index >= 0) rank before subsequence-only ones.
      const leftRank = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
      const rightRank = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.title.localeCompare(right.title);
    })
    .slice(0, limit);
}
