/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { SkillDB } from "../../../src/main/database/skill";

describe("SkillDB", () => {
  let root: string;
  let database: DatabaseAdapter;
  let db: SkillDB;
  const draft = (name: string, source_id?: string) => ({
    name,
    source_id,
    protocol_type: "skill" as const,
    is_favorite: false,
  });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-skill-db-"));
    configureRuntimePaths({ userDataPath: root });
    database = new DatabaseAdapter(path.join(root, "skills.db"));
    database.exec(SCHEMA);
    db = new SkillDB(database);
  });
  afterEach(() => {
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("rejects duplicate skill creation by default", () => {
    const original = db.create(draft("demo-skill"));
    expect(() => db.create(draft("demo-skill"))).toThrow(
      "Skill already exists: demo-skill",
    );
    expect(db.getAll()).toEqual([original]);
  });
  it("allows overwriteExisting creates during managed restore flows", () => {
    const original = db.create(draft("demo-skill"));
    const restored = db.create(
      { ...draft("demo-skill"), description: "Restored" },
      { overwriteExisting: true },
    );
    expect(restored.id).toBe(original.id);
    expect(db.getById(original.id)?.description).toBe("Restored");
    expect(db.getAll()).toHaveLength(1);
  });
  it("rejects duplicate skill creation by source id even when the name differs", () => {
    const original = db.create(draft("writer-main", "source-writer-main"));
    expect(() => db.create(draft("writer-dev", "source-writer-main"))).toThrow(
      "Skill source already exists: source-writer-main",
    );
    expect(db.getAll()).toEqual([original]);
  });
  it("uses source id for overwriteExisting creates during managed restore flows", () => {
    const original = db.create(draft("writer-main", "source-writer-main"));
    const restored = db.create(draft("writer-dev", "source-writer-main"), {
      overwriteExisting: true,
    });
    expect(restored.id).toBe(original.id);
    expect(db.getById(original.id)?.name).toBe("writer-dev");
    expect(db.getAll()).toHaveLength(1);
  });
  it("rejects renaming a skill to another existing name", () => {
    const original = db.create(draft("alpha-skill"));
    db.create(draft("beta-skill"));
    expect(() => db.update(original.id, { name: "beta-skill" })).toThrow(
      "Skill already exists: beta-skill",
    );
    expect(db.getById(original.id)).toEqual(original);
  });
  it("rejects updating a skill to another existing source id", () => {
    const original = db.create(draft("writer-main", "source-writer-main"));
    db.create(draft("writer-dev", "source-writer-dev"));
    expect(() =>
      db.update(original.id, { source_id: "source-writer-dev" }),
    ).toThrow("Skill source already exists: source-writer-dev");
    expect(db.getById(original.id)).toEqual(original);
  });
  it("persists source metadata through create and update paths", () => {
    const metadata = {
      source_label: "openai/skills",
      source_branch: "main",
      source_directory: "skills/.curated/writer",
      canonical_skill_path: "skills/.curated/writer/SKILL.md",
    };
    const created = db.create({
      ...draft("writer", "source-writer-main"),
      ...metadata,
    });
    expect(db.getById(created.id)).toMatchObject(metadata);
    db.update(created.id, { source_branch: "dev" });
    database.close();
    database = new DatabaseAdapter(path.join(root, "skills.db"));
    db = new SkillDB(database);
    expect(db.getById(created.id)).toMatchObject({
      ...metadata,
      source_branch: "dev",
    });
  });
});
