import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isRuleFileId, isRulePlatformId } from "@prompthub/shared";
import type {
  RuleRecord,
  RuleFileId,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";
import {
  readRuleResourceBundle,
  validateRuleVersionSnapshot,
  type CanonicalRuleResource,
} from "../rule-resource-schema";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import { readRuleFile } from "../rule-storage";
import { isRecord, type StoredRuleMeta } from "../rules-workspace-support";

export interface RuleMetadataSources {
  directories: string[];
  metadata: Map<RuleFileId, StoredRuleMeta[]>;
  bundles: Map<RuleFileId, CanonicalRuleResource>;
  versions: Map<RuleFileId, RuleVersionSnapshot[]>;
}

export function ruleSourceFiles(root: string, directory: string): string[] {
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.lstatSync(directory).isDirectory())
    throw new Error("Historical Rule directory is unsafe");
  const files: string[] = [];
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("Historical Rule source contains a symbolic link");
    if (entry.isDirectory()) files.push(...ruleSourceFiles(root, file));
    else if (entry.isFile()) files.push(file);
    else throw new Error("Historical Rule source is not a regular file");
  }
  return files;
}

export function ruleSourceDigest(root: string, directory: string): string {
  const hash = crypto.createHash("sha256");
  for (const file of ruleSourceFiles(root, directory)) {
    const bytes = fs.readFileSync(file);
    hash.update(JSON.stringify([path.relative(directory, file), bytes.length]));
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function validatePlacement(value: Record<string, unknown>): void {
  if (
    typeof value.targetPath !== "string" ||
    value.targetPath.includes("\0") ||
    (value.projectRootPath !== undefined &&
      value.projectRootPath !== null &&
      (typeof value.projectRootPath !== "string" ||
        !value.projectRootPath ||
        value.projectRootPath.includes("\0"))) ||
    (value.targetPath === "" && value.projectRootPath != null)
  )
    throw new Error("Historical Rule project binding is invalid");
}

function readMeta(root: string, file: string): StoredRuleMeta {
  const value: unknown = JSON.parse(readRuleFile(file, root));
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRuleFileId(value.id) ||
    typeof value.platformId !== "string" ||
    !isRulePlatformId(value.platformId) ||
    (value.scope !== "global" && value.scope !== "project")
  )
    throw new Error("Historical Rule metadata identity is invalid");
  for (const field of [
    "platformName",
    "platformIcon",
    "platformDescription",
    "canonicalFileName",
    "description",
    "managedPath",
    "createdAt",
    "updatedAt",
  ])
    if (typeof value[field] !== "string" || value[field].includes("\0"))
      throw new Error(`Historical Rule metadata ${field} is invalid`);
  if (
    !Number.isFinite(Date.parse(String(value.createdAt))) ||
    !Number.isFinite(Date.parse(String(value.updatedAt)))
  )
    throw new Error("Historical Rule metadata timestamp is invalid");
  validatePlacement(value);
  // The shape and every required field were validated at this historical input boundary.
  const meta = value as unknown as StoredRuleMeta;
  if (
    path.basename(meta.canonicalFileName) !== meta.canonicalFileName ||
    /[\\\0]/u.test(meta.canonicalFileName)
  )
    throw new Error("Historical Rule file name is invalid");
  // Copied roots may retain the old absolute path; only the source-adjacent file is read.
  return {
    ...meta,
    managedPath: path.join(path.dirname(file), meta.canonicalFileName),
  };
}

function readIndex(
  root: string,
  file: string,
): { id: RuleFileId; versions: RuleVersionSnapshot[] } {
  const key = path.basename(path.dirname(file));
  let decoded: string;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    throw new Error("Historical Rule version directory identity is invalid");
  }
  if (!isRuleFileId(decoded))
    throw new Error("Historical Rule version directory identity is invalid");
  const value: unknown = JSON.parse(readRuleFile(file, root));
  if (!Array.isArray(value))
    throw new Error("Historical Rule version index is invalid");
  return {
    id: decoded,
    versions: value.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.fileName !== "string" ||
        path.basename(entry.fileName) !== entry.fileName ||
        /[\\\0]/u.test(entry.fileName)
      )
        throw new Error("Historical Rule version file is unsafe");
      return validateRuleVersionSnapshot({
        ...entry,
        content: readRuleFile(
          path.join(path.dirname(file), entry.fileName),
          root,
        ),
      });
    }),
  };
}

export function readRuleMetadataSources(
  root: string,
  records: RuleRecord[],
): RuleMetadataSources {
  const directories = [
    path.join(root, "data", "rules"),
    path.join(root, "cache", "rules-workspace"),
  ].filter((directory) => fs.existsSync(directory));
  const result: RuleMetadataSources = {
    directories,
    metadata: new Map(),
    bundles: new Map(),
    versions: new Map(),
  };
  const indexes: string[] = [];
  for (const directory of directories)
    for (const file of ruleSourceFiles(root, directory)) {
      if (path.basename(file) === "_rule.json") {
        const meta = readMeta(root, file);
        const metas = result.metadata.get(meta.id) ?? [];
        metas.push(meta);
        result.metadata.set(meta.id, metas);
      } else if (
        path.basename(file) === "rule.json" &&
        fs.existsSync(path.join(path.dirname(file), "manifest.json"))
      ) {
        const bundle = readRuleResourceBundle(path.dirname(file));
        if (
          path.basename(path.dirname(file)) !==
          encodeCanonicalResourceDirectory(bundle.rule.id)
        )
          throw new Error("Historical Rule bundle identity mismatch");
        if (result.bundles.has(bundle.rule.id))
          throw new Error("Duplicate historical Rule bundle identity");
        result.bundles.set(bundle.rule.id, bundle.rule);
      } else if (
        path.basename(file) === "index.json" &&
        path.basename(path.dirname(path.dirname(file))) === ".versions"
      )
        indexes.push(file);
    }
  const scopedOwners = new Map(
    [
      ...records,
      ...[...result.metadata.values()].flat(),
      ...result.bundles.values(),
    ].map((record) => [
      `claude-scoped-${crypto.createHash("sha256").update(record.id).digest("hex")}`,
      record,
    ]),
  );
  for (const file of indexes) {
    // Scoped Claude history used a hashed directory; its SQL path owns the identity.
    const owner = scopedOwners.get(path.basename(path.dirname(file)));
    if (owner) {
      const value: unknown = JSON.parse(readRuleFile(file, root));
      if (!Array.isArray(value))
        throw new Error("Historical scoped Rule version index is invalid");
      const versions = value.map((entry) => {
        if (
          !isRecord(entry) ||
          typeof entry.fileName !== "string" ||
          path.basename(entry.fileName) !== entry.fileName ||
          /[\\\0]/u.test(entry.fileName)
        )
          throw new Error("Historical scoped Rule version file is unsafe");
        return validateRuleVersionSnapshot({
          ...entry,
          content: readRuleFile(
            path.join(path.dirname(file), entry.fileName),
            root,
          ),
        });
      });
      result.versions.set(owner.id, [
        ...(result.versions.get(owner.id) ?? []),
        ...versions,
      ]);
    } else {
      const index = readIndex(root, file);
      result.versions.set(index.id, [
        ...(result.versions.get(index.id) ?? []),
        ...index.versions,
      ]);
    }
  }
  return result;
}
