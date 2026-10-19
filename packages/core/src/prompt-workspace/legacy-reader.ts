import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";
import type { PromptCanonicalGraphSnapshot } from "../prompt-canonical-export";
import { normalizePromptGraphForDatabase } from "../prompt-canonical-catalog";
import {
  collectFolderMetadataFiles,
  collectPromptFiles,
  parseFrontmatter,
  parsePromptFile,
  parseVersionFile,
  promptFrontmatter,
  versionFrontmatter,
} from "./codec";

/** Field presence belongs to the historical import boundary, not normal CRUD. */
export interface LegacyPromptWorkspaceFields {
  prompts: Map<string, ReadonlySet<string>>;
  folders: Map<string, ReadonlySet<string>>;
  versions: Map<string, ReadonlySet<string>>;
}

function assertId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  )
    throw new Error("Historical Prompt workspace id is invalid");
}

export function validateWorkspaceMetadata(
  file: string,
  isVersion = false,
): Record<string, unknown> {
  const { metadata } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  assertId(metadata.id);
  for (const key of ["folderId", "parentId", "promptId"])
    if (metadata[key] !== undefined && metadata[key] !== null)
      assertId(metadata[key]);
  for (const key of ["createdAt", "updatedAt"]) {
    const value = metadata[key];
    if (key === "updatedAt" && isVersion && value === undefined) continue;
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      !Number.isFinite(new Date(value).getTime())
    )
      throw new Error(`Historical Prompt workspace ${key} is invalid`);
  }
  validateMetadataFields(metadata);
  return metadata;
}

function validateMetadataFields(metadata: Record<string, unknown>): void {
  for (const key of [
    "title",
    "description",
    "systemPromptEn",
    "userPromptEn",
    "source",
    "notes",
    "note",
    "aiResponse",
  ])
    if (
      metadata[key] !== undefined &&
      metadata[key] !== null &&
      typeof metadata[key] !== "string"
    )
      throw new Error(`Historical Prompt workspace ${key} is invalid`);
  for (const key of ["variables", "tags", "images", "videos"])
    if (metadata[key] !== undefined && !Array.isArray(metadata[key]))
      throw new Error(`Historical Prompt workspace ${key} is invalid`);
  for (const key of ["isFavorite", "isPinned"])
    if (metadata[key] !== undefined && typeof metadata[key] !== "boolean")
      throw new Error(`Historical Prompt workspace ${key} is invalid`);
  for (const key of ["currentVersion", "version", "order"])
    if (metadata[key] !== undefined && !Number.isSafeInteger(metadata[key]))
      throw new Error(`Historical Prompt workspace ${key} is invalid`);
  if (
    metadata.promptType !== undefined &&
    !["text", "image", "video"].includes(String(metadata.promptType))
  )
    throw new Error("Historical Prompt workspace promptType is invalid");
}

function insertUnique<T extends { id: string }>(
  map: Map<string, T>,
  value: T,
): void {
  assertId(value.id);
  const previous = map.get(value.id);
  if (previous && !isDeepStrictEqual(previous, value))
    throw new Error(
      `Historical Prompt workspace identity conflict: ${value.id}`,
    );
  map.set(value.id, value);
}

function readFolders(
  workspace: string,
  fields?: LegacyPromptWorkspaceFields,
): Folder[] {
  const result = new Map<string, Folder>();
  const list = path.join(workspace, "folders.json");
  const values: unknown[] = [];
  if (fs.existsSync(list)) {
    const parsed: unknown = JSON.parse(fs.readFileSync(list, "utf8"));
    if (!Array.isArray(parsed))
      throw new Error("Historical folders must be an array");
    values.push(...parsed);
  }
  for (const file of collectFolderMetadataFiles(
    path.join(workspace, "prompts"),
  ))
    values.push(JSON.parse(fs.readFileSync(file, "utf8")));
  for (const value of values) {
    if (typeof value !== "object" || value === null || !("id" in value))
      throw new Error("Historical folder is invalid");
    // Historical folder JSON is validated with the complete merged graph before writes.
    const folder = value as Folder;
    fields?.folders.set(folder.id, new Set(Object.keys(value)));
    const normalized = normalizePromptGraphForDatabase({
      prompts: [],
      promptVersions: [],
      folders: [folder],
      promptRelations: [],
      outputFormatItems: [],
    }).folders[0];
    insertUnique(result, normalized);
  }
  return [...result.values()];
}

export function readLegacyPromptWorkspace(
  workspace: string,
  fields?: LegacyPromptWorkspaceFields,
): PromptCanonicalGraphSnapshot {
  const prompts = new Map<string, Prompt>();
  const versions = new Map<string, PromptVersion>();
  const versionDirectories = new Map<string, string>();
  for (const file of collectPromptFiles(path.join(workspace, "prompts"))) {
    const metadata = validateWorkspaceMetadata(file);
    const prompt = parsePromptFile(file);
    fields?.prompts.set(
      prompt.id,
      new Set([...Object.keys(metadata), "systemPrompt", "userPrompt"]),
    );
    insertUnique(prompts, prompt);
    if (path.basename(file) === "prompt.md")
      versionDirectories.set(
        path.join(path.dirname(file), "versions"),
        prompt.id,
      );
  }
  const versionRoot = path.join(workspace, ".versions");
  if (fs.existsSync(versionRoot))
    for (const entry of fs.readdirSync(versionRoot, { withFileTypes: true })) {
      if (!entry.isDirectory())
        throw new Error("Historical version directory is invalid");
      assertId(entry.name);
      versionDirectories.set(path.join(versionRoot, entry.name), entry.name);
    }
  for (const [directory, owner] of versionDirectories) {
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md"))
        throw new Error("Historical version entry is invalid");
      const file = path.join(directory, entry.name);
      const metadata = validateWorkspaceMetadata(file, true);
      if (metadata.promptId !== undefined && metadata.promptId !== owner)
        throw new Error("Historical version owner is inconsistent");
      const version = parseVersionFile(file, owner);
      fields?.versions.set(
        version.id,
        new Set([
          ...Object.keys(metadata),
          "promptId",
          "systemPrompt",
          "userPrompt",
        ]),
      );
      insertUnique(versions, version);
    }
  }
  return normalizePromptGraphForDatabase({
    prompts: [...prompts.values()],
    promptVersions: [...versions.values()],
    folders: readFolders(workspace, fields),
    promptRelations: [],
    outputFormatItems: [],
  });
}

/** Compare only fields represented by the historical Markdown exporter. */
export function workspacePromptProjection(
  prompt: Prompt,
): Record<string, unknown> {
  return {
    ...promptFrontmatter(prompt),
    systemPrompt: prompt.systemPrompt?.trim() || null,
    userPrompt: prompt.userPrompt.trim(),
  };
}

export function workspaceVersionProjection(
  version: PromptVersion,
): Record<string, unknown> {
  return {
    ...versionFrontmatter(version),
    systemPrompt: version.systemPrompt?.trim() || null,
    userPrompt: version.userPrompt.trim(),
  };
}
