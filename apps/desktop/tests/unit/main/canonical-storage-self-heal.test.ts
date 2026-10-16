import { hashContent } from "@prompthub/core/rules-workspace-support";
import { migrateSkillSqliteV1 } from "@prompthub/core/migrations/skill-sqlite-v1";
/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  materializeCanonicalStorageShadow,
  RuleStorageDB,
  getRuleManagedPath,
  readPromptCanonicalGraph,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import {
  acquireDatabaseClientLease,
  AgentProviderProfileDB,
  PromptDB,
  PluginDB,
} from "@prompthub/db";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentProviderProfile } from "@prompthub/shared";

import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import {
  reconcileCanonicalStorageCatalog,
  repairCanonicalStorageFromPromptWorkspace,
} from "../../../src/main/services/canonical-storage-self-heal";

describe("canonical storage startup self-heal", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetRuntimePaths();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture() {
    const activeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-storage-self-heal-"),
    );
    roots.push(activeRoot);
    configureRuntimePaths({ userDataPath: activeRoot });
    writeRuntimeLayoutState(activeRoot);
    const dataPath = path.join(activeRoot, "data");
    const graphPath = path.join(activeRoot, "empty-graph");
    const canonicalMediaPath = path.join(activeRoot, "canonical-media.jpeg");
    fs.writeFileSync(canonicalMediaPath, "canonical image bytes", "utf8");
    const skillEntrypoint = path.join(activeRoot, "canonical-skill.md");
    fs.writeFileSync(skillEntrypoint, "# File skill\n");
    materializeCanonicalStorageShadow({
      targetPath: graphPath,
      prompts: {
        prompts: [
          {
            id: "shared-prompt",
            title: "Superseded canonical title",
            userPrompt: "Superseded canonical content.",
            variables: [],
            tags: [],
            images: ["missing-legacy-image.jpeg"],
            videos: [],
            isFavorite: false,
            isPinned: false,
            version: 1,
            currentVersion: 1,
            usageCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        promptVersions: [
          {
            id: "superseded-version-1",
            promptId: "shared-prompt",
            version: 1,
            userPrompt: "Superseded canonical content.",
            variables: [],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        folders: [],
        promptRelations: [],
        outputFormatItems: [],
      },
      resolvePromptMediaSource: () => canonicalMediaPath,
      skills: [
        {
          skill: {
            id: "skill-1",
            name: "file-skill",
            content: "# File skill\n",
            instructions: "# File skill\n",
            protocol_type: "skill",
            tags: [],
            is_favorite: false,
            currentVersion: 1,
            versionTrackingEnabled: true,
            created_at: Date.parse("2026-01-01T00:00:00.000Z"),
            updated_at: Date.parse("2026-01-01T00:00:00.000Z"),
          },
          versions: [],
          packageFiles: [{ path: "SKILL.md", sourcePath: skillEntrypoint }],
        },
      ],
    });
    fs.mkdirSync(dataPath, { recursive: true });
    for (const entry of fs.readdirSync(graphPath)) {
      fs.renameSync(path.join(graphPath, entry), path.join(dataPath, entry));
    }
    fs.rmdirSync(graphPath);
    writeCanonicalStorageAuthority(activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "broken-authority",
    });

    const promptsPath = path.join(dataPath, "prompts");
    fs.mkdirSync(promptsPath, { recursive: true });
    fs.mkdirSync(path.join(promptsPath, "empty-workspace-folder"));
    const markdownPath = path.join(promptsPath, "file-prompt.md");
    fs.writeFileSync(
      markdownPath,
      `---
id: "shared-prompt"
title: "File title"
currentVersion: 2
images: ["missing-legacy-image.jpeg"]
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-08-18T00:00:00.000Z"
---
File current content.
`,
      "utf8",
    );
    const appearancePath = path.join(dataPath, "agent-appearance", "theme.txt");
    fs.mkdirSync(path.dirname(appearancePath), { recursive: true });
    fs.writeFileSync(appearancePath, "keep appearance", "utf8");
    const mcpCompatibilityPath = path.join(dataPath, "mcp", "library.json");
    const pluginCachePath = path.join(dataPath, "plugins", "market-cache.json");
    fs.mkdirSync(path.dirname(mcpCompatibilityPath), { recursive: true });
    fs.mkdirSync(path.dirname(pluginCachePath), { recursive: true });
    fs.writeFileSync(mcpCompatibilityPath, "{}\n", "utf8");
    fs.writeFileSync(pluginCachePath, "{}\n", "utf8");
    const secretPath = path.join(
      activeRoot,
      "secrets",
      "mcp-resource-secrets.json",
    );
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, "{invalid secret store", "utf8");

    const databasePath = path.join(dataPath, "prompthub.db");
    const database = new DatabaseAdapter(databasePath);
    database.exec(SCHEMA_TABLES);
    database.exec(SCHEMA_INDEXES);
    database.exec(
      "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    migrateSkillSqliteV1(database, { rootPath: activeRoot, databasePath });
    const promptDb = new PromptDB(database);
    promptDb.insertPromptDirect({
      id: "shared-prompt",
      title: "Database title",
      isFavorite: false,
      isPinned: false,
      userPrompt: "Database current content.",
      variables: [],
      tags: [],
      images: [],
      videos: [],
      version: 2,
      currentVersion: 2,
      usageCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    promptDb.insertVersionDirect({
      id: "version-1",
      promptId: "shared-prompt",
      version: 1,
      userPrompt: "History one",
      variables: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    database.run(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
      "theme",
      "dark",
    );
    database.close();
    const downgradeMarkerPath = path.join(
      dataPath,
      ".prompthub-0.5.3-backup-done",
    );
    const standaloneBackupPath = path.join(
      dataPath,
      "prompthub.db.backup-before-0.5.3.2026-08-14T08-34-00-283Z.db",
    );
    fs.writeFileSync(downgradeMarkerPath, "legacy marker", "utf8");
    fs.writeFileSync(standaloneBackupPath, "legacy database backup", "utf8");
    return {
      activeRoot,
      appearancePath,
      databasePath,
      downgradeMarkerPath,
      markdownPath,
      mcpCompatibilityPath,
      pluginCachePath,
      secretPath,
      standaloneBackupPath,
    };
  }

  it("repairs a deterministic Markdown workspace without reading device secrets", async () => {
    const input = fixture();
    const source = new DatabaseAdapter(input.databasePath, { readOnly: true });
    expect(
      source.get("SELECT value FROM settings WHERE key = ?", "theme"),
    ).toEqual({ value: "dark" });
    source.close();

    const repaired = await repairCanonicalStorageFromPromptWorkspace({
      activeRoot: input.activeRoot,
      sourceDatabasePath: input.databasePath,
      trustedRoots: [],
      now: new Date("2026-08-18T13:00:00.000Z"),
    });

    const graph = readPromptCanonicalGraph(path.join(input.activeRoot, "data"));
    expect(graph.snapshot.prompts).toEqual([
      expect.objectContaining({
        id: "shared-prompt",
        title: "File title",
        userPrompt: "File current content.",
      }),
    ]);
    expect(graph.snapshot.promptVersions.map((item) => item.version)).toEqual([
      1, 2,
    ]);
    const mediaObject = JSON.parse(
      fs.readFileSync(
        path.join(
          input.activeRoot,
          "data",
          "prompts",
          "shared-prompt",
          "prompt.json",
        ),
        "utf8",
      ),
    ).mediaObjects[0];
    expect(mediaObject).toMatchObject({
      kind: "image",
      reference: "missing-legacy-image.jpeg",
    });
    expect(
      fs.existsSync(
        path.join(
          input.activeRoot,
          "data",
          "assets",
          "objects",
          "sha256",
          mediaObject.sha256.slice(0, 2),
          mediaObject.sha256,
        ),
      ),
    ).toBe(true);
    expect(fs.readFileSync(input.appearancePath, "utf8")).toBe(
      "keep appearance",
    );
    expect(fs.readFileSync(input.secretPath, "utf8")).toBe(
      "{invalid secret store",
    );
    expect(fs.readFileSync(input.mcpCompatibilityPath, "utf8")).toBe("{}\n");
    expect(fs.readFileSync(input.pluginCachePath, "utf8")).toBe("{}\n");
    expect(fs.existsSync(input.markdownPath)).toBe(false);
    expect(fs.existsSync(input.downgradeMarkerPath)).toBe(false);
    expect(fs.existsSync(input.standaloneBackupPath)).toBe(false);
    expect(fs.existsSync(`${input.databasePath}.migration-intent.json`)).toBe(
      false,
    );
    expect(
      fs.existsSync(
        path.join(
          repaired.recoveryArtifactPath,
          "root",
          "data",
          "prompts",
          "file-prompt.md",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repaired.recoveryArtifactPath,
          "root",
          "data",
          path.basename(input.standaloneBackupPath),
        ),
      ),
    ).toBe(true);

    const prior = new DatabaseAdapter(
      path.join(repaired.recoveryArtifactPath, "root", "data", "prompthub.db"),
      { readOnly: true },
    );
    expect(
      prior.get("SELECT value FROM settings WHERE key = ?", "theme"),
    ).toEqual({ value: "dark" });
    prior.close();

    const database = new DatabaseAdapter(input.databasePath, {
      readOnly: true,
    });
    try {
      expect(new PromptDB(database).getById("shared-prompt")?.title).toBe(
        "File title",
      );
      expect(
        database
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("theme"),
      ).toEqual({ value: "dark" });
      expect(
        database.get(
          "SELECT local_repo_path FROM skills WHERE id = ?",
          "skill-1",
        ),
      ).toEqual({
        local_repo_path: path.join(
          input.activeRoot,
          "data",
          "skills",
          "skill-1",
          "files",
        ),
      });
    } finally {
      database.close();
    }
  });

  it("preserves authoritative provider rows when repairing another domain", async () => {
    const input = fixture();
    const original = new DatabaseAdapter(input.databasePath);
    let profile: AgentProviderProfile;
    const plugin = {
      id: "sql-plugin",
      name: "sql-plugin",
      displayName: "SQL Plugin",
      trustLevel: "custom" as const,
      classification: "bundle" as const,
      inventory: {
        skills: 0,
        mcpServers: 0,
        apps: 0,
        commands: 0,
        hooks: 0,
        agents: 0,
        assets: 0,
        docs: 0,
        lspServers: 0,
        scripts: 0,
      },
      source: { kind: "local" as const },
      installedAt: 1,
      updatedAt: 1,
    };
    try {
      new PluginDB(original).replace([plugin], []);
      const id = "project:preserved-rule";
      const managedPath = getRuleManagedPath({
        id,
        scope: "project",
        canonicalFileName: "AGENTS.md",
      });
      const savedAt = "2026-10-16T00:00:00.000Z";
      new RuleStorageDB(original).publishGraphs([
        {
          rule: {
            id,
            scope: "project",
            platformId: "workspace",
            platformName: "Preserved",
            platformIcon: "Folder",
            platformDescription: "Project",
            canonicalFileName: "AGENTS.md",
            description: "Preserved SQL rule",
            contentHash: hashContent("# Preserve Rule"),
            managedPath,
            targetPath: "",
            projectRootPath: null,
            syncStatus: "target-missing",
            currentVersion: 1,
            createdAt: savedAt,
            updatedAt: savedAt,
          },
          content: "# Preserve Rule",
          versions: [
            {
              id: "preserved-rule-history",
              savedAt,
              source: "create",
              content: "# Earlier Rule",
            },
          ],
        },
      ]);
      profile = new AgentProviderProfileDB(original).createProfileWithMappings(
        {
          platformId: "codex",
          name: "Retain SQL provider",
          providerKind: "openai",
          protocol: "openai-responses",
          config: {},
          source: "manual",
          secretRef: "agent-provider:retain-device-reference",
        },
        [{ routeKey: "primary", modelId: "fixture", parameters: {} }],
      );
    } finally {
      original.close();
    }
    await repairCanonicalStorageFromPromptWorkspace({
      activeRoot: input.activeRoot,
      sourceDatabasePath: input.databasePath,
      trustedRoots: [],
    });
    const restored = new DatabaseAdapter(input.databasePath, {
      readOnly: true,
    });
    try {
      expect(new PluginDB(restored).list()).toEqual([plugin]);
      const rules = new RuleStorageDB(restored);
      const rule = rules.getById("project:preserved-rule");
      if (!rule) throw new Error("Rule lost during recovery");
      expect(rules.readContent(rule)).toBe("# Preserve Rule");
      expect(rules.readVersions(rule.id)).toMatchObject([
        { content: "# Earlier Rule" },
      ]);
      const providers = new AgentProviderProfileDB(restored);
      expect(providers.getProfileById(profile.id)).toEqual(profile);
      expect(providers.listModelMappings(profile.id)).toMatchObject([
        { modelId: "fixture" },
      ]);
    } finally {
      restored.close();
    }
  });

  it("repairs the resource index without overwriting SQL edits and is idempotent", async () => {
    const input = fixture();
    await repairCanonicalStorageFromPromptWorkspace({
      activeRoot: input.activeRoot,
      sourceDatabasePath: input.databasePath,
      trustedRoots: [],
    });
    reconcileCanonicalStorageCatalog({
      activeRoot: input.activeRoot,
      databasePath: input.databasePath,
    });
    const stale = new DatabaseAdapter(input.databasePath);
    stale.run(
      "UPDATE prompts SET title = ? WHERE id = ?",
      "Current SQL title",
      "shared-prompt",
    );
    stale.run(
      "INSERT INTO canonical_resources VALUES (?, ?, ?, ?, ?, ?, ?)",
      "prompt",
      "retired-resource",
      1,
      1,
      "a".repeat(64),
      "prompts/retired/manifest.json",
      new Date().toISOString(),
    );
    stale.close();

    expect(
      reconcileCanonicalStorageCatalog({
        activeRoot: input.activeRoot,
        databasePath: input.databasePath,
      }),
    ).toEqual({ status: "rebuilt" });
    expect(
      reconcileCanonicalStorageCatalog({
        activeRoot: input.activeRoot,
        databasePath: input.databasePath,
      }),
    ).toEqual({ status: "current" });

    const rebuilt = new DatabaseAdapter(input.databasePath, { readOnly: true });
    try {
      expect(new PromptDB(rebuilt).getById("shared-prompt")?.title).toBe(
        "Current SQL title",
      );
      expect(
        rebuilt.all(
          "SELECT resource_id FROM canonical_resources WHERE resource_type = ?",
          "prompt",
        ),
      ).toEqual([]);
      expect(
        rebuilt
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("theme"),
      ).toEqual({ value: "dark" });
    } finally {
      rebuilt.close();
    }
  });

  it("keeps the active tree unchanged when Markdown ids are ambiguous", async () => {
    const input = fixture();
    const duplicatePath = path.join(
      input.activeRoot,
      "data",
      "prompts",
      "duplicate.md",
    );
    fs.copyFileSync(input.markdownPath, duplicatePath);
    const catalogBefore = fs.readFileSync(
      path.join(input.activeRoot, "data", "catalog.json"),
    );

    await expect(
      repairCanonicalStorageFromPromptWorkspace({
        activeRoot: input.activeRoot,
        sourceDatabasePath: input.databasePath,
        trustedRoots: [],
      }),
    ).rejects.toThrow(/duplicate/iu);

    expect(fs.readFileSync(input.markdownPath, "utf8")).toContain("File title");
    expect(fs.existsSync(duplicatePath)).toBe(true);
    expect(
      fs.readFileSync(path.join(input.activeRoot, "data", "catalog.json")),
    ).toEqual(catalogBefore);
  });

  it("rejects incomplete bundle-shaped directories beside Markdown", async () => {
    const input = fixture();
    const typeSubstitutedPath = path.join(
      input.activeRoot,
      "data",
      "prompts",
      "type-substituted-bundle",
    );
    fs.mkdirSync(path.join(typeSubstitutedPath, "prompt.json"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(typeSubstitutedPath, "manifest.json"),
      "{}\n",
      "utf8",
    );
    const unexpectedPath = path.join(
      input.activeRoot,
      "data",
      "prompts",
      "incomplete-bundle",
      "unexpected.json",
    );
    fs.mkdirSync(path.dirname(unexpectedPath), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(unexpectedPath), "manifest.json"),
      "{}\n",
      "utf8",
    );
    fs.writeFileSync(unexpectedPath, "{}\n", "utf8");

    await expect(
      repairCanonicalStorageFromPromptWorkspace({
        activeRoot: input.activeRoot,
        sourceDatabasePath: input.databasePath,
        trustedRoots: [],
      }),
    ).rejects.toThrow(/unexpected file/iu);
    expect(fs.existsSync(input.markdownPath)).toBe(true);
    expect(fs.existsSync(unexpectedPath)).toBe(true);
  });

  it("rejects a damaged canonical media fallback", async () => {
    const input = fixture();
    const promptDocument = JSON.parse(
      fs.readFileSync(
        path.join(
          input.activeRoot,
          "data",
          "prompts",
          "shared-prompt",
          "prompt.json",
        ),
        "utf8",
      ),
    );
    const hash = promptDocument.mediaObjects[0].sha256 as string;
    fs.writeFileSync(
      path.join(
        input.activeRoot,
        "data",
        "assets",
        "objects",
        "sha256",
        hash.slice(0, 2),
        hash,
      ),
      "damaged image bytes",
      "utf8",
    );

    await expect(
      repairCanonicalStorageFromPromptWorkspace({
        activeRoot: input.activeRoot,
        sourceDatabasePath: input.databasePath,
        trustedRoots: [],
      }),
    ).rejects.toThrow(/content-addressed .*object/iu);
    expect(fs.existsSync(input.markdownPath)).toBe(true);
  });

  it("rolls back a publication failure and remains retryable", async () => {
    const input = fixture();

    await expect(
      repairCanonicalStorageFromPromptWorkspace({
        activeRoot: input.activeRoot,
        sourceDatabasePath: input.databasePath,
        trustedRoots: [],
        injectFailure(stage) {
          if (stage === "verified") throw new Error("verification interrupted");
        },
      }),
    ).rejects.toThrow("verification interrupted");

    expect(fs.existsSync(input.markdownPath)).toBe(true);
    expect(() =>
      readPromptCanonicalGraph(path.join(input.activeRoot, "data")),
    ).toThrow(/canonical graph|undeclared file/iu);

    await expect(
      repairCanonicalStorageFromPromptWorkspace({
        activeRoot: input.activeRoot,
        sourceDatabasePath: input.databasePath,
        trustedRoots: [],
      }),
    ).resolves.toMatchObject({ recoveryArtifactPath: expect.any(String) });
  });

  it("does not replace SQLite while another database client is live", async () => {
    const input = fixture();
    const lease = acquireDatabaseClientLease(input.databasePath, {
      registerExitHandler: false,
    });
    try {
      await expect(
        repairCanonicalStorageFromPromptWorkspace({
          activeRoot: input.activeRoot,
          sourceDatabasePath: input.databasePath,
          trustedRoots: [],
        }),
      ).rejects.toThrow("database clients to be closed");
      expect(fs.existsSync(input.markdownPath)).toBe(true);
    } finally {
      lease.release();
    }
  });
});
