import { describe, expect, it } from "vitest";
import {
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";
import {
  decodeSkillFileSnapshot,
  encodeSkillFileSnapshot,
  validateSkillFileSnapshots,
  hasEncodedSkillSnapshots,
  serializeSkillSnapshotTransport,
  parseSkillSnapshotTransport,
  withSkillSnapshotEntrypoint,
  assertSkillSnapshotCapability,
  validateEncodedSkillSnapshots,
  skillSnapshotEnvelopeKind,
} from "@prompthub/shared/utils/skill-file-snapshot";

describe("lossless Skill file snapshot contract", () => {
  it.each(["", "中文 🏳️‍🌈\r\n", "\ufeff# BOM", "x".repeat(1_048_577)])(
    "keeps legacy UTF-8 text representation and exact bytes (%#)",
    (text) => {
      const bytes = new TextEncoder().encode(text);
      const snapshot = encodeSkillFileSnapshot("docs/说明.txt", bytes);
      expect(snapshot).toEqual({
        relativePath: "docs/说明.txt",
        content: text,
      });
      expect(decodeSkillFileSnapshot(snapshot)).toEqual(bytes);
    },
  );

  it.each([[0, 1, 255, 128], [0], [0xc0, 0xaf], [0xed, 0xa0, 0x80]])(
    "round-trips binary without placeholder or replacement bytes (%#)",
    (...values) => {
      const bytes = new Uint8Array(values);
      const snapshot = encodeSkillFileSnapshot("assets/archive.zip", bytes);
      expect(snapshot.encoding).toBe("base64");
      expect(
        decodeSkillFileSnapshot(JSON.parse(JSON.stringify(snapshot))),
      ).toEqual(bytes);
      expect(
        hasEncodedSkillSnapshots({
          skillVersions: [{ filesSnapshot: [snapshot] }],
        }),
      ).toBe(true);
      expect(
        hasEncodedSkillSnapshots({ skillFiles: { skill: [snapshot] } }),
      ).toBe(true);
    },
  );

  it.each(["../x", "/tmp/x", "C:/x", "a\\b", "a//b", "a/../b", "a\0b", ""])(
    "rejects unsafe snapshot path %j",
    (relativePath) => {
      expect(() =>
        validateSkillFileSnapshots([{ relativePath, content: "x" }]),
      ).toThrow();
    },
  );

  it.each([
    { content: "x", encoding: "future" },
    { content: "!!!", encoding: "base64" },
    { content: "AB==", encoding: "base64" },
    { content: "YQ", encoding: "base64" },
    { content: "YQ==\n", encoding: "base64" },
    { content: 3 },
  ])(
    "rejects unsupported or malformed content before restoration (%#)",
    (value) => {
      expect(() =>
        decodeSkillFileSnapshot({ relativePath: "x", ...value } as never),
      ).toThrow();
    },
  );

  it("rejects duplicate identities and preserves literal historical placeholders", () => {
    expect(() =>
      validateSkillFileSnapshots([
        { relativePath: "x", content: "a" },
        { relativePath: "x", content: "b" },
      ]),
    ).toThrow(/duplicate/i);
    expect(
      new TextDecoder().decode(
        decodeSkillFileSnapshot({
          relativePath: "notes.txt",
          content: "[binary file]",
        }),
      ),
    ).toBe("[binary file]");
    expect(hasEncodedSkillSnapshots({})).toBe(false);
    expect(
      hasEncodedSkillSnapshots({ skillFiles: { s: [{ content: "text" }] } }),
    ).toBe(false);
  });

  it("keeps legacy raw JSON and makes encoded transport fail closed in old JSON readers", () => {
    const legacy = {
      skillFiles: { s: [{ relativePath: "SKILL.md", content: "text" }] },
    };
    expect(serializeSkillSnapshotTransport(legacy)).toBe(
      JSON.stringify(legacy),
    );
    const binary = {
      skillFiles: {
        s: [encodeSkillFileSnapshot("icon.png", new Uint8Array([0, 255]))],
      },
    };
    const framed = serializeSkillSnapshotTransport(binary);
    expect(() => JSON.parse(framed)).toThrow();
    expect(parseSkillSnapshotTransport(framed)).toEqual(binary);
    expect(parseSkillSnapshotTransport(JSON.stringify(legacy))).toEqual(legacy);
  });

  it("restores legacy auxiliary snapshots with the saved entrypoint and rejects binary entrypoints", () => {
    const files = [{ relativePath: "script.py", content: "print(1)" }];
    expect(withSkillSnapshotEntrypoint(files, "# Old version")).toEqual([
      { relativePath: "SKILL.md", content: "# Old version" },
      ...files,
    ]);
    expect(() =>
      withSkillSnapshotEntrypoint(
        [{ relativePath: "SKILL.md", content: "AA==", encoding: "base64" }],
        "",
      ),
    ).toThrow();
    expect(
      withSkillSnapshotEntrypoint(
        [{ relativePath: "SKILL.md", content: "Iw==", encoding: "base64" }],
        "ignored",
      ),
    ).toHaveLength(1);
  });

  it("gates only encoded snapshot carriers and validates before lenient parsing", () => {
    const binary = {
      skillFiles: {
        s: [{ relativePath: "x", content: "AA==", encoding: "base64" }],
      },
    };
    expect(() => assertSkillSnapshotCapability(binary, undefined)).toThrow(
      /requires/,
    );
    expect(() => assertSkillSnapshotCapability(binary, "2")).not.toThrow();
    expect(() => assertSkillSnapshotCapability({}, undefined)).not.toThrow();
    expect(skillSnapshotEnvelopeKind("prompthub-backup", binary)).toBe(
      "prompthub-backup-v2",
    );
    expect(skillSnapshotEnvelopeKind("prompthub-export", {})).toBe(
      "prompthub-export",
    );
    expect(() =>
      validateEncodedSkillSnapshots({
        skillVersions: [
          {
            filesSnapshot: [
              { relativePath: "x", content: "x", encoding: "bad" },
            ],
          },
        ],
      }),
    ).toThrow();
    for (const value of [
      null,
      "text",
      {},
      { skillFiles: { s: null }, skillVersions: [null] },
    ])
      expect(() => validateEncodedSkillSnapshots(value)).not.toThrow();
    expect(hasEncodedSkillSnapshots(null)).toBe(false);
    expect(hasEncodedSkillSnapshots("text")).toBe(false);
  });

  it("enforces the existing per-file and aggregate capacity without preview limits", () => {
    const plain = "x".repeat(MAX_SKILL_PACKAGE_FILE_BYTES);
    expect(() =>
      validateSkillFileSnapshots([{ relativePath: "x", content: plain + "x" }]),
    ).toThrow(/file limit/);
    expect(() =>
      validateSkillFileSnapshots([
        {
          relativePath: "x",
          content: "中".repeat(Math.ceil(MAX_SKILL_PACKAGE_FILE_BYTES / 3)),
        },
      ]),
    ).toThrow(/file limit/);
    expect(() =>
      validateSkillFileSnapshots([
        {
          relativePath: "x",
          content: "A".repeat(
            Math.ceil(MAX_SKILL_PACKAGE_FILE_BYTES / 3) * 4 + 4,
          ),
          encoding: "base64",
        },
      ]),
    ).toThrow(/file limit/);
    expect(() =>
      encodeSkillFileSnapshot(
        "x",
        new Uint8Array(MAX_SKILL_PACKAGE_FILE_BYTES + 1),
      ),
    ).toThrow(/file limit/);
    expect(() =>
      validateSkillFileSnapshots(
        Array.from({ length: MAX_SKILL_PACKAGE_FILES + 1 }, (_, i) => ({
          relativePath: `${i}`,
          content: "",
        })),
      ),
    ).toThrow(/count/);
    expect(() => validateSkillFileSnapshots(null as never)).toThrow(/count/);
    expect(() =>
      validateSkillFileSnapshots(
        Array.from(
          {
            length:
              Math.floor(
                MAX_SKILL_PACKAGE_TOTAL_BYTES / MAX_SKILL_PACKAGE_FILE_BYTES,
              ) + 1,
          },
          (_, i) => ({ relativePath: `${i}`, content: plain }),
        ),
      ),
    ).toThrow(/total byte/);
  });

  it("rejects an encoded package with conflicting entries before restoration", () => {
    const file = { relativePath: "x", content: "AA==", encoding: "base64" };
    expect(() =>
      validateEncodedSkillSnapshots({ skillFiles: { s: [file, file] } }),
    ).toThrow(/duplicate/);
    expect(() =>
      validateEncodedSkillSnapshots({
        skillFiles: { s: [{ ...file, relativePath: "SKILL.md" }] },
      }),
    ).toThrow(/entrypoint/);
  });
});
