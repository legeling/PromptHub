import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

import type Database from "../database/sqlite";
import { SkillDB } from "../database/skill";
import { PromptDB } from "../database/prompt";
import { FolderDB } from "../database/folder";
import { getSkillsDir } from "../runtime-paths";
import type { CreateSkillParams } from "@prompthub/shared/types";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";

interface E2ESkillFileSeed {
  relativePath: string;
  content: string;
}

interface E2ESkillSeed {
  name: string;
  description?: string;
  content?: string;
  instructions?: string;
  author?: string;
  tags?: string[];
  localRepoName?: string;
  files?: E2ESkillFileSeed[];
}

interface E2ESeedDocument {
  settings?: Record<string, unknown>;
  folders?: Folder[];
  prompts?: Prompt[];
  versions?: PromptVersion[];
  skills?: E2ESkillSeed[];
}

interface E2EStats {
  webdav: {
    testConnection: number;
    ensureDirectory: number;
    upload: number;
    download: number;
    stat: number;
  };
}

const e2eStats: E2EStats = {
  webdav: {
    testConnection: 0,
    ensureDirectory: 0,
    upload: 0,
    download: 0,
    stat: 0,
  },
};

function createEmptyE2EStats(): E2EStats {
  return {
    webdav: {
      testConnection: 0,
      ensureDirectory: 0,
      upload: 0,
      download: 0,
      stat: 0,
    },
  };
}

export function resetE2EStats(): void {
  Object.assign(e2eStats, createEmptyE2EStats());
}

export function getE2EStats(): E2EStats {
  return JSON.parse(JSON.stringify(e2eStats)) as E2EStats;
}

export function getE2EWebDAVMode(
  env: NodeJS.ProcessEnv = process.env,
): "off" | "remote-empty" {
  return env.PROMPTHUB_E2E_WEBDAV_MODE === "remote-empty"
    ? "remote-empty"
    : "off";
}

export function registerE2EIPC(env: NodeJS.ProcessEnv = process.env): void {
  if (!isE2EEnabled(env)) {
    return;
  }

  ipcMain.handle("e2e:getStats", () => getE2EStats());
  ipcMain.handle("e2e:resetStats", () => {
    resetE2EStats();
    return true;
  });
}

export function handleE2EWebDAVRequest(
  action: keyof E2EStats["webdav"],
  fileUrl: string,
): Record<string, unknown> {
  e2eStats.webdav[action] += 1;

  const mode = getE2EWebDAVMode();
  if (mode !== "remote-empty") {
    return { success: false, error: "E2E WebDAV mock disabled" };
  }

  if (action === "stat") {
    return { success: false, notFound: true };
  }

  if (action === "download") {
    return { success: false, notFound: true };
  }

  if (action === "testConnection") {
    return { success: true, message: "E2E WebDAV mock connected" };
  }

  if (action === "ensureDirectory" || action === "upload") {
    return { success: true };
  }

  return {
    success: false,
    error: `Unhandled E2E WebDAV request for ${fileUrl}`,
  };
}

export function isE2EEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PROMPTHUB_E2E === "1";
}

export function shouldUseDevServer(
  appIsPackaged: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isE2EEnabled(env)) {
    return false;
  }
  return env.NODE_ENV === "development" || !appIsPackaged;
}

export function configureE2ETestProfile(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isE2EEnabled(env)) {
    return null;
  }

  const configuredDir = env.PROMPTHUB_E2E_USER_DATA_DIR;
  if (!configuredDir) {
    return null;
  }

  const resolvedDir = path.resolve(configuredDir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  app.setName("PromptHub E2E");
  app.setPath("userData", resolvedDir);
  return resolvedDir;
}

function readSeedDocument(
  env: NodeJS.ProcessEnv = process.env,
): E2ESeedDocument | null {
  const seedPath = env.PROMPTHUB_E2E_SEED_PATH;
  if (!seedPath) {
    return null;
  }

  const resolvedPath = path.resolve(seedPath);
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(raw) as E2ESeedDocument;
}

function writeSeedSettings(
  db: Database.Database,
  settings?: Record<string, unknown>,
): void {
  if (!settings || Object.keys(settings).length === 0) {
    return;
  }

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
  );
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, JSON.stringify(value));
    }
  });

  transaction();
}

function writeSeedPromptData(
  db: Database.Database,
  seed: E2ESeedDocument,
): void {
  const folderDb = new FolderDB(db);
  const promptDb = new PromptDB(db);

  for (const folder of seed.folders ?? []) {
    folderDb.insertFolderDirect(folder);
  }

  for (const prompt of seed.prompts ?? []) {
    promptDb.insertPromptDirect(prompt);
  }

  for (const version of seed.versions ?? []) {
    promptDb.insertVersionDirect(version);
  }
}

function resolveSeedFiles(skill: E2ESkillSeed): E2ESkillFileSeed[] {
  if (Array.isArray(skill.files) && skill.files.length > 0) {
    return skill.files;
  }

  const skillMdContent =
    skill.instructions || skill.content || `# ${skill.name}\n\nE2E seeded skill`;

  return [
    {
      relativePath: "SKILL.md",
      content: skillMdContent,
    },
  ];
}

function writeSeedSkillFiles(skill: E2ESkillSeed, repoDir: string): string {
  const files = resolveSeedFiles(skill);

  for (const file of files) {
    const filePath = path.join(repoDir, file.relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf8");
  }

  const skillMd = files.find(
    (file) => file.relativePath.toLowerCase() === "skill.md",
  );
  return skillMd?.content || files[0]?.content || "";
}

function createSeedSkillInput(skill: E2ESkillSeed, repoDir: string): CreateSkillParams {
  const content = writeSeedSkillFiles(skill, repoDir);

  return {
    name: skill.name,
    description: skill.description || null || undefined,
    instructions: content,
    content,
    protocol_type: "skill",
    author: skill.author || "E2E Seed",
    tags: skill.tags || [],
    is_favorite: false,
    local_repo_path: repoDir,
    versionTrackingEnabled: true,
  };
}

export function applyE2ESeed(
  db: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isE2EEnabled(env)) {
    return;
  }

  const seed = readSeedDocument(env);
  if (!seed) {
    return;
  }

  writeSeedSettings(db, seed.settings);
  writeSeedPromptData(db, seed);

  if (!seed.skills?.length) {
    return;
  }

  const skillDb = new SkillDB(db);
  const skillsRoot = getSkillsDir();
  fs.mkdirSync(skillsRoot, { recursive: true });

  for (const skill of seed.skills) {
    const repoDir = path.join(skillsRoot, skill.localRepoName || skill.name);
    fs.mkdirSync(repoDir, { recursive: true });

    skillDb.create(createSeedSkillInput(skill, repoDir), {
      overwriteExisting: true,
      skipInitialVersion: true,
    });
  }
}
