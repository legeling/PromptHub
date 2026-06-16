/**
 * Wiki-link references inside prompt descriptions. A reference is written as
 * `[[promptId]]` in the stored text; this module parses, strips, and tokenizes
 * those markers so the description can carry inline prompt links while the
 * related_to relations stay derivable from the text.
 */

const REFERENCE_PATTERN = /\[\[([^[\]]+)\]\]/g;

export interface DescriptionTextSegment {
  type: "text";
  value: string;
}

export interface DescriptionRefSegment {
  type: "ref";
  /** The referenced prompt id from [[id]]. */
  promptId: string;
}

export type DescriptionSegment = DescriptionTextSegment | DescriptionRefSegment;

/**
 * Extract the unique prompt ids referenced via [[id]] in `text`, preserving
 * first-seen order.
 */
export function parsePromptReferences(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const id = match[1].trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Remove all [[id]] markers, collapsing leftover double spaces. */
export function stripPromptReferences(text: string | null | undefined): string {
  if (!text) {
    return "";
  }
  return text.replace(REFERENCE_PATTERN, "").replace(/ {2,}/g, " ").trim();
}

/**
 * Split `text` into ordered segments of plain text and prompt references, so a
 * renderer can interleave text spans with clickable prompt links.
 */
export function tokenizeDescription(
  text: string | null | undefined,
): DescriptionSegment[] {
  if (!text) {
    return [];
  }

  const segments: DescriptionSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    const promptId = match[1].trim();
    if (promptId) {
      segments.push({ type: "ref", promptId });
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

/** Whether `text` contains at least one [[id]] reference. */
export function hasPromptReferences(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  REFERENCE_PATTERN.lastIndex = 0;
  return REFERENCE_PATTERN.test(text);
}

/**
 * Insert a [[promptId]] marker into `text` at `caret`, replacing the trailing
 * `@query` token the user typed. Returns the new text and the caret position
 * after the inserted marker.
 */
export function insertPromptReference(
  text: string,
  caret: number,
  promptId: string,
): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  // Drop the "@partialQuery" immediately preceding the caret.
  const atIndex = before.lastIndexOf("@");
  const head = atIndex >= 0 ? before.slice(0, atIndex) : before;
  const marker = `[[${promptId}]]`;
  const needsSpace = head.length > 0 && !head.endsWith(" ");
  const insertion = `${needsSpace ? " " : ""}${marker} `;
  const nextText = `${head}${insertion}${after}`;
  return { text: nextText, caret: head.length + insertion.length };
}

/**
 * If the caret sits inside an active `@query` token (after an `@` with no
 * whitespace between it and the caret), return that query; otherwise null.
 */
export function getActiveMentionQuery(
  text: string,
  caret: number,
): string | null {
  const before = text.slice(0, caret);
  const atIndex = before.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const query = before.slice(atIndex + 1);
  // A mention token ends at whitespace or a closing bracket.
  if (/[\s\]]/.test(query)) {
    return null;
  }
  return query;
}
