import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentProviderProfileDB, DatabaseAdapter } from "@prompthub/db";
import { afterEach, beforeEach, expect, it } from "vitest";
import { materializeAgentProviderResourceBundle } from "../src/agent-resource-schema";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";
import { closeDatabase, initDatabase } from "../src/database";
import { migrateAgentProviderSqliteV1 } from "../src/migrations/agent-provider-sqlite-v1";

let root: string;
let databasePath: string;
let database: DatabaseAdapter.Database;
let databaseClosed: boolean;

function closeFixtureDatabase(): void {
  if (!databaseClosed) {
    database.close();
    databaseClosed = true;
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-agent-sqlite-"));
  databasePath = path.join(root, "data", "prompthub.db");
  materializeCanonicalStorageShadow({
    targetPath: path.join(root, "data"),
    prompts: {
      prompts: [],
      promptVersions: [],
      folders: [],
      promptRelations: [],
      outputFormatItems: [],
    },
  });
  stageCanonicalStorageDatabase(path.join(root, "data"), databasePath);
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "a".repeat(64),
    operationId: "agent-sqlite-test",
  });
  database = new DatabaseAdapter(databasePath);
  databaseClosed = false;
  database.pragma("foreign_keys = ON");
});

afterEach(() => {
  closeFixtureDatabase();
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function createProfile(name = "Same display name") {
  const profiles = new AgentProviderProfileDB(database);
  return profiles.createProfileWithMappings(
    {
      name,
      platformId: "codex",
      providerKind: "openai",
      protocol: "openai-responses",
      config: { reasoningEffort: "high" },
      source: "manual",
      secretRef: "agent-provider:existing-device-reference",
    },
    [{ routeKey: "primary", modelId: "fixture-model", parameters: {} }],
  );
}

function publishLegacy(id: string): string {
  const profiles = new AgentProviderProfileDB(database);
  const profile = profiles.getProfileById(id);
  if (!profile) throw new Error("Fixture profile is missing");
  const target = path.join(root, "data", "agents", id);
  materializeAgentProviderResourceBundle({
    bundlePath: target,
    profile,
    modelMappings: profiles.listModelMappings(id),
  });
  return target;
}

function migrate(injectFailure?: (targetPath: string) => void): void {
  migrateAgentProviderSqliteV1(database, {
    rootPath: root,
    databasePath,
    injectFailure,
  });
}

it("migrates historical bundles at the Core startup entrypoint before exposing SQL", () => {
  const profile = createProfile();
  const source = publishLegacy(profile.id);
  new AgentProviderProfileDB(database).deleteProfile(profile.id);
  closeFixtureDatabase();
  const current = new AgentProviderProfileDB(initDatabase());
  expect(current.getProfileById(profile.id)).toMatchObject({
    id: profile.id,
    name: profile.name,
  });
  expect(current.listModelMappings(profile.id)).toHaveLength(1);
  expect(fs.existsSync(source)).toBe(false);
});

it("adopts independent IDs, preserves device references and edits/deletes through SQLite across two starts", () => {
  const profiles = new AgentProviderProfileDB(database);
  const shared = createProfile();
  const localOnly = createProfile();
  const fileOnly = createProfile();
  const sharedPath = publishLegacy(shared.id);
  publishLegacy(fileOnly.id);
  const raw = fs.readFileSync(path.join(sharedPath, "agent.json"));
  profiles.deleteProfile(fileOnly.id);
  migrate();
  expect(profiles.listProfiles()).toHaveLength(3);
  expect(profiles.getProfileById(shared.id)).toEqual(shared);
  expect(profiles.getProfileById(localOnly.id)).toEqual(localOnly);
  expect(profiles.listModelMappings(fileOnly.id)[0].modelId).toBe(
    "fixture-model",
  );
  const recoveryRoot = path.join(
    root,
    "recovery",
    "agent-provider-sqlite-v1",
    shared.id,
  );
  const recovery = path.join(
    recoveryRoot,
    fs.readdirSync(recoveryRoot)[0],
    "agent.json",
  );
  expect(fs.readFileSync(recovery)).toEqual(raw);
  expect(fs.readdirSync(path.join(root, "data", "agents"))).toEqual([]);
  profiles.updateProfile(
    shared.id,
    { name: "SQL saved name" },
    shared.updatedAt,
  );
  profiles.deleteProfile(localOnly.id);
  closeFixtureDatabase();
  for (let start = 0; start < 2; start += 1) {
    const current = new AgentProviderProfileDB(initDatabase());
    expect(current.getProfileById(shared.id)).toMatchObject({
      name: "SQL saved name",
      secretRef: shared.secretRef,
    });
    expect(current.getProfileById(localOnly.id)).toBeNull();
    expect(current.getProfileById(fileOnly.id)?.name).toBe(fileOnly.name);
    closeDatabase();
  }
  expect(fs.readdirSync(path.join(root, "data", "agents"))).toEqual([]);
});

it.each(["profile", "mapping"])(
  "rejects conflicting %s data before retiring or overwriting either source",
  (kind) => {
    const profiles = new AgentProviderProfileDB(database);
    const profile = createProfile();
    const source = publishLegacy(profile.id);
    const bytes = fs.readFileSync(path.join(source, "agent.json"));
    if (kind === "profile")
      profiles.updateProfile(
        profile.id,
        { name: "SQL difference" },
        profile.updatedAt,
      );
    else
      profiles.upsertModelMapping({
        providerProfileId: profile.id,
        routeKey: "primary",
        modelId: "SQL difference",
        parameters: {},
      });
    const before = profiles.getProfileById(profile.id);
    const mappings = profiles.listModelMappings(profile.id);
    expect(() => migrate()).toThrow(/conflict/i);
    expect(profiles.getProfileById(profile.id)).toEqual(before);
    expect(profiles.listModelMappings(profile.id)).toEqual(mappings);
    expect(fs.readFileSync(path.join(source, "agent.json"))).toEqual(bytes);
  },
);

it("rolls back source retirement and new rows on SQL failure, then retries", () => {
  const profiles = new AgentProviderProfileDB(database);
  const profile = createProfile();
  const source = publishLegacy(profile.id);
  profiles.deleteProfile(profile.id);
  const bytes = fs.readFileSync(path.join(source, "agent.json"));
  database.exec(
    "CREATE TRIGGER reject_agent_upgrade BEFORE INSERT ON agent_provider_profiles BEGIN SELECT RAISE(ABORT, 'fixture SQL failure'); END;",
  );
  expect(() => migrate()).toThrow("fixture SQL failure");
  expect(profiles.listProfiles()).toEqual([]);
  expect(fs.readFileSync(path.join(source, "agent.json"))).toEqual(bytes);
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "agent-provider-sqlite-v1",
    ),
  ).toBeNull();
  database.exec("DROP TRIGGER reject_agent_upgrade");
  migrate();
  expect(profiles.getProfileById(profile.id)?.name).toBe(profile.name);
  expect(fs.existsSync(source)).toBe(false);
});

