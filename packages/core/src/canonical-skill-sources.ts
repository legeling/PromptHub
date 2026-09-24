import fs from "node:fs";
import path from "node:path";
import { DatabaseAdapter } from "@prompthub/db";
import type { Skill } from "@prompthub/shared/types";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import {
  publishCanonicalEntries,
  type CanonicalEntryMutation,
} from "./canonical-entry-publication";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { deriveLocalResourceDeviceId } from "./storage-root-identity";

function sourcePath(root: string, skillId: string): string {
  return path.join(
    root,
    "config",
    "devices",
    "skill-sources",
    `${encodeCanonicalResourceDirectory(skillId)}.json`,
  );
}

function isLocalSource(value: unknown): value is string {
  return (
    typeof value === "string" &&
    path.isAbsolute(value) &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    Buffer.byteLength(value, "utf8") <= 4096
  );
}

export function readCanonicalSkillSource(
  root: string,
  skillId: string,
): string | undefined {
  const target = sourcePath(root, skillId);
  assertStoragePathComponentsSafe(root, target);
  if (!fs.existsSync(target)) return undefined;
  const stats = fs.lstatSync(target);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 16 * 1024)
    throw new Error("Canonical Skill source binding is unsafe");
  const value: unknown = JSON.parse(fs.readFileSync(target, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("kind" in value) ||
    value.kind !== "prompthub-skill-source-binding" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("skillId" in value) ||
    value.skillId !== skillId ||
    !("deviceId" in value) ||
    typeof value.deviceId !== "string" ||
    !("sourceUrl" in value) ||
    !isLocalSource(value.sourceUrl)
  )
    throw new Error("Canonical Skill source binding is invalid");
  return value.deviceId === deriveLocalResourceDeviceId(root)
    ? value.sourceUrl
    : undefined;
}

/** The device binding and portable bundle are entries of the same publication. */
export function canonicalSkillSourceMutations(
  root: string,
  skill: Pick<Skill, "id" | "source_url">,
): CanonicalEntryMutation[] {
  const targetPath = sourcePath(root, skill.id);
  assertStoragePathComponentsSafe(root, targetPath);
  if (!isLocalSource(skill.source_url))
    return fs.existsSync(targetPath) ? [{ targetPath, delete: true }] : [];
  const document = {
    kind: "prompthub-skill-source-binding",
    version: 1,
    deviceId: deriveLocalResourceDeviceId(root),
    skillId: skill.id,
    sourceUrl: skill.source_url,
  };
  return [
    {
      targetPath,
      prepare(stagePath) {
        fs.mkdirSync(path.dirname(stagePath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(stagePath, `${JSON.stringify(document, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      },
    },
  ];
}

function migrationComplete(root: string, markerPath: string): boolean {
  assertStoragePathComponentsSafe(root, markerPath);
  if (fs.existsSync(markerPath)) {
    const stats = fs.lstatSync(markerPath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024)
      throw new Error("Skill source migration marker is unsafe");
    const marker: unknown = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    if (
      !marker ||
      typeof marker !== "object" ||
      !("version" in marker) ||
      marker.version !== 1
    )
      throw new Error("Skill source migration marker is invalid");
    return true;
  }
  return false;
}

function sourceRow(value: unknown): Pick<Skill, "id" | "source_url"> {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("source_url" in value) ||
    typeof value.source_url !== "string"
  )
    throw new Error("Skill source migration row is invalid");
  return { id: value.id, source_url: value.source_url };
}

/** One-time adoption before rebuilding the catalog can remove local-only fields. */
export function migrateCanonicalSkillSources(
  root: string,
  databasePath: string,
): void {
  const markerPath = path.join(
    root,
    "data",
    "operations",
    "migrations",
    "skill-source-bindings-v1.json",
  );
  if (migrationComplete(root, markerPath)) return;
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    const rows = database.all(
      "SELECT id, source_url FROM skills WHERE source_url IS NOT NULL",
    );
    const entries = rows.flatMap((row) => {
      const skill = sourceRow(row);
      if (
        !isLocalSource(skill.source_url) ||
        readCanonicalSkillSource(root, skill.id)
      )
        return [];
      return canonicalSkillSourceMutations(root, skill);
    });
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "skill-source-migration",
      entries: [
        ...entries,
        {
          targetPath: markerPath,
          prepare(stagePath) {
            fs.mkdirSync(path.dirname(stagePath), {
              recursive: true,
              mode: 0o700,
            });
            fs.writeFileSync(stagePath, '{"version":1}\n', {
              flag: "wx",
              mode: 0o600,
            });
          },
        },
      ],
    });
  } finally {
    database.close();
  }
}
