/** @vitest-environment node */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type {
  RegistrySkill,
  Skill,
  SkillPackageOperationRequest,
} from "@prompthub/shared/types";
import {
  createSkillTestRuntime,
  fileInventory,
  invokeSkillIPC,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";

const initialContent =
  "---\nname: functional-package\ndescription: Full package fixture\nversion: 1.0.0\n---\n\n# First version\n";
const binary = Buffer.from([0, 255, 137, 80, 78, 71, 13, 10, 128]);

function writeFixture(source: string): void {
  for (const directory of ["docs/nested", "assets", ".git", ".prompthub"])
    fs.mkdirSync(path.join(source, directory), { recursive: true });
  fs.writeFileSync(path.join(source, "SKILL.md"), initialContent);
  fs.writeFileSync(
    path.join(source, "docs/nested/reference.txt"),
    "Reference v1\n",
  );
  fs.writeFileSync(path.join(source, "assets/picture.bin"), binary);
  fs.writeFileSync(
    path.join(source, ".git/config"),
    "fixture internal metadata",
  );
  fs.writeFileSync(path.join(source, ".prompthub/private.json"), "{}");
}

function packageRequest(
  runtime: SkillTestRuntime,
): SkillPackageOperationRequest {
  const registrySkill: RegistrySkill = {
    slug: "functional-package",
    name: "functional-package",
    description: "Full package fixture",
    category: "general",
    author: "Fixture",
    source_id: "functional-local-source",
    source_url: runtime.source,
    tags: [],
    version: "1.0.0",
    content: initialContent,
  };
  return {
    operation: "install",
    registrySkill,
    content: initialContent,
    source: { kind: "local-directory", directory: runtime.source },
  };
}

async function installedSkill(runtime: SkillTestRuntime): Promise<Skill> {
  const result = await skillApi.runPackageOperation(packageRequest(runtime));
  expect(result.status, JSON.stringify(result)).toBe("completed");
  if (result.status !== "completed")
    throw new Error("Package installation failed");
  return result.skill;
}

function packagePath(runtime: SkillTestRuntime, id: string): string {
  return path.join(runtime.profile, "data/skills", encodeURIComponent(id));
}

describe("Skill public functional workflows (real services and persistent storage)", () => {
  let runtime: SkillTestRuntime;
  beforeEach(async () => {
    runtime = await createSkillTestRuntime();
    writeFixture(runtime.source);
  });
  afterEach(() => runtime?.dispose());

  it("creates, edits metadata and files, versions, reopens and deletes a manual Skill", async () => {
    const created: Skill = await skillApi.create({
      name: "manual-functional",
      description: "Initial description",
      instructions: "# Manual instructions\n",
      protocol_type: "skill",
      is_favorite: false,
    });
    expect(created.id).toBeTruthy();
    const edited: Skill = await skillApi.update(created.id, {
      description: "Edited description",
      author: "Functional author",
    });
    await skillApi.writeLocalFile(created.id, "docs/note.txt", "Persist me\n");
    await skillApi.versionCreate(created.id, "Functional snapshot");
    expect(edited.description).toBe("Edited description");
    expect(
      fs.readFileSync(path.join(edited.local_repo_path!, "SKILL.md"), "utf8"),
    ).toContain("description: Edited description");
    await runtime.reopen();
    expect(await skillApi.get(created.id)).toMatchObject({
      name: "manual-functional",
      description: "Edited description",
      author: "Functional author",
    });
    expect(await skillApi.readLocalFiles(created.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/note.txt",
          content: "Persist me\n",
        }),
      ]),
    );
    expect(await skillApi.versionGetAll(created.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ note: "Functional snapshot" }),
      ]),
    );
    expect(await skillApi.delete(created.id)).toBe(true);
    expect(fs.existsSync(packagePath(runtime, created.id))).toBe(false);
    expect(fs.existsSync(edited.local_repo_path!)).toBe(false);
    await runtime.reopen();
    expect(await skillApi.getAll()).toEqual([]);
    expect(await skillApi.versionGetAll(created.id)).toEqual([]);
  });

  it("clears instructions through update while preserving the package and previous version", async () => {
    const created: Skill = await skillApi.create({
      name: "empty-body",
      instructions: "# Content to clear\n",
      protocol_type: "skill",
      is_favorite: false,
    });
    await skillApi.writeLocalFile(
      created.id,
      "docs/keep.txt",
      "Keep this file\n",
    );

    const updated: Skill = await skillApi.update(created.id, {
      instructions: "",
      content: "",
    });
    const entryPath = path.join(
      packagePath(runtime, created.id),
      "files/SKILL.md",
    );
    const entry = fs.readFileSync(entryPath, "utf8");
    expect(entry).toMatch(/^---\r?\n[\s\S]*?\r?\n---\s*$/);
    expect(entry).toContain("name: empty-body");
    expect(entry).not.toContain("Content to clear");
    expect(updated.instructions).toBe(entry);
    expect(
      fs.readFileSync(path.join(updated.local_repo_path!, "SKILL.md"), "utf8"),
    ).toBe(entry);

    await runtime.reopen();
    expect(await skillApi.get(created.id)).toMatchObject({
      instructions: entry,
      content: entry,
    });
    expect(fs.readFileSync(entryPath, "utf8")).toBe(entry);
    expect(await skillApi.readLocalFiles(created.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/keep.txt",
          content: "Keep this file\n",
        }),
      ]),
    );
    expect(await skillApi.versionGetAll(created.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("Content to clear"),
        }),
      ]),
    );
  });

  it("imports a full directory, distributes copy and symlink, renames, updates and removes it", async () => {
    const sourceBefore = fileInventory(runtime.source);
    const installed = await installedSkill(runtime);
    const filesRoot = path.join(packagePath(runtime, installed.id), "files");
    const expectedInventory = {
      "SKILL.md": Buffer.from(initialContent).toString("base64"),
      "docs/nested/reference.txt":
        Buffer.from("Reference v1\n").toString("base64"),
      "assets/picture.bin": binary.toString("base64"),
    };
    expect(fileInventory(filesRoot)).toEqual(expectedInventory);
    const workspaceInventory = fileInventory(installed.local_repo_path!);
    const marker = workspaceInventory[".canonical-bundle-hash"];
    expect(Buffer.from(marker, "base64").toString("utf8")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(workspaceInventory).toEqual({
      ...expectedInventory,
      ".canonical-bundle-hash": marker,
    });
    await skillApi.installMd(installed.id, initialContent, "claude");
    await skillApi.installMdSymlink(installed.id, initialContent, "codex");
    const copyPath = path.join(
      runtime.platformRoot("claude"),
      "skills",
      installed.name,
    );
    const linkPath = path.join(
      runtime.platformRoot("codex"),
      "skills",
      installed.name,
    );
    expect(fileInventory(copyPath)).toEqual(expectedInventory);
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(linkPath)).toBe(
      fs.realpathSync(installed.local_repo_path!),
    );
    expect(
      await skillApi.getMdInstallStatusDetails(installed.id),
    ).toMatchObject({
      claude: { installed: true, mode: "copy" },
      codex: { installed: true, mode: "symlink" },
    });
    const renamed: Skill = await skillApi.update(installed.id, {
      name: "renamed-package",
    });
    const newCopyPath = path.join(path.dirname(copyPath), renamed.name);
    const newLinkPath = path.join(path.dirname(linkPath), renamed.name);
    expect(fs.existsSync(copyPath)).toBe(false);
    expect(fs.existsSync(linkPath)).toBe(false);
    expect(
      fs.readFileSync(path.join(newCopyPath, "assets/picture.bin")),
    ).toEqual(binary);
    expect(fs.realpathSync(newLinkPath)).toBe(
      fs.realpathSync(renamed.local_repo_path!),
    );
    await skillApi.uninstallMd(installed.id, "claude");
    await skillApi.uninstallMd(installed.id, "codex");
    expect(fs.existsSync(newCopyPath)).toBe(false);
    expect(fs.existsSync(newLinkPath)).toBe(false);
    expect(fileInventory(runtime.source)).toEqual(sourceBefore);

    const nextContent = initialContent.replace(
      "First version",
      "Second version",
    );
    fs.writeFileSync(path.join(runtime.source, "SKILL.md"), nextContent);
    fs.writeFileSync(
      path.join(runtime.source, "docs/nested/reference.txt"),
      "Reference v2\n",
    );
    fs.writeFileSync(
      path.join(runtime.source, "docs/new.txt"),
      "New package file\n",
    );
    const request = packageRequest(runtime);
    const updated = await skillApi.runPackageOperation({
      ...request,
      operation: "update",
      skillId: installed.id,
      content: nextContent,
      registrySkill: {
        ...request.registrySkill,
        content: nextContent,
        version: "2.0.0",
      },
    });
    expect(updated.status, JSON.stringify(updated)).toBe("completed");
    await runtime.reopen();
    const reopened: Skill = await skillApi.get(installed.id);
    expect(
      fs.readFileSync(
        path.join(reopened.local_repo_path!, "docs/new.txt"),
        "utf8",
      ),
    ).toBe("New package file\n");
    expect(fs.readFileSync(path.join(filesRoot, "assets/picture.bin"))).toEqual(
      binary,
    );
    expect(await skillApi.versionGetAll(installed.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("First version"),
        }),
      ]),
    );
    await skillApi.installMdSymlink(
      installed.id,
      reopened.content ?? "",
      "codex",
    );
    const updatedSource = fileInventory(runtime.source);
    expect(await skillApi.delete(installed.id)).toBe(true);
    expect(
      fs.existsSync(
        path.join(runtime.platformRoot("codex"), "skills", reopened.name),
      ),
    ).toBe(false);
    expect(fs.existsSync(filesRoot)).toBe(false);
    expect(fileInventory(runtime.source)).toEqual(updatedSource);
    await runtime.reopen();
    expect(await skillApi.getAll()).toEqual([]);
  });

  describe("black-box write validation", () => {
    const cases: {
      name: string;
      channel: string;
      args: (context: SkillTestRuntime, id: string) => unknown[];
      error: RegExp;
    }[] = [
      {
        name: "rejects a null create payload",
        channel: IPC_CHANNELS.SKILL_CREATE,
        args: () => [null],
        error: /requires a non-empty name/,
      },
      {
        name: "rejects a traversal name",
        channel: IPC_CHANNELS.SKILL_CREATE,
        args: () => [{ name: "../escape", protocol_type: "skill" }],
        error: /Skill name must contain/,
      },
      {
        name: "rejects a numeric description",
        channel: IPC_CHANNELS.SKILL_UPDATE,
        args: (_context, id) => [id, { description: 123 }],
        error: /description must be a string/,
      },
      {
        name: "rejects a null byte in a name",
        channel: IPC_CHANNELS.SKILL_UPDATE,
        args: (_context, id) => [id, { name: "bad\0name" }],
        error: /Skill name must contain/,
      },
      {
        name: "rejects relocating a package through metadata update",
        channel: IPC_CHANNELS.SKILL_UPDATE,
        args: (context, id) => [id, { local_repo_path: context.source }],
        error: /relocation must use the package lifecycle/,
      },
      {
        name: "rejects a string deletion flag",
        channel: IPC_CHANNELS.SKILL_DELETE,
        args: (_context, id) => [id, { removeCopyInstallations: "yes" }],
        error: /removeCopyInstallations must be a boolean/,
      },
      ...[
        { name: "parent traversal", relativePath: () => "../escape.txt" },
        {
          name: "absolute native path",
          relativePath: (context: SkillTestRuntime) =>
            path.join(context.root, "escape.txt"),
        },
        { name: "absolute Windows path", relativePath: () => "C:\\escape.txt" },
        { name: "null byte path", relativePath: () => "docs/\0.txt" },
      ].map(({ name, relativePath }) => ({
        name: "rejects a " + name + " file write",
        channel: IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE,
        args: (context: SkillTestRuntime, id: string) => [
          id,
          relativePath(context),
          "overwrite",
        ],
        error: /Invalid Skill snapshot relative path/,
      })),
    ];

    it.each(cases)(
      "$name and preserves saved data after reopen",
      async ({ channel, args, error }) => {
        const installed = await installedSkill(runtime);
        const packageRoot = packagePath(runtime, installed.id);
        const beforeFiles = fileInventory(packageRoot);
        const beforeRecord = await skillApi.get(installed.id);
        const beforeVersions = await skillApi.versionGetAll(installed.id);

        await expect(
          invokeSkillIPC(channel, ...args(runtime, installed.id)),
        ).rejects.toThrow(error);

        expect(await skillApi.get(installed.id)).toEqual(beforeRecord);
        expect(await skillApi.versionGetAll(installed.id)).toEqual(
          beforeVersions,
        );
        expect(fileInventory(packageRoot)).toEqual(beforeFiles);
        expect(fs.existsSync(path.join(runtime.root, "escape.txt"))).toBe(
          false,
        );

        await runtime.reopen();
        expect(await skillApi.get(installed.id)).toEqual(beforeRecord);
        expect(await skillApi.versionGetAll(installed.id)).toEqual(
          beforeVersions,
        );
        expect(fileInventory(packageRoot)).toEqual(beforeFiles);
      },
    );
  });

  describe("black-box package update validation", () => {
    const cases: {
      name: string;
      changes: (
        context: SkillTestRuntime,
      ) => Partial<SkillPackageOperationRequest>;
      status: string;
      code: string;
      phase: string;
    }[] = [
      {
        name: "missing source directory",
        changes: (context) => ({
          source: {
            kind: "local-directory",
            directory: path.join(context.root, "missing"),
          },
        }),
        status: "failed",
        code: "STAGING_FAILED",
        phase: "staging",
      },
      {
        name: "traversal package entry",
        changes: (context) => ({
          source: {
            kind: "files",
            sourceUrl: context.source,
            files: [{ path: "../escape.txt", content: "escape" }],
          },
        }),
        status: "failed",
        code: "INVALID_PACKAGE",
        phase: "validation",
      },
      {
        name: "missing SKILL.md",
        changes: (context) => ({
          source: {
            kind: "files",
            sourceUrl: context.source,
            files: [{ path: "notes.txt", content: "No entrypoint" }],
          },
        }),
        status: "failed",
        code: "INVALID_PACKAGE",
        phase: "validation",
      },
      {
        name: "stale source fingerprint",
        changes: () => ({ expectedSourceFingerprint: "0".repeat(64) }),
        status: "conflict",
        code: "CONFLICT",
        phase: "staging",
      },
    ];

    it.each(cases)(
      "rejects $name without partial publication",
      async ({ changes, status, code, phase }) => {
        const installed = await installedSkill(runtime);
        const packageRoot = packagePath(runtime, installed.id);
        const beforeFiles = fileInventory(packageRoot);
        const beforeRecord = await skillApi.get(installed.id);
        const beforeVersions = await skillApi.versionGetAll(installed.id);

        const result = await skillApi.runPackageOperation({
          ...packageRequest(runtime),
          ...changes(runtime),
          operation: "update",
          skillId: installed.id,
        });

        expect(result).toMatchObject({
          status,
          failure: { code, phase },
        });
        expect(fileInventory(packageRoot)).toEqual(beforeFiles);
        expect(await skillApi.versionGetAll(installed.id)).toEqual(
          beforeVersions,
        );
        expect(
          (await skillApi.getAll()).map((skill: Skill) => skill.id),
        ).toEqual([installed.id]);
        expect(fs.existsSync(path.join(runtime.root, "escape.txt"))).toBe(
          false,
        );

        await runtime.reopen();
        expect(await skillApi.get(installed.id)).toEqual(beforeRecord);
        expect(await skillApi.versionGetAll(installed.id)).toEqual(
          beforeVersions,
        );
        expect(fileInventory(packageRoot)).toEqual(beforeFiles);
      },
    );
  });
});
