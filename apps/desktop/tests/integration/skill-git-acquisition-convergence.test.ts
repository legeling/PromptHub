/** @vitest-environment node */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SkillMetadataDB } from "@prompthub/db";
import { installFromGithub as cliInstall } from "@prompthub/core/cli/skill/install";
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { SkillDB, initDatabase } from "../../src/main/database";
import { getOperationsDir, getSkillsDir } from "../../src/main/runtime-paths";
import { SkillInstaller } from "../../src/main/services/skill-installer";
import * as transport from "../../src/main/services/skill-installer-utils";

let runtime: SkillTestRuntime;
const url = "git@example.com:example/catalog.git";
const content = "---\nname: writer\ndescription: fixture\n---\n# Writer\n";
const binary = Buffer.from([0, 255, 1]);

async function packageAt(checkout: string, directory: string): Promise<void> {
  const selected = path.join(checkout, directory);
  await fs.mkdir(path.join(selected, "assets"), { recursive: true });
  await fs.mkdir(path.join(selected, "docs/nested"), { recursive: true });
  await fs.writeFile(path.join(selected, "SKILL.md"), content);
  await fs.writeFile(path.join(selected, "assets/fixture.bin"), binary);
  await fs.writeFile(path.join(selected, "docs/nested/guide.md"), "Guide\n");
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
});
afterEach(() => {
  vi.restoreAllMocks();
  runtime.dispose();
});

function createOriginal() {
  return new SkillDB(initDatabase()).create({
    name: "writer",
    content: "# Old",
    protocol_type: "skill",
    is_favorite: true,
    tags: ["personal"],
    source_url: url,
  });
}

function expectPackage(repoPath: string): void {
  expect(fileInventory(repoPath)).toEqual({
    "SKILL.md": Buffer.from(content).toString("base64"),
    "assets/fixture.bin": binary.toString("base64"),
    "docs/nested/guide.md": Buffer.from("Guide\n").toString("base64"),
  });
}

async function expectCleanOperations(): Promise<void> {
  const entries = await fs.readdir(getOperationsDir(), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "skill-package-lifecycle")
      expect(
        await fs.readdir(path.join(getOperationsDir(), entry.name)),
      ).toEqual([]);
    else expect(entry.name).not.toMatch(/^skill-(git|import)-/);
  }
}

// Git/HTTP and Electron message transport are replaced; publication, SQL,
// history, filesystem and restart recovery execute their production paths.
it.each(["git", "zip"] as const)(
  "legacy %s save publishes once to canonical storage and survives reopen",
  async (kind) => {
    const original = createOriginal();
    const clone = vi
      .spyOn(transport, "gitClone")
      .mockImplementation(async (_url, dest) =>
        packageAt(dest, "skills/writer"),
      );
    vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(
      zipSync({
        "SKILL.md": strToU8(content),
        "assets/fixture.bin": binary,
        "docs/nested/guide.md": strToU8("Guide\n"),
      }),
    );
    const copies = vi.spyOn(fsSync, "copyFileSync");
    const result =
      kind === "git"
        ? await skillApi.saveRemoteGitToRepo(original.id, {
            repoUrl: url,
            branch: "topic",
          })
        : await skillApi.saveRemoteZipToRepo(original.id, {
            zipUrl: "https://example.com/writer.zip",
          });
    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error("Expected saved package");
    const saved = new SkillDB(initDatabase()).getById(original.id)!;
    expect(result.repoPath).toBe(saved.local_repo_path);
    expect(
      fsSync.existsSync(path.join(getSkillsDir(), original.id, "repo")),
    ).toBe(false);
    expect(saved.tags).toEqual(["personal"]);
    expect(saved.is_favorite).toBe(true);
    expectPackage(result.repoPath);
    expect(
      copies.mock.calls.filter(([src]) => String(src).endsWith("fixture.bin")),
    ).toHaveLength(1);
    if (kind === "git") {
      expect(clone).toHaveBeenCalledTimes(1);
      expect(saved.source_directory).toBe("skills/writer");
      expect(saved.source_branch).toBe("topic");
      expect(saved.canonical_skill_path).toBe("skills/writer/SKILL.md");
    }
    await runtime.reopen();
    const reopened = new SkillDB(initDatabase()).getById(original.id)!;
    expect(reopened.local_repo_path).toBe(result.repoPath);
    expect(reopened.source_directory).toBe(saved.source_directory);
    expectPackage(reopened.local_repo_path!);
    if (kind === "git") {
      clone.mockImplementation(async (_url, dest) => {
        await packageAt(dest, "skills/writer");
        await packageAt(dest, "skills/another-writer");
      });
      const again = await skillApi.saveRemoteGitToRepo(original.id, {
        repoUrl: url,
      });
      expect(again).toEqual({ status: "saved", repoPath: result.repoPath });
      expect(clone.mock.calls[1]?.slice(2)).toEqual(["topic", "skills/writer"]);
    }
    await expectCleanOperations();
  },
);

