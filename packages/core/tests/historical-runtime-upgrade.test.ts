import { getManagedSkillPackagePath } from "../src/skill-storage-files";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { AgentProviderProfileDB, DatabaseAdapter } from "@prompthub/db";
import type {
  Folder,
  Prompt,
  PromptVersion,
  Skill,
  SkillVersion,
  AgentProviderProfile,
  PluginLibraryFile,
  PluginVersion,
  McpLibraryFile,
} from "@prompthub/shared";
import * as core from "../src/database";
import * as paths from "../src/runtime-paths";
import { createCliSkillService } from "../src/cli/skill-cli-service";
import { createRulesWorkspaceService } from "../src/rules-workspace";
import { CoreAIConfigService } from "../src/ai-config";
import { CorePluginLibraryService } from "../src/plugin-library";
import { createPortablePluginResourceEntry } from "../src/plugin-resource-schema";
import { CoreMcpLibraryService } from "../src/mcp-library";
import type { McpMasterKeyStore } from "../src/mcp-credentials";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const fixtures = path.join(
  repository,
  "packages/core/tests/fixtures/historical-runtime",
);
const sources = [
  ["v0.5.9", "1e933ae29726361982c5ce7b49bc4f4c6da326ba"],
  ["beta.1", "494d57d7da654b8380e4b81f8f51fc5c72e6b7f7"],
  ["beta.2", "b7854508c3c69eb99cc2d1b6207db02ce5a25ddc"],
];
const roots: string[] = [];
const childTimeoutMs = 60_000;
const outputLimitBytes = 32 * 1024 * 1024;
const upgradeTimeoutMs = 120_000;
const ruleId = "project:historical-source";
const editedPrompt = "Edited after upgrade — 中文 🦌\n{{topic}}";
const editedGuide = "Edited package after upgrade\n";
const editedRule = "Edited Rules after upgrade — 中文\n";

