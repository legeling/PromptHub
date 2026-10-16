import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase, RuleDB } from "../src/database";
import { DatabaseAdapter, FolderDB, PromptDB, SCHEMA } from "@prompthub/db";
import { writeRuntimeLayoutState } from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";
import { collectPromptCanonicalGraph } from "../src/prompt-canonical-export";
import {
  configureRuntimePaths,
  getRulesDir,
  resetRuntimePaths,
} from "../src/runtime-paths";
import { createRulesWorkspaceService } from "../src/rules-workspace";

describe.each(["database-catalog", "canonical-files"])(
  "explicit historical Rules upgrade (%s)",
  (authority) => {
    let root: string;
    const ruleId = "claude-global";
    const oldVersion = {
      id: "historical",
      savedAt: "2025-01-01T00:00:00.000Z",
      content: "历史规则",
      source: "manual-save",
    };
    const sourcePath = () => path.join(root, "rule-history", `${ruleId}.json`);
    const targetPath = () => path.join(root, "targets", "claude", "CLAUDE.md");
    function service() {
      const database = initDatabase();
      return createRulesWorkspaceService({
        getRulesDir,
        createRuleDb: () => new RuleDB(database),
        getPlatformRootDir: (platform) =>
          path.join(root, "targets", platform.id),
        getPlatformGlobalRulePath: (platform) =>
          platform.id === "claude"
            ? targetPath()
            : path.join(root, "targets", platform.id, "AGENTS.md"),
      });
    }
    function seed(value: unknown = [oldVersion]) {
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(sourcePath(), JSON.stringify(value));
    }
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-rule-upgrade-"));
      if (authority === "canonical-files") {
        const database = new DatabaseAdapter(":memory:");
        try {
          database.exec(SCHEMA);
          materializeCanonicalStorageShadow({
            targetPath: path.join(root, "data"),
            prompts: collectPromptCanonicalGraph(
              new PromptDB(database),
              new FolderDB(database),
              database,
            ),
          });
        } finally {
          database.close();
        }
        stageCanonicalStorageDatabase(
          path.join(root, "data"),
          path.join(root, "data", "prompthub.db"),
        );
        writeRuntimeLayoutState(root);
        writeCanonicalStorageAuthority(root, {
          consistencyId: "c".repeat(64),
          operationId: "rule-upgrade-test",
        });
      }
      configureRuntimePaths({ userDataPath: root });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      closeDatabase();
      resetRuntimePaths();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("ordinary list/read does not import historical data", async () => {
      seed();
      const workspace = service();
      await workspace.listRuleDescriptors();
      expect((await workspace.readRuleContent(ruleId)).versions).toEqual([]);
      expect(fs.existsSync(sourcePath())).toBe(true);
    });

    it("upgrades once, preserves exact source, and survives close/reopen and deletion", async () => {
      seed();
      const source = fs.readFileSync(sourcePath(), "utf8");
      let workspace = service();
      await workspace.bootstrapRuleWorkspace();
      expect(fs.existsSync(sourcePath())).toBe(false);
      expect(
        initDatabase()
          .prepare("SELECT name FROM schema_migrations WHERE name = ?")
          .get("rule-history-v1"),
      ).toEqual({ name: "rule-history-v1" });
      const backupDir = path.join(root, "recovery", "rule-history-v1");
      expect(
        fs
          .readdirSync(backupDir)
          .map((name) => fs.readFileSync(path.join(backupDir, name), "utf8")),
      ).toContain(source);
      closeDatabase();
      workspace = service();
      await workspace.bootstrapRuleWorkspace();
      const restored = await workspace.readRuleContent(ruleId);
      expect(restored.content).toBe(oldVersion.content);
      expect(restored.versions).toEqual([oldVersion]);
      expect(restored.syncStatus).toBe("target-missing");
      expect(fs.existsSync(targetPath())).toBe(false);
      await workspace.saveRuleContent(ruleId, "current body");
      await workspace.deleteRuleVersion(ruleId, oldVersion.id);
      closeDatabase();
      workspace = service();
      await workspace.bootstrapRuleWorkspace();
      expect(
        (await workspace.readRuleContent(ruleId)).versions.some(
          (version) => version.id === oldVersion.id,
        ),
      ).toBe(false);
    });

    it("recovers committed Rule history after a failed journal commit marker", async () => {
      seed();
      const workspace = service();
      const rename = fs.renameSync.bind(fs);
      const fault = vi
        .spyOn(fs, "renameSync")
        .mockImplementation((from, to) => {
          if (
            String(to).endsWith("rule-history-v1-publication.json") &&
            JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
          )
            throw new Error("injected Rule commit journal failure");
          return rename(from, to);
        });
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow(
        /outcome is unknown/,
      );
      fault.mockRestore();
      closeDatabase();
      const reopened = service();
      expect(fs.existsSync(sourcePath())).toBe(false);
      expect(await reopened.readRuleContent(ruleId)).toMatchObject({
        content: oldVersion.content,
        versions: [oldVersion],
      });
      await reopened.bootstrapRuleWorkspace();
      expect((await reopened.readRuleContent(ruleId)).versions).toEqual([
        oldVersion,
      ]);
    });

    it("merges existing history without replacing current content or truncating old history", async () => {
      const workspace = service();
      fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
      fs.writeFileSync(targetPath(), "current body");
      await workspace.listRuleDescriptors();
      const historicalCount = 25;
      seed(
        Array.from({ length: historicalCount }, (_, index) => ({
          ...oldVersion,
          id: `historical-${index}`,
          content: `body ${index}`,
        })),
      );
      await workspace.bootstrapRuleWorkspace();
      const result = await workspace.readRuleContent(ruleId);
      expect(result.content).toBe("current body");
      expect(result.versions).toHaveLength(historicalCount + 1);
      expect(fs.readFileSync(targetPath(), "utf8")).toBe("current body");
    });

    it.each([
      "invalid date",
      "conflicting id",
      "unknown rule",
      "invalid JSON",
      "invalid id",
      "invalid UTF8",
    ])("preserves all inputs on %s", async (failure) => {
      const workspace = service();
      seed();
      if (failure === "invalid UTF8")
        fs.writeFileSync(sourcePath(), Buffer.from([0x7b, 0xff, 0x7d]));
      if (failure === "invalid id") seed([{ ...oldVersion, id: "bad\0id" }]);
      if (failure === "invalid date")
        seed([{ ...oldVersion, savedAt: "invalid" }]);
      if (failure === "conflicting id")
        seed([oldVersion, { ...oldVersion, content: "conflict" }]);
      if (failure === "unknown rule") seed({ "unknown-global": [oldVersion] });
      if (failure === "invalid JSON") fs.writeFileSync(sourcePath(), "{");
      const before = fs.readFileSync(sourcePath(), "utf8");
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow();
      expect(fs.readFileSync(sourcePath(), "utf8")).toBe(before);
      expect(fs.existsSync(path.join(root, "data", "rules", ruleId))).toBe(
        false,
      );
    });

    it("rolls back a failed source retirement and retries without duplicates", async () => {
      seed();
      const workspace = service();
      const rename = fs.renameSync;
      const spy = vi
        .spyOn(fs, "renameSync")
        .mockImplementation((source, target) => {
          if (source === sourcePath())
            throw new Error("injected retirement failure");
          return rename(source, target);
        });
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow(
        "injected retirement failure",
      );
      expect(fs.existsSync(sourcePath())).toBe(true);
      spy.mockRestore();
      await workspace.bootstrapRuleWorkspace();
      expect((await workspace.readRuleContent(ruleId)).versions).toEqual([
        oldVersion,
      ]);
    });

    it("rejects symlinked historical input without following it", async () => {
      const outside = path.join(root, "outside.json");
      fs.writeFileSync(outside, JSON.stringify([oldVersion]));
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.symlinkSync(outside, sourcePath());
      await expect(service().bootstrapRuleWorkspace()).rejects.toThrow();
      expect(fs.lstatSync(sourcePath()).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(outside, "utf8")).toBe(
        JSON.stringify([oldVersion]),
      );
    });
    it("upgrades shared identity maps and restored sources through the same boundary", async () => {
      seed({
        "claude-global": [oldVersion],
        "codex-global": [{ ...oldVersion, id: "codex-history" }],
      });
      let workspace = service();
      await workspace.bootstrapRuleWorkspace();
      expect(
        (await workspace.readRuleContent("codex-global")).versions[0].id,
      ).toBe("codex-history");
      closeDatabase();
      seed([
        oldVersion,
        {
          ...oldVersion,
          id: "restored-history",
          content: "restored old body",
          savedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);
      workspace = service();
      await workspace.bootstrapRuleWorkspace();
      const result = await workspace.readRuleContent(ruleId);
      expect(result.content).toBe(oldVersion.content);
      expect(result.versions.map((version) => version.id)).toEqual([
        oldVersion.id,
        "restored-history",
      ]);
    });

    it("rejects a collision with current versions before changing managed content", async () => {
      const workspace = service();
      await workspace.saveRuleContent(ruleId, "current body");
      const before = await workspace.readRuleContent(ruleId);
      seed([{ ...before.versions[0], content: "conflicting historical body" }]);
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow(
        "version conflict",
      );
      expect((await workspace.readRuleContent(ruleId)).content).toBe(
        before.content,
      );
      expect(fs.existsSync(sourcePath())).toBe(true);
    });
    it("rejects version identities shared by different Rules before retiring input", async () => {
      seed({ "claude-global": [oldVersion], "codex-global": [oldVersion] });
      const workspace = service();
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow(
        "version identity",
      );
      expect(fs.existsSync(sourcePath())).toBe(true);
      expect((await workspace.readRuleContent(ruleId)).versions).toEqual([]);
    });

    it("rejects a historical identity already owned by another current Rule", async () => {
      const workspace = service();
      await workspace.saveRuleContent("codex-global", "current codex");
      const before = await workspace.readRuleContent("codex-global");
      seed([{ ...oldVersion, id: before.versions[0].id }]);
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow(
        "version identity",
      );
      expect(fs.existsSync(sourcePath())).toBe(true);
      expect(
        (await workspace.readRuleContent("codex-global")).versions,
      ).toEqual(before.versions);
    });

    it("rolls back file publication when the database migration commit fails", async () => {
      seed();
      const workspace = service();
      const database = initDatabase();
      database.exec(
        "CREATE TRIGGER fail_rule_migration BEFORE INSERT ON rule_versions BEGIN SELECT RAISE(ABORT, 'injected database migration failure'); END",
      );
      await expect(workspace.bootstrapRuleWorkspace()).rejects.toThrow(
        "injected database migration failure",
      );
      expect(fs.existsSync(sourcePath())).toBe(true);
      expect(
        database.prepare("SELECT COUNT(*) AS count FROM rule_versions").get(),
      ).toEqual({ count: 0 });
      expect(
        database
          .prepare("SELECT name FROM schema_migrations WHERE name = ?")
          .get("rule-history-v1"),
      ).toBeNull();
      database.exec("DROP TRIGGER fail_rule_migration");
      closeDatabase();
      const reopened = service();
      await reopened.bootstrapRuleWorkspace();
      expect((await reopened.readRuleContent(ruleId)).versions).toEqual([
        oldVersion,
      ]);
    });
  },
);
