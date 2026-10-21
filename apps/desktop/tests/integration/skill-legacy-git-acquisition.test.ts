/** @vitest-environment node */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { initDatabase, SkillDB } from "../../src/main/database";
import { getOperationsDir } from "../../src/main/runtime-paths";
import { SkillInstaller } from "../../src/main/services/skill-installer";
import * as transport from "../../src/main/services/skill-installer-utils";

let runtime: SkillTestRuntime;
let initialOperations: string[];
const content =
  "---\nname: legacy-writer\ndescription: Legacy package\n---\n# Writer";
const binary = Buffer.from([0, 255, 42]);

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  initialOperations = await fs.readdir(getOperationsDir());
});
afterEach(() => {
  vi.restoreAllMocks();
  runtime.dispose();
});

async function writePackage(
  checkout: string,
  directory: string,
): Promise<void> {
  const selected = path.join(checkout, directory);
  await fs.mkdir(path.join(selected, "assets"), { recursive: true });
  await fs.writeFile(path.join(selected, "SKILL.md"), content);
  await fs.writeFile(path.join(selected, "assets/icon.bin"), binary);
}

// Only remote Git/HTTP transport is substituted; facade, storage and reopen are real.
it.each([
  [
    "https://github.com/example/catalog/tree/topic/skills/writer",
    undefined,
    "skills/writer",
    "topic",
  ],
  [
    "git@example.com:example/catalog.git",
    { branch: "topic", directory: "skills/writer" },
    "skills/writer",
    "topic",
  ],
  ["https://github.com/example/catalog", undefined, "skills/writer", undefined],
  ["https://github.com/example/catalog", undefined, ".", undefined],
] as const)(
  "legacy source %s preserves the selected package and source metadata",
  async (url, options, directory, branch) => {
    const clone = vi
      .spyOn(transport, "gitClone")
      .mockImplementation(async (_url, checkout) => {
        await writePackage(checkout, directory);
        if (branch) await writePackage(checkout, "other");
      });
    const db = new SkillDB(initDatabase());
    const create = vi.spyOn(db, "create");
    const update = vi.spyOn(db, "update");
    const id = await SkillInstaller.installFromSource(url, db, options);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(clone.mock.calls[0]?.slice(2)).toEqual([
      branch,
      options?.directory ?? (url.includes("/tree/") ? directory : undefined),
    ]);
    await runtime.reopen();
    const skill = new SkillDB(initDatabase()).getById(id);
    expect(skill?.source_directory).toBe(directory);
    expect(skill?.source_branch || undefined).toBe(branch);
    expect(skill?.canonical_skill_path).toBe(
      directory === "." ? "SKILL.md" : `${directory}/SKILL.md`,
    );
    expect(
      await fs.readFile(path.join(skill!.local_repo_path!, "assets/icon.bin")),
    ).toEqual(binary);
    expect(await fs.readdir(getOperationsDir())).toEqual(initialOperations);
  },
);

it("legacy Git failure uses the shared archive fallback and cleans staging", async () => {
  vi.spyOn(transport, "gitClone").mockRejectedValue(
    new Error("Git unavailable"),
  );
  const fetchArchive = vi
    .spyOn(SkillInstaller, "fetchRemoteBytes")
    .mockResolvedValue(
      zipSync({
        "catalog-topic/skills/writer/SKILL.md": strToU8(content),
        "catalog-topic/skills/writer/assets/icon.bin": binary,
        "catalog-topic/other/SKILL.md": strToU8("# Other"),
      }),
    );
  const id = await SkillInstaller.installFromSource(
    "https://github.com/example/catalog/tree/topic/skills/writer",
    new SkillDB(initDatabase()),
  );
  expect(fetchArchive).toHaveBeenCalledWith(
    "https://codeload.github.com/example/catalog/zip/topic",
  );
  await runtime.reopen();
  const skill = new SkillDB(initDatabase()).getById(id);
  expect(skill?.source_directory).toBe("skills/writer");
  expect(
    await fs.readFile(path.join(skill!.local_repo_path!, "assets/icon.bin")),
  ).toEqual(binary);
  expect(await fs.readdir(getOperationsDir())).toEqual(initialOperations);
});

it("ambiguous discovery leaves no row or staging package", async () => {
  vi.spyOn(transport, "gitClone").mockImplementation(async (_url, checkout) => {
    await writePackage(checkout, "one");
    await writePackage(checkout, "two");
  });
  const db = new SkillDB(initDatabase());
  await expect(
    SkillInstaller.installFromSource("git@example.com:example/catalog.git", db),
  ).rejects.toThrow(/multiple/i);
  expect(db.getAll()).toHaveLength(0);
  expect(await fs.readdir(getOperationsDir())).toEqual(initialOperations);
});

it("canonical copy failure rolls back the legacy install and permits retry", async () => {
  vi.spyOn(transport, "gitClone").mockImplementation(async (_url, checkout) => {
    await writePackage(checkout, "skills/writer");
  });
  const copy = fsSync.copyFileSync;
  const injection = vi
    .spyOn(fsSync, "copyFileSync")
    .mockImplementation((source, target, flags) => {
      if (String(target).endsWith("assets/icon.bin"))
        throw new Error("fixture publication denied");
      return copy(source, target, flags);
    });
  const db = new SkillDB(initDatabase());
  await expect(
    SkillInstaller.installFromSource("git@example.com:example/catalog.git", db),
  ).rejects.toThrow("fixture publication denied");
  injection.mockRestore();
  await runtime.reopen();
  const reopened = new SkillDB(initDatabase());
  expect(reopened.getAll()).toHaveLength(0);
  expect(await fs.readdir(getOperationsDir())).toEqual(initialOperations);
  const id = await SkillInstaller.installFromSource(
    "git@example.com:example/catalog.git",
    reopened,
  );
  expect(
    await fs.readFile(
      path.join(reopened.getById(id)!.local_repo_path!, "assets/icon.bin"),
    ),
  ).toEqual(binary);
});

it("missing explicit directory never switches to another package or HTTP", async () => {
  vi.spyOn(transport, "gitClone").mockImplementation(async (_url, checkout) => {
    await writePackage(checkout, "other");
  });
  const http = vi.spyOn(SkillInstaller, "fetchRemoteBytes");
  const db = new SkillDB(initDatabase());
  await expect(
    SkillInstaller.installFromSource(
      "https://github.com/example/catalog/tree/topic/missing",
      db,
    ),
  ).rejects.toThrow(/ENOENT/);
  expect(http).not.toHaveBeenCalled();
  expect(db.getAll()).toHaveLength(0);
  expect(await fs.readdir(getOperationsDir())).toEqual(initialOperations);
});
