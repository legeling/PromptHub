import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SkillDB,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import { hashRegularFile } from "../content-addressed-object-store";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import { migrateSkillSqliteV1 } from "./skill-sqlite-v1";

const RECOVERY_MIGRATION = "skill-directory-recovery-v1";
type MigrationOptions = Parameters<typeof migrateSkillSqliteV1>[1];

function unrecognizedDirectories(
  database: DatabaseAdapter.Database,
  root: string,
): string[] {
  const directory = path.join(root, "data", "skills");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  const known = new Set<string>();
  for (const skill of new SkillDB(database).getAll()) {
    known.add(encodeCanonicalResourceDirectory(skill.id));
    if (!skill.local_repo_path) continue;
    const relative = path.relative(directory, skill.local_repo_path);
    // Match the released converter's ownership check, without rewriting it.
    if (relative && !relative.startsWith(".."))
      known.add(relative.split(path.sep)[0]);
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isSymbolicLink())
        throw new Error("Skill migration package is unsafe");
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        known.has(entry.name)
      )
        return false;
      return ![
        "manifest.json",
        "SKILL.md",
        "files/SKILL.md",
        "repo/SKILL.md",
      ].some((file) => fs.existsSync(path.join(directory, entry.name, file)));
    })
    .map((entry) => path.join(directory, entry.name));
}

/** Include empty/hidden directories and stream file hashes; never follow links. */
function directoryDigest(directory: string): string {
  const digest = crypto.createHash("sha256");
  const pending = [""];
  while (pending.length) {
    const relative = pending.pop()!;
    const file = path.join(directory, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
      throw new Error("Skill recovery directory contains an unsafe entry");
    digest.update(
      JSON.stringify([
        relative,
        stat.isDirectory() ? "directory" : "file",
        stat.mode & 0o777,
      ]),
    );
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort().reverse())
        pending.push(path.join(relative, name));
    } else digest.update(hashRegularFile(file, stat.size).hash);
  }
  return digest.digest("hex");
}

function preserveUnrecognizedDirectories(
  database: DatabaseAdapter.Database,
  options: MigrationOptions,
): void {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, RECOVERY_MIGRATION);
  const sources = unrecognizedDirectories(database, root);
  if (!sources.length) return;
  const hashes = sources.map(directoryDigest);
  const archive = path.join(
    root,
    "recovery",
    RECOVERY_MIGRATION,
    crypto.randomUUID(),
  );
  assertStoragePathComponentsSafe(root, archive);
  createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    ...options,
    rootPath: root,
    operationKey: RECOVERY_MIGRATION,
    entries: [
      {
        targetPath: archive,
        prepare(stage) {
          fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
          for (const [index, source] of sources.entries()) {
            const target = path.join(
              stage,
              "directories",
              path.basename(source),
            );
            fs.cpSync(source, target, {
              recursive: true,
              dereference: false,
              force: false,
              errorOnExist: true,
            });
            if (directoryDigest(target) !== hashes[index])
              throw new Error("Skill recovery copy verification failed");
          }
          fs.writeFileSync(
            path.join(stage, "manifest.json"),
            JSON.stringify(
              {
                migration: RECOVERY_MIGRATION,
                sourceDirectories: sources.map((source) =>
                  path.relative(root, source).split(path.sep).join("/"),
                ),
                directoryDigests: hashes,
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
        },
      },
      ...sources.map((targetPath) => ({ targetPath, delete: true })),
    ],
    beforePublish() {
      if (
        sources.some(
          (source, index) => directoryDigest(source) !== hashes[index],
        )
      )
        throw new Error("Skill recovery source changed before publication");
    },
    commit() {
      database.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        RECOVERY_MIGRATION,
        Date.now(),
      );
    },
  });
  console.warn(
    `[Skill migration] Unregistered directories preserved at ${archive}`,
  );
}

/** Correct unknown-directory handling before the immutable released converter. */
export function migrateSkillSqlite(
  database: DatabaseAdapter.Database,
  options: MigrationOptions,
): void {
  preserveUnrecognizedDirectories(database, options);
  migrateSkillSqliteV1(database, options);
}
