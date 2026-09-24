import type {
  CreateSkillParams,
  RegistrySkill,
  Skill,
  SkillPackageOperationRequest,
  SkillPackageOperationSource,
  SkillSafetyReport,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import { computeStableTextHash } from "@prompthub/shared/utils/skill-identity";
import { SKILL_PACKAGE_FINGERPRINT_ALGORITHM } from "@prompthub/shared/utils/skill-source-update";
import { parseSkillMd } from "./skill-frontmatter";
import {
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_PATH_LENGTH,
  MAX_SKILL_PACKAGE_TEXT_BYTES,
} from "@prompthub/shared/constants/skill-package";

const MAX_METADATA_TEXT_LENGTH = 16_384;
const MAX_METADATA_LIST_ITEMS = 500;

function requireNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_METADATA_TEXT_LENGTH) {
    throw new Error(`${field} exceeds the text length limit`);
  }
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (value.length > MAX_METADATA_TEXT_LENGTH) {
    throw new Error(`${field} exceeds the text length limit`);
  }
}

function validateOptionalString(value: unknown, field: string): void {
  if (value === undefined) return;
  requireString(value, field);
}

function requirePackageText(
  value: unknown,
  field: string,
  allowEmpty = false,
): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (
    new TextEncoder().encode(value).byteLength > MAX_SKILL_PACKAGE_TEXT_BYTES
  ) {
    throw new Error(`${field} exceeds the package text size limit`);
  }
}

function validateStringList(
  value: unknown,
  field: string,
  optional = false,
): void {
  if (optional && value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_METADATA_LIST_ITEMS) {
    throw new Error(`${field} must be a bounded string array`);
  }
  for (const item of value) requireString(item, `${field} item`);
}

function isSafeRelativePackagePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return (
    Boolean(normalized) &&
    !normalized.startsWith("/") &&
    !/^[a-z]:\//i.test(normalized) &&
    !normalized.includes("\0") &&
    parts.every((part) => part !== "" && part !== "." && part !== "..")
  );
}

function assertPackagePathBudget(value: string): void {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length > MAX_SKILL_PACKAGE_PATH_LENGTH) {
    throw new Error("file.path exceeds the path length limit");
  }
  if (normalized.split("/").length > MAX_SKILL_PACKAGE_DEPTH + 1) {
    throw new Error("file.path exceeds the package depth limit");
  }
}

function validatePackageFiles(
  source: Extract<SkillPackageOperationSource, { kind: "files" }>,
): void {
  if (!Array.isArray(source.files) || source.files.length === 0) {
    throw new Error("files source must contain at least one package file");
  }
  if (source.files.length > MAX_SKILL_PACKAGE_FILES) {
    throw new Error(`files source exceeds ${MAX_SKILL_PACKAGE_FILES} entries`);
  }
  let totalBytes = 0;
  let hasSkillMd = false;
  const normalizedPaths = new Set<string>();
  for (const file of source.files) {
    if (
      !file ||
      typeof file !== "object" ||
      typeof file.path !== "string" ||
      !isSafeRelativePackagePath(file.path)
    ) {
      throw new Error("file.path must be a safe relative package path");
    }
    if (typeof file.content !== "string") {
      throw new Error("file.content must be a string");
    }
    assertPackagePathBudget(file.path);
    const normalizedPath = file.path.replace(/\\/g, "/");
    const identity = normalizedPath.toLowerCase();
    if (normalizedPaths.has(identity)) {
      throw new Error(`files source contains duplicate path: ${file.path}`);
    }
    normalizedPaths.add(identity);
    hasSkillMd ||= normalizedPath === "SKILL.md";
    totalBytes += new TextEncoder().encode(file.content).byteLength;
  }
  if (!hasSkillMd) throw new Error("files source must contain root SKILL.md");
  if (totalBytes > MAX_SKILL_PACKAGE_TEXT_BYTES) {
    throw new Error("files source exceeds the package text size limit");
  }
}

function validateOperationSource(source: SkillPackageOperationSource): void {
  switch (source.kind) {
    case "remote-git":
      requireNonEmptyString(source.repoUrl, "source.repoUrl");
      validateOptionalString(source.branch, "source.branch");
      validateOptionalString(source.directory, "source.directory");
      if (source.skillName !== undefined) {
        requireNonEmptyString(source.skillName, "source.skillName");
      }
      return;
    case "remote-zip":
      requireNonEmptyString(source.zipUrl, "source.zipUrl");
      return;
    case "content":
      requireNonEmptyString(source.sourceUrl, "source.sourceUrl");
      requirePackageText(source.content, "source.content");
      return;
    case "local-directory":
      requireNonEmptyString(source.directory, "source.directory");
      return;
    case "files":
      requireNonEmptyString(source.sourceUrl, "source.sourceUrl");
      validatePackageFiles(source);
      return;
    default:
      throw new Error("source.kind is not supported");
  }
}

