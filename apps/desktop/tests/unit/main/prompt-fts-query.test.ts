import { describe, expect, it } from "vitest";
import { buildFtsPhraseQuery } from "../../../src/main/database/prompt";

/**
 * Unit tests for the FTS query builder (v0.6.2 db-prompt-fts-tokenized-search).
 * The builder must emit per-term quoted phrases joined with AND so that
 * multi-word search keeps the special-character escaping guarantees of the
 * legacy whole-keyword phrase while matching non-adjacent terms.
 */
describe("buildFtsPhraseQuery", () => {
  it("joins multiple terms with AND as separate quoted phrases", () => {
    expect(buildFtsPhraseQuery("提示词 管理")).toBe('"提示词" AND "管理"');
    expect(buildFtsPhraseQuery('multi   spaces\there')).toBe(
      '"multi" AND "spaces" AND "here"',
    );
  });

  it("keeps single-word behavior identical to the legacy phrase", () => {
    expect(buildFtsPhraseQuery("alpha")).toBe('"alpha"');
    expect(buildFtsPhraseQuery(" alpha ")).toBe('"alpha"');
  });

  it('doubles embedded quotes per FTS5 escaping', () => {
    expect(buildFtsPhraseQuery('has"quote')).toBe('"has""quote"');
    expect(buildFtsPhraseQuery('a "b c" d')).toBe(
      '"a" AND """b" AND "c""" AND "d"',
    );
  });

  it("returns null for empty or non-term keywords", () => {
    expect(buildFtsPhraseQuery("")).toBeNull();
    expect(buildFtsPhraseQuery("   ")).toBeNull();
    expect(buildFtsPhraseQuery("\t  \n")).toBeNull();
    // terms that contain nothing but quotes carry no searchable tokens
    expect(buildFtsPhraseQuery('" "')).toBeNull();
    expect(buildFtsPhraseQuery('""')).toBeNull();
  });

  it("neutralizes bare FTS operator terms by quoting them", () => {
    expect(buildFtsPhraseQuery("a AND b")).toBe('"a" AND "AND" AND "b"');
    expect(buildFtsPhraseQuery("OR")).toBe('"OR"');
    expect(buildFtsPhraseQuery("NEAR alpha beta")).toBe(
      '"NEAR" AND "alpha" AND "beta"',
    );
  });
});