interface SourceObservation {
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  folders: Folder[];
  relations: unknown[];
  formats: unknown[];
  skill: Skill;
  skillVersions: SkillVersion[];
  skillFiles: unknown[];
  rule: { id: string; content: string; versions: unknown[] };
  settings: ReturnType<CoreAIConfigService["read"]>;
  profiles?: AgentProviderProfile[];
  pluginLibrary?: PluginLibraryFile;
  pluginVersions?: PluginVersion[];
  mcp?: McpLibraryFile;
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env = process.env,
): Buffer {
  const result = spawnSync(command, args, {
    cwd,
    env,
    timeout: childTimeoutMs,
    maxBuffer: outputLimitBytes,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString().slice(-16_384));
  return result.stdout;
}

function linkDependency(
  destination: string,
  owner: string,
  name: string,
): void {
  if (name.startsWith("@prompthub/")) return;
  const target = path.join(destination, "node_modules", name);
  if (fs.existsSync(target)) return;
  const installed = [
    path.join(
      repository,
      owner === "cli" ? "apps" : "packages",
      owner,
      "node_modules",
      name,
    ),
    path.join(repository, "node_modules", name),
  ].find((candidate) => fs.existsSync(candidate));
  assert.ok(installed, `Missing installed historical dependency: ${name}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(fs.realpathSync(installed), target, "dir");
}

function exportSource(commit: string): string {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-upgrade-source-")),
  );
  roots.push(root);
  const archive = run(
    "git",
    ["archive", commit, "packages/core", "packages/db", "packages/shared"],
    repository,
  );
  const extracted = spawnSync("tar", ["-xf", "-", "-C", root], {
    input: archive,
    timeout: childTimeoutMs,
    maxBuffer: outputLimitBytes,
  });
  assert.equal(extracted.status, 0, extracted.stderr.toString());
  fs.mkdirSync(path.join(root, "node_modules/@prompthub"), { recursive: true });
  for (const owner of ["core", "db", "shared"]) {
    const packageRoot = path.join(root, "packages", owner);
    fs.symlinkSync(
      packageRoot,
      path.join(root, "node_modules/@prompthub", owner),
      "dir",
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    );
    for (const name of Object.keys(manifest.dependencies ?? {}))
      linkDependency(root, owner, name);
  }
  linkDependency(root, "cli", "tsx");
  const harness = path.join(root, "harness");
  fs.mkdirSync(harness);
  for (const name of ["source-runner.mjs", "audit-loader.mjs"]) {
    fs.copyFileSync(path.join(fixtures, name), path.join(harness, name));
  }
  fs.writeFileSync(
    path.join(harness, "register-audit.mjs"),
    "import { register } from 'node:module'; register(new URL('./audit-loader.mjs', import.meta.url));\n",
  );
  return root;
}

function seedSource(
  label: string,
  commit: string,
): { profile: string; expected: SourceObservation } {
  const root = exportSource(commit);
  const profile = path.join(root, "profile");
  fs.mkdirSync(profile);
  const env = {
    ...process.env,
    HISTORICAL_SOURCE_ROOT: root,
    HISTORICAL_LOAD_LOG: path.join(root, "loaded.log"),
  };
  for (const action of ["seed", "reopen"]) {
    run(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./harness/register-audit.mjs",
        "./harness/source-runner.mjs",
        root,
        profile,
        label,
        action,
        path.join(root, `${action}.json`),
      ],
      root,
      env,
    );
  }
  const seeded = JSON.parse(
    fs.readFileSync(path.join(root, "seed.json"), "utf8"),
  );
  const reopened = JSON.parse(
    fs.readFileSync(path.join(root, "reopen.json"), "utf8"),
  );
  expect(reopened.result).toEqual(seeded.result);
  // The historical harness owns this JSON shape; assertions below independently
  // compare current public readers, complete package bytes and version records.
  const expected = reopened.result as SourceObservation;
  expect(expected.prompts).toHaveLength(2);
  expect(expected.skillVersions.length).toBeGreaterThanOrEqual(2);
  expect(expected.rule.versions).toHaveLength(2);
  return { profile, expected };
}

function inventory(root: string, directory = root): Record<string, string> {
  const entries: [string, string][] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    expect(entry.isSymbolicLink(), file).toBe(false);
    if (entry.isDirectory())
      entries.push(...Object.entries(inventory(root, file)));
    else
      entries.push([
        path.relative(root, file),
        createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      ]);
  }
  return Object.fromEntries(entries);
}

function readDatabaseImage(databasePath: string) {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    const schema = database
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name",
      )
      .all();
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all();
    const rows = Object.fromEntries(
      tables.map((table) => {
        assert.ok(
          typeof table === "object" && table !== null && "name" in table,
        );
        assert.equal(typeof table.name, "string");
        const name = String(table.name);
        const identifier = `"${name.replaceAll('"', '""')}"`;
        return [
          name,
          database
            .prepare(`SELECT * FROM ${identifier}`)
            .all()
            .map((row) => JSON.stringify(row))
            .sort(),
        ];
      }),
    );
    return { schema, rows, version: database.pragma("user_version") };
  } finally {
    database.close();
  }
}

function runtime(profile: string, masterKeyStore: McpMasterKeyStore) {
  paths.configureRuntimePaths({
    userDataPath: profile,
    appDataPath: path.join(profile, "app-data"),
  });
  const database = core.initDatabase(undefined, { masterKeyStore });
  return {
    database,
    prompts: new core.PromptDB(database),
    skills: new core.SkillDB(database),
    skillService: createCliSkillService(),
    settings: new CoreAIConfigService(),
    plugins: new CorePluginLibraryService(),
    mcp: new CoreMcpLibraryService({ database, masterKeyStore }),
    rules: createRulesWorkspaceService({
      getRulesDir: paths.getRulesDir,
      createRuleDb: () => new core.RuleDB(database),
      getPlatformGlobalRulePath: () => null,
      getPlatformRootDir: (platform) =>
        path.join(profile, "agent-homes", platform.id),
    }),
  };
}

type Runtime = ReturnType<typeof runtime>;

