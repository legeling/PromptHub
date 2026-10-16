import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PromptDB, VersionImportConflictError } from "@prompthub/db";
import { closeDatabase, initDatabase, SkillDB } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-version-import-"));
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function promptFixture() {
  const repository = new PromptDB(initDatabase());
  const prompt = repository.create({
    title: "Version source",
    userPrompt: "Original",
  });
  return { repository, prompt, version: repository.getVersions(prompt.id)[0] };
}

function skillFixture() {
  const repository = new SkillDB(initDatabase());
  const skill = repository.create({
    name: "Version source",
    content: "# Original",
    protocol_type: "skill",
    is_favorite: false,
  });
  const version = repository.createVersion(skill.id, "Package history", [
    { relativePath: "SKILL.md", content: "# Original" },
    { relativePath: "scripts/task.ts", content: "export const value = 1;" },
  ]);
  if (!version) throw new Error("Test Skill version was not persisted");
  return { repository, skill, version };
}

it("accepts an identical Prompt version repeatedly and preserves the stored response across reopen", () => {
  const { repository, prompt, version } = promptFixture();
  repository.insertVersionDirect(version);
  repository.insertVersionDirect({ ...version });
  expect(repository.getVersions(prompt.id)).toEqual([version]);
  closeDatabase();
  expect(new PromptDB(initDatabase()).getVersions(prompt.id)).toEqual([
    version,
  ]);
});

it.each(["body", "identity", "number", "owner"])(
  "rejects conflicting Prompt version %s without changing history",
  (field) => {
    const { repository, prompt, version } = promptFixture();
    const other = repository.create({
      title: "Other",
      userPrompt: "Other body",
    });
    const otherHistory = repository.getVersions(other.id);
    const changed = {
      ...version,
      ...(field === "body" ? { userPrompt: "Unsaved conflict" } : {}),
      ...(field === "identity" ? { id: "different-version-id" } : {}),
      ...(field === "number" ? { version: version.version + 1 } : {}),
      ...(field === "owner" ? { promptId: other.id } : {}),
    };
    expect(() => repository.insertVersionDirect(changed)).toThrow(
      VersionImportConflictError,
    );
    closeDatabase();
    const persisted = new PromptDB(initDatabase());
    expect(persisted.getVersions(prompt.id)).toEqual([version]);
    expect(persisted.getVersions(other.id)).toEqual(otherHistory);
  },
);

it("accepts an identical Skill package snapshot independently of JSON object key order", () => {
  const { repository, skill, version } = skillFixture();
  const reversed = {
    ...version,
    filesSnapshot: version.filesSnapshot?.map(({ relativePath, content }) => ({
      content,
      relativePath,
    })),
  };
  repository.insertVersionDirect(reversed);
  repository.insertVersionDirect(version);
  closeDatabase();
  expect(new SkillDB(initDatabase()).getVersions(skill.id)).toEqual([version]);
});

it.each(["body", "files", "identity", "owner"])(
  "rejects conflicting Skill version %s without changing either history",
  (field) => {
    const { repository, skill, version } = skillFixture();
    const other = repository.create({
      name: "Other",
      protocol_type: "skill",
      is_favorite: false,
    });
    const changed = {
      ...version,
      ...(field === "body" ? { content: "Changed body" } : {}),
      ...(field === "files"
        ? {
            filesSnapshot: [
              { relativePath: "SKILL.md", content: "Changed file" },
            ],
          }
        : {}),
      ...(field === "identity" ? { id: "different-version-id" } : {}),
      ...(field === "owner" ? { skillId: other.id } : {}),
    };
    expect(() => repository.insertVersionDirect(changed)).toThrow(
      VersionImportConflictError,
    );
    closeDatabase();
    const persisted = new SkillDB(initDatabase());
    expect(persisted.getVersions(skill.id)).toEqual([version]);
    expect(persisted.getVersions(other.id)).toEqual([]);
  },
);

it("rolls back an entire version import batch on a late identity conflict", () => {
  const { repository, prompt, version } = promptFixture();
  expect(() =>
    initDatabase().transaction(() => {
      repository.insertVersionDirect({
        ...version,
        id: "new-version",
        version: 2,
        userPrompt: "New history",
      });
      repository.insertVersionDirect({
        ...version,
        userPrompt: "Conflicting history",
      });
    })(),
  ).toThrow(VersionImportConflictError);
  closeDatabase();
  expect(new PromptDB(initDatabase()).getVersions(prompt.id)).toEqual([
    version,
  ]);
});

it("rejects truncated Skill version text without publishing a partial row", () => {
  const { repository, skill, version } = skillFixture();
  expect(() =>
    repository.insertVersionDirect({
      ...version,
      id: "bad-text",
      version: 2,
      content: "before\0after",
    }),
  ).toThrow();
  closeDatabase();
  expect(new SkillDB(initDatabase()).getVersions(skill.id)).toEqual([version]);
});

it("preserves explicitly empty optional text and returns the actual inserted snapshots", () => {
  const prompt = promptFixture();
  const promptInput = {
    ...prompt.version,
    id: "empty-prompt-version",
    version: 2,
    systemPrompt: "",
    note: "",
    aiResponse: "",
  };
  expect(prompt.repository.insertVersionDirect(promptInput)).toEqual(
    promptInput,
  );
  const skill = skillFixture();
  const skillInput = {
    ...skill.version,
    id: "empty-skill-version",
    version: 2,
    content: "",
    note: "",
  };
  expect(skill.repository.insertVersionDirect(skillInput)).toEqual(skillInput);
  closeDatabase();
  expect(
    new PromptDB(initDatabase()).getVersions(prompt.prompt.id),
  ).toContainEqual(promptInput);
  expect(
    new SkillDB(initDatabase()).getVersions(skill.skill.id),
  ).toContainEqual(skillInput);
});

it("imports and repeats a thousand-version transaction with exact identities", () => {
  const { repository, prompt, version } = promptFixture();
  const importedVersionCount = 1000;
  const inputs = Array.from({ length: importedVersionCount }, (_, index) => ({
    ...version,
    id: `bulk-${index}`,
    version: index + 2,
    userPrompt: `History ${index}`,
  }));
  const started = performance.now();
  const importBatch = initDatabase().transaction(() => {
    for (const input of inputs) repository.insertVersionDirect(input);
  });
  importBatch();
  importBatch();
  const stored = repository.getVersions(prompt.id);
  expect(stored).toHaveLength(importedVersionCount + 1);
  expect(stored).toEqual([...inputs].reverse().concat(version));
  console.info("Version import batch measurement", {
    importedVersionCount,
    passes: 2,
    elapsedMs: performance.now() - started,
  });
});