it("preserves both sources when file retirement fails and permits retry", () => {
  const profile = createProfile();
  const source = publishLegacy(profile.id);
  const bytes = fs.readFileSync(path.join(source, "agent.json"));
  expect(() =>
    migrate((target) => {
      if (target === source) throw new Error("fixture retirement failure");
    }),
  ).toThrow("fixture retirement failure");
  expect(
    new AgentProviderProfileDB(database).getProfileById(profile.id),
  ).toEqual(profile);
  expect(fs.readFileSync(path.join(source, "agent.json"))).toEqual(bytes);
  migrate();
  expect(fs.existsSync(source)).toBe(false);
});

it("does not resurrect a deleted SQL profile when a retired bundle reappears", () => {
  const profiles = new AgentProviderProfileDB(database);
  const profile = createProfile();
  const source = publishLegacy(profile.id);
  const copy = path.join(root, "retired-input");
  fs.cpSync(source, copy, { recursive: true });
  migrate();
  profiles.deleteProfile(profile.id);
  fs.cpSync(copy, source, { recursive: true });
  expect(() => migrate()).toThrow(/conflict/i);
  expect(profiles.getProfileById(profile.id)).toBeNull();
  expect(fs.existsSync(source)).toBe(true);
});

it("rejects malformed and symlinked historical bundles without changing SQL", () => {
  const profile = createProfile();
  const source = publishLegacy(profile.id);
  const file = path.join(source, "agent.json");
  fs.writeFileSync(file, "{");
  expect(() => migrate()).toThrow();
  expect(
    new AgentProviderProfileDB(database).getProfileById(profile.id),
  ).toEqual(profile);
  fs.rmSync(source, { recursive: true });
  fs.symlinkSync(path.join(root, "external"), source);
  expect(() => migrate()).toThrow(/unsafe/i);
});

it("refuses to turn a missing authoritative database into an empty replacement", () => {
  createProfile();
  migrate();
  closeFixtureDatabase();
  fs.unlinkSync(databasePath);
  expect(() => initDatabase()).toThrow(/SQLite.*recovery/i);
  expect(fs.existsSync(databasePath)).toBe(false);
});

it("keeps SQL profiles and snapshots when another domain's catalog is rebuilt", () => {
  const profile = createProfile();
  const profiles = new AgentProviderProfileDB(database);
  const snapshot = profiles.createSnapshot({
    platformId: "codex",
    providerProfileId: profile.id,
    nativeDigest: "fixture-digest",
    redactedSnapshot: {},
    operation: "import",
    result: "verified",
  });
  migrate();
  database.run(
    "INSERT INTO canonical_resources VALUES (?, ?, ?, ?, ?, ?, ?)",
    "agent-provider",
    "stale-catalog",
    1,
    1,
    "a".repeat(64),
    "agents/stale/manifest.json",
    new Date().toISOString(),
  );
  closeFixtureDatabase();
  const current = new AgentProviderProfileDB(initDatabase());
  expect(current.getProfileById(profile.id)).toEqual(profile);
  expect(current.listSnapshots({ platformId: "codex" })).toEqual([snapshot]);
  closeDatabase();
});
