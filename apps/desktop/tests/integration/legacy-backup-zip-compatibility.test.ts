import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRendererPersistenceStore,
  parsePortableLogicalEnvelope,
} from "@prompthub/core";
import { initDatabase, closeDatabase } from "@prompthub/db";
import {
  previewPortableSnapshotArchive,
  restorePortableSnapshotArchive,
} from "../../src/main/services/portable-snapshot-restore";
import { parsePromptHubBackupFile } from "../../src/renderer/services/database-backup-format";
import { createAtomicLogicalImportEnvelope } from "../../src/renderer/services/database-backup-portable";

const exportedAt = "2026-06-01T00:00:00.000Z";
// v0.5.8's data:exportZip writes this envelope without a portable manifest.
const legacyText = JSON.stringify({
  kind: "prompthub-export",
  exportedAt,
  scope: {
    prompts: true,
    folders: true,
    versions: true,
    images: false,
    videos: false,
    aiConfig: false,
    settings: false,
    rules: false,
    skills: false,
  },
  payload: { version: 1, exportedAt, prompts: [], folders: [], versions: [] },
});

describe("v0.5.8 backup compatibility", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0))
      fs.rmSync(root, { recursive: true, force: true });
  });

  function fixture(): {
    archivePath: string;
    activeRoot: string;
    cacheRoot: string;
  } {
    const activeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-legacy-zip-"),
    );
    roots.push(activeRoot);
    fs.mkdirSync(path.join(activeRoot, "data"));
    const database = initDatabase(
      path.join(activeRoot, "data", "prompthub.db"),
    );
    try {
      createRendererPersistenceStore({
        database,
        rootPath: activeRoot,
        encryption: {
          isEncryptionAvailable: () => false,
          encryptString: () => Buffer.from(""),
          decryptString: () => "",
        },
      });
    } finally {
      closeDatabase();
    }
    const archivePath = path.join(activeRoot, "legacy.zip");
    fs.writeFileSync(
      archivePath,
      zipSync({
        "import-with-prompthub.json": [Buffer.from(legacyText), { level: 1 }],
      }),
    );
    return {
      activeRoot,
      archivePath,
      cacheRoot: path.join(activeRoot, "cache"),
    };
  }

  it("previews the ZIP layout emitted by v0.5.8", () => {
    const options = fixture();
    const entries = unzipSync(fs.readFileSync(options.archivePath));
    expect(entries["portable-manifest.json"]).toBeUndefined();
    expect(
      parsePromptHubBackupFile(
        Buffer.from(entries["import-with-prompthub.json"]).toString(),
      ).backup.prompts,
    ).toEqual([]);
    expect(
      parsePromptHubBackupFile(previewPortableSnapshotArchive(options).text)
        .backup.prompts,
    ).toEqual([]);
  });

  it("restores the ZIP layout emitted by v0.5.8", async () => {
    const result = await restorePortableSnapshotArchive({
      ...fixture(),
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from(""),
        decryptString: () => "",
      },
    });
    expect(result, result.error).toMatchObject({
      success: true,
      needsRestart: true,
    });
  });

  it("normalizes legacy gzip logical data through the separate JSON import boundary", () => {
    const legacyBackup = JSON.stringify({
      kind: "prompthub-backup",
      exportedAt,
      payload: {
        version: 1,
        exportedAt,
        prompts: [],
        folders: [],
        versions: [],
      },
    });
    const text = Buffer.from(
      gunzipSync(gzipSync(Buffer.from(legacyBackup))),
    ).toString();
    const { backup } = parsePromptHubBackupFile(text);
    const envelope = parsePortableLogicalEnvelope(
      createAtomicLogicalImportEnvelope(text, backup),
    );
    expect(envelope.scope).toMatchObject({
      prompts: true,
      mcp: false,
      plugins: false,
      agents: false,
    });
    expect(envelope.payload.prompts).toEqual([]);
  });

  it.each([
    {
      name: "malformed modern manifest",
      files: { "portable-manifest.json": Buffer.from("{broken") },
      error: /JSON|property|token/i,
    },
    {
      name: "modern tree with a deleted manifest",
      files: { "data/prompts/modern.json": Buffer.from("{}") },
      error: /Unrecognized legacy/i,
    },
    {
      name: "traversal",
      files: { "../escaped": Buffer.from("escape") },
      error: /unsafe path/i,
    },
  ])(
    "rejects $name without falling back or changing active data",
    async ({ files, error }) => {
      const options = fixture();
      const databasePath = path.join(
        options.activeRoot,
        "data",
        "prompthub.db",
      );
      const original = fs.readFileSync(databasePath);
      fs.writeFileSync(
        options.archivePath,
        zipSync({
          "import-with-prompthub.json": Buffer.from(legacyText),
          ...files,
        }),
      );
      expect(() => previewPortableSnapshotArchive(options)).toThrow(error);
      const result = await restorePortableSnapshotArchive({
        ...options,
        encryption: {
          isEncryptionAvailable: () => false,
          encryptString: () => Buffer.from(""),
          decryptString: () => "",
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(error);
      expect(fs.readFileSync(databasePath)).toEqual(original);
      expect(fs.existsSync(path.join(options.activeRoot, "escaped"))).toBe(
        false,
      );
      expect(
        fs.readdirSync(path.join(options.cacheRoot, "portable-imports")),
      ).toEqual([]);
    },
  );

  it("rejects an unknown newer logical version instead of silently downgrading it", () => {
    const options = fixture();
    fs.writeFileSync(
      options.archivePath,
      zipSync({
        "import-with-prompthub.json": Buffer.from(
          legacyText.replace('"version":1', '"version":99'),
        ),
      }),
    );
    expect(() => previewPortableSnapshotArchive(options)).toThrow(
      /Unsupported legacy/i,
    );
  });
});
