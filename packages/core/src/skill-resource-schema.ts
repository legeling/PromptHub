import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Skill, SkillVersion } from "@prompthub/shared/types";

import {
  readResourceBundle,
  type ResourceBundleManifest,
  type ResourceBundlePayloadSource,
} from "./resource-bundle";
import {
  resolveResourceBundleWriteRevision,
  writeResourceBundle,
  type ResourceBundleWritePolicy,
} from "./resource-bundle-publication";

export const SKILL_RESOURCE_KIND = "prompthub-skill-resource";
export const SKILL_VERSION_RESOURCE_KIND = "prompthub-skill-version-resource";
export const SKILL_RESOURCE_SCHEMA_VERSION = 1;

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const PROTOCOL_TYPES = new Set(["skill", "mcp", "claude-code"]);
const VISIBILITIES = new Set(["private", "shared"]);

export interface SkillResourceDocument {
  kind: typeof SKILL_RESOURCE_KIND;
  schemaVersion: 1;
  skill: Skill;
  [key: string]: unknown;
}

export interface SkillVersionResourceDocument {
  kind: typeof SKILL_VERSION_RESOURCE_KIND;
  schemaVersion: 1;
  version: SkillVersion;
  [key: string]: unknown;
}

export interface SkillPackagePayloadSource {
  path: string;
  sourcePath: string;
}

export interface MaterializeSkillResourceInput {
  bundlePath: string;
  skill: Skill;
  versions: readonly SkillVersion[];
  packageFiles: readonly SkillPackagePayloadSource[];
  writePolicy?: ResourceBundleWritePolicy;
}

export interface SkillPackageFile {
  path: string;
  absolutePath: string;
  size: number;
  sha256: string;
}

export interface ReadSkillResourceResult {
  skill: Skill;
  versions: SkillVersion[];
  packageFiles: SkillPackageFile[];
  bundleManifest: ResourceBundleManifest;
  document: SkillResourceDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value, "utf8") > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error(`Skill resource ${label} is invalid`);
  }
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`Skill resource ${label} is invalid`);
  }
}

function assertEpoch(value: unknown, label: string): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    !Number.isFinite(new Date(Number(value)).getTime())
  ) {
    throw new Error(`Skill resource ${label} is invalid`);
  }
}

function portableRemoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function portableSkill(input: Skill): Skill {
  const skill = structuredClone(input);
  delete skill.local_repo_path;
  skill.source_url = portableRemoteUrl(skill.source_url);
  skill.content_url = portableRemoteUrl(skill.content_url);
  skill.icon_url = portableRemoteUrl(skill.icon_url);
  return skill;
}

export function createPortableSkillResource(input: Skill): Skill {
  return validateSkill(portableSkill(input));
}

function validateSkill(value: unknown): Skill {
  if (!isRecord(value)) throw new Error("Skill resource metadata is invalid");
  assertId(value.id, "id");
  if (typeof value.name !== "string" || !value.name.trim())
    throw new Error("Skill resource name is invalid");
  if (
    typeof value.protocol_type !== "string" ||
    !PROTOCOL_TYPES.has(value.protocol_type)
  ) {
    throw new Error("Skill resource protocol type is invalid");
  }
  if (
    value.visibility !== undefined &&
    !VISIBILITIES.has(String(value.visibility))
  ) {
    throw new Error("Skill resource visibility is invalid");
  }
  if (typeof value.is_favorite !== "boolean")
    throw new Error("Skill resource favorite flag is invalid");
  if (
    value.currentVersion !== undefined &&
    (!Number.isSafeInteger(value.currentVersion) ||
      Number(value.currentVersion) < 0)
  ) {
    throw new Error("Skill resource currentVersion is invalid");
  }
  if (
    value.versionTrackingEnabled !== undefined &&
    typeof value.versionTrackingEnabled !== "boolean"
  ) {
    throw new Error("Skill resource version tracking flag is invalid");
  }
  for (const field of [
    "tags",
    "original_tags",
    "prerequisites",
    "compatibility",
  ]) {
    if (
      value[field] !== undefined &&
      (!Array.isArray(value[field]) ||
        (value[field] as unknown[]).some((item) => typeof item !== "string"))
    ) {
      throw new Error(`Skill resource ${field} is invalid`);
    }
  }
  if (value.local_repo_path !== undefined)
    throw new Error("Skill resource cannot persist local_repo_path");
  assertEpoch(value.created_at, "created_at");
  assertEpoch(value.updated_at, "updated_at");
  return value as unknown as Skill;
}

