/**
 * Skill store search utilities (issue #88).
 *
 * Users reported that skills they could find yesterday were sometimes
 * "gone" today. Two classes of problems were behind this:
 *
 *   1. The original filter only considered `name`, `description`, and
 *      `tags`, and did so with a naive `includes` on the lowercase text.
 *      That meant a query like "hello world" would not find a skill
 *      called "hello-world" or "hello_world", even though those are the
 *      conventional store naming conventions.
 *
 *   2. Some skills surface their distinguishing identifier in other
 *      fields such as `install_name`, `slug`, or `author`. If the user
 *      remembered the author / slug, the old search would miss the
 *      skill completely.
 *
 * This module exposes a pure helper so the UI and tests can share the
 * same algorithm, and so future adjustments (e.g. fuzzy matching) can
 * be made in a single place.
 *
 */

import type { RegistrySkill, SkillCategory } from "@prompthub/shared/types";

/**
 * Normalize a free-form search term so that users typing natural
 * language ("Hello World") still find slug-style names ("hello-world"
 * or "hello_world"). We collapse anything that is not a Unicode letter
 * or digit into a single space, lowercase, and collapse repeated
 * whitespace.
 *
 * The normalized form is intentionally not returned to the user — it
 * is purely an internal matching key.
 *
 */
export function normalizeSearchTerm(term: string): string {
  if (!term) return "";
  return term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Return all searchable fields of a registry skill as a single
 * pre-normalized haystack. This also protects against fields that may
 * be `undefined` in ill-formed remote entries (the old implementation
 * called `.toLowerCase()` directly and crashed).
 *
 */
function buildSkillHaystack(skill: RegistrySkill): string {
  const parts: string[] = [];
  const pushIfString = (value: unknown) => {
    if (typeof value === "string" && value.length > 0) {
      parts.push(value);
    }
  };

  pushIfString(skill.name);
  pushIfString(skill.install_name);
  pushIfString(skill.slug);
  pushIfString(skill.description);
  pushIfString(skill.author);
  pushIfString(skill.source_label);
  pushIfString(skill.source_url);
  pushIfString(skill.store_url);
  pushIfString(skill.content_url);
  pushIfString(skill.canonical_skill_path);
  if (Array.isArray(skill.tags)) {
    for (const tag of skill.tags) {
      pushIfString(tag);
    }
  }

  return normalizeSearchTerm(parts.join(" "));
}

/**
 * Per-skill haystack cache. Remote-market skill objects are effectively
 * immutable — rebuilding the haystack on every keystroke across hundreds
 * of skills caused noticeable typing lag in the skill store (review
 * feedback on #126). Keyed by the RegistrySkill object reference, so a
 * freshly-fetched registry (different references) automatically bypasses
 * the cache and the GC can reclaim stale entries when skill references
 * are dropped.
 */
const HAYSTACK_CACHE: WeakMap<RegistrySkill, string> = new WeakMap();

function getSkillHaystack(skill: RegistrySkill): string {
  const cached = HAYSTACK_CACHE.get(skill);
  if (cached !== undefined) {
    return cached;
  }
  const computed = buildSkillHaystack(skill);
  HAYSTACK_CACHE.set(skill, computed);
  return computed;
}

export interface FilterRegistrySkillsOptions {
  /** Optional category filter. `"all"` is treated as "no filter". */
  category?: SkillCategory | "all";
  /**
   * Free-form search query. Empty / whitespace-only queries are treated
   * as "no search" so the full list is returned.
   */
  searchQuery?: string;
}

/**
 * Filter a list of registry skills by category and search query.
 *
 * Behavior:
 *   - Category `"all"` or absent → no category filter.
 *   - Empty / whitespace-only query → no search filter.
 *   - Non-empty query → all whitespace-separated tokens of the
 *     normalized query must appear as substrings in the normalized
 *     skill haystack (AND semantics). This lets a user type three
 *     distinct tokens in any order and still find the skill.
 *
 */
export function filterRegistrySkills(
  skills: readonly RegistrySkill[],
  options: FilterRegistrySkillsOptions = {},
): RegistrySkill[] {
  const { category, searchQuery } = options;

  // Category filter first — cheap and avoids building haystacks for
  // skills that are going to be dropped anyway.
  const categorized =
    category && category !== "all"
      ? skills.filter((skill) => skill.category === category)
      : skills;

  const normalizedQuery = normalizeSearchTerm(searchQuery ?? "");
  if (normalizedQuery.length === 0) {
    // `filter` always returns a new array in the search path; mirror that
    // here so callers get stable return-type semantics.
    return categorized.slice();
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return categorized.slice();
  }

  return categorized.filter((skill) => {
    const haystack = getSkillHaystack(skill);
    return tokens.every((token) => haystack.includes(token));
  });
}
