import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  RuleFileContent,
  RuleFileGroup,
  RuleFileId,
  RulePlatformId,
  RuleVersionSnapshot,
} from "@prompthub/shared/types/rules";

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

export const RULE_RESOURCE_KIND = "prompthub-rule-resource";
export const RULE_RESOURCE_SCHEMA_VERSION = 1;

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_RULE_BYTES = 16 * 1024 * 1024;
const GROUPS = new Set(["workspace", "assistant", "tooling"]);
const VERSION_SOURCES = new Set(["manual-save", "ai-rewrite", "create"]);

export interface CanonicalRuleVersionMetadata {
  id: string;
  version: number;
  savedAt: string;
  source: RuleVersionSnapshot["source"];
  path: string;
}

export interface RuleResourceDocument {
  kind: typeof RULE_RESOURCE_KIND;
  schemaVersion: 1;
  rule: {
    id: RuleFileId;
    platformId: RulePlatformId;
    platformName: string;
    platformIcon: string;
    platformDescription: string;
    name: string;
    description: string;
    group: RuleFileGroup;
    targetPath?: string;
    projectRootPath?: string | null;
    currentVersion: number;
    versions: CanonicalRuleVersionMetadata[];
  };
  [key: string]: unknown;
}

export interface CanonicalRuleResource {
  id: RuleFileId;
  platformId: RulePlatformId;
  platformName: string;
  platformIcon: string;
  platformDescription: string;
  name: string;
  description: string;
  group: RuleFileGroup;
  targetPath?: string;
  projectRootPath?: string | null;
  content: string;
  versions: RuleVersionSnapshot[];
}

export interface ReadRuleResourceResult {
  rule: CanonicalRuleResource;
  bundleManifest: ResourceBundleManifest;
  document: RuleResourceDocument;
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
    throw new Error(`Rule resource ${label} is invalid`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string")
    throw new Error(`Rule resource ${label} must be a string`);
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
    throw new Error(`Rule resource ${label} is invalid`);
  }
}

function positiveVersion(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 999_999
  )
    throw new Error("Rule resource version number is invalid");
  return Number(value);
}

function versionPath(version: number): string {
  return `versions/${String(version).padStart(6, "0")}.md`;
}

function validateContent(value: unknown, label: string): string {
  assertString(value, label);
  if (Buffer.byteLength(value, "utf8") > MAX_RULE_BYTES)
    throw new Error(`Rule resource ${label} byte limit exceeded`);
  return value;
}

