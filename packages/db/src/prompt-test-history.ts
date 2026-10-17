import type Database from "./adapter";
import type {
  PromptTestRun,
  PromptTestRunSummary,
} from "@prompthub/shared/types/prompt-test-history";

export const PROMPT_TEST_HISTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS prompt_test_runs (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompt_test_runs_prompt_time ON prompt_test_runs(prompt_id, created_at DESC, id DESC);
`;

export function migratePromptTestHistory(db: Database.Database): void {
  db.exec(PROMPT_TEST_HISTORY_SCHEMA);
}

function readJson<T>(row: unknown, key: string): T {
  if (!row || typeof row !== "object" || !(key in row)) {
    throw new Error("Missing prompt test history snapshot");
  }
  // SQLite adapter returns unknown rows; validate the selected JSON column.
  const value = (row as Record<string, unknown>)[key];
  if (typeof value !== "string")
    throw new Error("Invalid prompt test history snapshot");
  return JSON.parse(value);
}

export class PromptTestHistoryDB {
  constructor(private readonly db: Database.Database) {}

  add(run: PromptTestRun): PromptTestRun {
    const summary: PromptTestRunSummary = {
      id: run.id,
      createdAt: run.createdAt,
      mode: run.mode,
      models: run.results.map((result) => result.model),
      successCount: run.results.filter((result) => result.success).length,
      resultCount: run.results.length,
    };
    this.db
      .prepare(
        "INSERT INTO prompt_test_runs (id, prompt_id, created_at, summary_json, snapshot_json) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        run.id,
        run.promptId,
        run.createdAt,
        JSON.stringify(summary),
        JSON.stringify(run),
      );
    return run;
  }

  list(promptId: string, offset: number): PromptTestRunSummary[] {
    const rows = this.db
      .prepare(
        "SELECT summary_json FROM prompt_test_runs WHERE prompt_id = ? ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ?",
      )
      .all(promptId, offset);
    return rows.map((row) =>
      readJson<PromptTestRunSummary>(row, "summary_json"),
    );
  }

  get(promptId: string, id: string): PromptTestRun | null {
    const row = this.db
      .prepare(
        "SELECT snapshot_json FROM prompt_test_runs WHERE prompt_id = ? AND id = ?",
      )
      .get(promptId, id);
    return row ? readJson<PromptTestRun>(row, "snapshot_json") : null;
  }

  delete(promptId: string, id: string): void {
    this.db
      .prepare("DELETE FROM prompt_test_runs WHERE prompt_id = ? AND id = ?")
      .run(promptId, id);
  }
}