async function observe(current: Runtime) {
  const entries = current.prompts
    .getAll()
    .sort((left, right) => left.title.localeCompare(right.title));
  const primary = entries.find((entry) => entry.title === "Historical primary");
  assert.ok(primary);
  const skill = current.skills.getAll()[0];
  assert.ok(skill);
  const rule = await current.rules.readRuleContent(ruleId);
  return {
    prompts: entries,
    promptVersions: current.prompts.getVersions(primary.id),
    folders: new core.FolderDB(current.database).getAll(),
    relations: new core.PromptRelationDB(current.database).list(),
    formats: new core.PromptOutputFormatDB(current.database).list(),
    skill,
    skillVersions: current.skills.getVersions(skill.id),
    skillFiles: await current.skillService.listLocalFiles(
      current.skills,
      skill.id,
    ),
    rule: { id: rule.id, content: rule.content, versions: rule.versions },
    settings: current.settings.read(),
  };
}

function verifyBeta(current: Runtime, expected: SourceObservation): void {
  if (!expected.profiles) return;
  expect(
    new AgentProviderProfileDB(current.database)
      .listProfiles()
      .sort((left, right) => left.id.localeCompare(right.id)),
  ).toEqual(expected.profiles);
  const library = current.plugins.read();
  expect(library.plugins.map(createPortablePluginResourceEntry)).toEqual(
    expected.pluginLibrary!.plugins.map(createPortablePluginResourceEntry),
  );
  expect(library.plugins[0].source.url).toBe(expected.pluginLibrary!.plugins[0].source.url);
  expect(library.plugins[0].distributedTargetIds ?? []).toEqual(expected.pluginLibrary!.plugins[0].distributedTargetIds ?? []);
  expect(fs.readFileSync(path.join(library.plugins[0].localPackagePath!, "skills/writer/pixel.bin"))).toEqual(Buffer.from([0,255,16,128]));
  expect(current.plugins.getPluginVersions(library.plugins[0].id).map((version) => ({ ...version, plugin: createPortablePluginResourceEntry(version.plugin) }))).toEqual(
    expected.pluginVersions!.map((version) => ({ ...version, plugin: createPortablePluginResourceEntry(version.plugin) })),
  );
  const server = current.mcp.getServer("historical-mcp");
  expect(server).toMatchObject({
    name: "historical-mcp",
    transport: "stdio",
    command: "fixture-command",
    args: ["--synthetic"],
    description: "Updated historical MCP config",
  });
  expect(current.mcp.read().servers).toHaveLength(1);
  expect(current.mcp.read().servers).toMatchObject(expected.mcp?.servers ?? []);
}

async function edit(
  current: Runtime,
  expected: SourceObservation,
): Promise<void> {
  const primary = expected.prompts.find(
    (entry) => entry.title === "Historical primary",
  );
  assert.ok(primary);
  current.prompts.update(primary.id, { userPrompt: editedPrompt });
  await current.skillService.writeLocalFile(
    current.skills,
    expected.skill.id,
    "docs/guide.md",
    editedGuide,
  );
  await current.skillService.createVersion(
    current.skills,
    expected.skill.id,
    "Current package after historical upgrade",
  );
  await current.rules.saveRuleContent(ruleId, editedRule);
}

