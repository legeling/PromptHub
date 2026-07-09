import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  CreateOutputFormatItemDTO,
  OutputFormatItem,
  OutputFormatItemQuery,
  UpdateOutputFormatItemDTO,
} from "@prompthub/shared/types";

interface OutputFormatItemRow {
  id: string;
  source_prompt_id: string;
  target_prompt_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export class PromptOutputFormatDB {
  constructor(private db: Database.Database) {}

  create(data: CreateOutputFormatItemDTO): OutputFormatItem {
    const normalized = this.normalizeCreateInput(data);

    const existing = this.findExisting(
      normalized.sourcePromptId,
      normalized.targetPromptId,
    );

    if (existing) {
      return existing;
    }

    const id = uuidv4();
    const now = Date.now();

    const maxOrder = this.getMaxSortOrder(normalized.sourcePromptId);
    const sortOrder = normalized.sortOrder ?? (maxOrder + 1);

    this.db
      .prepare(
        `INSERT INTO prompt_output_format_items (
          id, source_prompt_id, target_prompt_id, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        normalized.sourcePromptId,
        normalized.targetPromptId,
        sortOrder,
        now,
        now,
      );

    const created = this.getById(id);
    if (!created) {
      throw new Error(`Failed to create output format item with id: ${id}`);
    }
    return created;
  }

  update(id: string, data: UpdateOutputFormatItemDTO): OutputFormatItem | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = Date.now();

    this.db
      .prepare(
        `UPDATE prompt_output_format_items
         SET sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
        now,
        id,
      );

    return this.getById(id);
  }

  reorder(sourcePromptId: string, itemId: string, newSortOrder: number): void {
    const items = this.list({ sourcePromptId });
    const itemIndex = items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) return;

    const item = items[itemIndex];
    const oldOrder = item.sortOrder;

    if (newSortOrder === oldOrder) return;

    const now = Date.now();

    if (newSortOrder > oldOrder) {
      this.db
        .prepare(
          `UPDATE prompt_output_format_items
           SET sort_order = sort_order - 1, updated_at = ?
           WHERE source_prompt_id = ? AND sort_order > ? AND sort_order <= ?`,
        )
        .run(now, sourcePromptId, oldOrder, newSortOrder);
    } else {
      this.db
        .prepare(
          `UPDATE prompt_output_format_items
           SET sort_order = sort_order + 1, updated_at = ?
           WHERE source_prompt_id = ? AND sort_order >= ? AND sort_order < ?`,
        )
        .run(now, sourcePromptId, newSortOrder, oldOrder);
    }

    this.db
      .prepare(
        `UPDATE prompt_output_format_items
         SET sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(newSortOrder, now, itemId);
  }

  getById(id: string): OutputFormatItem | null {
    const row = this.db
      .prepare("SELECT * FROM prompt_output_format_items WHERE id = ?")
      .get(id) as OutputFormatItemRow | undefined;
    return row ? this.rowToItem(row) : null;
  }

  list(query: OutputFormatItemQuery = {}): OutputFormatItem[] {
    const clauses: string[] = [];
    const values: (string | number)[] = [];

    if (query.sourcePromptId) {
      clauses.push("source_prompt_id = ?");
      values.push(query.sourcePromptId);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM prompt_output_format_items ${where}
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(...values) as OutputFormatItemRow[];

    return rows.map((row) => this.rowToItem(row));
  }

  delete(id: string): boolean {
    const item = this.getById(id);
    if (!item) return false;

    const result = this.db
      .prepare("DELETE FROM prompt_output_format_items WHERE id = ?")
      .run(id);

    if (result.changes > 0) {
      this.normalizeSortOrder(item.sourcePromptId);
    }

    return result.changes > 0;
  }

  deleteBySourcePromptId(sourcePromptId: string): void {
    this.db
      .prepare(
        "DELETE FROM prompt_output_format_items WHERE source_prompt_id = ?",
      )
      .run(sourcePromptId);
  }

  private normalizeCreateInput(
    data: CreateOutputFormatItemDTO,
  ): CreateOutputFormatItemDTO {
    if (
      typeof data.sourcePromptId !== "string" ||
      data.sourcePromptId.trim().length === 0
    ) {
      throw new Error("Source prompt id is required");
    }

    return {
      ...data,
      targetPromptId: data.targetPromptId ?? null,
    };
  }

  private findExisting(
    sourcePromptId: string,
    targetPromptId: string | null,
  ): OutputFormatItem | null {
    const query = `SELECT * FROM prompt_output_format_items
                   WHERE source_prompt_id = ? AND target_prompt_id IS ${
                     targetPromptId === null ? "NULL" : "NOT NULL"
                   }
                   ${
                     targetPromptId !== null ? "AND target_prompt_id = ?" : ""
                   }`;

    const params =
      targetPromptId !== null
        ? [sourcePromptId, targetPromptId]
        : [sourcePromptId];

    const row = this.db
      .prepare(query)
      .get(...params) as
      | OutputFormatItemRow
      | undefined;

    return row ? this.rowToItem(row) : null;
  }

  private getMaxSortOrder(sourcePromptId: string): number {
    const row = this.db
      .prepare(
        `SELECT MAX(sort_order) as max_order FROM prompt_output_format_items
         WHERE source_prompt_id = ?`,
      )
      .get(sourcePromptId) as { max_order: number | undefined };

    return row?.max_order ?? -1;
  }

  private normalizeSortOrder(sourcePromptId: string): void {
    const items = this.list({ sourcePromptId });
    const now = Date.now();

    for (let i = 0; i < items.length; i++) {
      if (items[i].sortOrder !== i) {
        this.db
          .prepare(
            `UPDATE prompt_output_format_items
             SET sort_order = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(i, now, items[i].id);
      }
    }
  }

  private rowToItem(row: OutputFormatItemRow): OutputFormatItem {
    return {
      id: row.id,
      sourcePromptId: row.source_prompt_id,
      targetPromptId: row.target_prompt_id,
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
