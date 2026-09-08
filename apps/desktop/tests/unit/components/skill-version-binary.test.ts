import { describe, expect, it } from "vitest";
import {
  buildVersionFileDiffEntries,
  normalizeVersionSnapshot,
} from "../../../src/renderer/components/skill/version-utils";

describe("Skill binary version comparison", () => {
  it("retains binary encoding and compares bytes without rendering base64 text", () => {
    const oldFiles = normalizeVersionSnapshot([
      { relativePath: "icon.png", content: "AAH/", encoding: "base64" },
    ]);
    const nextFiles = [
      {
        relativePath: "icon.png",
        content: "AAI=",
        encoding: "base64" as const,
      },
    ];
    expect(oldFiles[0].encoding).toBe("base64");
    expect(buildVersionFileDiffEntries(oldFiles, nextFiles)[0]).toMatchObject({
      binary: true,
      oldContent: "",
      newContent: "",
      oldBytes: 3,
      newBytes: 2,
      unchanged: false,
    });
    expect(buildVersionFileDiffEntries(oldFiles, oldFiles)[0].unchanged).toBe(
      true,
    );
  });
  it("does not confuse an added empty file with an unchanged file", () => {
    expect(
      buildVersionFileDiffEntries(
        [],
        [{ relativePath: "empty.txt", content: "" }],
      )[0].unchanged,
    ).toBe(false);
  });
  it("compares equivalent encodings and binary additions/deletions accurately", () => {
    const text = { relativePath: "a", content: "a" };
    const encoded = {
      relativePath: "a",
      content: "YQ==",
      encoding: "base64" as const,
    };
    expect(
      buildVersionFileDiffEntries([text], [{ ...text, encoding: "utf8" }])[0]
        .unchanged,
    ).toBe(true);
    expect(buildVersionFileDiffEntries([text], [encoded])[0].unchanged).toBe(
      true,
    );
    expect(buildVersionFileDiffEntries([], [encoded])[0]).toMatchObject({
      binary: true,
      oldBytes: 0,
      newBytes: 1,
      unchanged: false,
    });
    expect(buildVersionFileDiffEntries([encoded], [])[0]).toMatchObject({
      binary: true,
      oldBytes: 1,
      newBytes: 0,
      unchanged: false,
    });
    expect(
      buildVersionFileDiffEntries(
        [encoded],
        [{ ...encoded, content: "Yg==" }],
      )[0].unchanged,
    ).toBe(false);
  });
});
