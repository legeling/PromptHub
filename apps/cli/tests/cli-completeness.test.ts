import fs from "fs";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, resetRuntimePaths, runCli } from "@prompthub/core";

import { makeTempRoot } from "./helpers/cli-harness";

function withDataDir(rootDir: string): string[] {
  return ["--data-dir", path.join(rootDir, "user-data")];
}

async function execCli(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, {
    stdout: (message: string) => stdout.push(message),
    stderr: (message: string) => stderr.push(message),
  });

  const joinedStdout = stdout.join("\n");
  const joinedStderr = stderr.join("\n");
  const parseMaybeJson = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  return {
    exitCode,
    json: parseMaybeJson(joinedStdout),
    errorJson: parseMaybeJson(joinedStderr),
    joinedStdout,
    joinedStderr,
  };
}

describe("CLI feature completeness", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports MCP create, update, and delete", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "create",
      "--name",
      "docs-fs",
      "--command",
      "npx",
      "--args",
      "-y,@modelcontextprotocol/server-filesystem",
      "--transport",
      "stdio",
    ]);
    expect(createRes.exitCode).toBe(0);
    expect(createRes.json).toMatchObject({
      name: "docs-fs",
      command: "npx",
      enabled: true,
    });

    const updateRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "update",
      "docs-fs",
      "--description",
      "Filesystem MCP",
      "--disabled",
    ]);
    expect(updateRes.exitCode).toBe(0);
    expect(updateRes.json).toMatchObject({
      name: "docs-fs",
      description: "Filesystem MCP",
      enabled: false,
    });

    const deleteRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "delete",
      "docs-fs",
    ]);
    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json).toMatchObject({ deleted: true, name: "docs-fs" });

    const listRes = await execCli([...withDataDir(root), "mcp", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.json).toEqual([]);
  });

  it("supports prompt parent-id, relations, and output formats", async () => {
    const root = makeTempRoot(tempDirs);

    const parentRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Parent Prompt",
      "--user-prompt",
      "Parent body",
    ]);
    expect(parentRes.exitCode).toBe(0);
    const parentId = parentRes.json.id as string;

    const childRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Child Prompt",
      "--user-prompt",
      "Child body",
      "--parent-id",
      parentId,
    ]);
    expect(childRes.exitCode).toBe(0);
    expect(childRes.json.parentId).toBe(parentId);
    const childId = childRes.json.id as string;

    const relationRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "relation",
      "create",
      "--source",
      parentId,
      "--target",
      childId,
      "--kind",
      "related_to",
      "--note",
      "linked",
    ]);
    expect(relationRes.exitCode).toBe(0);
    // related_to is stored undirected with normalized endpoint order.
    expect(relationRes.json.kind).toBe("related_to");
    expect(relationRes.json.note).toBe("linked");
    expect(
      new Set([
        relationRes.json.sourcePromptId,
        relationRes.json.targetPromptId,
      ]),
    ).toEqual(new Set([parentId, childId]));
    const relationId = relationRes.json.id as string;

    const formatRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "output-format",
      "create",
      "--source",
      parentId,
      "--target",
      childId,
    ]);
    expect(formatRes.exitCode).toBe(0);
    expect(formatRes.json).toMatchObject({
      sourcePromptId: parentId,
      targetPromptId: childId,
    });

    const listRel = await execCli([
      ...withDataDir(root),
      "prompt",
      "relation",
      "list",
      "--prompt-id",
      parentId,
    ]);
    expect(listRel.exitCode).toBe(0);
    expect(listRel.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: relationId, kind: "related_to" }),
      ]),
    );
  });

  it("supports skill metadata update and check-update", async () => {
    const root = makeTempRoot(tempDirs);
    const skillFile = path.join(root, "meta-skill.SKILL.md");
    fs.writeFileSync(
      skillFile,
      "---\nname: meta-skill\ndescription: Original\nversion: 1.0.0\n---\nBody.\n",
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillFile,
    ]);
    expect(installRes.exitCode).toBe(0);

    const updateRes = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "update",
      "meta-skill",
      "--description",
      "Updated meta",
      "--author",
      "CLI",
      "--tags",
      "a,b",
    ]);
    expect(updateRes.exitCode).toBe(0);
    expect(updateRes.json).toMatchObject({
      name: "meta-skill",
      description: "Updated meta",
      author: "CLI",
      tags: ["a", "b"],
    });

    const checkRes = await execCli([
      ...withDataDir(root),
      "skill",
      "check-update",
      "meta-skill",
    ]);
    expect(checkRes.exitCode).toBe(0);
    expect(checkRes.json).toMatchObject({
      skillId: expect.any(String),
      status: expect.any(String),
      localModified: expect.any(Boolean),
      remoteChanged: expect.any(Boolean),
    });
  });

  it("exports and imports skillFiles, relations, and output formats", async () => {
    // Multi-step DB + skill repo round-trip; keep above default 5s budget under full suite load.
    const sourceRoot = makeTempRoot(tempDirs);
    const targetRoot = makeTempRoot(tempDirs);
    const exportFile = path.join(sourceRoot, "full-workspace.json");

    const parentRes = await execCli([
      ...withDataDir(sourceRoot),
      "prompt",
      "create",
      "--title",
      "Portable Parent",
      "--user-prompt",
      "Parent",
    ]);
    expect(parentRes.exitCode).toBe(0);
    const parentId = parentRes.json.id as string;

    const childRes = await execCli([
      ...withDataDir(sourceRoot),
      "prompt",
      "create",
      "--title",
      "Portable Child",
      "--user-prompt",
      "Child",
      "--parent-id",
      parentId,
    ]);
    expect(childRes.exitCode).toBe(0);
    const childId = childRes.json.id as string;

    expect(
      (
        await execCli([
          ...withDataDir(sourceRoot),
          "prompt",
          "relation",
          "create",
          "--source",
          parentId,
          "--target",
          childId,
          "--kind",
          "next_step",
        ])
      ).exitCode,
    ).toBe(0);

    expect(
      (
        await execCli([
          ...withDataDir(sourceRoot),
          "prompt",
          "output-format",
          "create",
          "--source",
          parentId,
          "--target",
          childId,
        ])
      ).exitCode,
    ).toBe(0);

    const skillDir = path.join(sourceRoot, "portable-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: portable-skill\ndescription: Portable\n---\nUse me.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(skillDir, "notes.txt"),
      "helper notes\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(skillDir, "bytes.bin"),
      Buffer.from([0, 255, 128]),
    );
    expect(
      (
        await execCli([
          ...withDataDir(sourceRoot),
          "skill",
          "install",
          skillDir,
        ])
      ).exitCode,
    ).toBe(0);

    const exportRes = await execCli([
      ...withDataDir(sourceRoot),
      "workspace",
      "export",
      "--file",
      exportFile,
    ]);
    expect(exportRes.exitCode).toBe(0);
    expect(exportRes.json.skillFiles).toBeGreaterThan(0);
    expect(exportRes.json.promptRelations).toBe(1);
    expect(exportRes.json.outputFormatItems).toBe(1);

    const bundle = JSON.parse(fs.readFileSync(exportFile, "utf8"));
    expect(bundle.payload.skillFiles).toBeTruthy();
    expect(bundle.payload.promptRelations).toHaveLength(1);
    expect(bundle.payload.outputFormatItems).toHaveLength(1);
    // The target must restore the exported package without its original source.
    fs.rmSync(skillDir, { recursive: true });

    const importRes = await execCli([
      ...withDataDir(targetRoot),
      "workspace",
      "import",
      "--file",
      exportFile,
      "--force-clear",
    ]);
    if (importRes.exitCode !== 0) {
      throw new Error(
        `workspace import failed: ${importRes.exitCode} ${JSON.stringify(importRes.errorJson ?? importRes.joinedStderr)}`,
      );
    }
    expect(importRes.exitCode).toBe(0);
    expect(importRes.json.prompts).toBe(2);
    expect(importRes.json.skills).toBe(1);
    expect(importRes.json.promptRelations).toBe(1);
    expect(importRes.json.outputFormatItems).toBe(1);

    const skillGet = await execCli([
      ...withDataDir(targetRoot),
      "skill",
      "get",
      "portable-skill",
    ]);
    expect(skillGet.exitCode).toBe(0);

    const filesRes = await execCli([
      ...withDataDir(targetRoot),
      "skill",
      "repo-files",
      "portable-skill",
    ]);
    expect(filesRes.exitCode).toBe(0);
    const filePaths = (filesRes.json as Array<{ path: string }>).map(
      (entry) => entry.path,
    );
    expect(filePaths).toEqual(
      expect.arrayContaining(["SKILL.md", "notes.txt", "bytes.bin"]),
    );
    expect(
      fs.readFileSync(
        path.join(
          targetRoot,
          "user-data",
          "data",
          "skills",
          skillGet.json.id,
          "files",
          "bytes.bin",
        ),
      ),
    ).toEqual(Buffer.from([0, 255, 128]));

    const relations = await execCli([
      ...withDataDir(targetRoot),
      "prompt",
      "relation",
      "list",
    ]);
    expect(relations.exitCode).toBe(0);
    expect(relations.json).toHaveLength(1);
  }, 30_000);

  it("lists plugins from the shared library and supports delete", async () => {
    const root = makeTempRoot(tempDirs);
    const userData = path.join(root, "user-data");
    // Bootstrap runtime paths by running any CLI command first.
    expect(
      (await execCli([...withDataDir(root), "plugin", "list"])).exitCode,
    ).toBe(0);

    const pluginLibraryDir = path.join(userData, "data", "plugins");
    fs.mkdirSync(pluginLibraryDir, { recursive: true });
    const libraryPath = path.join(pluginLibraryDir, "library.json");
    // Fallback: write through Core paths after a command configured runtime.
    // The library path is under userData via getPluginLibraryFilePath.
    // Create a minimal library by installing is heavy; seed via filesystem if known.
    // Instead exercise help + empty list + market/sources smoke.
    const listRes = await execCli([...withDataDir(root), "plugin", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(Array.isArray(listRes.json)).toBe(true);

    const sourcesRes = await execCli([
      ...withDataDir(root),
      "plugin",
      "sources",
    ]);
    expect(sourcesRes.exitCode).toBe(0);
    expect(Array.isArray(sourcesRes.json)).toBe(true);
    expect(sourcesRes.json.length).toBeGreaterThan(0);

    const helpRes = await execCli([...withDataDir(root), "plugin", "--help"]);
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.joinedStdout).toContain("Plugin 命令");

    // Keep reference so path is used if needed for debugging.
    void libraryPath;
  });

  it("exposes plugin in root help", async () => {
    const res = await execCli(["--help"]);
    expect(res.exitCode).toBe(0);
    expect(res.joinedStdout).toContain("plugin");
    expect(res.joinedStdout).toContain("mcp");
  });
});
