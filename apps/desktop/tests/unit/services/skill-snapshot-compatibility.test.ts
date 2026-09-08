import { describe, expect, it } from "vitest";
import { parsePromptHubBackupFile } from "../../../src/renderer/services/database-backup-format";
import {
  assertSkillSnapshotCapability,
  encodeSkillFileSnapshot,
  skillSnapshotEnvelopeKind,
} from "@prompthub/shared/utils/skill-file-snapshot";

describe("Skill snapshot backup compatibility", () => {
  const file = encodeSkillFileSnapshot(
    "assets/icon.png",
    new Uint8Array([0, 255]),
  );
  const backup = {
    version: 1,
    exportedAt: "2026-09-08T00:00:00.000Z",
    prompts: [],
    folders: [],
    versions: [],
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
    skillFiles: { s: [file] },
  };
  it("uses a distinguishable file envelope and keeps binary content", () => {
    const kind = skillSnapshotEnvelopeKind("prompthub-backup", backup);
    expect(kind).toBe("prompthub-backup-v2");
    expect(
      parsePromptHubBackupFile(JSON.stringify({ kind, payload: backup })).backup
        .skillFiles?.s,
    ).toEqual([file]);
    expect(skillSnapshotEnvelopeKind("prompthub-export", {})).toBe(
      "prompthub-export",
    );
  });
  it("fails closed on encoded corruption even in lenient file imports", () => {
    const payload = {
      ...backup,
      skillFiles: { s: [{ ...file, encoding: "future" }] },
    };
    expect(() =>
      parsePromptHubBackupFile(
        JSON.stringify({ kind: "prompthub-backup-v2", payload }),
      ),
    ).toThrow(/encoding/i);
  });
  it("requires capability only when encoded snapshots are present", () => {
    expect(() => assertSkillSnapshotCapability(backup, undefined)).toThrow(
      /lossless/,
    );
    assertSkillSnapshotCapability(backup, "2");
    assertSkillSnapshotCapability(
      { skillFiles: { s: [{ relativePath: "x", content: "text" }] } },
      undefined,
    );
  });
});
