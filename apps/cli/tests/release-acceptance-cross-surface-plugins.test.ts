import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  closeDatabase,
  configureRuntimePaths,
  CorePluginLibraryService,
  initDatabase,
  resetRuntimePaths,
} from "@prompthub/core";
import { getCliProcessEntry } from "./helpers/cli-process";

const CLI_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHILD_TIMEOUT_MS = 10_000;
const CHILD_OUTPUT_BYTES = 1_048_576;
let root = "";
let profile = "";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;
  throw new Error("Expected a JSON object");
}

function string(value: unknown): string {
  if (typeof value === "string") return value;
  throw new Error("Expected a string");
}

function invoke(args: string[], status = 0): unknown {
  const result = spawnSync(
    process.execPath,
    [getCliProcessEntry(), "--data-dir", profile, "plugin", ...args],
    {
      cwd: CLI_ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
      maxBuffer: CHILD_OUTPUT_BYTES,
    },
  );
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  expect(result.status, result.stderr).toBe(status);
  return JSON.parse(status === 0 ? result.stdout : result.stderr);
}

function inventory(directory: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(relative: string): void {
    for (const entry of fs.readdirSync(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else
        result[name.split(path.sep).join("/")] = fs
          .readFileSync(path.join(directory, name))
          .toString("base64");
    }
  }
  visit("");
  return result;
}

function createSource(name: string): string {
  const source = path.join(root, "sources", name);
  const files = {
    ".codex-plugin/plugin.json": JSON.stringify({
      name,
      version: "1.0.0",
      skills: "./skills",
      commands: ["./commands/review.md"],
    }),
    "skills/review/SKILL.md":
      "---\nname: review\ndescription: Review files\n---\n中文 🦌\n",
    "commands/review.md": "Review command $& <literal>",
    "assets/nested/blob.bin": Buffer.from([0, 128, 255, 10]),
  };
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  return source;
}

function preparePackages(): {
  firstId: string;
  secondId: string;
  source: string;
  secondSource: string;
  external: string;
} {
  const source = createSource("first-bundle");
  const secondSource = createSource("second-bundle");
  const external = path.join(root, "external-target");
  configureRuntimePaths({ userDataPath: profile });
  initDatabase();
  try {
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: () => external,
    });
    const first = service.importLocalPluginPackage({
      sourcePath: source,
    }).plugin;
    const second = service.importLocalPluginPackage({
      sourcePath: secondSource,
    }).plugin;
    service.distributePlugin({
      pluginId: first.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    return {
      firstId: first.id,
      secondId: second.id,
      source,
      secondSource,
      external,
    };
  } finally {
    closeDatabase();
    resetRuntimePaths();
  }
}

function versionInventory(value: unknown): Record<string, string> {
  const files = object(object(value).packageSnapshot).files;
  if (!Array.isArray(files)) throw new Error("Version has no package files");
  return Object.fromEntries(
    files.map((value: unknown) => {
      const file = object(value);
      const encoded = string(file.contentBase64);
      expect(file.size).toBe(Buffer.from(encoded, "base64").length);
      return [string(file.relativePath), encoded];
    }),
  );
}

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cross-plugin-")),
  );
  profile = path.join(root, "profile");
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("reads, snapshots and deletes a complete local Plugin through independent CLI processes without touching other packages or targets", () => {
  const { firstId, secondId, source, secondSource, external } =
    preparePackages();
  const expected = inventory(source);
  const otherExpected = inventory(secondSource);
  const externalExpected = inventory(external);
  const first = object(invoke(["get", firstId]));
  const managed = string(first.localPackagePath);
  expect(inventory(managed)).toEqual(expected);
  expect(invoke(["list"])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: firstId }),
      expect.objectContaining({ id: secondId }),
    ]),
  );
  const version = object(
    invoke(["create-version", firstId, "--note", "原始完整包 🦌"]),
  );
  expect(version).toMatchObject({
    pluginId: firstId,
    version: 1,
    note: "原始完整包 🦌",
  });
  expect(versionInventory(version)).toEqual(expected);
  expect(invoke(["versions", firstId])).toEqual([version]);
  expect(invoke(["get", "first-bundle"])).toEqual(first);
  expect(inventory(managed)).toEqual(expected);
  expect(invoke(["delete", firstId, "--unknown"], 2)).toMatchObject({
    error: { code: "USAGE_ERROR" },
  });
  expect(invoke(["get", firstId])).toEqual(first);
  invoke(["delete", firstId]);
  expect(invoke(["get", firstId], 3)).toMatchObject({
    error: { code: "NOT_FOUND" },
  });
  expect(invoke(["list"])).toEqual([expect.objectContaining({ id: secondId })]);
  const second = object(invoke(["get", secondId]));
  expect(inventory(string(second.localPackagePath))).toEqual(otherExpected);
  expect(fs.existsSync(managed)).toBe(false);
  expect(inventory(source)).toEqual(expected);
  expect(inventory(secondSource)).toEqual(otherExpected);
  expect(inventory(external)).toEqual(externalExpected);
});
