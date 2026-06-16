import { describe, expect, it } from "vitest";

import {
  getActiveMentionQuery,
  hasPromptReferences,
  insertPromptReference,
  parsePromptReferences,
  stripPromptReferences,
  tokenizeDescription,
} from "../../../src/renderer/components/prompt/prompt-description-refs";

describe("parsePromptReferences", () => {
  it("extracts unique ids in first-seen order", () => {
    const text = "see [[a]] and [[b]] then [[a]] again";
    expect(parsePromptReferences(text)).toEqual(["a", "b"]);
  });

  it("returns empty for no references or empty input", () => {
    expect(parsePromptReferences("plain text")).toEqual([]);
    expect(parsePromptReferences("")).toEqual([]);
    expect(parsePromptReferences(null)).toEqual([]);
  });

  it("trims whitespace inside markers", () => {
    expect(parsePromptReferences("[[ abc ]]")).toEqual(["abc"]);
  });
});

describe("stripPromptReferences", () => {
  it("removes markers and collapses extra spaces", () => {
    expect(stripPromptReferences("pair with [[abc]] here")).toBe(
      "pair with here",
    );
  });

  it("handles empty input", () => {
    expect(stripPromptReferences(null)).toBe("");
  });
});

describe("tokenizeDescription", () => {
  it("interleaves text and ref segments in order", () => {
    expect(tokenizeDescription("a [[x]] b")).toEqual([
      { type: "text", value: "a " },
      { type: "ref", promptId: "x" },
      { type: "text", value: " b" },
    ]);
  });

  it("handles leading and trailing references", () => {
    expect(tokenizeDescription("[[x]]tail")).toEqual([
      { type: "ref", promptId: "x" },
      { type: "text", value: "tail" },
    ]);
  });

  it("returns a single text segment when there are no references", () => {
    expect(tokenizeDescription("just text")).toEqual([
      { type: "text", value: "just text" },
    ]);
  });
});

describe("hasPromptReferences", () => {
  it("detects presence and is not corrupted by global-regex state", () => {
    expect(hasPromptReferences("x [[a]] y")).toBe(true);
    // Calling twice must not flip due to lastIndex statefulness.
    expect(hasPromptReferences("x [[a]] y")).toBe(true);
    expect(hasPromptReferences("no refs")).toBe(false);
  });
});

describe("getActiveMentionQuery", () => {
  it("returns the query when caret is inside an @token", () => {
    const text = "pair with @cod";
    expect(getActiveMentionQuery(text, text.length)).toBe("cod");
  });

  it("returns empty string right after a bare @", () => {
    const text = "pair with @";
    expect(getActiveMentionQuery(text, text.length)).toBe("");
  });

  it("returns null when whitespace breaks the token", () => {
    const text = "pair with @cod review";
    expect(getActiveMentionQuery(text, text.length)).toBeNull();
  });

  it("returns null with no @ before caret", () => {
    expect(getActiveMentionQuery("plain", 5)).toBeNull();
  });
});

describe("insertPromptReference", () => {
  it("replaces the trailing @query with a marker and spaces it", () => {
    const text = "pair with @cod";
    const result = insertPromptReference(text, text.length, "abc");
    expect(result.text).toBe("pair with [[abc]] ");
    expect(result.caret).toBe(result.text.length);
  });

  it("inserts at the start without a leading space", () => {
    const result = insertPromptReference("@c", 2, "abc");
    expect(result.text).toBe("[[abc]] ");
  });

  it("keeps text after the caret intact", () => {
    const text = "a @c tail";
    const result = insertPromptReference(text, 4, "abc");
    expect(result.text).toBe("a [[abc]]  tail");
  });
});
