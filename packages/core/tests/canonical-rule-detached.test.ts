import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { RuleFileContent } from "@prompthub/shared/types";

import { encodeCanonicalResourceDirectory } from "../src/canonical-resource-path";
import {
  closeDatabase,
  getDatabase,
  initDatabase,
  RuleDB,
} from "../src/database";
import { materializeRuleResourceBundle } from "../src/rule-resource-schema";
import { createRulesWorkspaceService } from "../src/rules-workspace";
import {
  configureRuntimePaths,
  getRulesDir,
  resetRuntimePaths,
} from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import { writeRuntimeLayoutState } from "../src/runtime-storage-context";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";

const ruleId = "project:detached";
const currentBody = "# Restored project\nPreserve current body.\n";
const previousBody = "# Previous project\nPreserve history.\n";
let root: string;
let bundle: string;

function service() {
  return createRulesWorkspaceService({
    getRulesDir,
    createRuleDb: () => new RuleDB(getDatabase()),
    getPlatformGlobalRulePath: (platform) =>
      path.join(root, "agents", platform.id, "AGENTS.md"),
    getPlatformRootDir: () => path.join(root, "agents"),
  });
}

function reopen(): void {
  closeDatabase();
  initDatabase();
}

function readFiles(directory: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, content] of Object.entries(readFiles(filePath))) {
        result[path.join(entry.name, name)] = content;
      }
    } else {
      result[entry.name] = fs.readFileSync(filePath).toString("hex");
    }
  }
  return result;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-detached-rule-"));
  configureRuntimePaths({ userDataPath: root });
  materializeCanonicalStorageShadow({
    targetPath: path.join(root, "data"),
    prompts: {
      prompts: [],
      folders: [],
      promptVersions: [],
      promptRelations: [],
      outputFormatItems: [],
    },
  });
  stageCanonicalStorageDatabase(
    path.join(root, "data"),
    path.join(root, "data", "prompthub.db"),
  );
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "d".repeat(64),
    operationId: "detached-rule-test",
  });
  bundle = path.join(
    root,
    "data",
    "rules",
    encodeCanonicalResourceDirectory(ruleId),
  );
  const rule: RuleFileContent = {
    id: ruleId,
    platformId: "workspace",
    platformName: "Restored project",
    platformIcon: "Folder",
    platformDescription: "Project rules",
    name: "AGENTS.md",
    description: "Restored project rules",
    path: "",
    targetPath: "",
    projectRootPath: null,
    exists: false,
    group: "workspace",
    content: currentBody,
    versions: [
      {
        id: "prior",
        savedAt: "2026-09-01T00:00:00.000Z",
        source: "create",
        content: previousBody,
      },
      {
        id: "current",
        savedAt: "2026-09-02T00:00:00.000Z",
        source: "manual-save",
        content: currentBody,
      },
    ],
  };
  materializeRuleResourceBundle({ bundlePath: bundle, rule });
  initDatabase();
});

afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("keeps detached project identity, body and history through two real startups and removal", async () => {
  expect(fs.existsSync(bundle)).toBe(false);
  for (let startup = 0; startup < 2; startup += 1) {
    reopen();
    const workspace = service();
    expect(
      (await workspace.listRuleDescriptors()).filter(
        (rule) => rule.id === ruleId,
      ),
    ).toEqual([
      expect.objectContaining({
        id: ruleId,
        name: "AGENTS.md",
        targetPath: "",
        projectRootPath: null,
      }),
    ]);
    const content = await workspace.readRuleContent(ruleId);
    expect(content).toMatchObject({
      content: currentBody,
      targetPath: "",
      projectRootPath: null,
    });
    expect(content.versions.map(({ id, content: body }) => [id, body])).toEqual(
      [
        ["current", currentBody],
        ["prior", previousBody],
      ],
    );
    expect(fs.existsSync(bundle)).toBe(false);
  }
  const record = new RuleDB(getDatabase()).getById(ruleId);
  expect(record).not.toBeNull();
  if (!record) throw new Error("Detached Rule missing after startup");
  const managedDirectory = path.dirname(record.managedPath);
  await service().removeProjectRule("detached");
  expect(fs.existsSync(managedDirectory)).toBe(false);
  expect(fs.existsSync(bundle)).toBe(false);
  reopen();
  expect(
    (await service().listRuleDescriptors()).some((rule) => rule.id === ruleId),
  ).toBe(false);
  expect(new RuleDB(getDatabase()).getVersions(ruleId)).toEqual([]);
  await service().removeProjectRule("detached");
});

it.each(["aaa-stale", "zzz-stale"])(
  "uses canonical detached placement before stale binding %s instead of restoring the old deployment",
  async (staleName) => {
    const record = new RuleDB(getDatabase()).getById(ruleId);
    if (!record) throw new Error("Detached Rule missing after startup");
    const oldRoot = path.join(root, "old-project");
    const oldTarget = path.join(oldRoot, "AGENTS.md");
    fs.mkdirSync(oldRoot);
    fs.writeFileSync(oldTarget, "# External old deployment\n");
    const staleDirectory = path.join(
      root,
      "cache",
      "rules-workspace",
      "projects",
      staleName,
    );
    fs.mkdirSync(staleDirectory, { recursive: true });
    fs.writeFileSync(path.join(staleDirectory, "AGENTS.md"), currentBody);
    fs.writeFileSync(
      path.join(staleDirectory, "_rule.json"),
      JSON.stringify({
        ...record,
        managedPath: path.join(staleDirectory, "AGENTS.md"),
        targetPath: oldTarget,
        projectRootPath: oldRoot,
      }),
    );
    reopen();
    expect(new RuleDB(getDatabase()).getById(ruleId)).toMatchObject({
      targetPath: "",
      projectRootPath: null,
    });
    await service().removeProjectRule("detached");
    expect(fs.existsSync(staleDirectory)).toBe(false);
    expect(fs.readFileSync(oldTarget, "utf8")).toBe(
      "# External old deployment\n",
    );
    reopen();
    expect(new RuleDB(getDatabase()).getById(ruleId)).toBeNull();
  },
);

it.each([
  { targetPath: 123, projectRootPath: null },
  { targetPath: "bad\0path", projectRootPath: null },
  { targetPath: "", projectRootPath: "nonempty-root" },
  { targetPath: "nonempty-target", projectRootPath: "" },
  { targetPath: "nonempty-target", projectRootPath: "bad\0root" },
  { targetPath: "nonempty-target", projectRootPath: 123 },
])(
  "rejects malformed placement %j on startup without changing Rule files",
  (placement) => {
    const record = new RuleDB(getDatabase()).getById(ruleId);
    if (!record) throw new Error("Detached Rule missing after startup");
    const metadata = path.join(
      root,
      "cache",
      "rules-workspace",
      "projects",
      "malformed",
      "_rule.json",
    );
    fs.mkdirSync(path.dirname(metadata), { recursive: true });
    fs.writeFileSync(metadata, JSON.stringify({ ...record, ...placement }));
    const beforeWorkspace = readFiles(getRulesDir());
    expect(() => reopen()).toThrow(
      "Historical Rule project binding is invalid",
    );
    expect(JSON.parse(fs.readFileSync(metadata, "utf8"))).toMatchObject(
      placement,
    );
    expect(readFiles(getRulesDir())).toEqual(beforeWorkspace);
  },
);
