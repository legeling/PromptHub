import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";

/**
 * Repair report for prompt version consistency healing.
 * Storage-layer primitive: reconciles `prompts.current_version` with the
 * `prompt_versions` table so canonical graph validation can pass.
 */
export interface PromptVersionConsistencyRepair {
  /** Prompt ids whose `current_version` was rewritten to the stored maximum. */
  repairedPromptIds: string[];
  /** Prompt ids that had no version rows and received a v1 snapshot. */
  createdInitialVersionPromptIds: string[];
}

interface PromptVersionSourceRow {
  id: string;
  current_version: number;
  system_prompt: string | null;
  system_prompt_en: string | null;
  user_prompt: string;
  user_prompt_en: string | null;
  variables: string | null;
  last_ai_response: string | null;
  created_at: number;
}

const SELECT_PROMPT_VERSION_SOURCES = `
  SELECT
    id, current_version, system_prompt, system_prompt_en, user_prompt,
    user_prompt_en, variables, last_ai_response, created_at
  FROM prompts
`;

const INSERT_INITIAL_VERSION = `
  INSERT INTO prompt_versions (
    id, prompt_id, version, system_prompt, system_prompt_en, user_prompt,
    user_prompt_en, variables, note, ai_response, created_at
  ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, NULL, ?, ?)
`;

const UPDATE_CURRENT_VERSION = `
  UPDATE prompts SET current_version = ? WHERE id = ?
`;

const DELETE_NON_POSITIVE_VERSIONS = `
  DELETE FROM prompt_versions WHERE prompt_id = ? AND version <= 0
`;

const SELECT_MAX_POSITIVE_VERSION = `
  SELECT MAX(version) AS maxVersion
  FROM prompt_versions
  WHERE prompt_id = ? AND version > 0
`;

/**
 * Make every prompt version set consistent with the canonical graph invariant
 * `max(prompt_versions.version) == prompts.current_version` using only positive
 * version numbers:
 *
 * - legacy rows numbered `<= 0` are removed first (canonical schema only admits
 *   positive versions, so a v0-only chain can never be valid);
 * - when the prompt has positive version rows but `current_version` is missing,
 *   stale, or ahead, converge it to the maximum stored version number;
 * - when the prompt has no positive version rows, create a v1 snapshot from the
 *   current prompt row and set `current_version = 1`.
 *
 * The repair runs inside a single transaction. Healthy prompts are left
 * untouched, and a second pass is a no-op. Prompt content and metadata other
 * than the version pointer and non-positive legacy version rows are never
 * modified.
 */
export function repairPromptVersionConsistency(
  database: Database,
): PromptVersionConsistencyRepair {
  const repairedPromptIds: string[] = [];
  const createdInitialVersionPromptIds: string[] = [];

  const run = database.transaction(() => {
    const prompts = database
      .prepare(SELECT_PROMPT_VERSION_SOURCES)
      .all() as PromptVersionSourceRow[];
    for (const prompt of prompts) {
      // Canonical prompt resources only accept positive version numbers. Any
      // legacy `version <= 0` row cannot be represented and is removed first.
      database
        .prepare(DELETE_NON_POSITIVE_VERSIONS)
        .run(prompt.id);

      const maxRow = database
        .prepare(SELECT_MAX_POSITIVE_VERSION)
        .get(prompt.id) as { maxVersion: number | null };
      const maxVersion = maxRow.maxVersion;
      if (maxVersion === null) {
        // No positive version rows: snapshot the current prompt content as v1.
        database
          .prepare(INSERT_INITIAL_VERSION)
          .run(
            uuidv4(),
            prompt.id,
            prompt.system_prompt,
            prompt.system_prompt_en,
            prompt.user_prompt,
            prompt.user_prompt_en,
            prompt.variables,
            prompt.last_ai_response,
            prompt.created_at,
          );
        if (prompt.current_version !== 1) {
          database
            .prepare(UPDATE_CURRENT_VERSION)
            .run(1, prompt.id);
        }
        createdInitialVersionPromptIds.push(prompt.id);
      } else if (prompt.current_version !== maxVersion) {
        database.prepare(UPDATE_CURRENT_VERSION).run(maxVersion, prompt.id);
        repairedPromptIds.push(prompt.id);
      }
    }
  });
  run();

  return { repairedPromptIds, createdInitialVersionPromptIds };
}
