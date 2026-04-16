import fs from "fs";
import path from "path";

import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";

import { FolderDB } from "../database/folder";
import { PromptDB } from "../database/prompt";
import { getWorkspaceDir, getPromptsWorkspaceDir } from "../runtime-paths";

const FOLDERS_FILE_NAME = "folders.json";
const PROMPT_FILE_NAME = "prompt.md";
const VERSIONS_DIR_NAME = "versions";
const SYSTEM_MARKER = "<!-- PROMPTHUB:SYSTEM -->";
const USER_MARKER = "<!-- PROMPTHUB:USER -->";

interface FrontmatterResult {
  metadata: Record<string, unknown>;
  body: string;
}

interface PromptWorkspaceSyncResult {
  promptCount: number;
  folderCount: number;
  versionCount: number;
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function slugify(input: string | null | undefined): string {
  const normalized = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "untitled";
}

function padVersion(version: number): string {
  return String(version).padStart(4, "0");
}

function formatFrontmatter(metadata: Record<string, unknown>): string {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

  return `---\n${lines.join("\n")}\n---\n`;
}

function parseFrontmatter(raw: string): FrontmatterResult {
  if (!raw.startsWith("---\n")) {
    return { metadata: {}, body: raw };
  }

  const endIndex = raw.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { metadata: {}, body: raw };
  }

  const metadataBlock = raw.slice(4, endIndex);
  const body = raw.slice(endIndex + 5);
  const metadata: Record<string, unknown> = {};

  for (const line of metadataBlock.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    try {
      metadata[key] = JSON.parse(rawValue);
    } catch {
      metadata[key] = rawValue;
    }
  }

  return { metadata, body };
}

function formatPromptBody(
  systemPrompt: string | null | undefined,
  userPrompt: string,
): string {
  return [
    SYSTEM_MARKER,
    systemPrompt ?? "",
    "",
    USER_MARKER,
    userPrompt,
    "",
  ].join("\n");
}

function parsePromptBody(body: string): {
  systemPrompt: string | null;
  userPrompt: string;
} {
  const systemIndex = body.indexOf(SYSTEM_MARKER);
  const userIndex = body.indexOf(USER_MARKER);

  if (systemIndex === -1 || userIndex === -1 || userIndex < systemIndex) {
    return {
      systemPrompt: null,
      userPrompt: body.trim(),
    };
  }

  const systemPrompt = body
    .slice(systemIndex + SYSTEM_MARKER.length, userIndex)
    .trim();
  const userPrompt = body.slice(userIndex + USER_MARKER.length).trim();

  return {
    systemPrompt: systemPrompt || null,
    userPrompt,
  };
}

function promptFrontmatter(prompt: Prompt): Record<string, unknown> {
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description ?? null,
    promptType: prompt.promptType ?? "text",
    systemPromptEn: prompt.systemPromptEn ?? null,
    userPromptEn: prompt.userPromptEn ?? null,
    variables: prompt.variables ?? [],
    tags: prompt.tags ?? [],
    folderId: prompt.folderId ?? null,
    images: prompt.images ?? [],
    videos: prompt.videos ?? [],
    isFavorite: prompt.isFavorite,
    isPinned: prompt.isPinned,
    currentVersion: prompt.currentVersion ?? prompt.version ?? 1,
    source: prompt.source ?? null,
    notes: prompt.notes ?? null,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

function versionFrontmatter(version: PromptVersion): Record<string, unknown> {
  return {
    id: version.id,
    promptId: version.promptId,
    version: version.version,
    systemPromptEn: version.systemPromptEn ?? null,
    userPromptEn: version.userPromptEn ?? null,
    variables: version.variables ?? [],
    note: version.note ?? null,
    aiResponse: version.aiResponse ?? null,
    createdAt: version.createdAt,
  };
}

function readFoldersFile(workspaceDir: string): Folder[] {
  const foldersFile = path.join(workspaceDir, FOLDERS_FILE_NAME);
  if (!fs.existsSync(foldersFile)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(foldersFile, "utf8")) as Folder[];
  return Array.isArray(parsed) ? parsed : [];
}

function writeFoldersFile(workspaceDir: string, folders: Folder[]): void {
  ensureDir(workspaceDir);
  fs.writeFileSync(
    path.join(workspaceDir, FOLDERS_FILE_NAME),
    JSON.stringify(folders, null, 2),
    "utf8",
  );
}

function buildFolderSegments(
  folderId: string | null | undefined,
  folderMap: Map<string, Folder>,
): string[] {
  const segments: string[] = [];
  const seen = new Set<string>();
  let currentId = folderId ?? null;

  while (currentId) {
    const folder = folderMap.get(currentId);
    if (!folder || seen.has(currentId)) {
      break;
    }

    seen.add(currentId);
    segments.unshift(slugify(folder.name));
    currentId = folder.parentId ?? null;
  }

  return segments;
}

function getPromptDirectory(
  promptsDir: string,
  folderMap: Map<string, Folder>,
  prompt: Prompt,
): string {
  const folderSegments = buildFolderSegments(prompt.folderId ?? null, folderMap);
  return path.join(
    promptsDir,
    ...folderSegments,
    `${slugify(prompt.title)}__${prompt.id}`,
  );
}

function collectPromptFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPromptFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name === PROMPT_FILE_NAME) {
      files.push(absolutePath);
    }
  }

  return files;
}

