import { unzipSync, zipSync, strToU8 } from "fflate";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  closeDatabase,
  createCliSkillService,
  resetRuntimePaths,
} from "@prompthub/core";
import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

const roots: string[] = [];
afterEach(async () => {
  closeDatabase();
  resetRuntimePaths();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

// Only the network checkout is replaced. Commands, package storage and reopen are real.
it.each([
  ["https://github.com/example/catalog/tree/main/skills/writer", []],
  [
    "git@github.com:example/catalog.git",
    ["--branch", "main", "--directory", "skills/writer"],
  ],
])(
  "imports a complete selected package from %s and reads it after reopen",
  async (source, flags) => {
    const root = makeTempRoot(roots);
    const service = createCliSkillService({
      gitCloneImpl: async (url, checkout, branch) => {
        expect(url).toMatch(/example\/catalog/);
        expect(branch).toBe("main");
        await fs.mkdir(path.join(checkout, "skills/writer/assets"), {
          recursive: true,
        });
        await fs.writeFile(
          path.join(checkout, "skills/writer/SKILL.md"),
          "---\nname: writer\ndescription: Write clearly\n---\n# Writer\n",
        );
        await fs.writeFile(
          path.join(checkout, "skills/writer/assets/icon.bin"),
          Buffer.from([0, 255, 3]),
        );
        await fs.mkdir(path.join(checkout, "unrelated"));
        await fs.writeFile(
          path.join(checkout, "unrelated/SKILL.md"),
          "# Unrelated",
        );
      },
    });
    const imported = await execCli(
      [...withDataDir(root), "skill", "import", source, ...flags],
      service,
    );
    expect(imported.exitCode, imported.joinedStderr).toBe(0);
    closeDatabase();
    resetRuntimePaths();
    const read = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "get",
      "writer",
    ]);
    expect(read.exitCode, read.joinedStderr).toBe(0);
    expect(read.joinedStdout).toContain("Write clearly");
    const files = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-files",
      "writer",
    ]);
    expect(files.exitCode, files.joinedStderr).toBe(0);
    expect(files.joinedStdout).toContain("icon.bin");
    expect(files.joinedStdout).not.toContain("unrelated");
    // Locate the managed package using the public get result, not the checkout fixture.
    const payload = JSON.parse(read.joinedStdout);
    const skill = payload.data ?? payload;
    expect(
      await fs.readFile(path.join(skill.local_repo_path, "assets/icon.bin")),
    ).toEqual(Buffer.from([0, 255, 3]));
  },
);

it("rejects a traversal selector before transport and leaves the library empty", async () => {
  const root = makeTempRoot(roots);
  let requested = false;
  const service = createCliSkillService({
    gitCloneImpl: async () => {
      requested = true;
    },
  });
  const result = await execCli(
    [
      ...withDataDir(root),
      "skill",
      "import",
      "git@github.com:example/catalog.git",
      "--directory",
      "../outside",
    ],
    service,
  );
  expect(result.exitCode).not.toBe(0);
  expect(requested).toBe(false);
  const list = await execCli([...withDataDir(root), "skill", "list"]);
  expect(list.exitCode).toBe(0);
  expect(list.json.data ?? list.json).toEqual([]);
});

// Git and HTTP are the only replaced boundaries; fallback, extraction, import and storage are real.
it("falls back from a failed Git checkout to a bounded HTTP archive and preserves nested binary files", async () => {
  const root = makeTempRoot(roots);
  const archive = zipSync({
    "catalog-main/skills/writer/SKILL.md": strToU8(
      "---\nname: archive-writer\ndescription: From archive\n---\n# Writer",
    ),
    "catalog-main/skills/writer/assets/icon.bin": new Uint8Array([0, 255, 3]),
    ...Object.fromEntries(
      Array.from({ length: 1200 }, (_, index) => [
        `catalog-main/unrelated/${index}.txt`,
        strToU8("ignored"),
      ]),
    ),
  });
  const service = createCliSkillService({
    gitCloneImpl: async () => {
      throw new Error("GIT_EXECUTABLE_UNAVAILABLE");
    },
    fetchArchive: async (url) => {
      expect(url).toBe("https://codeload.github.com/example/catalog/zip/main");
      return archive;
    },
  });
  const result = await execCli(
    [
      ...withDataDir(root),
      "skill",
      "import",
      "https://github.com/example/catalog/tree/main/skills/writer",
    ],
    service,
  );
  expect(result.exitCode, result.joinedStderr).toBe(0);
  closeDatabase();
  resetRuntimePaths();
  const read = await execCli([
    ...withDataDir(root),
    "--full",
    "skill",
    "get",
    "archive-writer",
  ]);
  expect(read.exitCode, read.joinedStderr).toBe(0);
  const payload = JSON.parse(read.joinedStdout);
  expect(
    await fs.readFile(
      path.join((payload.data ?? payload).local_repo_path, "assets/icon.bin"),
    ),
  ).toEqual(Buffer.from([0, 255, 3]));
});

