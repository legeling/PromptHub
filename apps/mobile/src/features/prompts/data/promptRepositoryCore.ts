import type { Prompt } from "@prompthub/shared/types";
import { assertPromptContent } from "@prompthub/shared/utils/prompt-content";

export type MobilePromptSummary = Pick<
  Prompt,
  | "id"
  | "title"
  | "description"
  | "tags"
  | "isFavorite"
  | "updatedAt"
  | "userPrompt"
  | "systemPrompt"
>;

interface PromptRow {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  is_favorite: number;
  updated_at: number;
  user_prompt: string;
  system_prompt: string | null;
}

type PromptBindValue =
  | string
  | number
  | null
  | boolean
  | Uint8Array
  | ArrayBuffer;

export interface PromptDatabase {
  getAll(source: string): Promise<unknown[]>;
  getFirst(source: string, params: PromptBindValue[]): Promise<unknown>;
  run(source: string, params: PromptBindValue[]): Promise<unknown>;
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((tag) => typeof tag === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function mapPromptRow(row: PromptRow): MobilePromptSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    tags: parseTags(row.tags),
    isFavorite: Boolean(row.is_favorite),
    updatedAt: new Date(row.updated_at).toISOString(),
    userPrompt: row.user_prompt,
    systemPrompt: row.system_prompt ?? undefined,
  };
}

class SQLitePromptRepository {
  constructor(
    private readonly getDb: () => PromptDatabase | Promise<PromptDatabase>,
  ) {}

  async list(): Promise<MobilePromptSummary[]> {
    const rows = await (await this.getDb()).getAll(
      "SELECT * FROM prompts ORDER BY updated_at DESC",
    ) as PromptRow[];
    return rows.map(mapPromptRow);
  }

  async getById(id: string): Promise<MobilePromptSummary | null> {
    const row = await (await this.getDb()).getFirst(
      "SELECT * FROM prompts WHERE id = ?",
      [id],
    ) as PromptRow | null;
    return row ? mapPromptRow(row) : null;
  }

  async create(prompt: Omit<MobilePromptSummary, "updatedAt">): Promise<void> {
    assertPromptContent(prompt);
    const now = Date.now();
    await (await this.getDb()).run(
      `INSERT INTO prompts (
        id, title, description, system_prompt, user_prompt, tags, is_favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prompt.id,
        prompt.title,
        prompt.description ?? null,
        prompt.systemPrompt ?? null,
        prompt.userPrompt,
        JSON.stringify(prompt.tags),
        prompt.isFavorite ? 1 : 0,
        now,
        now,
      ],
    );
  }

  async update(
    id: string,
    updates: Partial<MobilePromptSummary>,
  ): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Prompt not found: ${id}`);
    const updated = { ...existing, ...updates };
    if (
      updates.systemPrompt !== undefined ||
      updates.userPrompt !== undefined
    ) {
      assertPromptContent(updated);
    }
    await (await this.getDb()).run(
      `UPDATE prompts SET title = ?, description = ?, system_prompt = ?,
        user_prompt = ?, tags = ?, is_favorite = ?, updated_at = ? WHERE id = ?`,
      [
        updated.title,
        updated.description ?? null,
        updated.systemPrompt ?? null,
        updated.userPrompt,
        JSON.stringify(updated.tags),
        updated.isFavorite ? 1 : 0,
        Date.now(),
        id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await (await this.getDb()).run("DELETE FROM prompts WHERE id = ?", [id]);
  }
}

export function createPromptRepository(
  getDb: () => PromptDatabase | Promise<PromptDatabase>,
) {
  return new SQLitePromptRepository(getDb);
}