function toIsoString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function parsePromptFile(filePath: string): Prompt {
  const { metadata, body } = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
  const parsedBody = parsePromptBody(body);
  const now = new Date().toISOString();

  return {
    id: String(metadata.id),
    title: String(metadata.title ?? "Untitled Prompt"),
    description:
      typeof metadata.description === "string" ? metadata.description : null,
    promptType:
      metadata.promptType === "image" || metadata.promptType === "video"
        ? metadata.promptType
        : "text",
    systemPrompt: parsedBody.systemPrompt,
    systemPromptEn:
      typeof metadata.systemPromptEn === "string"
        ? metadata.systemPromptEn
        : null,
    userPrompt: parsedBody.userPrompt,
    userPromptEn:
      typeof metadata.userPromptEn === "string" ? metadata.userPromptEn : null,
    variables: Array.isArray(metadata.variables)
      ? (metadata.variables as Prompt["variables"])
      : [],
    tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [],
    folderId: typeof metadata.folderId === "string" ? metadata.folderId : null,
    images: Array.isArray(metadata.images) ? (metadata.images as string[]) : [],
    videos: Array.isArray(metadata.videos) ? (metadata.videos as string[]) : [],
    isFavorite: metadata.isFavorite === true,
    isPinned: metadata.isPinned === true,
    version:
      typeof metadata.currentVersion === "number" ? metadata.currentVersion : 1,
    currentVersion:
      typeof metadata.currentVersion === "number" ? metadata.currentVersion : 1,
    usageCount: 0,
    source: typeof metadata.source === "string" ? metadata.source : null,
    notes: typeof metadata.notes === "string" ? metadata.notes : null,
    lastAiResponse: null,
    createdAt: toIsoString(metadata.createdAt, now),
    updatedAt: toIsoString(metadata.updatedAt, now),
  };
}

function parseVersionFile(filePath: string, promptId: string): PromptVersion {
  const { metadata, body } = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
  const parsedBody = parsePromptBody(body);

  return {
    id: String(metadata.id),
    promptId,
    version:
      typeof metadata.version === "number"
        ? metadata.version
        : Number.parseInt(path.basename(filePath, ".md"), 10) || 1,
    systemPrompt: parsedBody.systemPrompt,
    systemPromptEn:
      typeof metadata.systemPromptEn === "string"
        ? metadata.systemPromptEn
        : null,
    userPrompt: parsedBody.userPrompt,
    userPromptEn:
      typeof metadata.userPromptEn === "string" ? metadata.userPromptEn : null,
    variables: Array.isArray(metadata.variables)
      ? (metadata.variables as PromptVersion["variables"])
      : [],
    note: typeof metadata.note === "string" ? metadata.note : null,
    aiResponse:
      typeof metadata.aiResponse === "string" ? metadata.aiResponse : null,
    createdAt: toIsoString(metadata.createdAt, new Date().toISOString()),
  };
}

