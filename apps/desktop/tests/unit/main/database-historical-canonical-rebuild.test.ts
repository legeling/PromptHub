/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { readCanonicalStorageShadow } from "@prompthub/core";
import {
  CURRENT_DATABASE_SCHEMA_VERSION,
  DATABASE_MIGRATION_MANIFEST,
  closeDatabase,
  initDatabase,
} from "@prompthub/db";

import { projectCanonicalStorageShadow } from "../../../src/main/services/canonical-storage-projector";
import Database from "../../../src/main/database/sqlite";
import {
  createHistoricalDatabaseFixture,
  HISTORICAL_DATABASE_FIXTURES,
} from "../../fixtures/historical-databases";

function canonicalTreeContains(rootPath: string, needle: string): boolean {
  const bytes = Buffer.from(needle, "utf8");
  return fs.readdirSync(rootPath, { recursive: true }).some((relativePath) => {
    const filePath = path.join(rootPath, relativePath.toString());
    return (
      fs.statSync(filePath).isFile() &&
      fs.readFileSync(filePath).includes(bytes)
    );
  });
}

describe("historical database canonical rebuild", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    closeDatabase();
    for (const directory of tempDirs.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  for (const descriptor of HISTORICAL_DATABASE_FIXTURES) {
    it(`rebuilds ${descriptor.tag} through canonical resources without losing durable history`, async () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), `prompthub-${descriptor.version}-canonical-`),
      );
      tempDirs.push(root);
      const sourceDatabasePath = createHistoricalDatabaseFixture(
        root,
        descriptor,
      );
      const database = initDatabase(sourceDatabasePath);
      database.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        "historical-fixture-setting",
        descriptor.tag,
      );
      database.run(
        `INSERT INTO users (
          id, username, password_hash, role, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        "historical-user",
        `fixture-${descriptor.version}`,
        `secret-${descriptor.tag}`,
        "user",
        Date.UTC(2026, 0, 1),
        Date.UTC(2026, 0, 1),
      );

      const result = await projectCanonicalStorageShadow({
        database,
        targetPath: path.join(root, "canonical-shadow"),
        readRules: () => [],
        mcpLibrary: {
          kind: "prompthub-mcp-library",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          servers: [],
          bindings: [],
        },
        plugins: [],
        pluginVersions: new Map(),
        generations: [],
        operationalSourceDatabasePath: sourceDatabasePath,
      });
      closeDatabase();

      const canonical = readCanonicalStorageShadow(result.targetPath);
      expect(canonical.promptGraph.snapshot.prompts).toHaveLength(1);
      expect(
        canonical.promptGraph.snapshot.promptVersions.map(
          (version) => version.version,
        ),
      ).toEqual([1, 2, 3, 4]);
      expect(canonical.skills).toHaveLength(1);
      expect(
        canonical.skills[0].versions.map((version) => version.version),
      ).toEqual([1]);
      expect(
        canonicalTreeContains(result.targetPath, `secret-${descriptor.tag}`),
      ).toBe(false);

      const rebuilt = new Database(result.verificationDatabasePath, {
        readOnly: true,
      });
      try {
        expect(rebuilt.pragma("user_version")).toEqual([
          { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
        ]);
        expect(
          rebuilt.all(
            `SELECT version, user_prompt
             FROM prompt_versions
             WHERE prompt_id = ?
             ORDER BY version ASC`,
            "prompt-history",
          ),
        ).toEqual([
          { version: 1, user_prompt: "Version 1" },
          { version: 2, user_prompt: "Version 2" },
          { version: 3, user_prompt: "Version 3" },
          { version: 4, user_prompt: "Version 4" },
        ]);
        expect(
          rebuilt.all(
            `SELECT version, content
             FROM skill_versions
             WHERE skill_id = ?
             ORDER BY version ASC`,
            "skill-history",
          ),
        ).toEqual([{ version: 1, content: "# Historical skill" }]);
        expect(
          rebuilt.get(
            "SELECT value FROM settings WHERE key = ?",
            "historical-fixture-setting",
          ),
        ).toEqual({ value: descriptor.tag });
        expect(
          rebuilt.get(
            "SELECT password_hash FROM users WHERE id = ?",
            "historical-user",
          ),
        ).toEqual({ password_hash: `secret-${descriptor.tag}` });
        expect(
          rebuilt.all(
            `SELECT migration_id, name, checksum
             FROM database_migration_history
             ORDER BY migration_id ASC`,
          ),
        ).toEqual(
          DATABASE_MIGRATION_MANIFEST.map(
            ({ migrationId, name, checksum }) => ({
              migration_id: migrationId,
              name,
              checksum,
            }),
          ),
        );
        expect(rebuilt.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
      } finally {
        rebuilt.close();
      }
    });
  }
});