function validateRegistrySkill(value: unknown): asserts value is RegistrySkill {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("registrySkill must be an object");
  }
  const skill = value as Record<string, unknown>;
  requireNonEmptyString(skill.slug, "registrySkill.slug");
  requireNonEmptyString(skill.name, "registrySkill.name");
  for (const field of [
    "description",
    "category",
    "author",
    "source_url",
    "version",
  ]) {
    requireString(skill[field], `registrySkill.${field}`);
  }
  requirePackageText(skill.content, "registrySkill.content", true);
  for (const field of [
    "install_name",
    "source_id",
    "source_label",
    "source_branch",
    "source_directory",
    "canonical_skill_path",
    "directory_fingerprint",
    "icon_url",
    "icon_background",
    "icon_emoji",
    "store_url",
    "content_url",
    "package_url",
    "weekly_installs",
    "github_stars",
  ]) {
    validateOptionalString(skill[field], `registrySkill.${field}`);
  }
  validateStringList(skill.tags, "registrySkill.tags");
  for (const field of [
    "prerequisites",
    "compatibility",
    "installed_on",
    "security_audits",
  ]) {
    validateStringList(skill[field], `registrySkill.${field}`, true);
  }
}

/** Validate the renderer-to-main lifecycle contract before any side effect. */
export function validateSkillPackageOperationRequest(
  value: unknown,
): SkillPackageOperationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Skill package operation request must be an object");
  }
  const request = value as SkillPackageOperationRequest;
  if (request.operation !== "install" && request.operation !== "update") {
    throw new Error("operation must be install or update");
  }
  if (request.operation === "update") {
    requireNonEmptyString(request.skillId, "skillId");
  } else {
    validateOptionalString(request.skillId, "skillId");
  }
  validateRegistrySkill(request.registrySkill);
  requirePackageText(request.content, "content");
  if (
    !request.source ||
    typeof request.source !== "object" ||
    Array.isArray(request.source)
  ) {
    throw new Error("source must be an object");
  }
  validateOperationSource(request.source);
  if (
    request.markAsBuiltin !== undefined &&
    typeof request.markAsBuiltin !== "boolean"
  ) {
    throw new Error("markAsBuiltin must be a boolean");
  }
  validateOptionalString(request.note, "note");
  if (
    request.expectedSourceFingerprint !== undefined &&
    (typeof request.expectedSourceFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(request.expectedSourceFingerprint))
  ) {
    throw new Error("expectedSourceFingerprint must be a SHA-256 fingerprint");
  }
  return request;
}

export function sanitizeSkillPackageSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[^a-z0-9@:/._-]+/gi, "");
  }
}

function getSourceIdentity(source: SkillPackageOperationSource): string {
  switch (source.kind) {
    case "remote-git":
      return `${sanitizeSkillPackageSourceUrl(source.repoUrl)}|${source.branch ?? ""}|${source.directory ?? ""}|${source.skillName?.trim().toLocaleLowerCase() ?? ""}`;
    case "remote-zip":
      return sanitizeSkillPackageSourceUrl(source.zipUrl);
    case "content":
    case "files":
      return sanitizeSkillPackageSourceUrl(source.sourceUrl);
    case "local-directory":
      return source.directory;
  }
}

/** Build a credential-free key used to coalesce duplicate mutations. */
export function buildSkillPackageOperationKey(
  request: SkillPackageOperationRequest,
): string {
  if (request.operation === "update" && request.skillId?.trim()) {
    return `update:${request.skillId.trim()}`;
  }
  const sourceIdentity =
    request.registrySkill.source_id || getSourceIdentity(request.source);
  const target = request.skillId?.trim() || "new";
  return `${request.operation}:${target}:${computeStableTextHash(sourceIdentity)}`;
}

type StoreSkillDataInput = {
  registrySkill: RegistrySkill;
  content: string;
  contentHash: string;
  directoryFingerprint: string;
  sourceId: string;
  now: number;
  safetyReport?: SkillSafetyReport;
};

type StagedPackageMetadata = {
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  compatibility?: string[];
};