function readPromptVersions(promptDir: string, promptId: string): PromptVersion[] {
  const versionsDir = path.join(promptDir, VERSIONS_DIR_NAME);
  if (!fs.existsSync(versionsDir)) {
    return [];
  }

  return fs
    .readdirSync(versionsDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parseVersionFile(path.join(versionsDir, file), promptId));
}

function workspaceHasPromptData(promptsDir: string, workspaceDir: string): boolean {
  if (collectPromptFiles(promptsDir).length > 0) {
    return true;
  }

  return fs.existsSync(path.join(workspaceDir, FOLDERS_FILE_NAME));
}

export function syncPromptWorkspaceFromDatabase(
  promptDb: PromptDB,
  folderDb: FolderDB,
): PromptWorkspaceSyncResult {
  const workspaceDir = getWorkspaceDir();
  const promptsDir = getPromptsWorkspaceDir();
  const folders = folderDb.getAll();
  const prompts = promptDb.getAll();
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  fs.rmSync(promptsDir, { recursive: true, force: true });
  ensureDir(promptsDir);
  writeFoldersFile(workspaceDir, folders);

  let versionCount = 0;

  for (const prompt of prompts) {
    const promptDir = getPromptDirectory(promptsDir, folderMap, prompt);
    ensureDir(promptDir);

    fs.writeFileSync(
      path.join(promptDir, PROMPT_FILE_NAME),
      `${formatFrontmatter(promptFrontmatter(prompt))}${formatPromptBody(prompt.systemPrompt, prompt.userPrompt)}`,
      "utf8",
    );

    const versions = promptDb.getVersions(prompt.id).sort(
      (left, right) => left.version - right.version,
    );
    if (versions.length > 0) {
      const versionsDir = path.join(promptDir, VERSIONS_DIR_NAME);
      ensureDir(versionsDir);
      for (const version of versions) {
        fs.writeFileSync(
          path.join(versionsDir, `${padVersion(version.version)}.md`),
          `${formatFrontmatter(versionFrontmatter(version))}${formatPromptBody(version.systemPrompt, version.userPrompt)}`,
          "utf8",
        );
      }
      versionCount += versions.length;
    }
  }

  return {
    promptCount: prompts.length,
    folderCount: folders.length,
    versionCount,
  };
}

export function importPromptWorkspaceIntoDatabase(
  promptDb: PromptDB,
  folderDb: FolderDB,
): PromptWorkspaceSyncResult {
  const workspaceDir = getWorkspaceDir();
  const promptsDir = getPromptsWorkspaceDir();
  const folders = readFoldersFile(workspaceDir);
  const promptFiles = collectPromptFiles(promptsDir);

  if (!workspaceHasPromptData(promptsDir, workspaceDir)) {
    return { promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  for (const folder of folders) {
    folderDb.insertFolderDirect(folder);
  }

  let versionCount = 0;
  for (const promptFile of promptFiles) {
    const prompt = parsePromptFile(promptFile);
    promptDb.insertPromptDirect(prompt);

    const promptDir = path.dirname(promptFile);
    const versions = readPromptVersions(promptDir, prompt.id);
    for (const version of versions) {
      promptDb.insertVersionDirect(version);
    }
    versionCount += versions.length;
  }

  return {
    promptCount: promptFiles.length,
    folderCount: folders.length,
    versionCount,
  };
}

export function bootstrapPromptWorkspace(
  promptDb: PromptDB,
  folderDb: FolderDB,
): { imported: boolean; exported: boolean } {
  const workspaceDir = getWorkspaceDir();
  const promptsDir = getPromptsWorkspaceDir();
  const hasDatabasePrompts = promptDb.getAll().length > 0;
  const hasWorkspaceData = workspaceHasPromptData(promptsDir, workspaceDir);

  if (!hasDatabasePrompts && hasWorkspaceData) {
    importPromptWorkspaceIntoDatabase(promptDb, folderDb);
    syncPromptWorkspaceFromDatabase(promptDb, folderDb);
    return { imported: true, exported: true };
  }

  syncPromptWorkspaceFromDatabase(promptDb, folderDb);
  return { imported: false, exported: true };
}