it.each(["git", "zip"] as const)(
  "legacy %s save rolls back files and metadata after SQL failure and permits retry",
  async (kind) => {
    const original = createOriginal();
    const before = fileInventory(getSkillsDir());
    const versions = new SkillDB(initDatabase()).getVersions(original.id);
    vi.spyOn(transport, "gitClone").mockImplementation(async (_url, dest) =>
      packageAt(dest, "skills/writer"),
    );
    vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(
      zipSync({
        "SKILL.md": strToU8(content),
        "assets/fixture.bin": binary,
        "docs/nested/guide.md": strToU8("Guide\n"),
      }),
    );
    const save = () =>
      kind === "git"
        ? skillApi.saveRemoteGitToRepo(original.id, { repoUrl: url })
        : skillApi.saveRemoteZipToRepo(original.id, {
            zipUrl: "https://example.com/writer.zip",
          });
    const injection = vi
      .spyOn(SkillMetadataDB.prototype, "update")
      .mockImplementation(() => {
        throw new Error("fixture SQL finalize denied");
      });
    await expect(save()).rejects.toThrow("fixture SQL finalize denied");
    injection.mockRestore();
    expect(fileInventory(getSkillsDir())).toEqual(before);
    expect(new SkillDB(initDatabase()).getById(original.id)).toEqual(original);
    expect(new SkillDB(initDatabase()).getVersions(original.id)).toEqual(
      versions,
    );
    await runtime.reopen();
    expect(fileInventory(getSkillsDir())).toEqual(before);
    const result = await save();
    if (result.status !== "saved") throw new Error("Expected saved package");
    expectPackage(result.repoPath);
    await expectCleanOperations();
  },
);

it("legacy install accepts separate packages from the same repository", async () => {
  vi.spyOn(transport, "gitClone").mockImplementation(async (_url, dest) => {
    await packageAt(dest, "skills/writer");
    await packageAt(dest, "skills/reviewer");
  });
  const db = new SkillDB(initDatabase());
  const first = await SkillInstaller.installFromSource(url, db, {
    directory: "skills/writer",
  });
  const second = await SkillInstaller.installFromSource(url, db, {
    directory: "skills/reviewer",
    name: "reviewer",
  });
  expect(first).not.toBe(second);
  await runtime.reopen();
  const reopened = new SkillDB(initDatabase());
  expect(reopened.getById(second)?.name).toBe("reviewer");
  expect(reopened.getById(first)?.source_directory).toBe("skills/writer");
  expect(reopened.getById(second)?.source_directory).toBe("skills/reviewer");
  expectPackage(reopened.getById(first)!.local_repo_path!);
  expectPackage(reopened.getById(second)!.local_repo_path!);
  await expectCleanOperations();
});

it("unknown root-plus-nested selection is rejected consistently without publication", async () => {
  const clone = async (_url: string, dest: string): Promise<void> => {
    await packageAt(dest, ".");
    await packageAt(dest, "skills/nested");
  };
  vi.spyOn(transport, "gitClone").mockImplementation(clone);
  const db = new SkillDB(initDatabase());
  await expect(SkillInstaller.installFromSource(url, db)).rejects.toThrow(
    /multiple/i,
  );
  await expect(cliInstall(url, db, clone, {})).rejects.toThrow(/multiple/i);
  expect(db.getAll()).toEqual([]);
  await expectCleanOperations();
});

it.each(["cli", "desktop", "legacy"] as const)(
  "%s Git installation skips links without changing their targets or copying twice",
  async (entry) => {
    const external = path.join(runtime.root, "external");
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "keep.txt"), "untouched");
    const clone = async (_url: string, dest: string): Promise<void> => {
      await packageAt(dest, "skills/writer");
      const selected = path.join(dest, "skills/writer");
      await fs.symlink("assets/fixture.bin", path.join(selected, "alias.bin"));
      await fs.symlink("missing", path.join(selected, "broken"));
      await fs.symlink(external, path.join(selected, "outside"), "dir");
    };
    vi.spyOn(transport, "gitClone").mockImplementation(clone);
    const copies = vi.spyOn(fsSync, "copyFileSync");
    const intermediateCopy = vi.spyOn(fs, "cp");
    const db = new SkillDB(initDatabase());
    let id: string;
    if (entry === "cli")
      id = await cliInstall(url, db, clone, { directory: "skills/writer" });
    else if (entry === "legacy")
      id = await SkillInstaller.installFromSource(url, db, {
        directory: "skills/writer",
      });
    else {
      const result = await skillApi.runPackageOperation({
        operation: "install",
        content: "",
        registrySkill: {
          slug: "writer",
          name: "writer",
          description: "fixture",
          author: "fixture",
          category: "general",
          tags: [],
          version: "1.0.0",
          content: "",
          source_url: url,
        },
        source: {
          kind: "remote-git",
          repoUrl: url,
          directory: "skills/writer",
        },
      });
      expect(result.status).toBe("completed");
      if (result.status !== "completed")
        throw new Error(JSON.stringify(result));
      id = result.skill.id;
    }
    expect(
      copies.mock.calls.filter(([src]) => String(src).endsWith("fixture.bin")),
    ).toHaveLength(1);
    expect(intermediateCopy).not.toHaveBeenCalled();
    await runtime.reopen();
    expectPackage(new SkillDB(initDatabase()).getById(id)!.local_repo_path!);
    expect(await fs.readFile(path.join(external, "keep.txt"), "utf8")).toBe(
      "untouched",
    );
    await expectCleanOperations();
  },
);
