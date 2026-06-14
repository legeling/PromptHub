import { describe, expect, it } from "vitest";

import {
  DB_BACKUP_VERSION,
  parsePromptHubBackupFile,
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
          prompts: [
            {
              id: "prompt-1",
              title: "Imported",
              userPrompt: "User",
              variables: [],
              tags: [],
              isFavorite: false,
              isPinned: false,
              version: 1,
              currentVersion: 1,
              usageCount: 0,
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
          ],
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

  it("parses prompt relations in strict mode", () => {
    const backup = parsePromptHubBackupFileContent(
      JSON.stringify({
        exportedAt: "2026-04-07T00:00:00.000Z",
        kind: "prompthub-backup",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [
            {
              id: "prompt-1",
              title: "Source",
              userPrompt: "Source body",
              variables: [],
              tags: [],
              isFavorite: false,
              isPinned: false,
              version: 1,
              currentVersion: 1,
              usageCount: 0,
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
            {
              id: "prompt-2",
              title: "Target",
              userPrompt: "Target body",
              variables: [],
              tags: [],
              isFavorite: false,
              isPinned: false,
              version: 1,
              currentVersion: 1,
              usageCount: 0,
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
          ],
          folders: [],
          versions: [],
          promptRelations: [
            {
              id: "relation-1",
              sourcePromptId: "prompt-1",
              targetPromptId: "prompt-2",
              kind: "related_to",
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    expect(backup.promptRelations).toEqual([
      expect.objectContaining({
        id: "relation-1",
        kind: "related_to",
      }),
    ]);
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

  it("rejects arbitrary JSON that is not a PromptHub backup/export file", () => {
    expect(() =>
      parsePromptHubBackupFileContent(
        JSON.stringify({ hello: "world", random: [1, 2, 3] }),
      ),
    ).toThrow(
      "Invalid PromptHub backup: unsupported file format. Please import a PromptHub backup/export file.",
    );
  });

  it("rejects malformed prompt payloads in strict mode instead of normalizing them to an empty restore", () => {
    expect(() =>
      parsePromptHubBackupFileContent(
        JSON.stringify({
          exportedAt: "2026-04-07T00:00:00.000Z",
          prompts: [{ id: "prompt-1" }],
          folders: [],
          versions: [],
        }),
      ),
    ).toThrow("Invalid PromptHub backup: prompts payload is malformed.");
  });

  it("lenient parser drops corrupted prompt records and keeps the rest, reporting skipped counts", () => {
    const goodPrompt = {
      id: "prompt-good",
      title: "Good",
      userPrompt: "Body",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
    };
    const badPrompt = { id: "prompt-bad" }; // missing required fields

    const { backup, skipped } = parsePromptHubBackupFile(
      JSON.stringify({
        kind: "prompthub-backup",
        exportedAt: "2026-04-07T00:00:00.000Z",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [goodPrompt, badPrompt],
          folders: [],
          versions: [],
        },
      }),
    );

    expect(backup.prompts).toHaveLength(1);
    expect(backup.prompts[0]?.id).toBe("prompt-good");
    expect(skipped.prompts).toBe(1);
    expect(skipped.folders).toBe(0);
    expect(skipped.versions).toBe(0);
  });

  it("lenient parser drops prompt versions that reference dropped prompts (referential integrity)", () => {
    const goodPrompt = {
      id: "prompt-keep",
      title: "Keep",
      userPrompt: "Body",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
    };
    const badPrompt = { id: "prompt-drop" }; // will be filtered
    const orphanVersion = {
      id: "version-orphan",
      promptId: "prompt-drop",
      version: 1,
      userPrompt: "Old body",
      createdAt: "2026-04-07T00:00:00.000Z",
    };
    const keptVersion = {
      id: "version-keep",
      promptId: "prompt-keep",
      version: 1,
      userPrompt: "Old body",
      createdAt: "2026-04-07T00:00:00.000Z",
    };

    const { backup, skipped } = parsePromptHubBackupFile(
      JSON.stringify({
        kind: "prompthub-backup",
        exportedAt: "2026-04-07T00:00:00.000Z",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [goodPrompt, badPrompt],
          folders: [],
          versions: [keptVersion, orphanVersion],
        },
      }),
    );

    expect(backup.prompts).toHaveLength(1);
    expect(backup.versions).toHaveLength(1);
    expect(backup.versions[0]?.id).toBe("version-keep");
    expect(skipped.prompts).toBe(1);
    expect(skipped.versions).toBe(1); // orphan dropped
  });

  it("lenient parser drops prompt relations that reference dropped prompts", () => {
    const keptPrompt = {
      id: "prompt-keep",
      title: "Keep",
      userPrompt: "Body",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
    };

    const { backup, skipped } = parsePromptHubBackupFile(
      JSON.stringify({
        kind: "prompthub-backup",
        exportedAt: "2026-04-07T00:00:00.000Z",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [keptPrompt, { id: "prompt-drop" }],
          folders: [],
          versions: [],
          promptRelations: [
            {
              id: "relation-keep",
              sourcePromptId: "prompt-keep",
              targetPromptId: "prompt-keep-2",
              kind: "related_to",
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
            {
              id: "relation-drop",
              sourcePromptId: "prompt-keep",
              targetPromptId: "prompt-drop",
              kind: "related_to",
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    expect(backup.promptRelations).toEqual([]);
    expect(skipped.prompts).toBe(1);
    expect(skipped.promptRelations).toBe(2);
  });

  it("lenient parser returns all-zero skipped counts when the payload is fully valid", () => {
    const { backup, skipped } = parsePromptHubBackupFile(
      JSON.stringify({
        kind: "prompthub-backup",
        exportedAt: "2026-04-07T00:00:00.000Z",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [],
          folders: [],
          versions: [],
        },
      }),
    );

    expect(backup.prompts).toEqual([]);
    expect(skipped.prompts).toBe(0);
    expect(skipped.folders).toBe(0);
    expect(skipped.versions).toBe(0);
    expect(skipped.skills).toBe(0);
    expect(skipped.skillVersions).toBe(0);
    expect(skipped.skillFiles).toBe(0);
  });

  it("lenient parser clears invalid folder parent references instead of keeping broken links", () => {
    const { backup, skipped } = parsePromptHubBackupFile(
      JSON.stringify({
        kind: "prompthub-backup",
        exportedAt: "2026-04-07T00:00:00.000Z",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [],
          folders: [
            {
              id: "child-folder",
              name: "Child",
              parentId: "missing-parent",
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
          ],
          versions: [],
        },
      }),
    );

    expect(backup.folders[0]?.parentId).toBeNull();
    expect(skipped.folders).toBe(1);
  });

  it("lenient parser clears prompt folder references that point to missing folders", () => {
    const { backup, skipped } = parsePromptHubBackupFile(
      JSON.stringify({
        kind: "prompthub-backup",
        exportedAt: "2026-04-07T00:00:00.000Z",
        payload: {
          exportedAt: "2026-04-07T00:00:00.000Z",
          version: 1,
          prompts: [
            {
              id: "prompt-1",
              title: "Imported",
              userPrompt: "User",
              variables: [],
              tags: [],
              folderId: "missing-folder",
              isFavorite: false,
              isPinned: false,
              version: 1,
              currentVersion: 1,
              usageCount: 0,
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z",
            },
          ],
          folders: [],
          versions: [],
        },
      }),
    );

    expect(backup.prompts[0]?.folderId).toBeNull();
    expect(skipped.prompts).toBe(1);
  });
});
