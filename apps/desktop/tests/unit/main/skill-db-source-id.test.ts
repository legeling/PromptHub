import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Database from "../../../src/main/database/sqlite";
import { SCHEMA } from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";

describe("SkillDB source id uniqueness", () => {
  let tempDir: string;
  let db: Database.Database;
  let skillDb: SkillDB;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-skill-source-id-"),
    );
    configureRuntimePaths({ userDataPath: tempDir });
    db = new Database(path.join(tempDir, "prompthub.db"));
    db.exec(SCHEMA);
    skillDb = new SkillDB(db);
  });

  afterEach(() => {
    db.close();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows same-name skills to coexist when source ids differ", () => {
    const stable = skillDb.create({
      name: "writer",
      source_id: "source-writer-main",
      protocol_type: "skill",
      is_favorite: false,
    });
    const dev = skillDb.create({
      name: "writer",
      source_id: "source-writer-dev",
      protocol_type: "skill",
      is_favorite: false,
    });

    expect(stable.id).not.toBe(dev.id);
    expect(
      skillDb
        .getAll()
        .map((skill) => skill.source_id)
        .sort(),
    ).toEqual(["source-writer-dev", "source-writer-main"]);
  });

  it("rejects a second skill when the source id matches an existing variant", () => {
    skillDb.create({
      name: "writer-stable",
      source_id: "source-writer-main",
      protocol_type: "skill",
      is_favorite: false,
    });

    expect(() =>
      skillDb.create({
        name: "writer-dev",
        source_id: "source-writer-main",
        protocol_type: "skill",
        is_favorite: false,
      }),
    ).toThrow("Skill source already exists: source-writer-main");
  });

  it("persists and reads back source metadata fields", () => {
    const created = skillDb.create({
      name: "writer",
      source_id: "source-writer-main",
      source_label: "openai/skills",
      source_branch: "main",
      source_directory: "skills/.curated/writer",
      canonical_skill_path: "skills/.curated/writer/SKILL.md",
      logical_name: "writer",
      variant_key: "openai-main",
      protocol_type: "skill",
      is_favorite: false,
    });

    const reloaded = skillDb.getById(created.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded).toEqual(
      expect.objectContaining({
        source_label: "openai/skills",
        source_branch: "main",
        source_directory: "skills/.curated/writer",
        canonical_skill_path: "skills/.curated/writer/SKILL.md",
        logical_name: "writer",
        variant_key: "openai-main",
      }),
    );
  });

  it("preserves ownership and visibility across create, update, and direct restore", () => {
    db.prepare(
      "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("user-1", "owner", "hash", 1, 1);
    const created = skillDb.create({
      ownerUserId: "user-1",
      visibility: "shared",
      name: "owned-skill",
      protocol_type: "skill",
      is_favorite: false,
    });
    expect(created).toMatchObject({
      ownerUserId: "user-1",
      visibility: "shared",
    });
    expect(skillDb.update(created.id, { visibility: "private" })).toMatchObject(
      {
        ownerUserId: "user-1",
        visibility: "private",
      },
    );

    skillDb.insertSkillDirect({
      id: "restored-skill",
      ownerUserId: "user-1",
      visibility: "shared",
      name: "restored",
      logical_name: "restored-logical",
      variant_key: "restored-variant",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    });
    expect(skillDb.getById("restored-skill")).toMatchObject({
      ownerUserId: "user-1",
      visibility: "shared",
      logical_name: "restored-logical",
      variant_key: "restored-variant",
    });
  });
});
