/**
 * @vitest-environment node
 */
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  getCherryStudioSkillStatus,
  installCherryStudioSkill,
  uninstallCherryStudioSkill,
} from "../../../src/main/services/cherry-studio-skill-platform";

const CHERRY_PLATFORM: SkillPlatform = {
  id: "cherry-studio",
  name: "Cherry Studio",
  icon: "Bot",
  rootDir: {
    darwin: "/unused",
    win32: "/unused",
    linux: "/unused",
  },
  skillsRelativePath: "Data/Skills",
};

interface GlobalSkillRow {
  id: string;
  name: string;
  description: string | null;
  folder_name: string;
  tags: string;
  content_hash: string;
}

let tempRoot: string;

function createCherryStudioSchema(database: DatabaseAdapter.Database): void {
  database.exec(`
    CREATE TABLE agent_global_skill (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      description text,
      folder_name text NOT NULL,
      source text NOT NULL,
      source_url text,
      namespace text,
      author text,
      tags text DEFAULT '[]' NOT NULL,
      content_hash text NOT NULL,
      is_enabled integer DEFAULT false NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE UNIQUE INDEX agent_global_skill_folder_name_unique
      ON agent_global_skill (folder_name);
    CREATE TABLE agent (
      id text PRIMARY KEY NOT NULL,
      type text NOT NULL,
      name text NOT NULL,
      description text DEFAULT '' NOT NULL,
      accessible_paths text DEFAULT '[]' NOT NULL,
      instructions text NOT NULL,
      model text NOT NULL,
      plan_model text,
      small_model text,
      mcps text DEFAULT '[]' NOT NULL,
      allowed_tools text DEFAULT '[]' NOT NULL,
      configuration text DEFAULT '{}' NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      deleted_at integer
    );
    CREATE TABLE agent_skill (
      agent_id text NOT NULL,
      skill_id text NOT NULL,
      is_enabled integer DEFAULT false NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      PRIMARY KEY (agent_id, skill_id)
    );
  `);
}

function createModernCherryStudioSchema(database: DatabaseAdapter.Database): void {
  database.exec(`
    CREATE TABLE skills (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      description text,
      folder_name text NOT NULL,
      source text NOT NULL,
      source_url text,
      namespace text,
      author text,
      tags text,
      content_hash text NOT NULL,
      is_enabled integer DEFAULT true NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE UNIQUE INDEX skills_folder_name_unique ON skills (folder_name);
    CREATE TABLE agents (
      id text PRIMARY KEY NOT NULL,
      type text NOT NULL,
      name text NOT NULL,
      description text,
      accessible_paths text,
      instructions text,
      model text NOT NULL,
      plan_model text,
      small_model text,
      mcps text,
      allowed_tools text,
      configuration text,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      deleted_at text
    );
    CREATE TABLE agent_skills (
      agent_id text NOT NULL,
      skill_id text NOT NULL,
      is_enabled integer DEFAULT false NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      PRIMARY KEY (agent_id, skill_id)
    );
  `);
}

function options() {
  return { overrides: { "cherry-studio": tempRoot } };
}

function dbPath(): string {
  return path.join(tempRoot, "cherrystudio.sqlite");
}

function modernDbPath(): string {
  return path.join(tempRoot, "Data", "agents.db");
}

async function writeSkillPackage(
  folderName: string,
  skillMd: string,
): Promise<string> {
  const sourceDir = path.join(tempRoot, "source", folderName);
  await fs.mkdir(path.join(sourceDir, "references", "nested"), {
    recursive: true,
  });
  await fs.writeFile(path.join(sourceDir, "SKILL.md"), skillMd, "utf-8");
  await fs.writeFile(
    path.join(sourceDir, "references", "nested", "example.txt"),
    "nested asset",
    "utf-8",
  );
  return sourceDir;
}

function readGlobalSkill(folderName: string): GlobalSkillRow | undefined {
  const database = new DatabaseAdapter(dbPath());
  try {
    return database.get(
      `SELECT id, name, description, folder_name, tags, content_hash
       FROM agent_global_skill
       WHERE folder_name = ?`,
      folderName,
    ) as GlobalSkillRow | undefined;
  } finally {
    database.close();
  }
}

function getSqlRow(sql: string, ...params: unknown[]): unknown {
  const database = new DatabaseAdapter(dbPath());
  try {
    return database.get(sql, ...params);
  } finally {
    database.close();
  }
}

