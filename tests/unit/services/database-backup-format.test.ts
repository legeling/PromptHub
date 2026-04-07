import { describe, expect, it } from "vitest";

import {
  DB_BACKUP_VERSION,
  parsePromptHubBackupFileContent,
} from "../../../src/renderer/services/database-backup-format";

describe("database-backup-format", () => {
  it("parses a full backup envelope into a normalized backup payload", () => {
    const backup = parsePromptHubBackupFileContent(
      JSON.stringify({
        exportedAt: "2026-04-07T00:00:00.000Z",
        kind: "prompthub-backup",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          folders: [],
          prompts: [],
          version: 1,
          versions: [],
        },
      }),
    );

    expect(backup.prompts).toEqual([]);
    expect(backup.folders).toEqual([]);
    expect(backup.versions).toEqual([]);
    expect(backup.version).toBe(1);
  });

  it("parses a selective export envelope into an importable normalized backup payload", () => {
    const backup = parsePromptHubBackupFileContent(
      JSON.stringify({
        exportedAt: "2026-04-07T00:00:00.000Z",
        kind: "prompthub-export",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          prompts: [{ id: "prompt-1" }],
        },
        scope: {
          aiConfig: false,
          folders: false,
          images: false,
          prompts: true,
          settings: false,
          skills: false,
          versions: false,
        },
      }),
    );

    expect(backup.prompts).toHaveLength(1);
    expect(backup.folders).toEqual([]);
    expect(backup.versions).toEqual([]);
  });

  it("normalizes a legacy raw backup object with missing optional collections", () => {
    const backup = parsePromptHubBackupFileContent(
      JSON.stringify({
        exportedAt: "2026-04-07T00:00:00.000Z",
        prompts: [],
      }),
    );

    expect(backup.version).toBe(DB_BACKUP_VERSION);
    expect(backup.folders).toEqual([]);
    expect(backup.versions).toEqual([]);
  });
});