function parseCompatibility(value?: string): string[] | undefined {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

function getStagedPackageMetadata(content: string): StagedPackageMetadata {
  const frontmatter = parseSkillMd(content)?.frontmatter;
  if (!frontmatter) return {};
  return {
    description: frontmatter.description,
    version: frontmatter.version,
    author: frontmatter.author,
    tags: frontmatter.tags,
    compatibility: parseCompatibility(frontmatter.compatibility),
  };
}

function getCatalogInstalledVersion(
  catalogVersion: string,
  packageVersion?: string,
  currentVersion?: string,
): string | undefined {
  return catalogVersion === "source"
    ? packageVersion || currentVersion
    : catalogVersion;
}

function buildSourceBaseline(input: StoreSkillDataInput) {
  return {
    directory_fingerprint: input.directoryFingerprint,
    installed_directory_fingerprint: input.directoryFingerprint,
    fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    source_last_checked_at: input.now,
    source_last_error: null,
    source_binding_state: "bound" as const,
  };
}

/** Build the only canonical store-install row payload. */
export function buildStoreInstallSkillData(
  input: StoreSkillDataInput,
): CreateSkillParams {
  const skill = input.registrySkill;
  const packageMetadata = getStagedPackageMetadata(input.content);
  const installedVersion = getCatalogInstalledVersion(
    skill.version,
    packageMetadata.version,
  );
  return {
    name: skill.install_name || skill.slug,
    description: packageMetadata.description ?? skill.description,
    instructions: input.content,
    content: input.content,
    protocol_type: "skill",
    version: packageMetadata.version ?? installedVersion,
    author: packageMetadata.author ?? skill.author,
    source_url: skill.source_url,
    source_id: input.sourceId,
    source_label: skill.source_label,
    source_branch: skill.source_branch,
    source_directory: skill.source_directory,
    canonical_skill_path: skill.canonical_skill_path,
    tags: [],
    original_tags: packageMetadata.tags ?? skill.tags,
    is_favorite: false,
    icon_url: skill.icon_url,
    icon_emoji: skill.icon_emoji,
    icon_background: skill.icon_background,
    category: skill.category,
    is_builtin: true,
    registry_slug: skill.slug,
    content_url: skill.content_url,
    installed_content_hash: input.contentHash,
    installed_version: installedVersion,
    installed_at: input.now,
    updated_from_store_at: input.now,
    prerequisites: skill.prerequisites,
    compatibility: packageMetadata.compatibility ?? skill.compatibility,
    ...buildSourceBaseline(input),
  };
}

type StoreSkillUpdateInput = StoreSkillDataInput & {
  installedSkill: Skill;
  markAsBuiltin: boolean;
};

/** Build canonical update metadata without overwriting user-owned tags. */
export function buildStoreUpdateSkillData(
  input: StoreSkillUpdateInput,
): UpdateSkillParams {
  const skill = input.registrySkill;
  const packageMetadata = getStagedPackageMetadata(input.content);
  const installedVersion = getCatalogInstalledVersion(
    skill.version,
    packageMetadata.version,
    input.installedSkill.installed_version ?? input.installedSkill.version,
  );
  return {
    description: packageMetadata.description ?? skill.description,
    instructions: input.content,
    content: input.content,
    version: packageMetadata.version ?? installedVersion,
    author: packageMetadata.author ?? skill.author,
    source_url: skill.source_url,
    source_id: input.sourceId,
    source_label: input.installedSkill.source_label || skill.source_label,
    source_branch: skill.source_branch,
    source_directory: skill.source_directory,
    canonical_skill_path: skill.canonical_skill_path,
    icon_url: skill.icon_url,
    icon_emoji: skill.icon_emoji,
    icon_background: skill.icon_background,
    category: skill.category,
    is_builtin: input.markAsBuiltin ? true : input.installedSkill.is_builtin,
    registry_slug: skill.slug,
    content_url: skill.content_url,
    original_tags: packageMetadata.tags ?? skill.tags,
    prerequisites: skill.prerequisites,
    compatibility: packageMetadata.compatibility ?? skill.compatibility,
    installed_content_hash: input.contentHash,
    installed_version: installedVersion,
    updated_from_store_at: input.now,
    ...buildSourceBaseline(input),
  };
}

/** Redact credentials and bound diagnostics before returning them over IPC. */
export function sanitizeSkillPackageDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(/([?&](?:token|secret|password|key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(token|secret|password|api[_-]?key)=\S+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