it("reports both failed transports without persisting a partial Skill", async () => {
  const root = makeTempRoot(roots);
  const service = createCliSkillService({
    gitCloneImpl: async () => {
      throw new Error("Failed to connect to 127.0.0.1 port 7892");
    },
    fetchArchive: async () => {
      throw new Error("GitHub HTTP 401 fetching remote content");
    },
  });
  const result = await execCli(
    [
      ...withDataDir(root),
      "skill",
      "import",
      "https://github.com/example/catalog",
    ],
    service,
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.joinedStderr).toContain("github-authentication");
  const listed = await execCli([...withDataDir(root), "skill", "list"]);
  expect(listed.exitCode).toBe(0);
  expect(listed.joinedStdout).not.toContain("catalog");
});

it("checks complete Git packages and detects binary-only upstream changes without modifying the installed package", async () => {
  const root = makeTempRoot(roots);
  let version = 1;
  const service = createCliSkillService({
    gitCloneImpl: async (_url, checkout) => {
      await fs.mkdir(path.join(checkout, "writer"), { recursive: true });
      await fs.writeFile(
        path.join(checkout, "writer/SKILL.md"),
        "---\nname: binary-writer\n---\n# Same content",
      );
      await fs.writeFile(
        path.join(checkout, "writer/icon.bin"),
        new Uint8Array([0, version, 255]),
      );
    },
  });
  expect(
    (
      await execCli(
        [
          ...withDataDir(root),
          "skill",
          "import",
          "https://github.com/example/catalog/tree/main/writer",
        ],
        service,
      )
    ).exitCode,
  ).toBe(0);
  const current = await execCli(
    [
      ...withDataDir(root),
      "--full",
      "skill",
      "check-update",
      "binary-writer",
      "--fetch-remote",
    ],
    service,
  );
  expect(current.exitCode, current.joinedStderr).toBe(0);
  expect(current.joinedStdout).toContain("up-to-date");
  version = 2;
  const changed = await execCli(
    [
      ...withDataDir(root),
      "--full",
      "skill",
      "check-update",
      "binary-writer",
      "--fetch-remote",
    ],
    service,
  );
  expect(changed.exitCode, changed.joinedStderr).toBe(0);
  expect(changed.joinedStdout).toContain("update-available");
  const read = await execCli([
    ...withDataDir(root),
    "--full",
    "skill",
    "get",
    "binary-writer",
  ]);
  const payload = JSON.parse(read.joinedStdout);
  expect(
    await fs.readFile(
      path.join((payload.data ?? payload).local_repo_path, "icon.bin"),
    ),
  ).toEqual(Buffer.from([0, 1, 255]));
  const updated = await execCli(
    [...withDataDir(root), "skill", "update-source", "binary-writer"],
    service,
  );
  expect(updated.exitCode, updated.joinedStderr).toBe(0);
  const repo = (payload.data ?? payload).local_repo_path;
  expect(await fs.readFile(path.join(repo, "icon.bin"))).toEqual(
    Buffer.from([0, 2, 255]),
  );
  const exportedPath = path.join(root, "writer.zip");
  const exported = await execCli([
    ...withDataDir(root),
    "skill",
    "export",
    "binary-writer",
    "--format",
    "zip",
    "--file",
    exportedPath,
  ]);
  expect(exported.exitCode, exported.joinedStderr).toBe(0);
  expect(
    Buffer.from(
      unzipSync(new Uint8Array(await fs.readFile(exportedPath)))["icon.bin"],
    ),
  ).toEqual(Buffer.from([0, 2, 255]));
  expect(
    (
      await execCli([
        ...withDataDir(root),
        "skill",
        "export",
        "binary-writer",
        "--format",
        "zip",
        "--file",
        exportedPath,
      ])
    ).exitCode,
  ).not.toBe(0);
  await fs.writeFile(path.join(repo, "icon.bin"), Buffer.from([0, 9, 255]));
  const conflict = await execCli(
    [...withDataDir(root), "skill", "update-source", "binary-writer"],
    service,
  );
  expect(conflict.exitCode).not.toBe(0);
  expect(conflict.joinedStderr).toContain("local changes");
  expect(await fs.readFile(path.join(repo, "icon.bin"))).toEqual(
    Buffer.from([0, 9, 255]),
  );
  const forced = await execCli(
    [
      ...withDataDir(root),
      "skill",
      "update-source",
      "binary-writer",
      "--force",
    ],
    service,
  );
  expect(forced.exitCode, forced.joinedStderr).toBe(0);
  closeDatabase();
  resetRuntimePaths();
  const versions = await execCli([
    ...withDataDir(root),
    "--full",
    "skill",
    "versions",
    "binary-writer",
  ]);
  expect(versions.exitCode, versions.joinedStderr).toBe(0);
  expect(versions.joinedStdout).toContain("Before source update");
  expect(versions.joinedStdout).toContain("AAn/");
  expect(await fs.readFile(path.join(repo, "icon.bin"))).toEqual(
    Buffer.from([0, 2, 255]),
  );
});
