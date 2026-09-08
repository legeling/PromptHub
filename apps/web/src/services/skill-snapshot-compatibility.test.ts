import { describe, expect, it } from "vitest";
import { parseSyncSnapshot } from "./sync-snapshot";
import {
  encodeSkillFileSnapshot,
  decodeSkillFileSnapshot,
  SKILL_SNAPSHOT_SYNC_VERSION,
} from "@prompthub/shared/utils/skill-file-snapshot";

describe("Web lossless Skill snapshot compatibility", () => {
  const payload = (files: unknown[]) => ({
    version: SKILL_SNAPSHOT_SYNC_VERSION,
    exportedAt: "2026-09-08T00:00:00.000Z",
    prompts: [],
    folders: [],
    skills: [
      {
        id: "s",
        name: "skill",
        protocol_type: "skill",
        is_favorite: false,
        created_at: 1,
        updated_at: 2,
      },
    ],
    skillVersions: [],
    skillFiles: { s: files },
  });
  it("preserves encoding through the actual Web normalizer", () => {
    const bytes = new Uint8Array([0, 255, 128]);
    const file = encodeSkillFileSnapshot("assets/icon.png", bytes);
    const result = parseSyncSnapshot(payload([file]));
    expect(result.skillFiles?.s).toEqual([file]);
    expect(decodeSkillFileSnapshot(result.skillFiles!.s[0])).toEqual(bytes);
  });
  it("continues to accept old plain-text snapshots", () => {
    const legacy = {
      ...payload([{ relativePath: "SKILL.md", content: "# Skill" }]),
      version: "desktop-backup-v1",
    };
    expect(parseSyncSnapshot(legacy).skillFiles?.s[0]).toEqual({
      relativePath: "SKILL.md",
      content: "# Skill",
    });
  });
  it.each(["future", null, 1])(
    "rejects unknown encoding %j instead of stripping it",
    (encoding) => {
      expect(() =>
        parseSyncSnapshot(
          payload([{ relativePath: "x", content: "AA==", encoding }]),
        ),
      ).toThrow();
    },
  );
});
