import fs from "node:fs";
import path from "node:path";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";
import { normalizePromptGraphForDatabase } from "../prompt-canonical-catalog";
import type { PromptCanonicalGraphSnapshot } from "../prompt-canonical-export";
import { parsePromptFile, parseVersionFile } from "./codec";
import { validateWorkspaceMetadata } from "./legacy-reader";

interface WorkspaceFiles {
  prompts: string[];
  folders: string[];
}

function collectFiles(directory: string, files: WorkspaceFiles): void {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === ".versions" ||
      entry.name.startsWith(".prompts-staging-") ||
      entry.name.startsWith(".prompts-backup-")
    )
      continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(file, files);
    else if (entry.name === "_folder.json") files.folders.push(file);
    else if (entry.name.endsWith(".md")) files.prompts.push(file);
  }
}

function readPrompt(file: string): Prompt {
  const metadata = validateWorkspaceMetadata(file);
  if (
    metadata.ownerUserId !== undefined &&
    metadata.ownerUserId !== null &&
    typeof metadata.ownerUserId !== "string"
  )
    throw new Error("Historical Web Prompt owner is invalid");
  if (
    metadata.visibility !== undefined &&
    metadata.visibility !== "private" &&
    metadata.visibility !== "shared"
  )
    throw new Error("Historical Web Prompt visibility is invalid");
  if (
    metadata.usageCount !== undefined &&
    (!Number.isSafeInteger(metadata.usageCount) ||
      Number(metadata.usageCount) < 0)
  )
    throw new Error("Historical Web Prompt usageCount is invalid");
  if (
    metadata.lastAiResponse !== undefined &&
    metadata.lastAiResponse !== null &&
    typeof metadata.lastAiResponse !== "string"
  )
    throw new Error("Historical Web Prompt lastAiResponse is invalid");
  return {
    ...parsePromptFile(file),
    ownerUserId:
      typeof metadata.ownerUserId === "string"
        ? metadata.ownerUserId
        : undefined,
    visibility: metadata.visibility === "shared" ? "shared" : "private",
    usageCount:
      typeof metadata.usageCount === "number" ? metadata.usageCount : 0,
    lastAiResponse:
      typeof metadata.lastAiResponse === "string"
        ? metadata.lastAiResponse
        : null,
  };
}

export function readLegacyWebPromptWorkspace(
  promptsDirectory: string,
): PromptCanonicalGraphSnapshot {
  const files: WorkspaceFiles = { prompts: [], folders: [] };
  collectFiles(promptsDirectory, files);
  const prompts = files.prompts.map(readPrompt);
  const folders = files.folders.map((file) => {
    const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("Historical Web folder metadata is invalid");
    // The merged graph validator checks every Folder field before publication.
    return value as Folder;
  });
  const promptVersions: PromptVersion[] = [];
  const versionsRoot = path.join(promptsDirectory, ".versions");
  if (fs.existsSync(versionsRoot))
    for (const owner of fs.readdirSync(versionsRoot, { withFileTypes: true })) {
      if (!owner.isDirectory())
        throw new Error("Historical Web version owner directory is invalid");
      const directory = path.join(versionsRoot, owner.name);
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md"))
          throw new Error("Historical Web version file is invalid");
        const file = path.join(directory, entry.name);
        const metadata = validateWorkspaceMetadata(file, true);
        if (metadata.promptId !== owner.name)
          throw new Error("Historical Web version owner is inconsistent");
        promptVersions.push(parseVersionFile(file, owner.name));
      }
    }
  return normalizePromptGraphForDatabase({
    prompts,
    folders,
    promptVersions,
    promptRelations: [],
    outputFormatItems: [],
  });
}

export function webWorkspacePromptProjection(prompt: Prompt): unknown {
  return {
    ...prompt,
    systemPrompt: prompt.systemPrompt?.trim() || null,
    userPrompt: prompt.userPrompt.trim(),
  };
}
