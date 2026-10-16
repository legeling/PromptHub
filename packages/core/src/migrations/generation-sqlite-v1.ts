import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  GenerationDB,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  GenerationBatchManifest,
  GenerationOutputRecord,
} from "@prompthub/shared/types";
import {
  readGenerationManifestFile,
  readGenerationResourceBundle,
} from "../generation-resource-schema";
import {
  hashRegularFile,
  readContentAddressedObject,
} from "../content-addressed-object-store";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import { generationOutputPath } from "../generation-storage";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";

const MIGRATION_NAME = "generation-sqlite-v1";
interface HistoricalBatch {
  source: string;
  manifest: GenerationBatchManifest;
  canonical: boolean;
}

function historicalBatches(root: string): HistoricalBatch[] {
  const directory = path.join(root, "data", "generations");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== "assets")
    .map((entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error("Historical generation directory is unsafe");
      const source = path.join(directory, entry.name),
        canonical = fs.existsSync(path.join(source, "manifest.json"));
      const manifest = canonical
        ? readGenerationResourceBundle(
            source,
            path.join(root, "data", "assets", "objects"),
          ).manifest
        : readGenerationManifestFile(path.join(source, "batch.json"));
      if (entry.name !== encodeCanonicalResourceDirectory(manifest.id))
        throw new Error("Historical generation identity mismatch");
      return { source, manifest, canonical };
    });
}

function checkLegacyIndex(
  database: DatabaseAdapter.Database,
  manifest: GenerationBatchManifest,
): void {
  const expected = {
    id: manifest.id,
    status: manifest.status,
    title: manifest.title,
    source_prompt_id: manifest.sourcePromptId ?? null,
    provider: manifest.model.provider,
    model: manifest.model.model,
    requested_count: manifest.targetCount,
    succeeded_count: manifest.counts.succeeded,
    failed_count: manifest.counts.failed,
    cancelled_count: manifest.counts.cancelled,
    interrupted_count: manifest.counts.interrupted,
    created_at: manifest.createdAt,
    updated_at: manifest.updatedAt,
    completed_at: manifest.completedAt ?? null,
  };
  const row = database.get(
    "SELECT * FROM generation_batches WHERE id = ?",
    manifest.id,
  ) as Record<string, unknown> | undefined; // Compare every owned historical column below.
  if (!row) return;
  for (const [key, value] of Object.entries(expected))
    if (!isDeepStrictEqual(row[key], value))
      throw new Error(
        `Generation migration index conflict: ${manifest.id} ${key}`,
      );
  checkLegacySlots(database, manifest);
}

function checkLegacySlots(
  database: DatabaseAdapter.Database,
  manifest: GenerationBatchManifest,
): void {
  const rows = database.all(
    "SELECT * FROM generation_outputs WHERE batch_id = ? ORDER BY slot_index",
    manifest.id,
  ) as Record<string, unknown>[]; // Current table rows are compared with the historical manifest.
  if (rows.length !== manifest.slots.length)
    throw new Error(`Generation migration slot conflict: ${manifest.id}`);
  for (const slot of manifest.slots) {
    const expectedSlot = {
      id: slot.output?.id ?? `${manifest.id}:${slot.index}`,
      batch_id: manifest.id,
      slot_index: slot.index,
      status: slot.status,
      file_name: slot.output?.fileName ?? null,
      mime_type: slot.output?.mimeType ?? null,
      byte_size: slot.output?.byteSize ?? null,
      sha256: slot.output?.sha256 ?? null,
      favorite: slot.output?.favorite ? 1 : 0,
      created_at: slot.output?.createdAt ?? null,
      deleted_at: null,
    };
    for (const [key, value] of Object.entries(expectedSlot))
      if (!isDeepStrictEqual(rows[slot.index][key], value))
        throw new Error(
          `Generation migration slot conflict: ${manifest.id} ${slot.index} ${key}`,
        );
  }
}

function planBatches(
  database: DatabaseAdapter.Database,
  historical: HistoricalBatch[],
  completed: boolean,
): void {
  const repository = new GenerationDB(database);
  for (const { manifest } of historical) {
    // The existing FK intentionally clears this link when its Prompt is removed.
    if (
      manifest.sourcePromptId &&
      !database.get(
        "SELECT id FROM prompts WHERE id = ?",
        manifest.sourcePromptId,
      )
    )
      delete manifest.sourcePromptId;
    const row = database.get(
      "SELECT request_json FROM generation_batches WHERE id = ?",
      manifest.id,
    ) as { request_json: string | null } | undefined; // This query selects the owned nullable request column.
    if (completed && !row)
      throw new Error(
        `Generation migration retired batch is absent from SQLite: ${manifest.id}`,
      );
    if (row?.request_json !== undefined && row.request_json !== null) {
      if (!isDeepStrictEqual(repository.get(manifest.id), manifest))
        throw new Error(
          `Generation migration metadata conflict: ${manifest.id}`,
        );
    } else checkLegacyIndex(database, manifest);
  }
  const ids = new Set(historical.map((entry) => entry.manifest.id));
  // The SQL primary key is non-null text.
  for (const row of database.all(
    "SELECT id FROM generation_batches WHERE request_json IS NULL",
  ) as { id: string }[])
    if (!ids.has(row.id))
      throw new Error(
        `Generation metadata migration source is missing: ${row.id}`,
      );
}