function validatePackagePath(value: string): string {
  const segments = value.split("/");
  if (
    !value ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    /\p{Cc}|\\/u.test(value) ||
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    ) ||
    [".git", ".package-lifecycle", ".prompthub"].includes(segments[0])
  ) {
    throw new Error(`Skill resource package path is unsafe: ${value}`);
  }
  return value;
}

function validateVersion(value: unknown, skillId: string): SkillVersion {
  if (!isRecord(value)) throw new Error("Skill resource version is invalid");
  assertId(value.id, "version id");
  if (value.skillId !== skillId)
    throw new Error("Skill version does not belong to the owning Skill");
  if (
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    Number(value.version) > 999_999
  ) {
    throw new Error("Skill resource version number is invalid");
  }
  assertTimestamp(value.createdAt, "version createdAt");
  if (value.filesSnapshot !== undefined) {
    if (!Array.isArray(value.filesSnapshot))
      throw new Error("Skill resource filesSnapshot is invalid");
    for (const file of value.filesSnapshot) {
      if (
        !isRecord(file) ||
        typeof file.relativePath !== "string" ||
        typeof file.content !== "string"
      ) {
        throw new Error("Skill resource version file is invalid");
      }
      validatePackagePath(file.relativePath);
    }
  }
  return value as unknown as SkillVersion;
}

function validateVersions(
  skill: Skill,
  values: readonly unknown[],
): SkillVersion[] {
  const ids = new Set<string>();
  const numbers = new Set<number>();
  const versions = values.map((value) => validateVersion(value, skill.id));
  for (const version of versions) {
    if (ids.has(version.id) || numbers.has(version.version))
      throw new Error("Skill resource contains a duplicate version");
    ids.add(version.id);
    numbers.add(version.version);
  }
  const current = skill.currentVersion ?? 0;
  if (
    versions.length > 0 &&
    Math.max(...versions.map((value) => value.version)) > current
  ) {
    throw new Error("Skill resource version is newer than currentVersion");
  }
  return versions.sort((left, right) => left.version - right.version);
}

function versionPath(version: number): string {
  return `versions/${String(version).padStart(6, "0")}.json`;
}