function validateOptionalPath(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > 16_384 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Rule resource ${label} is invalid`);
  }
  return value;
}

function validateVersion(value: unknown, version: number): RuleVersionSnapshot {
  if (!isRecord(value)) throw new Error("Rule resource version is invalid");
  assertId(value.id, "version id");
  assertTimestamp(value.savedAt, "version savedAt");
  if (typeof value.source !== "string" || !VERSION_SOURCES.has(value.source))
    throw new Error("Rule resource version source is invalid");
  return {
    id: value.id,
    savedAt: value.savedAt,
    content: validateContent(value.content, `version ${version} content`),
    source: value.source as RuleVersionSnapshot["source"],
  };
}

function validateRule(value: unknown): CanonicalRuleResource {
  if (!isRecord(value)) throw new Error("Rule resource metadata is invalid");
  assertId(value.id, "id");
  assertId(value.platformId, "platformId");
  for (const field of [
    "platformName",
    "platformIcon",
    "platformDescription",
    "name",
    "description",
  ])
    assertString(value[field], field);
  if (typeof value.group !== "string" || !GROUPS.has(value.group))
    throw new Error("Rule resource group is invalid");
  if (!Array.isArray(value.versions) || value.versions.length === 0)
    throw new Error("Rule resource versions are missing");
  const versions = value.versions.map((version, index) =>
    validateVersion(version, index + 1),
  );
  if (new Set(versions.map((version) => version.id)).size !== versions.length)
    throw new Error("Rule resource contains a duplicate version");
  for (let index = 1; index < versions.length; index += 1) {
    if (
      Date.parse(versions[index].savedAt) <
      Date.parse(versions[index - 1].savedAt)
    )
      throw new Error("Rule resource versions are not chronological");
  }
  const content = validateContent(value.content, "current content");
  if (content !== versions.at(-1)?.content)
    throw new Error(
      "Rule resource current content does not match latest history",
    );
  return {
    id: value.id as RuleFileId,
    platformId: value.platformId as RulePlatformId,
    platformName: value.platformName as string,
    platformIcon: value.platformIcon as string,
    platformDescription: value.platformDescription as string,
    name: value.name as string,
    description: value.description as string,
    group: value.group as RuleFileGroup,
    targetPath: validateOptionalPath(value.targetPath, "targetPath"),
    projectRootPath:
      value.projectRootPath === null
        ? null
        : validateOptionalPath(value.projectRootPath, "projectRootPath"),
    content,
    versions,
  };
}

function portableRule(input: RuleFileContent): CanonicalRuleResource {
  const targetPath = input.targetPath ?? input.path;
  const projectPlacement = input.id.startsWith("project:")
    ? {
        // Detached DB Rules use an empty path; bundles omit deployment placement.
        targetPath: targetPath === "" ? undefined : targetPath,
        projectRootPath: input.projectRootPath ?? null,
      }
    : {};
  return {
    id: input.id,
    platformId: input.platformId,
    platformName: input.platformName,
    platformIcon: input.platformIcon,
    platformDescription: input.platformDescription,
    name: input.name,
    description: input.description,
    group: input.group,
    ...projectPlacement,
    content: input.content,
    versions: structuredClone(input.versions),
  };
}

function writeSource(
  root: string,
  relativePath: string,
  content: string,
): string {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return filePath;
}

export function materializeRuleResourceBundle(input: {
  bundlePath: string;
  rule: RuleFileContent;
  writePolicy?: ResourceBundleWritePolicy;
}): ResourceBundleManifest {
  const rule = validateRule(portableRule(input.rule));
  const versionMetadata = rule.versions.map((version, index) => ({
    id: version.id,
    version: index + 1,
    savedAt: version.savedAt,
    source: version.source,
    path: versionPath(index + 1),
  }));
  const document: RuleResourceDocument = {
    kind: RULE_RESOURCE_KIND,
    schemaVersion: 1,
    rule: {
      id: rule.id,
      platformId: rule.platformId,
      platformName: rule.platformName,
      platformIcon: rule.platformIcon,
      platformDescription: rule.platformDescription,
      name: rule.name,
      description: rule.description,
      group: rule.group,
      ...(rule.targetPath
        ? {
            targetPath: rule.targetPath,
            projectRootPath: rule.projectRootPath ?? null,
          }
        : {}),
      currentVersion: rule.versions.length,
      versions: versionMetadata,
    },
  };
  const parentPath = path.dirname(input.bundlePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const sourceRoot = path.join(
    parentPath,
    `.rule-sources-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(sourceRoot, { mode: 0o700 });
    const metadata = `${JSON.stringify(document, null, 2)}\n`;
    if (Buffer.byteLength(metadata, "utf8") > MAX_DOCUMENT_BYTES)
      throw new Error("Rule resource metadata byte limit exceeded");
    const payloads: ResourceBundlePayloadSource[] = [
      {
        path: "rule.json",
        sourcePath: writeSource(sourceRoot, "rule.json", metadata),
        role: "metadata",
      },
      {
        path: "rule.md",
        sourcePath: writeSource(sourceRoot, "rule.md", rule.content),
        role: "current",
      },
      ...rule.versions.map((version, index) => ({
        path: versionPath(index + 1),
        sourcePath: writeSource(
          sourceRoot,
          versionPath(index + 1),
          version.content,
        ),
        role: "version",
      })),
    ];
    const revision = resolveResourceBundleWriteRevision(
      input.bundlePath,
      "rule",
      rule.id,
      rule.versions.length,
      input.writePolicy,
    );
    return writeResourceBundle(
      {
        bundlePath: input.bundlePath,
        resourceType: "rule",
        resourceId: rule.id,
        schemaVersion: 1,
        revision,
        createdAt: rule.versions[0].savedAt,
        updatedAt: rule.versions.at(-1)!.savedAt,
        provenance: { source: "rules-workspace-shadow-export" },
        payloads,
      },
      { mode: input.writePolicy?.mode },
    ).manifest;
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function readText(filePath: string, maxBytes: number): string {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
    throw new Error("Rule resource payload is invalid");
  return fs.readFileSync(filePath, "utf8");
}

function parseDocument(bundlePath: string): RuleResourceDocument {
  const content = readText(
    path.join(bundlePath, "rule.json"),
    MAX_DOCUMENT_BYTES,
  );
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("Rule resource metadata contains invalid JSON", {
      cause: error,
    });
  }
  if (
    !isRecord(value) ||
    value.kind !== RULE_RESOURCE_KIND ||
    value.schemaVersion !== 1 ||
    !isRecord(value.rule)
  ) {
    throw new Error("Rule resource metadata header is unsupported");
  }
  const metadata = value.rule;
  assertId(metadata.id, "id");
  assertId(metadata.platformId, "platformId");
  for (const field of [
    "platformName",
    "platformIcon",
    "platformDescription",
    "name",
    "description",
  ])
    assertString(metadata[field], field);
  if (typeof metadata.group !== "string" || !GROUPS.has(metadata.group))
    throw new Error("Rule resource group is invalid");
  const currentVersion = positiveVersion(metadata.currentVersion);
  const targetPath = validateOptionalPath(metadata.targetPath, "targetPath");
  const projectRootPath =
    metadata.projectRootPath === null
      ? null
      : validateOptionalPath(metadata.projectRootPath, "projectRootPath");
  if (
    !Array.isArray(metadata.versions) ||
    metadata.versions.length !== currentVersion
  )
    throw new Error("Rule resource version metadata is invalid");
  const ids = new Set<string>();
  const versions = metadata.versions.map((entry, index) => {
    if (!isRecord(entry))
      throw new Error("Rule resource version metadata is invalid");
    assertId(entry.id, "version id");
    if (ids.has(entry.id))
      throw new Error("Rule resource contains a duplicate version");
    ids.add(entry.id);
    const version = positiveVersion(entry.version);
    if (version !== index + 1 || entry.path !== versionPath(version))
      throw new Error("Rule resource version metadata path is invalid");
    assertTimestamp(entry.savedAt, "version savedAt");
    if (typeof entry.source !== "string" || !VERSION_SOURCES.has(entry.source))
      throw new Error("Rule resource version source is invalid");
    return {
      id: entry.id,
      version,
      savedAt: entry.savedAt,
      source: entry.source as RuleVersionSnapshot["source"],
      path: entry.path,
    };
  });
  return {
    ...value,
    kind: RULE_RESOURCE_KIND,
    schemaVersion: 1,
    rule: {
      id: metadata.id as RuleFileId,
      platformId: metadata.platformId as RulePlatformId,
      platformName: metadata.platformName as string,
      platformIcon: metadata.platformIcon as string,
      platformDescription: metadata.platformDescription as string,
      name: metadata.name as string,
      description: metadata.description as string,
      group: metadata.group as RuleFileGroup,
      targetPath,
      projectRootPath,
      currentVersion,
      versions,
    },
  };
}

