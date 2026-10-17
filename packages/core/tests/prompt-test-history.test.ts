import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseAdapter } from "@prompthub/db";
import {
  migratePromptTestHistory,
  PromptTestHistoryDB,
} from "@prompthub/db/prompt-test-history";
import { PromptTestHistoryService } from "../src/prompt-test-history";

const root = mkdtempSync(path.join(tmpdir(), "prompthub-test-history-"));
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("history survives migration and reopen, isolates prompts and rejects invalid records", () => {
  const file = path.join(root, "history.db");
  let db = new DatabaseAdapter(file);
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE prompts (id TEXT PRIMARY KEY); INSERT INTO prompts VALUES ('a'), ('b');",
  );
  migratePromptTestHistory(db);
  migratePromptTestHistory(db);
  let service = new PromptTestHistoryService(new PromptTestHistoryDB(db));
  const input = {
    promptId: "a",
    promptVersion: 1,
    mode: "single",
    systemPrompt: "system",
    userPrompt: "filled prompt",
    outputFormat: "text",
    attachmentNames: ["sample.png"],
    results: [
      {
        model: "model-a",
        provider: "openai",
        success: true,
        response: "Saved answer",
        thinkingContent: "",
        error: "",
        latency: 12,
      },
    ],
  };
  const saved = service.add({ ...input, apiKey: "must-not-persist" });
  expect(JSON.stringify(saved)).not.toContain("must-not-persist");
  expect(service.list("b")).toEqual([]);
  expect(service.get("b", saved.id)).toBeNull();
  expect(() => service.add({ ...input, userPrompt: "bad\0text" })).toThrow();
  expect(() => service.add({ ...input, results: [] })).toThrow();
  expect(() => service.add({ ...input, promptId: "missing" })).toThrow();
  expect(() => service.list("a", -1)).toThrow();
  db.close();
  db = new DatabaseAdapter(file);
  db.exec("PRAGMA foreign_keys=ON");
  migratePromptTestHistory(db);
  service = new PromptTestHistoryService(new PromptTestHistoryDB(db));
  expect(service.get("a", saved.id)?.results[0].response).toBe("Saved answer");
  for (let i = 0; i < 51; i++) service.add(input);
  expect(service.list("a")).toHaveLength(50);
  expect(service.list("a", 50)).toHaveLength(2);
  service.delete("b", saved.id);
  expect(service.get("a", saved.id)).not.toBeNull();
  service.delete("a", saved.id);
  expect(service.get("a", saved.id)).toBeNull();
  db.prepare("DELETE FROM prompts WHERE id = ?").run("a");
  expect(service.list("a")).toEqual([]);
  db.close();
});