afterEach(() => {
  core.closeDatabase();
  paths.resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it.each(sources)(
  "upgrades %s in place, edits and reopens without losing historical data",
  async (label, commit) => {
    const { profile, expected } = seedSource(label, commit);
    assert.ok(expected.skill.local_repo_path);
    const packageBefore = inventory(expected.skill.local_repo_path);
    const pluginPath = expected.pluginLibrary?.plugins[0].localPackagePath;
    const pluginBefore = pluginPath ? inventory(pluginPath) : null;
    // The device keyring is outside this upgrade test. Keep synthetic keys in
    // memory across DB reopens; real SQL credential encryption still runs.
    const keys = new Map<string, Buffer>();
    const masterKeyStore: McpMasterKeyStore = {
      read: (id) => keys.get(id) ?? null,
      write: (id, key) => {
        keys.set(id, Buffer.from(key));
      },
    };
    let current = runtime(profile, masterKeyStore);
    await current.rules.bootstrapRuleWorkspace();
    // Source observations may include extra domains; compare the explicitly
    // selected normal consumer contract, not a latest-schema reconstruction.
    const upgraded = await observe(current);
    for (const key of Object.keys(upgraded)) {
      expect(Reflect.get(upgraded, key), key).toMatchObject(
        key === "skill"
          ? {
              ...expected.skill,
              local_repo_path: getManagedSkillPackagePath(
                expected.skill.id,
              ),
            }
          : Reflect.get(expected, key),
      );
    }
    expect(
      inventory(getManagedSkillPackagePath(expected.skill.id)),
    ).toEqual(packageBefore);
    verifyBeta(current, expected);
    await edit(current, expected);
    const edited = await observe(current);
    expect(
      edited.prompts.find((entry) => entry.title === "Historical primary")
        ?.userPrompt,
    ).toBe(editedPrompt);
    expect(edited.promptVersions).toHaveLength(
      expected.promptVersions.length + 1,
    );
    expect(edited.skillVersions).toHaveLength(
      expected.skillVersions.length + 1,
    );
    expect(edited.rule.content).toBe(editedRule);
    expect(edited.rule.versions).toHaveLength(
      expected.rule.versions.length + 1,
    );
    for (const version of expected.promptVersions)
      expect(edited.promptVersions).toContainEqual(version);
    for (const version of expected.skillVersions)
      expect(edited.skillVersions).toContainEqual(version);
    for (const version of expected.rule.versions)
      expect(edited.rule.versions).toContainEqual(version);
    for (let reopen = 0; reopen < 2; reopen += 1) {
      core.closeDatabase();
      paths.resetRuntimePaths();
      current = runtime(profile, masterKeyStore);
      await current.rules.bootstrapRuleWorkspace();
      expect(await observe(current)).toEqual(edited);
      expect(
        await current.skillService.readLocalFile(
          current.skills,
          expected.skill.id,
          "docs/guide.md",
        ),
      ).toMatchObject({ content: editedGuide });
      expect(
        fs.readFileSync(
          path.join(
            getManagedSkillPackagePath(expected.skill.id),
            "docs/pixel.bin",
          ),
        ),
      ).toEqual(Buffer.from([0, 255, 16, 128]));
      verifyBeta(current, expected);
      if (pluginPath) {
        const migratedPath = current.plugins.read().plugins[0].localPackagePath;
        assert.ok(migratedPath);
        expect(inventory(migratedPath)).toEqual(pluginBefore);
      }
      expect(current.database.prepare("PRAGMA quick_check").all()).toEqual([
        { quick_check: "ok" },
      ]);
      expect(
        current.database.prepare("PRAGMA foreign_key_check").all(),
      ).toEqual([]);
    }
  },
  upgradeTimeoutMs,
);

it.each(sources)(
  "preserves %s after a failed upgrade and permits a clean retry",
  async (label, commit) => {
    const { profile, expected } = seedSource(label, commit);
    paths.configureRuntimePaths({
      userDataPath: profile,
      appDataPath: path.join(profile, "app-data"),
    });
    const databasePath = paths.getDatabasePath();
    const beforeDatabase = readDatabaseImage(databasePath);
    const beforeFiles = inventory(profile);
    expect(() =>
      core.initDatabase({
        beforeMigrationCommit() {
          throw new Error("Injected historical upgrade transaction failure");
        },
      }),
    ).toThrow("Injected historical upgrade transaction failure");
    expect(() => core.getDatabase()).toThrow("Database not initialized");
    expect(readDatabaseImage(databasePath)).toEqual(beforeDatabase);
    for (const [relative, hash] of Object.entries(beforeFiles)) {
      if (path.join(profile, relative) === databasePath) continue;
      expect(
        createHash("sha256")
          .update(fs.readFileSync(path.join(profile, relative)))
          .digest("hex"),
        relative,
      ).toBe(hash);
    }
    const keys = new Map<string, Buffer>();
    const current = runtime(profile, {
      read: (id) => keys.get(id) ?? null,
      write: (id, key) => {
        keys.set(id, Buffer.from(key));
      },
    });
    await current.rules.bootstrapRuleWorkspace();
    const retried = await observe(current);
    for (const key of Object.keys(retried)) {
      expect(Reflect.get(retried, key), key).toMatchObject(
        key === "skill"
          ? {
              ...expected.skill,
              local_repo_path: getManagedSkillPackagePath(
                expected.skill.id,
              ),
            }
          : Reflect.get(expected, key),
      );
    }
    verifyBeta(current, expected);
  },
  upgradeTimeoutMs,
);