export function readRuleResourceBundle(
  bundlePath: string,
): ReadRuleResourceResult {
  const bundle = readResourceBundle(bundlePath, {
    expectedResourceType: "rule",
  });
  const roles = new Map(
    bundle.manifest.payloadFiles.map((file) => [file.path, file.role]),
  );
  if (
    roles.get("rule.json") !== "metadata" ||
    roles.get("rule.md") !== "current"
  )
    throw new Error("Rule resource required payloads are invalid");
  if (
    [...roles.values()].some(
      (role) => !["metadata", "current", "version"].includes(String(role)),
    )
  )
    throw new Error("Rule resource payload role is unsupported");
  const document = parseDocument(bundlePath);
  if (document.rule.id !== bundle.manifest.resourceId)
    throw new Error("Rule resource id does not match its bundle");
  const versions = document.rule.versions.map((metadata) => {
    if (roles.get(metadata.path) !== "version")
      throw new Error("Rule resource version payload is missing");
    return {
      id: metadata.id,
      savedAt: metadata.savedAt,
      source: metadata.source,
      content: readText(
        path.join(bundlePath, ...metadata.path.split("/")),
        MAX_RULE_BYTES,
      ),
    };
  });
  if (roles.size !== versions.length + 2)
    throw new Error("Rule resource contains undeclared version metadata");
  const content = readText(path.join(bundlePath, "rule.md"), MAX_RULE_BYTES);
  if (content !== versions.at(-1)?.content)
    throw new Error(
      "Rule resource current content does not match latest history",
    );
  return {
    rule: {
      id: document.rule.id,
      platformId: document.rule.platformId,
      platformName: document.rule.platformName,
      platformIcon: document.rule.platformIcon,
      platformDescription: document.rule.platformDescription,
      name: document.rule.name,
      description: document.rule.description,
      group: document.rule.group,
      targetPath: document.rule.targetPath,
      projectRootPath: document.rule.projectRootPath,
      content,
      versions,
    },
    bundleManifest: bundle.manifest,
    document,
  };
}
