import type { SkillFileSnapshot } from "../types/skill";
import {
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_PATH_LENGTH,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "../constants/skill-package";

export const SKILL_SNAPSHOT_CAPABILITY_HEADER = "X-PromptHub-Skill-Snapshot";
export const SKILL_SNAPSHOT_CAPABILITY = "2";
export const SKILL_SNAPSHOT_SYNC_VERSION = "prompthub-skill-snapshot-v2";
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const encoder = new TextEncoder();

export function validateSkillSnapshotPath(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_SKILL_PACKAGE_PATH_LENGTH ||
    /[\\:\u0000-\u001f\u007f]/u.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid Skill snapshot relative path");
}

function base64ByteLength(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  if (
    content.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content) ||
    (padding === 2 && (BASE64_ALPHABET.indexOf(content.at(-3)!) & 15) !== 0) ||
    (padding === 1 && (BASE64_ALPHABET.indexOf(content.at(-2)!) & 3) !== 0)
  )
    throw new Error("Invalid Skill snapshot base64 content");
  return (content.length / 4) * 3 - padding;
}

export function skillSnapshotByteLength(value: SkillFileSnapshot): number {
  if (!value || typeof value.content !== "string")
    throw new Error("Invalid Skill snapshot content");
  validateSkillSnapshotPath(value.relativePath);
  let size: number;
  if (value.encoding === "base64") {
    if (
      value.content.length >
      Math.ceil(MAX_SKILL_PACKAGE_FILE_BYTES / 3) * 4
    ) {
      throw new Error("Skill snapshot file limit exceeded");
    }
    size = base64ByteLength(value.content);
  } else if (value.encoding === undefined || value.encoding === "utf8") {
    if (value.content.length > MAX_SKILL_PACKAGE_FILE_BYTES)
      throw new Error("Skill snapshot file limit exceeded");
    size = encoder.encode(value.content).byteLength;
  } else {
    throw new Error("Unsupported Skill snapshot encoding");
  }
  if (size > MAX_SKILL_PACKAGE_FILE_BYTES)
    throw new Error("Skill snapshot file limit exceeded");
  return size;
}

export function validateSkillFileSnapshots(
  values: readonly SkillFileSnapshot[],
): void {
  if (!Array.isArray(values) || values.length > MAX_SKILL_PACKAGE_FILES) {
    throw new Error("Skill snapshot file count limit exceeded");
  }
  const paths = new Set<string>();
  let size = 0;
  for (const value of values) {
    size += skillSnapshotByteLength(value);
    if (paths.has(value.relativePath))
      throw new Error("Skill snapshot duplicate file path");
    paths.add(value.relativePath);
    if (size > MAX_SKILL_PACKAGE_TOTAL_BYTES)
      throw new Error("Skill snapshot total byte limit exceeded");
  }
}

/** Legacy auxiliary-file snapshots keep their separately stored entrypoint. */
export function withSkillSnapshotEntrypoint(
  files: readonly SkillFileSnapshot[],
  content: string,
): SkillFileSnapshot[] {
  validateSkillFileSnapshots(files);
  const entry = files.find(
    (file) => file.relativePath.toLowerCase() === "skill.md",
  );
  const result = entry
    ? [...files]
    : [{ relativePath: "SKILL.md", content }, ...files];
  const primary = entry ?? result[0];
  const text = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(decodeSkillFileSnapshot(primary));
  if (text.includes("\0"))
    throw new Error("Skill package requires a UTF-8 SKILL.md entrypoint");
  validateSkillFileSnapshots(result);
  return result;
}

export function encodeSkillFileSnapshot(
  relativePath: string,
  bytes: Uint8Array,
): SkillFileSnapshot {
  validateSkillSnapshotPath(relativePath);
  if (bytes.byteLength > MAX_SKILL_PACKAGE_FILE_BYTES)
    throw new Error("Skill snapshot file limit exceeded");
  if (!bytes.includes(0)) {
    try {
      return {
        relativePath,
        content: new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes),
      };
    } catch {
      // Invalid UTF-8 is binary, not text with replacement characters.
    }
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
    );
  }
  return { relativePath, content: btoa(chunks.join("")), encoding: "base64" };
}

export function decodeSkillFileSnapshot(value: SkillFileSnapshot): Uint8Array {
  skillSnapshotByteLength(value);
  if (value.encoding !== "base64") return encoder.encode(value.content);
  const binary = atob(value.content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Checks only the two documented snapshot carriers, not arbitrary user content. */
export function hasEncodedSkillSnapshots(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as {
    skillFiles?: Record<string, SkillFileSnapshot[]>;
    skillVersions?: Array<{ filesSnapshot?: SkillFileSnapshot[] }>;
  };
  const encoded = (files: unknown) =>
    Array.isArray(files) && files.some((file) => file?.encoding === "base64");
  return (
    Object.values(data.skillFiles ?? {}).some(encoded) ||
    (Array.isArray(data.skillVersions) &&
      data.skillVersions.some((version) => encoded(version?.filesSnapshot)))
  );
}

export function assertSkillSnapshotCapability(
  value: unknown,
  capability: string | undefined,
): void {
  if (
    hasEncodedSkillSnapshots(value) &&
    capability !== SKILL_SNAPSHOT_CAPABILITY
  ) {
    throw new Error(
      "This Skill snapshot requires a client with lossless snapshot support",
    );
  }
}

/** Validate encoded entries before any lenient legacy normalizer can drop fields. */
export function validateEncodedSkillSnapshots(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const data = value as {
    skillFiles?: Record<string, unknown>;
    skillVersions?: Array<{ filesSnapshot?: unknown }>;
  };
  const check = (files: unknown) => {
    if (!Array.isArray(files)) return;
    if (
      files.some(
        (file) =>
          file && typeof file === "object" && file.encoding !== undefined,
      )
    )
      withSkillSnapshotEntrypoint(files, "");
  };
  for (const files of Object.values(data.skillFiles ?? {})) check(files);
  if (Array.isArray(data.skillVersions))
    for (const version of data.skillVersions) check(version?.filesSnapshot);
}

export function skillSnapshotEnvelopeKind<
  T extends "prompthub-backup" | "prompthub-export",
>(kind: T, value: unknown): T | `${T}-v2` {
  return hasEncodedSkillSnapshots(value) ? `${kind}-v2` : kind;
}

const TRANSPORT_PREFIX = "PROMPTHUB-SKILL-SNAPSHOT-2\n";

/** Old raw-JSON readers fail before restoration, rather than losing encoding fields. */
export function serializeSkillSnapshotTransport(
  value: unknown,
  space?: number,
): string {
  validateEncodedSkillSnapshots(value);
  return (
    (hasEncodedSkillSnapshots(value) ? TRANSPORT_PREFIX : "") +
    JSON.stringify(value, null, space)
  );
}

export function parseSkillSnapshotTransport<T = unknown>(text: string): T {
  const raw = text.startsWith(TRANSPORT_PREFIX)
    ? text.slice(TRANSPORT_PREFIX.length)
    : text;
  const value: unknown = JSON.parse(raw);
  validateEncodedSkillSnapshots(value);
  return value as T;
}