function verifyImage(file: string, output: GenerationOutputRecord): void {
  const actual = hashRegularFile(file, output.byteSize);
  if (actual.hash !== output.sha256 || actual.size !== output.byteSize)
    throw new Error("Generation image integrity mismatch");
}

function imageSources(
  root: string,
  entry: HistoricalBatch,
  output: GenerationOutputRecord,
): string[] {
  const name = encodeCanonicalResourceDirectory(entry.manifest.id);
  const candidates = [
    generationOutputPath(root, entry.manifest.id, output.fileName),
    path.join(
      root,
      "data",
      "assets",
      "images",
      "generated",
      name,
      output.fileName,
    ),
    path.join(root, "cache", "generated-images", name, output.fileName),
  ];
  if (entry.canonical)
    candidates.push(
      readContentAddressedObject(
        path.join(root, "data", "assets", "objects"),
        output.sha256,
        { maxBytes: output.byteSize },
      ).path,
    );
  const sources = candidates.filter((file) => {
    assertStoragePathComponentsSafe(root, file);
    return fs.existsSync(file);
  });
  if (!sources.length)
    throw new Error(
      `Generation migration image is missing: ${entry.manifest.id} ${output.fileName}`,
    );
  for (const file of sources) verifyImage(file, output);
  return sources;
}

function treeHash(directory: string): string {
  const hash = crypto.createHash("sha256");
  function visit(current: string, relative: string): void {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name),
        name = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Generation recovery source contains a symlink");
      if (entry.isDirectory()) {
        hash.update(`directory:${name}\n`);
        visit(file, name);
      } else if (entry.isFile())
        hash.update(
          JSON.stringify([
            name,
            hashRegularFile(file, fs.statSync(file).size).hash,
          ]),
        );
      else
        throw new Error("Generation recovery source contains a special file");
    }
  }
  visit(directory, "");
  return hash.digest("hex");
}

function retireDirectory(
  root: string,
  source: string,
): CanonicalEntryMutation[] {
  assertStoragePathComponentsSafe(root, source);
  const digest = treeHash(source);
  const backup = path.join(
    root,
    "recovery",
    MIGRATION_NAME,
    digest,
    path.relative(root, source),
  );
  assertStoragePathComponentsSafe(root, backup);
  const verify = (directory: string) => {
    if (treeHash(directory) !== digest)
      throw new Error("Generation recovery copy differs from its source");
  };
  const entries: CanonicalEntryMutation[] = [];
  if (fs.existsSync(backup)) verify(backup);
  else
    entries.push({
      targetPath: backup,
      prepare(stage) {
        fs.cpSync(source, stage, {
          recursive: true,
          dereference: false,
          errorOnExist: true,
          force: false,
        });
        verify(stage);
      },
    });
  entries.push({ targetPath: source, delete: true });
  return entries;
}

function migrationEntries(
  root: string,
  historical: HistoricalBatch[],
): CanonicalEntryMutation[] {
  const entries: CanonicalEntryMutation[] = [];
  for (const entry of historical) {
    for (const slot of entry.manifest.slots) {
      if (!slot.output) continue;
      const output = slot.output,
        sources = imageSources(root, entry, output);
      const targetPath = generationOutputPath(
        root,
        entry.manifest.id,
        output.fileName,
      );
      if (!fs.existsSync(targetPath))
        entries.push({
          targetPath,
          prepare(stage) {
            fs.copyFileSync(sources[0], stage, fs.constants.COPYFILE_EXCL);
            verifyImage(stage, output);
          },
        });
    }
    entries.push(...retireDirectory(root, entry.source));
    for (const parent of [
      path.join(root, "data", "assets", "images", "generated"),
      path.join(root, "cache", "generated-images"),
    ]) {
      const directory = path.join(
        parent,
        encodeCanonicalResourceDirectory(entry.manifest.id),
      );
      assertStoragePathComponentsSafe(root, directory);
      if (fs.existsSync(directory))
        entries.push(...retireDirectory(root, directory));
    }
  }
  return entries;
}

/** Bootstrap-only conversion. Regular reads never import historical filesystem state. */
export function migrateGenerationSqliteV1(
  database: DatabaseAdapter.Database,
  options: {
    rootPath: string;
    databasePath: string;
    injectFailure?: (targetPath: string) => void;
  },
): void {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, "generation-storage");
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const historical = historicalBatches(root);
  const completed = Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    ),
  );
  planBatches(database, historical, completed);
  if (completed && historical.length === 0) return;
  const entries = migrationEntries(root, historical);
  if (historical.length)
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    injectFailure: options.injectFailure,
    commit() {
      const repository = new GenerationDB(database);
      for (const entry of historical) repository.upsert(entry.manifest);
      database.run(
        "DELETE FROM canonical_resources WHERE resource_type = ?",
        "generation",
      );
      database.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        Date.now(),
      );
    },
  });
}
