/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  acquireStorageMaintenanceIntent,
  configureRuntimePaths,
  getImagesDir,
  readCanonicalStorageShadow,
  resetRuntimePaths,
  stageCanonicalStorageDatabase,
} from "@prompthub/core";
import {
  closeDatabase,
  FolderDB,
  initDatabase,
  PromptDB,
  RuleDB,
  SkillDB,
} from "@prompthub/db";

import { projectCanonicalStorageShadow } from "../../../src/main/services/canonical-storage-projector";
import { GenerationLibrary } from "../../../src/main/services/generation-library";

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0a00000000", "hex");

describe("canonical storage production projector", () => {
  const roots: string[] = [];

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("projects live SQLite and package files into a reloadable canonical shadow", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-projector-"),
    );
    roots.push(root);
    configureRuntimePaths({ userDataPath: root });
    const database = initDatabase(path.join(root, "prompthub.db"));
    const folder = new FolderDB(database).create({ name: "Writing" });
    const prompt = new PromptDB(database).create({
      title: "Launch note",
      userPrompt: "Write {{topic}}",
      variables: [{ name: "topic", type: "text", required: true }],
      tags: ["release"],
      folderId: folder.id,
      images: ["launch.png"],
    });
    fs.mkdirSync(getImagesDir(), { recursive: true });
    fs.writeFileSync(path.join(getImagesDir(), "launch.png"), "image-bytes");
    const packagePath = path.join(root, "skill-package");
    fs.mkdirSync(path.join(packagePath, "references"), { recursive: true });
    fs.writeFileSync(path.join(packagePath, "SKILL.md"), "# Writer\n", "utf8");
    fs.writeFileSync(
      path.join(packagePath, "references", "style.md"),
      "Concise\n",
      "utf8",
    );
    const skill = new SkillDB(database).create({
      name: "Writer",
      description: "Writing helper",
      instructions: "Write clearly",
      protocol_type: "skill",
      is_favorite: false,
      local_repo_path: packagePath,
    });
    const targetPath = path.join(root, "canonical-shadow");

    const result = await projectCanonicalStorageShadow({
      database,
      targetPath,
      readRules: async () => [],
      mcpLibrary: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: new Date().toISOString(),
        servers: [],
        bindings: [],
      },
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
    });

    const shadow = readCanonicalStorageShadow(result.targetPath);
    expect(
      shadow.promptGraph.snapshot.prompts.map((entry) => entry.id),
    ).toEqual([prompt.id]);
    expect(shadow.skills.map((entry) => entry.skill.id)).toEqual([skill.id]);
    expect(shadow.skills[0].packageFiles.map((entry) => entry.path)).toEqual([
      "SKILL.md",
      "references/style.md",
    ]);
    expect(result.stagedDatabase.domainCounts.skills).toBe(1);
    expect(shadow.promptGraph.snapshot.prompts[0].images).toEqual([
      "launch.png",
    ]);
    expect(
      fs.readdirSync(path.join(targetPath, "assets", "objects", "sha256")),
    ).toHaveLength(1);
    expect(fs.existsSync(result.verificationDatabasePath)).toBe(true);

    const secondDatabasePath = path.join(root, "rebuilt.db");
    expect(
      stageCanonicalStorageDatabase(result.targetPath, secondDatabasePath)
        .promptGraphHash,
    ).toBe(result.stagedDatabase.promptGraphHash);
  });

  it("uses a bounded sibling verification database for long target names", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-projector-long-target-"),
    );
    roots.push(root);
    configureRuntimePaths({ userDataPath: root });
    const database = initDatabase(path.join(root, "prompthub.db"));
    const targetBasename = `canonical-${"a".repeat(96)}-123e4567-e89b-12d3-a456-426614174000`;
    const targetPath = path.join(root, targetBasename);

    const result = await projectCanonicalStorageShadow({
      database,
      targetPath,
      readRules: async () => [],
      mcpLibrary: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: new Date().toISOString(),
        servers: [],
        bindings: [],
      },
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
    });

    expect(path.dirname(result.verificationDatabasePath)).toBe(
      path.dirname(targetPath),
    );
    expect(
      path.basename(result.verificationDatabasePath).length,
    ).toBeLessThanOrEqual(64);
    expect(path.basename(result.verificationDatabasePath)).not.toContain(
      targetBasename,
    );
    expect(fs.existsSync(result.verificationDatabasePath)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "fails closed and removes the staged shadow when a managed package contains a symlink",
    async () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-canonical-projector-link-"),
      );
      roots.push(root);
      const database = initDatabase(path.join(root, "prompthub.db"));
      const packagePath = path.join(root, "skill-package");
      fs.mkdirSync(packagePath);
      fs.writeFileSync(
        path.join(packagePath, "SKILL.md"),
        "# Writer\n",
        "utf8",
      );
      fs.symlinkSync(
        path.join(packagePath, "SKILL.md"),
        path.join(packagePath, "linked.md"),
      );
      new SkillDB(database).create({
        name: "Writer",
        description: "Writing helper",
        instructions: "Write clearly",
        protocol_type: "skill",
        is_favorite: false,
        local_repo_path: packagePath,
      });
      const targetPath = path.join(root, "canonical-shadow");

      await expect(
        projectCanonicalStorageShadow({
          database,
          targetPath,
          readRules: async () => [],
          mcpLibrary: {
            kind: "prompthub-mcp-library",
            version: 1,
            updatedAt: new Date().toISOString(),
            servers: [],
            bindings: [],
          },
          plugins: [],
          pluginVersions: new Map(),
          generations: [],
        }),
      ).rejects.toThrow("contains a symbolic link");
      expect(fs.existsSync(targetPath)).toBe(false);
    },
  );

  it("collects production generation files through the default domain readers", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-generation-"),
    );
    roots.push(root);
    configureRuntimePaths({ userDataPath: root });
    const database = initDatabase(path.join(root, "prompthub.db"));
    const library = new GenerationLibrary(database);
    const batch = await library.createBatch({
      prompt: "Canonical output",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });

    const result = await projectCanonicalStorageShadow({
      database,
      targetPath: path.join(root, "canonical-shadow"),
    });

    expect(result.stagedDatabase.domainCounts.generations).toBe(1);
    expect(
      readCanonicalStorageShadow(result.targetPath).generations,
    ).toHaveLength(1);
  });

  it("reads Rule records from the supplied snapshot database without reopening storage", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-rule-"),
    );
    roots.push(root);
    configureRuntimePaths({ userDataPath: root });
    const database = initDatabase(path.join(root, "prompthub.db"));
    const managedPath = path.join(root, "rules", "CLAUDE.md");
    const targetRulePath = path.join(root, "target", "CLAUDE.md");
    const versionPath = path.join(root, "rules", "versions", "v1.md");
    const latestVersionPath = path.join(root, "rules", "versions", "v2.md");
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    fs.mkdirSync(path.dirname(targetRulePath), { recursive: true });
    fs.mkdirSync(path.dirname(versionPath), { recursive: true });
    fs.writeFileSync(managedPath, "Managed rule\n", "utf8");
    fs.writeFileSync(targetRulePath, "Target rule\n", "utf8");
    fs.writeFileSync(versionPath, "Original rule\n", "utf8");
    fs.writeFileSync(latestVersionPath, "Managed rule\n", "utf8");
    const ruleDb = new RuleDB(database);
    ruleDb.upsert({
      id: "claude-global",
      scope: "global",
      platformId: "claude",
      platformName: "Claude Code",
      platformIcon: "claude",
      platformDescription: "Claude rules",
      canonicalFileName: "CLAUDE.md",
      description: "Global Claude rule",
      managedPath,
      targetPath: targetRulePath,
      projectRootPath: null,
      syncStatus: "out-of-sync",
      currentVersion: 2,
      contentHash: "snapshot-hash",
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    });
    ruleDb.replaceVersions("claude-global", [
      {
        id: "rule-version-1",
        ruleId: "claude-global",
        version: 1,
        filePath: versionPath,
        source: "create",
        createdAt: "2026-08-11T00:00:00.000Z",
      },
      {
        id: "rule-version-2",
        ruleId: "claude-global",
        version: 2,
        filePath: latestVersionPath,
        source: "manual-save",
        createdAt: "2026-08-11T00:01:00.000Z",
      },
    ]);
    const maintenance = acquireStorageMaintenanceIntent(root, {
      operationId: "canonical-rule-export",
      operationKind: "canonical-checkpoint",
    });

    try {
      const result = await projectCanonicalStorageShadow({
        database,
        targetPath: path.join(root, "canonical-shadow"),
      });
      const [rule] = readCanonicalStorageShadow(result.targetPath).rules;
      expect(rule.rule).toMatchObject({
        id: "claude-global",
        content: "Managed rule\n",
      });
      expect(rule.rule.versions).toEqual([
        expect.objectContaining({
          id: "rule-version-1",
          content: "Original rule\n",
        }),
        expect.objectContaining({
          id: "rule-version-2",
          content: "Managed rule\n",
        }),
      ]);
    } finally {
      maintenance.release();
    }
  });

  it("does not publish target-missing Rule placeholders with missing or empty files", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-empty-rule-"),
    );
    roots.push(root);
    configureRuntimePaths({ userDataPath: root });
    const database = initDatabase(path.join(root, "prompthub.db"));
    const targetPath = path.join(root, "home", ".config", "amp", "AGENTS.md");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "");
    new RuleDB(database).upsert({
      id: "amp-global",
      scope: "global",
      platformId: "amp",
      platformName: "Amp",
      platformIcon: "Zap",
      platformDescription: "Amp rules",
      canonicalFileName: "AGENTS.md",
      description: "Global Amp rule",
      managedPath: path.join(root, "rules", "global", "amp", "AGENTS.md"),
      targetPath,
      projectRootPath: null,
      syncStatus: "target-missing",
      currentVersion: 0,
      contentHash: "",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });

    const result = await projectCanonicalStorageShadow({
      database,
      targetPath: path.join(root, "canonical-shadow"),
    });

    expect(readCanonicalStorageShadow(result.targetPath).rules).toEqual([]);
    expect(result.stagedDatabase.domainCounts.rules).toBe(0);
  });
});
