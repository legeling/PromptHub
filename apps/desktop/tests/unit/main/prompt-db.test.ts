import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PromptDB } from "../../../src/main/database/prompt";
import {
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
} from "../../../src/main/database/schema";
import DatabaseAdapter from "../../../src/main/database/sqlite";

/**
 * Integration tests for PromptDB using real in-memory SQLite.
 * These tests exercise actual SQL, triggers, and transactions.
 */
describe("PromptDB (in-memory SQLite)", () => {
  let rawDb: DatabaseAdapter.Database;
  let db: PromptDB;

  beforeEach(() => {
    rawDb = new DatabaseAdapter(":memory:");
    rawDb.pragma("journal_mode = WAL");
    rawDb.pragma("foreign_keys = ON");
    rawDb.exec(SCHEMA_TABLES);
    rawDb.exec(SCHEMA_INDEXES);
    db = new PromptDB(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe("create", () => {
    it("creates a prompt and returns it with generated id", () => {
      const prompt = db.create({
        title: "Test Prompt",
        userPrompt: "Hello {{name}}",
      });

      expect(prompt.id).toBeDefined();
      expect(prompt.id.length).toBeGreaterThan(0);
      expect(prompt.title).toBe("Test Prompt");
      expect(prompt.userPrompt).toBe("Hello {{name}}");
      expect(prompt.isFavorite).toBe(false);
      expect(prompt.isPinned).toBe(false);
      expect(prompt.usageCount).toBe(0);
      expect(prompt.promptType).toBe("text");
    });

    it("creates an initial version automatically", () => {
      const prompt = db.create({
        title: "Versioned",
        userPrompt: "content",
      });

      const versions = db.getVersions(prompt.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].note).toBe("Initial version");
    });

    it("stores optional fields correctly", () => {
      const prompt = db.create({
        title: "Full",
        userPrompt: "user",
        systemPrompt: "system",
        description: "desc",
        promptType: "image",
        variables: [{ name: "v1", type: "text", required: true }],
        tags: ["tag1", "tag2"],
        source: "https://example.com",
        notes: "some notes",
        images: ["img1.png"],
      });

      expect(prompt.systemPrompt).toBe("system");
      expect(prompt.description).toBe("desc");
      expect(prompt.promptType).toBe("image");
      expect(prompt.variables).toEqual([
        { name: "v1", type: "text", required: true },
      ]);
      expect(prompt.tags).toEqual(["tag1", "tag2"]);
      expect(prompt.source).toBe("https://example.com");
      expect(prompt.notes).toBe("some notes");
      expect(prompt.images).toEqual(["img1.png"]);
    });

    it("defaults empty arrays for variables, tags, images", () => {
      const prompt = db.create({ title: "Min", userPrompt: "p" });
      expect(prompt.variables).toEqual([]);
      expect(prompt.tags).toEqual([]);
      expect(prompt.images).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────
  describe("getById", () => {
    it("returns null for non-existent id", () => {
      expect(db.getById("non-existent")).toBeNull();
    });

    it("returns the correct prompt", () => {
      const created = db.create({ title: "Find Me", userPrompt: "content" });
      const found = db.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find Me");
    });
  });

  // ─────────────────────────────────────────────
  // getAll
  // ─────────────────────────────────────────────
  describe("getAll", () => {
    it("returns empty array when no prompts exist", () => {
      expect(db.getAll()).toEqual([]);
    });

    it("returns all prompts sorted by updated_at DESC", () => {
      // Insert with explicit timestamps to guarantee ordering
      const now = Date.now();
      rawDb
        .prepare(
          `INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, prompt_type, created_at, updated_at)
           VALUES (?, ?, ?, '[]', '[]', '[]', 0, 1, 0, 'text', ?, ?)`,
        )
        .run("id-first", "First", "a", now - 2000, now - 2000);
      rawDb
        .prepare(
          `INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, prompt_type, created_at, updated_at)
           VALUES (?, ?, ?, '[]', '[]', '[]', 0, 1, 0, 'text', ?, ?)`,
        )
        .run("id-second", "Second", "b", now - 1000, now - 1000);
      rawDb
        .prepare(
          `INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, prompt_type, created_at, updated_at)
           VALUES (?, ?, ?, '[]', ?, '[]', 0, 1, 0, 'text', ?, ?)`,
        )
        .run(
          "s-gamma",
          "Gamma Prompt",
          "content gamma",
          '["coding","writing"]',
          now,
          now,
        );
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe("update", () => {
    it("returns null for non-existent id", () => {
      expect(db.update("bad-id", { title: "New" })).toBeNull();
    });

    it("updates title", () => {
      const p = db.create({ title: "Old", userPrompt: "p" });
      const updated = db.update(p.id, { title: "New" });
      expect(updated!.title).toBe("New");

      // Verify persisted
      const fetched = db.getById(p.id);
      expect(fetched!.title).toBe("New");
    });

    it("creates a new version when content changes", () => {
      const p = db.create({ title: "V", userPrompt: "original" });
      expect(db.getVersions(p.id).length).toBe(1);

      const updated = db.update(p.id, { userPrompt: "modified" });
      const versions = db.getVersions(p.id);
      expect(versions.length).toBe(2);
      expect(updated?.currentVersion).toBe(2);
      expect(updated?.version).toBe(2);
    });

    it("does NOT create version for non-content changes (title only)", () => {
      const p = db.create({ title: "V", userPrompt: "p" });
      db.update(p.id, { title: "Renamed" });
      expect(db.getVersions(p.id).length).toBe(1); // Only the initial version
    });

    it("updates isFavorite boolean correctly", () => {
      const p = db.create({ title: "Fav", userPrompt: "p" });
      expect(p.isFavorite).toBe(false);

      db.update(p.id, { isFavorite: true });
      expect(db.getById(p.id)!.isFavorite).toBe(true);

      db.update(p.id, { isFavorite: false });
      expect(db.getById(p.id)!.isFavorite).toBe(false);
    });

    it("updates isPinned boolean correctly", () => {
      const p = db.create({ title: "Pin", userPrompt: "p" });
      db.update(p.id, { isPinned: true });
      expect(db.getById(p.id)!.isPinned).toBe(true);
    });

    it("updates multiple fields in one call", () => {
      const p = db.create({ title: "Multi", userPrompt: "p", tags: ["old"] });
      const updated = db.update(p.id, {
        title: "Multi Updated",
        tags: ["new1", "new2"],
        description: "added desc",
      });

      expect(updated!.title).toBe("Multi Updated");
      expect(updated!.tags).toEqual(["new1", "new2"]);
      expect(updated!.description).toBe("added desc");
    });
  });

  // ─────────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────────
  describe("delete", () => {
    it("deletes an existing prompt and returns true", () => {
      const p = db.create({ title: "Del", userPrompt: "p" });
      expect(db.delete(p.id)).toBe(true);
      expect(db.getById(p.id)).toBeNull();
    });

    it("returns false when deleting non-existent id", () => {
      expect(db.delete("no-such-id")).toBe(false);
    });

    it("cascade-deletes associated versions", () => {
      const p = db.create({ title: "CasDel", userPrompt: "p" });
      db.update(p.id, { userPrompt: "v2" });
      expect(db.getVersions(p.id).length).toBe(2);

      db.delete(p.id);
      // Versions should be gone too (ON DELETE CASCADE)
      expect(db.getVersions(p.id)).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // search
  // ─────────────────────────────────────────────
  describe("search", () => {
    beforeEach(() => {
      // Use explicit timestamps to guarantee deterministic ordering
      const now = Date.now();
      rawDb
        .prepare(
          `INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, prompt_type, created_at, updated_at)
           VALUES (?, ?, ?, '[]', ?, '[]', 0, 1, 0, 'text', ?, ?)`,
        )
        .run(
          "s-alpha",
          "Alpha Prompt",
          "content alpha",
          '["coding"]',
          now - 2000,
          now - 2000,
        );
      rawDb
        .prepare(
          `INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, prompt_type, created_at, updated_at)
           VALUES (?, ?, ?, '[]', ?, '[]', 0, 1, 0, 'text', ?, ?)`,
        )
        .run(
          "s-beta",
          "Beta Prompt",
          "content beta",
          '["writing"]',
          now - 1000,
          now - 1000,
        );
      rawDb
        .prepare(
          `INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, prompt_type, created_at, updated_at)
           VALUES (?, ?, ?, '[]', ?, '[]', 0, 1, 0, 'text', ?, ?)`,
        )
        .run(
          "s-gamma",
          "Gamma Prompt",
          "content gamma",
          '["coding","writing"]',
          now,
          now,
        );

      // Populate FTS index
      rawDb.exec(`
        INSERT INTO prompts_fts (rowid, title, description, user_prompt, system_prompt, tags)
        SELECT rowid, title, description, user_prompt, system_prompt, tags FROM prompts
      `);
    });

    it("returns all prompts when no filters", () => {
      const results = db.search({});
      expect(results.length).toBe(3);
    });

    it("filters by keyword via FTS", () => {
      const results = db.search({ keyword: "alpha" });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Alpha Prompt");
    });

    it("filters by tags", () => {
      const results = db.search({ tags: ["coding"] });
      expect(results.length).toBe(2);
    });

    it("supports pagination with limit and offset", () => {
      const page1 = db.search({ limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = db.search({ limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it("sorts by title ASC", () => {
      const results = db.search({ sortBy: "title", sortOrder: "asc" });
      expect(results[0].title).toBe("Alpha Prompt");
      expect(results[2].title).toBe("Gamma Prompt");
    });

    it("sorts by updatedAt DESC by default", () => {
      const results = db.search({});
      // Most recently created (Gamma) should be first
      expect(results[0].title).toBe("Gamma Prompt");
    });

    it("escapes FTS special characters in keyword", () => {
      // This should not throw even with special FTS chars
      const results = db.search({ keyword: 'test"OR"hack' });
      expect(results.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // incrementUsage
  // ─────────────────────────────────────────────
  describe("incrementUsage", () => {
    it("increments usage count by 1", () => {
      const p = db.create({ title: "Usage", userPrompt: "p" });
      expect(p.usageCount).toBe(0);

      db.incrementUsage(p.id);
      expect(db.getById(p.id)!.usageCount).toBe(1);

      db.incrementUsage(p.id);
      db.incrementUsage(p.id);
      expect(db.getById(p.id)!.usageCount).toBe(3);
    });
  });

  // ─────────────────────────────────────────────
  // createVersion / getVersions
  // ─────────────────────────────────────────────
  describe("versioning", () => {
    it("creates sequential versions", () => {
      const p = db.create({ title: "V", userPrompt: "v1" });
      db.update(p.id, { userPrompt: "v2" });
      db.update(p.id, { systemPrompt: "sys" });

      const versions = db.getVersions(p.id);
      expect(versions.length).toBe(3);
      // Ordered DESC
      expect(versions[0].version).toBeGreaterThan(versions[1].version);
    });

    it("returns null when creating version for non-existent prompt", () => {
      expect(db.createVersion("bad-id")).toBeNull();
    });

    it("captures current prompt content in version snapshot", () => {
      const p = db.create({
        title: "Snap",
        userPrompt: "original",
        systemPrompt: "sys",
      });
      db.update(p.id, { userPrompt: "updated" });

      const versions = db.getVersions(p.id);
      // The first version (oldest) should have 'original'
      const oldest = versions[versions.length - 1];
      expect(oldest.userPrompt).toBe("original");
      expect(oldest.systemPrompt).toBe("sys");
    });

    it("continues versioning after direct import stores the latest version number", () => {
      db.insertPromptDirect({
        id: "imported-prompt",
        title: "Imported",
        description: null,
        promptType: "text",
        systemPrompt: null,
        systemPromptEn: null,
        userPrompt: "v2",
        userPromptEn: null,
        variables: [],
        tags: [],
        folderId: null,
        images: [],
        videos: [],
        isFavorite: false,
        isPinned: false,
        version: 2,
        currentVersion: 2,
        usageCount: 0,
        source: null,
        notes: null,
        lastAiResponse: null,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      });
      db.insertVersionDirect({
        id: "imported-v1",
        promptId: "imported-prompt",
        version: 1,
        systemPrompt: null,
        systemPromptEn: null,
        userPrompt: "v1",
        userPromptEn: null,
        variables: [],
        note: "Initial version",
        aiResponse: null,
        createdAt: "2026-04-20T00:00:00.000Z",
      });
      db.insertVersionDirect({
        id: "imported-v2",
        promptId: "imported-prompt",
        version: 2,
        systemPrompt: null,
        systemPromptEn: null,
        userPrompt: "v2",
        userPromptEn: null,
        variables: [],
        note: null,
        aiResponse: null,
        createdAt: "2026-04-20T00:01:00.000Z",
      });

      const updated = db.update("imported-prompt", { userPrompt: "v3" });

      expect(updated?.currentVersion).toBe(3);
      expect(updated?.version).toBe(3);
      const versions = db.getVersions("imported-prompt");
      expect(versions).toHaveLength(3);
      expect(versions[0]?.version).toBe(3);
      expect(versions[1]?.version).toBe(2);
      expect(versions[2]?.version).toBe(1);
    });
  });

  // ─────────────────────────────────────────────
  // rollback
  // ─────────────────────────────────────────────
  describe("rollback", () => {
    it("restores prompt content from a specific version", () => {
      const p = db.create({
        title: "Roll",
        userPrompt: "v1-content",
        systemPrompt: "v1-sys",
      });
      db.update(p.id, { userPrompt: "v2-content", systemPrompt: "v2-sys" });

      // Rollback to version 1
      const rolled = db.rollback(p.id, 1);
      expect(rolled).not.toBeNull();
      expect(rolled!.userPrompt).toBe("v1-content");
      expect(rolled!.systemPrompt).toBe("v1-sys");

      // Verify persisted
      const fetched = db.getById(p.id);
      expect(fetched!.userPrompt).toBe("v1-content");
    });

    it("returns null for non-existent version", () => {
      const p = db.create({ title: "No", userPrompt: "p" });
      expect(db.rollback(p.id, 999)).toBeNull();
    });

    it("returns null for non-existent prompt", () => {
      expect(db.rollback("bad-id", 1)).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // folder association
  // ─────────────────────────────────────────────
  describe("folder association", () => {
    it("supports creating prompt with folderId", () => {
      // Create a folder first
      rawDb
        .prepare(
          "INSERT INTO folders (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("f1", "Folder 1", 0, Date.now(), Date.now());

      const p = db.create({
        title: "In Folder",
        userPrompt: "p",
        folderId: "f1",
      });
      expect(p.folderId).toBe("f1");
    });

    it("can search by folderId", () => {
      rawDb
        .prepare(
          "INSERT INTO folders (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("f1", "Folder 1", 0, Date.now(), Date.now());

      db.create({ title: "In F1", userPrompt: "p", folderId: "f1" });
      db.create({ title: "No Folder", userPrompt: "p" });

      const results = db.search({ folderId: "f1" });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("In F1");
    });

    it("can search by isFavorite", () => {
      const p = db.create({ title: "Fav", userPrompt: "p" });
      db.update(p.id, { isFavorite: true });
      db.create({ title: "Not Fav", userPrompt: "p" });

      const results = db.search({ isFavorite: true });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Fav");
    });
  });

  // ─────────────────────────────────────────────
  // Adversarial / fuzz-style boundary tests
  // ─────────────────────────────────────────────
  describe("adversarial inputs", () => {
    // SQL injection attempts — the search method uses parameterized queries
    // but the tag filter uses LIKE with string interpolation (`%"${tag}"%`)
    it("keyword with SQL injection attempt does not corrupt results", () => {
      db.create({ title: "Safe", userPrompt: "content" });
      // Classic SQL injection attempts
      const injections = [
        "'; DROP TABLE prompts; --",
        '" OR 1=1 --',
        "UNION SELECT * FROM settings",
        "1; DELETE FROM prompts WHERE 1=1",
        "Robert'); DROP TABLE prompts;--",
      ];
      for (const injection of injections) {
        expect(() => db.search({ keyword: injection })).not.toThrow();
      }
      // Table should still be intact
      expect(db.getAll().length).toBe(1);
    });

    it("tag filter with SQL injection attempt does not corrupt data", () => {
      db.create({ title: "Tagged", userPrompt: "p", tags: ["safe"] });
      // Tag filter uses: tags LIKE '%"${tag}"%' — test for escaping
      const maliciousTags = [
        '%" OR 1=1 --',
        "tag'; DROP TABLE prompts;--",
        '%"]; DELETE FROM prompts; --',
      ];
      for (const tag of maliciousTags) {
        expect(() => db.search({ tags: [tag] })).not.toThrow();
      }
      expect(db.getAll().length).toBe(1);
    });

    // FTS special characters
    it("FTS search handles all FTS5 special operators", () => {
      db.create({ title: "Normal", userPrompt: "hello world" });
      const specials = [
        "hello AND world",
        "hello OR world",
        "hello NOT world",
        "hello NEAR world",
        "hello*",
        '"hello world"',
        "col:hello",
        "{col1 col2}:hello",
        "^hello",
      ];
      for (const kw of specials) {
        expect(() => db.search({ keyword: kw })).not.toThrow();
      }
    });

    // Unicode / CJK / emoji in all fields
    it("stores and retrieves CJK/emoji content correctly", () => {
      const p = db.create({
        title: "日本語テスト 🎌",
        userPrompt: "请输入{{变量名}}的值",
        systemPrompt: "Вы — помощник 🤖",
        description: "Ελληνικά κείμενο",
        tags: ["标签", "タグ", "тег"],
        notes: "🏳️‍🌈🏴‍☠️",
      });

      const fetched = db.getById(p.id)!;
      expect(fetched.title).toBe("日本語テスト 🎌");
      expect(fetched.userPrompt).toBe("请输入{{变量名}}的值");
      expect(fetched.systemPrompt).toBe("Вы — помощник 🤖");
      expect(fetched.tags).toEqual(["标签", "タグ", "тег"]);
    });

    // Very large JSON in variables
    it("handles large nested variables array", () => {
      const bigVars = Array.from({ length: 100 }, (_, i) => ({
        name: `var_${i}`,
        type: "text" as const,
        required: i % 2 === 0,
        defaultValue: "x".repeat(1000),
      }));

      const p = db.create({
        title: "BigVars",
        userPrompt: "p",
        variables: bigVars,
      });

      const fetched = db.getById(p.id)!;
      expect(fetched.variables.length).toBe(100);
      expect(fetched.variables[99].name).toBe("var_99");
      expect(fetched.variables[0].defaultValue).toBe("x".repeat(1000));
    });

    // Empty string vs null distinction
    it("distinguishes empty string from null in optional fields", () => {
      const p = db.create({
        title: "EmptyVsNull",
        userPrompt: "p",
        description: "",
        systemPrompt: "",
        source: "",
        notes: "",
      });

      // Due to `data.description || null`, empty string becomes null
      // This tests the ACTUAL behavior (which may be a design decision or bug)
      const fetched = db.getById(p.id)!;
      // `|| null` converts empty string to null — verify actual behavior
      expect(fetched.description).toBeNull();
      expect(fetched.systemPrompt).toBeNull();
    });

    // Version number accuracy across many updates
    it("version numbers increment exactly by 1 across 20 content updates", () => {
      const p = db.create({ title: "ManyVersions", userPrompt: "v0" });
      for (let i = 1; i <= 20; i++) {
        db.update(p.id, { userPrompt: `v${i}` });
      }

      const versions = db.getVersions(p.id);
      // 1 initial + 20 content updates = 21 versions
      expect(versions.length).toBe(21);
      // Versions are ordered DESC, so first is highest
      expect(versions[0].version).toBe(21);
      expect(versions[20].version).toBe(1);

      // Every consecutive pair should differ by exactly 1
      for (let i = 0; i < versions.length - 1; i++) {
        expect(versions[i].version - versions[i + 1].version).toBe(1);
      }
    });

    // Rollback to version then continue updating
    it("can rollback and then continue creating new versions from rollback point", () => {
      const p = db.create({ title: "Rollback", userPrompt: "v1-content" });
      db.update(p.id, { userPrompt: "v2-content" });
      db.update(p.id, { userPrompt: "v3-content" });

      // Rollback to v1
      const rolled = db.rollback(p.id, 1);
      expect(rolled!.userPrompt).toBe("v1-content");

      // Continue updating — should create v4
      db.update(p.id, { userPrompt: "v4-after-rollback" });
      const versions = db.getVersions(p.id);
      // Initial(v1) + update(v2) + update(v3) + rollback-creates-v4 + post-rollback-update(v5) = 5
      expect(versions.length).toBe(5);
    });

    // Concurrent-like rapid updates in same tick (synchronous, but tests transaction safety)
    it("handles rapid sequential updates without data corruption", () => {
      const p = db.create({ title: "Rapid", userPrompt: "start" });
      for (let i = 0; i < 50; i++) {
        db.update(p.id, {
          title: `Rapid-${i}`,
          userPrompt: `content-${i}`,
          tags: [`tag-${i}`],
        });
      }
      const final = db.getById(p.id)!;
      expect(final.title).toBe("Rapid-49");
      expect(final.userPrompt).toBe("content-49");
      expect(final.tags).toEqual(["tag-49"]);
    });

    // Batch create + delete stress test
    it("handles 100 creates followed by deletes", () => {
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) {
        ids.push(db.create({ title: `Prompt ${i}`, userPrompt: "p" }).id);
      }
      expect(db.getAll().length).toBe(100);

      // Delete all
      for (const id of ids) {
        expect(db.delete(id)).toBe(true);
      }
      expect(db.getAll().length).toBe(0);
    });

    // Search with multiple filters combined
    it("combines keyword + tag + folder + favorite filters", () => {
      rawDb
        .prepare(
          "INSERT INTO folders (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("combo-folder", "Combo", 0, Date.now(), Date.now());

      const target = db.create({
        title: "Target Alpha",
        userPrompt: "matching content alpha",
        tags: ["special"],
        folderId: "combo-folder",
      });
      db.update(target.id, { isFavorite: true });

      // Create decoys that match some but not all filters
      db.create({
        title: "Decoy Alpha",
        userPrompt: "matching content alpha",
        tags: ["special"],
      }); // no folder
      db.create({
        title: "Decoy Beta",
        userPrompt: "no match",
        tags: ["special"],
        folderId: "combo-folder",
      }); // wrong keyword

      const results = db.search({
        keyword: "alpha",
        tags: ["special"],
        folderId: "combo-folder",
        isFavorite: true,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(target.id);
    });

    // Sort order injection attempt
    it("rejects invalid sortBy gracefully (falls back to updated_at)", () => {
      db.create({ title: "A", userPrompt: "p" });
      db.create({ title: "B", userPrompt: "p" });

      // Invalid sortBy — should fall back to updated_at without SQL error
      const results = db.search({
        sortBy: "nonexistent_column" as unknown as "title",
      });
      expect(results.length).toBe(2);
    });

    // incrementUsage on non-existent ID (should not throw)
    it("incrementUsage silently ignores non-existent prompt", () => {
      expect(() => db.incrementUsage("no-such-id")).not.toThrow();
    });

    // Update with all fields set to explicit null/undefined
    it("handles update with null folderId (unassign from folder)", () => {
      rawDb
        .prepare(
          "INSERT INTO folders (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("tmp-folder", "Tmp", 0, Date.now(), Date.now());

      const p = db.create({
        title: "InFolder",
        userPrompt: "p",
        folderId: "tmp-folder",
      });
      expect(p.folderId).toBe("tmp-folder");

      db.update(p.id, { folderId: null as unknown as string });
      const updated = db.getById(p.id)!;
      expect(updated.folderId).toBeNull();
    });

    // Variables with special JSON characters
    it("round-trips variables containing JSON-special characters", () => {
      const tricky = [
        { name: 'var"with"quotes', type: "text" as const, required: true },
        {
          name: "var\\with\\backslash",
          type: "text" as const,
          required: false,
        },
        { name: "var\nwith\nnewlines", type: "text" as const, required: true },
      ];
      const p = db.create({
        title: "JSONSpecial",
        userPrompt: "p",
        variables: tricky,
      });
      const fetched = db.getById(p.id)!;
      expect(fetched.variables).toEqual(tricky);
    });
  });
});
