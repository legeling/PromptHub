import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { CanonicalSkillDB } from "../src/canonical-skill-db";
import { getCanonicalSkillWorkspacePath } from "../src/canonical-skill-library";
import {
  CanonicalPromptDB,
  publishCanonicalPromptGraph,
} from "../src/canonical-prompt-graph-db";
import { readPromptCanonicalGraph } from "../src/prompt-canonical-import";
import { readSkillResourceBundle } from "../src/skill-resource-schema";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import { assertCanonicalPromptCatalogCurrent } from "../src/canonical-prompt-graph-db";

let root: string;
let db: DatabaseAdapter.Database;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-command-outcome-"));
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "outcome-test",
  });
  db = new DatabaseAdapter(":memory:");
  db.exec(SCHEMA);
  db.pragma("foreign_keys = ON");
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("rejects canonical commands inside an unrelated raw transaction before writing", () => {
  publishCanonicalPromptGraph(db);
  expect(() =>
    db.transaction(() =>
      new CanonicalPromptDB(db).create({
        title: "invalid outer transaction",
        userPrompt: "body",
      }),
    )(),
  ).toThrow(/command boundary/);
  expect(db.all("SELECT id FROM prompts")).toEqual([]);
  expect(
    readPromptCanonicalGraph(path.join(root, "data")).snapshot.prompts,
  ).toEqual([]);
});

it("blocks an old catalog from overwriting a newer canonical graph", () => {
  const prompts = new CanonicalPromptDB(db);
  publishCanonicalPromptGraph(db);
  const created = prompts.create({
    title: "committed",
    userPrompt: "new content",
  });
  db.prepare("UPDATE prompts SET user_prompt = ? WHERE id = ?").run(
    "stale catalog",
    created.id,
  );
  expect(() => assertCanonicalPromptCatalogCurrent(db)).toThrow(
    /catalog.*recovery/,
  );
  expect(() => prompts.update(created.id, { title: "overwrite" })).toThrow(
    /catalog.*recovery/,
  );
  expect(
    readPromptCanonicalGraph(path.join(root, "data")).snapshot.prompts[0]
      .userPrompt,
  ).toBe("new content");
});

it("keeps the new Skill in both stores when committed workspace hydration fails", () => {
  const skills = new CanonicalSkillDB(db);
  const source = path.join(root, "incoming");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "SKILL.md"), "# old");
  const created = skills.create({
    name: "outcome-skill",
    protocol_type: "skill",
    content: "old",
    is_favorite: false,
    local_repo_path: source,
  });
  const workspace = getCanonicalSkillWorkspacePath(created.id);
  fs.writeFileSync(path.join(workspace, "SKILL.md"), "# new");
  const rename = fs.renameSync.bind(fs);
  let failed = false;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (!failed && String(to) === workspace) {
      failed = true;
      throw new Error("workspace rename failed");
    }
    return rename(from, to);
  });
  expect(() => skills.update(created.id, { content: "new" })).toThrow(
    /committed/i,
  );
  expect(skills.getById(created.id)?.content).toBe("new");
  expect(
    readSkillResourceBundle(path.join(root, "data", "skills", created.id)).skill
      .content,
  ).toBe("new");
  skills.reconcileCanonicalWorkspaces();
  expect(fs.readFileSync(path.join(workspace, "SKILL.md"), "utf8")).toBe(
    "# new",
  );
});
