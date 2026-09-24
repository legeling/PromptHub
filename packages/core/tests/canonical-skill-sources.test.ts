import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CanonicalSkillDB } from "../src/canonical-skill-db";
import { publishCanonicalSkill } from "../src/canonical-skill-library";
import {
  migrateCanonicalSkillSources,
  readCanonicalSkillSource,
} from "../src/canonical-skill-sources";
import { readSkillResourceBundle } from "../src/skill-resource-schema";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import { writeRuntimeLayoutState } from "../src/runtime-storage-context";

describe("canonical local Skill sources", () => {
  let root: string;
  let source: string;
  let database: DatabaseAdapter.Database;
  let skills: CanonicalSkillDB;
  const bindingPath = (id: string) =>
    path.join(root, "config/devices/skill-sources", `${id}.json`);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-skill-source-"));
    source = path.join(root, "external-source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Source\n");
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "a".repeat(64),
      operationId: "source-test",
    });
    database = new DatabaseAdapter(path.join(root, "data/prompthub.db"));
    database.exec(SCHEMA);
    skills = new CanonicalSkillDB(database);
  });
  afterEach(() => {
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function createSkill() {
    return skills.create({
      name: "source-fixture",
      protocol_type: "skill",
      is_favorite: false,
      content: "# Source\n",
      source_url: source,
      local_repo_path: source,
    });
  }

  it("preserves the device source while keeping the portable bundle free of local paths", () => {
    const skill = createSkill();
    expect(readCanonicalSkillSource(root, skill.id)).toBe(source);
    expect(
      readSkillResourceBundle(path.join(root, "data/skills", skill.id)).skill
        .source_url,
    ).toBeUndefined();
    database
      .prepare("UPDATE skills SET source_url = NULL WHERE id = ?")
      .run(skill.id);
    skills.reconcileCanonicalWorkspaces();
    expect(skills.getById(skill.id)?.source_url).toBe(source);
    skills.update(skill.id, { source_url: "https://example.com/remote" });
    expect(fs.existsSync(bindingPath(skill.id))).toBe(false);
    skills.update(skill.id, { source_url: source });
    skills.delete(skill.id);
    expect(fs.existsSync(bindingPath(skill.id))).toBe(false);
    expect(fs.readFileSync(path.join(source, "SKILL.md"), "utf8")).toBe(
      "# Source\n",
    );
  });

  it("rolls back the local binding and bundle together when publication fails", () => {
    const skill = createSkill();
    const previousBinding = fs.readFileSync(bindingPath(skill.id), "utf8");
    const bundlePath = path.join(root, "data/skills", skill.id);
    const previousBundle = fs.readFileSync(
      path.join(bundlePath, "skill.json"),
      "utf8",
    );
    expect(() =>
      publishCanonicalSkill({
        skill: { ...skill, source_url: path.join(root, "replacement-source") },
        versions: skills.getVersions(skill.id),
        packageSourcePath: skill.local_repo_path,
        injectPublicationFailure(target) {
          if (target === bundlePath) throw new Error("publication stopped");
        },
      }),
    ).toThrow("publication stopped");
    expect(fs.readFileSync(bindingPath(skill.id), "utf8")).toBe(
      previousBinding,
    );
    expect(fs.readFileSync(path.join(bundlePath, "skill.json"), "utf8")).toBe(
      previousBundle,
    );
  });

  it("adopts existing catalog sources once and never resurrects a removed binding", () => {
    const skill = createSkill();
    fs.rmSync(bindingPath(skill.id));
    const databasePath = path.join(root, "data/prompthub.db");
    database.close();
    migrateCanonicalSkillSources(root, databasePath);
    expect(readCanonicalSkillSource(root, skill.id)).toBe(source);
    fs.rmSync(bindingPath(skill.id));
    migrateCanonicalSkillSources(root, databasePath);
    expect(fs.existsSync(bindingPath(skill.id))).toBe(false);
    database = new DatabaseAdapter(databasePath);
  });

  it("rejects malformed or linked records and does not apply another device's paths", () => {
    const skill = createSkill();
    const filePath = bindingPath(skill.id);
    const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
    fs.writeFileSync(
      filePath,
      JSON.stringify({ ...document, deviceId: "device-other" }),
    );
    expect(readCanonicalSkillSource(root, skill.id)).toBeUndefined();
    for (const sourceUrl of ["relative/path", "/bad\0path"]) {
      fs.writeFileSync(filePath, JSON.stringify({ ...document, sourceUrl }));
      expect(() => readCanonicalSkillSource(root, skill.id)).toThrow(
        "binding is invalid",
      );
    }
    fs.rmSync(filePath);
    fs.symlinkSync(path.join(source, "SKILL.md"), filePath);
    expect(() => readCanonicalSkillSource(root, skill.id)).toThrow();
  });
});
