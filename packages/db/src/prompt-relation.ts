import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  CreatePromptRelationDTO,
  PromptGraphRelationKind,
  PromptRelation,
  PromptRelationQuery,
  UpdatePromptRelationDTO,
} from "@prompthub/shared/types";

interface PromptRelationRow {
  id: string;
  source_prompt_id: string;
  target_prompt_id: string;
  kind: PromptGraphRelationKind;
  note: string | null;
  created_at: number;
  updated_at: number;
}

const PROMPT_GRAPH_RELATION_KINDS: ReadonlySet<string> = new Set([
  "related_to",
  "variant_of",
  "depends_on",
  "next_step",
]);

export class PromptRelationDB {
  constructor(private db: Database.Database) {}

  create(data: CreatePromptRelationDTO): PromptRelation {
    const normalized = this.normalizeCreateInput(data);
    const existing = this.findExisting(
      normalized.sourcePromptId,
      normalized.targetPromptId,
      normalized.kind,
    );

    if (existing) {
      if (data.note !== undefined && data.note !== existing.note) {
        return this.update(existing.id, { note: data.note })!;
      }
      return existing;
    }

    const id = uuidv4();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO prompt_relations (
          id, source_prompt_id, target_prompt_id, kind, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        normalized.sourcePromptId,
        normalized.targetPromptId,
        normalized.kind,
        normalized.note,
        now,
        now,
      );

    return this.getById(id)!;
  }

  update(id: string, data: UpdatePromptRelationDTO): PromptRelation | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const kind = data.kind ?? existing.kind;
    this.assertRelationKind(kind);
    const { sourcePromptId, targetPromptId } = this.normalizeEndpoints(
      existing.sourcePromptId,
      existing.targetPromptId,
      kind,
    );
    const now = Date.now();

    this.db
      .prepare(
        `UPDATE prompt_relations
         SET source_prompt_id = ?, target_prompt_id = ?, kind = ?, note = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        sourcePromptId,
        targetPromptId,
        kind,
        data.note === undefined ? existing.note : data.note,
        now,
        id,
      );

    return this.getById(id);
  }

  getById(id: string): PromptRelation | null {
    const row = this.db
      .prepare("SELECT * FROM prompt_relations WHERE id = ?")
      .get(id) as PromptRelationRow | undefined;
    return row ? this.rowToRelation(row) : null;
  }

  list(query: PromptRelationQuery = {}): PromptRelation[] {
    const clauses: string[] = [];
    const values: string[] = [];

    if (query.promptId) {
      if (query.direction === "outgoing") {
        clauses.push("source_prompt_id = ?");
        values.push(query.promptId);
      } else if (query.direction === "incoming") {
        clauses.push("target_prompt_id = ?");
        values.push(query.promptId);
      } else {
        clauses.push("(source_prompt_id = ? OR target_prompt_id = ?)");
        values.push(query.promptId, query.promptId);
      }
    }

    if (query.kind) {
      this.assertRelationKind(query.kind);
      clauses.push("kind = ?");
      values.push(query.kind);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM prompt_relations ${where}
         ORDER BY updated_at DESC, created_at DESC, id ASC`,
      )
      .all(...values) as PromptRelationRow[];

    return rows.map((row) => this.rowToRelation(row));
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM prompt_relations WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  private normalizeCreateInput(
    data: CreatePromptRelationDTO,
  ): CreatePromptRelationDTO {
    this.assertPromptId(data.sourcePromptId, "Source prompt id");
    this.assertPromptId(data.targetPromptId, "Target prompt id");
    this.assertRelationKind(data.kind);

    if (data.sourcePromptId === data.targetPromptId) {
      throw new Error("Prompt relation cannot point to itself");
    }

    this.assertPromptExists(data.sourcePromptId, "Source prompt does not exist");
    this.assertPromptExists(data.targetPromptId, "Target prompt does not exist");

    const endpoints = this.normalizeEndpoints(
      data.sourcePromptId,
      data.targetPromptId,
      data.kind,
    );

    return {
      ...data,
      ...endpoints,
      note: data.note ?? null,
    };
  }

  private normalizeEndpoints(
    sourcePromptId: string,
    targetPromptId: string,
    kind: PromptGraphRelationKind,
  ): Pick<CreatePromptRelationDTO, "sourcePromptId" | "targetPromptId"> {
    if (kind !== "related_to" || sourcePromptId < targetPromptId) {
      return { sourcePromptId, targetPromptId };
    }

    return {
      sourcePromptId: targetPromptId,
      targetPromptId: sourcePromptId,
    };
  }

  private findExisting(
    sourcePromptId: string,
    targetPromptId: string,
    kind: PromptGraphRelationKind,
  ): PromptRelation | null {
    const row = this.db
      .prepare(
        `SELECT * FROM prompt_relations
         WHERE source_prompt_id = ? AND target_prompt_id = ? AND kind = ?`,
      )
      .get(sourcePromptId, targetPromptId, kind) as
      | PromptRelationRow
      | undefined;

    return row ? this.rowToRelation(row) : null;
  }

  private assertPromptId(value: string, label: string): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${label} is required`);
    }
  }

  private assertPromptExists(promptId: string, message: string): void {
    const exists = this.db
      .prepare("SELECT 1 FROM prompts WHERE id = ?")
      .get(promptId);
    if (!exists) {
      throw new Error(message);
    }
  }

  private assertRelationKind(kind: string): asserts kind is PromptGraphRelationKind {
    if (!PROMPT_GRAPH_RELATION_KINDS.has(kind)) {
      throw new Error("Unsupported prompt relation kind");
    }
  }

  private rowToRelation(row: PromptRelationRow): PromptRelation {
    return {
      id: row.id,
      sourcePromptId: row.source_prompt_id,
      targetPromptId: row.target_prompt_id,
      kind: row.kind,
      note: row.note,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