function writeJsonSource(
  directory: string,
  fileName: string,
  value: unknown,
): string {
  const filePath = path.join(directory, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(text, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("Skill resource document byte limit exceeded");
  fs.writeFileSync(filePath, text, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return filePath;
}

function preparePayloads(
  sourceRoot: string,
  skill: Skill,
  versions: readonly SkillVersion[],
  packageFiles: readonly SkillPackagePayloadSource[],
): ResourceBundlePayloadSource[] {
  const document: SkillResourceDocument = {
    kind: SKILL_RESOURCE_KIND,
    schemaVersion: 1,
    skill,
  };
  const payloads: ResourceBundlePayloadSource[] = [
    {
      path: "skill.json",
      sourcePath: writeJsonSource(sourceRoot, "skill.json", document),
      role: "current",
    },
  ];
  for (const version of versions) {
    const relativePath = versionPath(version.version);
    const versionDocument: SkillVersionResourceDocument = {
      kind: SKILL_VERSION_RESOURCE_KIND,
      schemaVersion: 1,
      version,
    };
    payloads.push({
      path: relativePath,
      sourcePath: writeJsonSource(sourceRoot, relativePath, versionDocument),
      role: "version",
    });
  }
  const seen = new Set<string>();
  for (const file of packageFiles) {
    const packagePath = validatePackagePath(file.path);
    if (seen.has(packagePath))
      throw new Error(`Skill resource duplicate package path: ${packagePath}`);
    seen.add(packagePath);
    payloads.push({
      path: `files/${packagePath}`,
      sourcePath: file.sourcePath,
      role: "package",
    });
  }
  return payloads;
}

export function materializeSkillResourceBundle(
  input: MaterializeSkillResourceInput,
): ResourceBundleManifest {
  const skill = validateSkill(portableSkill(input.skill));
  const versions = validateVersions(skill, structuredClone(input.versions));
  const parentPath = path.dirname(input.bundlePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const sourceRoot = path.join(
    parentPath,
    `.skill-sources-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(sourceRoot, { mode: 0o700 });
    const revision = resolveResourceBundleWriteRevision(
      input.bundlePath,
      "skill",
      skill.id,
      Math.max(1, skill.currentVersion ?? 0),
      input.writePolicy,
    );
    return writeResourceBundle(
      {
        bundlePath: input.bundlePath,
        resourceType: "skill",
        resourceId: skill.id,
        schemaVersion: 1,
        revision,
        createdAt: new Date(skill.created_at).toISOString(),
        updatedAt: new Date(skill.updated_at).toISOString(),
        provenance: { source: "sqlite-skill-shadow-export" },
        payloads: preparePayloads(
          sourceRoot,
          skill,
          versions,
          input.packageFiles,
        ),
      },
      { mode: input.writePolicy?.mode },
    ).manifest;
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function parseJsonRecord(filePath: string): Record<string, unknown> {
  const stat = fs.lstatSync(filePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_DOCUMENT_BYTES
  ) {
    throw new Error("Skill resource document is invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("Skill resource document contains invalid JSON", {
      cause: error,
    });
  }
  if (!isRecord(value)) throw new Error("Skill resource document is invalid");
  return value;
}

function parseCurrent(bundlePath: string): {
  document: SkillResourceDocument;
  skill: Skill;
} {
  const value = parseJsonRecord(path.join(bundlePath, "skill.json"));
  if (value.kind !== SKILL_RESOURCE_KIND || value.schemaVersion !== 1)
    throw new Error("Skill resource document header is unsupported");
  const skill = validateSkill(value.skill);
  return {
    document: {
      ...value,
      kind: SKILL_RESOURCE_KIND,
      schemaVersion: 1,
      skill,
    } as SkillResourceDocument,
    skill,
  };
}

/**
 * Runtime/internal directories that may legitimately exist inside a published
 * skill bundle tree without being declared as payload files (for example a
 * user-sidecar `.prompthub` dir, or a leftover `repo`/clone dir from an
 * earlier ingest). Reads tolerate them by skipping their whole subtree; the
 * next full republish replaces the bundle and drops the leftover directory.
 */
const SKILL_BUNDLE_IGNORED_DIRECTORIES = [".prompthub", "repo"];

export function readSkillResourceBundle(
  bundlePath: string,
): ReadSkillResourceResult {
  const bundle = readResourceBundle(bundlePath, {
    expectedResourceType: "skill",
    ignoredDirectories: SKILL_BUNDLE_IGNORED_DIRECTORIES,
  });
  const currentFiles = bundle.manifest.payloadFiles.filter(
    (file) => file.role === "current",
  );
  if (currentFiles.length !== 1 || currentFiles[0].path !== "skill.json")
    throw new Error("Skill resource current payload is invalid");
  const parsed = parseCurrent(bundlePath);
  if (parsed.skill.id !== bundle.manifest.resourceId)
    throw new Error("Skill resource id does not match its bundle");
  const versions = bundle.manifest.payloadFiles
    .filter((file) => file.role === "version")
    .map((file) => {
      const value = parseJsonRecord(
        path.join(bundlePath, ...file.path.split("/")),
      );
      if (
        value.kind !== SKILL_VERSION_RESOURCE_KIND ||
        value.schemaVersion !== 1 ||
        file.path !==
          versionPath(
            Number((value.version as Record<string, unknown>)?.version),
          )
      ) {
        throw new Error(
          "Skill resource version document header or path is invalid",
        );
      }
      return validateVersion(value.version, parsed.skill.id);
    });
  const validatedVersions = validateVersions(parsed.skill, versions);
  const packageFiles = bundle.manifest.payloadFiles
    .filter((file) => file.role === "package")
    .map((file) => {
      if (!file.path.startsWith("files/"))
        throw new Error("Skill resource package payload path is invalid");
      const packagePath = validatePackagePath(file.path.slice("files/".length));
      return {
        path: packagePath,
        absolutePath: path.join(bundlePath, ...file.path.split("/")),
        size: file.size,
        sha256: file.sha256,
      };
    })
    .sort((left, right) =>
      left.path === right.path ? 0 : left.path < right.path ? -1 : 1,
    );
  const unknownRole = bundle.manifest.payloadFiles.find(
    (file) => !["current", "version", "package"].includes(String(file.role)),
  );
  if (unknownRole)
    throw new Error("Skill resource payload role is unsupported");
  const skill = {
    ...parsed.skill,
    ...(packageFiles.length > 0
      ? { local_repo_path: path.join(bundlePath, "files") }
      : {}),
  };
  return {
    skill,
    versions: validatedVersions,
    packageFiles,
    bundleManifest: bundle.manifest,
    document: parsed.document,
  };
}