describe("cherry-studio-skill-platform", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ph-cherry-skill-"));
    const database = new DatabaseAdapter(dbPath());
    createCherryStudioSchema(database);
    database.close();
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("does not report installed when a skill folder exists without Cherry Studio DB registration", async () => {
    await fs.mkdir(path.join(tempRoot, "Data", "Skills", "writer"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tempRoot, "Data", "Skills", "writer", "SKILL.md"),
      "---\nname: writer\n---\ncontent",
      "utf-8",
    );

    await expect(
      getCherryStudioSkillStatus(CHERRY_PLATFORM, "writer", options()),
    ).resolves.toBe(false);
  });

  it("copies the whole skill package and registers agent_global_skill with safe SQL parameters", async () => {
    const skillMd = [
      "---",
      "name: writer",
      "description: \"CJK 中文 🏳️‍🌈 '; DROP TABLE agent_global_skill; --\"",
      "author: icelemon",
      "tags: [prompt, 安全]",
      "---",
      "Use the nested reference file.",
      "",
    ].join("\n");
    const sourceDir = await writeSkillPackage("writer", skillMd);

    await installCherryStudioSkill(CHERRY_PLATFORM, "writer", sourceDir, options());

    await expect(
      fs.readFile(
        path.join(
          tempRoot,
          "Data",
          "Skills",
          "writer",
          "references",
          "nested",
          "example.txt",
        ),
        "utf-8",
      ),
    ).resolves.toBe("nested asset");

    const row = readGlobalSkill("writer");
    expect(row).toMatchObject({
      name: "writer",
      folder_name: "writer",
    });
    expect(row?.description).toContain("DROP TABLE");
    expect(JSON.parse(row?.tags ?? "[]")).toEqual(["prompt", "安全"]);
    expect(row?.content_hash).toBe(
      crypto.createHash("sha256").update(skillMd).digest("hex"),
    );
    expect(
      getSqlRow(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_global_skill'",
      ),
    ).toBeTruthy();
    await expect(
      getCherryStudioSkillStatus(CHERRY_PLATFORM, "writer", options()),
    ).resolves.toBe(true);
  });

  it("uses the current Cherry Studio Data/agents.db schema when present", async () => {
    await fs.rm(dbPath(), { force: true });
    await fs.mkdir(path.dirname(modernDbPath()), { recursive: true });
    const database = new DatabaseAdapter(modernDbPath());
    createModernCherryStudioSchema(database);
    database.close();
    const sourceDir = await writeSkillPackage(
      "svg",
      "---\nname: svg\ndescription: SVG helper\n---\ncontent",
    );

    await installCherryStudioSkill(CHERRY_PLATFORM, "svg", sourceDir, options());

    const modernDb = new DatabaseAdapter(modernDbPath());
    try {
      expect(
        modernDb.get("SELECT folder_name FROM skills WHERE folder_name = ?", "svg"),
      ).toMatchObject({ folder_name: "svg" });
      expect(
        modernDb.get(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_global_skill'",
        ),
      ).toBeNull();
    } finally {
      modernDb.close();
    }
    await expect(
      fs.access(path.join(tempRoot, "Data", "Skills", "svg", "SKILL.md")),
    ).resolves.toBeUndefined();
    await expect(
      getCherryStudioSkillStatus(CHERRY_PLATFORM, "svg", options()),
    ).resolves.toBe(true);
  });

  it("updates an existing Cherry Studio row in place so agent enablement keeps the same skill id", async () => {
    const initial = await writeSkillPackage(
      "writer-v1",
      "---\nname: writer\n---\nfirst",
    );
    await installCherryStudioSkill(CHERRY_PLATFORM, "writer", initial, options());
    const originalId = readGlobalSkill("writer")?.id;

    const updated = await writeSkillPackage(
      "writer-v2",
      "---\nname: writer\nversion: 2\n---\nsecond",
    );
    await fs.writeFile(
      path.join(updated, "references", "nested", "example.txt"),
      "updated asset",
      "utf-8",
    );

    await installCherryStudioSkill(CHERRY_PLATFORM, "writer", updated, options());

    expect(readGlobalSkill("writer")?.id).toBe(originalId);
    await expect(
      fs.readFile(
        path.join(
          tempRoot,
          "Data",
          "Skills",
          "writer",
          "references",
          "nested",
          "example.txt",
        ),
        "utf-8",
      ),
    ).resolves.toBe("updated asset");
  });

  it("uninstalls the registry row, copied folder, and enabled agent symlink", async () => {
    const sourceDir = await writeSkillPackage(
      "writer",
      "---\nname: writer\n---\ncontent",
    );
    await installCherryStudioSkill(CHERRY_PLATFORM, "writer", sourceDir, options());

    const skillId = readGlobalSkill("writer")?.id;
    const workspace = path.join(tempRoot, "workspace");
    const linkDir = path.join(workspace, ".claude", "skills");
    const linkPath = path.join(linkDir, "writer");
    await fs.mkdir(linkDir, { recursive: true });
    await fs.symlink(path.join(tempRoot, "Data", "Skills", "writer"), linkPath, "dir");

    const now = Date.now();
    const database = new DatabaseAdapter(dbPath());
    database.run(
      `INSERT INTO agent
       (id, type, name, accessible_paths, instructions, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "agent-1",
      "claude-code",
      "Agent 1",
      JSON.stringify([workspace]),
      "",
      "claude",
      now,
      now,
    );
    database.run(
      `INSERT INTO agent_skill
       (agent_id, skill_id, is_enabled, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
      "agent-1",
      skillId,
      now,
      now,
    );
    database.close();

    await uninstallCherryStudioSkill(CHERRY_PLATFORM, "writer", options());

    expect(readGlobalSkill("writer")).toBeFalsy();
    expect(
      getSqlRow("SELECT skill_id FROM agent_skill WHERE skill_id = ?", skillId),
    ).toBeFalsy();
    await expect(
      fs.access(path.join(tempRoot, "Data", "Skills", "writer")),
    ).rejects.toThrow();
    await expect(fs.lstat(linkPath)).rejects.toThrow();
  });
});
