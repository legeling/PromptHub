import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseAdapter, PromptDB, SCHEMA } from "@prompthub/db";
import { CanonicalSkillDB } from "../../../../packages/core/src/canonical-skill-db";
import { getCanonicalSkillWorkspacePath } from "../../../../packages/core/src/canonical-skill-library";
import { readSkillResourceBundle } from "../../../../packages/core/src/skill-resource-schema";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../../../../packages/core/src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../../../../packages/core/src/canonical-storage-authority";

let database: DatabaseAdapter.Database | undefined;
let root: string | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  database?.close();
  database = undefined;
  resetRuntimePaths();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

it("A10: failure to insert initial history must roll back a base Prompt create", () => {
  database = new DatabaseAdapter(":memory:");
  database.exec(SCHEMA);
  database.pragma("foreign_keys = ON");
  database.exec(
    `CREATE TRIGGER audit_reject_initial_version BEFORE INSERT ON prompt_versions BEGIN SELECT RAISE(ABORT, 'injected version write failure'); END;`,
  );
  const prompts = new PromptDB(database);
  expect(() =>
    prompts.create({ title: "failed create", userPrompt: "body" }),
  ).toThrow("injected version write failure");
  console.log(
    "A10 failed create remaining rows",
    prompts
      .getAll()
      .map((p) => ({ title: p.title, currentVersion: p.currentVersion })),
  );
  expect(prompts.getAll()).toHaveLength(0);
});

it("A11: failed Skill workspace hydration must not disagree with its restored DB row", () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-foundation-audit-"));
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "foundation-audit",
  });
  database = new DatabaseAdapter(":memory:");
  database.exec(SCHEMA);
  database.pragma("foreign_keys = ON");
  const skills = new CanonicalSkillDB(database);
  const source = path.join(root, "incoming");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "SKILL.md"), "# old");
  const created = skills.create({
    name: "audit-skill",
    protocol_type: "skill",
    content: "old",
    is_favorite: false,
    local_repo_path: source,
  });
  const workspace = getCanonicalSkillWorkspacePath(created.id);
  fs.writeFileSync(path.join(workspace, "SKILL.md"), "# new");
  const rename = fs.renameSync.bind(fs);
  let injected = false;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (!injected && String(to) === workspace) {
      injected = true;
      throw new Error("injected workspace rename failure");
    }
    return rename(from, to);
  });
  expect(() => skills.update(created.id, { content: "new" })).toThrow(
    "injected workspace rename failure",
  );
  const dbContent = skills.getById(created.id)?.content;
  const fileContent = readSkillResourceBundle(
    path.join(root, "data", "skills", created.id),
  ).skill.content;
  console.log("A11 after failed update", {
    dbContent,
    canonicalContent: fileContent,
  });
  expect(fileContent).toBe(dbContent);
});
