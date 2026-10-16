import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SkillDB } from "@prompthub/db";
import type { Skill, SkillVersion } from "@prompthub/shared/types";
import { migrateSkillSqliteV1 } from "../src/migrations/skill-sqlite-v1";
import { materializeSkillResourceBundle } from "../src/skill-resource-schema";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
let databasePath: string;
let database: DatabaseAdapter;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-source-collision-"));
  configureRuntimePaths({ userDataPath: root });
  databasePath = path.join(root, "database.sqlite");
  database = new DatabaseAdapter(databasePath);
  database.exec(SCHEMA);
  database.exec(
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
});
afterEach(() => {
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function variants(): Skill[] {
  const repository = new SkillDB(database);
  const created = repository.create({
    name: "writer",
    source_id: "shared-source",
    content: "Original",
    protocol_type: "skill",
    is_favorite: true,
  });
  const version = repository.createVersion(created.id, "Original history")!;
  const original = repository.getById(created.id)!;
  const skills = [
    original,
    ...["variant-a", "variant-b"].map((id) => ({
      ...original,
      id,
      name: id,
      content: id,
      instructions: id,
    })),
  ];
  for (const skill of skills) writeVariant(skill, version);
  // The historical bundle owns the retained version identity in this fixture.
  database.run("DELETE FROM skill_versions WHERE skill_id = ?", original.id);
  return skills;
}

function writeVariant(skill: Skill, version: SkillVersion): void {
  const source = path.join(root, "incoming", skill.id);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "SKILL.md"), skill.content!);
  fs.writeFileSync(path.join(source, "binary.dat"), Buffer.from([0, 255, 128]));
  materializeSkillResourceBundle({
    bundlePath: path.join(root, "data", "skills", skill.id),
    skill,
    versions: [
      {
        ...version,
        id: `${skill.id}-history`,
        skillId: skill.id,
        content: skill.content,
        filesSnapshot: [{ relativePath: "SKILL.md", content: skill.content! }],
      },
    ],
    packageFiles: ["SKILL.md", "binary.dat"].map((name) => ({
      path: name,
      sourcePath: path.join(source, name),
    })),
  });
}

function migrate(injectFailure?: (target: string) => void): void {
  migrateSkillSqliteV1(database, {
    rootPath: root,
    databasePath,
    injectFailure,
  });
}

function assertPreserved(skills: Skill[]): void {
  const repository = new SkillDB(database);
  expect(repository.getAll()).toHaveLength(skills.length);
  for (const skill of skills) {
    const stored = repository.getById(skill.id)!;
    expect(stored).toMatchObject({
      id: skill.id,
      name: skill.name,
      content: skill.content,
      is_favorite: true,
    });
    expect(repository.getVersions(skill.id)).toMatchObject([
      { id: `${skill.id}-history`, content: skill.content },
    ]);
    expect(
      fs.readFileSync(path.join(stored.local_repo_path!, "binary.dat")),
    ).toEqual(Buffer.from([0, 255, 128]));
  }
}

it("preserves every historical identity and keeps only the existing SQL source owner bound across two reopens", () => {
  const skills = variants();
  for (let start = 0; start < 3; start += 1) {
    migrate();
    assertPreserved(skills);
    const repository = new SkillDB(database);
    expect(repository.getById(skills[0].id)?.source_id).toBe("shared-source");
    for (const skill of skills.slice(1))
      expect(repository.getById(skill.id)).toMatchObject({
        source_id: undefined,
        source_binding_state: "detached",
      });
    database.close();
    database = new DatabaseAdapter(databasePath);
  }
  for (const skill of skills) {
    const recovery = path.join(root, "recovery", "skill-sqlite-v1", skill.id);
    const saved = path.join(
      recovery,
      fs.readdirSync(recovery)[0],
      "bundle",
      "skill.json",
    );
    expect(JSON.parse(fs.readFileSync(saved, "utf8")).skill.source_id).toBe(
      "shared-source",
    );
  }
});

it("detaches ambiguous historical bindings without selecting an arbitrary owner when SQL has none", () => {
  const skills = variants();
  database.run("DELETE FROM skills WHERE id = ?", skills[0].id);
  migrate();
  assertPreserved(skills);
  expect(
    new SkillDB(database)
      .getAll()
      .every(
        (skill) =>
          !skill.source_id && skill.source_binding_state === "detached",
      ),
  ).toBe(true);
});

it("restores all original bundles and SQL when source-collision adoption fails, then permits retry", () => {
  const skills = variants();
  const before = skills.map((skill) =>
    fs.readFileSync(path.join(root, "data", "skills", skill.id, "skill.json")),
  );
  expect(() =>
    migrate((target) => {
      if (target === path.join(root, "data", "skills", "variant-b"))
        throw new Error("injected publication failure");
    }),
  ).toThrow("injected publication failure");
  expect(new SkillDB(database).getAll()).toHaveLength(1);
  expect(
    skills.map((skill) =>
      fs.readFileSync(
        path.join(root, "data", "skills", skill.id, "skill.json"),
      ),
    ),
  ).toEqual(before);
  migrate();
  assertPreserved(skills);
});
