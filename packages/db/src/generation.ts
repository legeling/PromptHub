import type Database from "./adapter";
import type {
  GenerationBatchManifest,
  GenerationSlotRecord,
} from "@prompthub/shared/types";
import { validateGenerationManifest } from "@prompthub/shared/utils/generation-manifest";

interface BatchRow {
  id: string;
  request_json: string | null;
  status: GenerationBatchManifest["status"];
  title: string;
  source_prompt_id: string | null;
  provider: string;
  model: string;
  requested_count: number;
  succeeded_count: number;
  failed_count: number;
  cancelled_count: number;
  interrupted_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
interface SlotRow {
  id: string;
  batch_id: string;
  slot_index: number;
  status: GenerationSlotRecord["status"];
  file_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  favorite: number;
  created_at: string | null;
  error_json: string | null;
  revised_prompt: string | null;
}

function decodeSlot(row: SlotRow): GenerationSlotRecord {
  return {
    index: row.slot_index,
    status: row.status,
    ...(row.error_json === null ? {} : { error: JSON.parse(row.error_json) }),
    ...(row.file_name === null
      ? {}
      : {
          output: {
            id: row.id,
            slotIndex: row.slot_index,
            fileName: row.file_name,
            // The complete reconstructed graph is validated before it crosses the DB boundary.
            mimeType: row.mime_type!,
            byteSize: row.byte_size!,
            sha256: row.sha256!,
            favorite: row.favorite === 1,
            createdAt: row.created_at!,
            ...(row.revised_prompt === null
              ? {}
              : { revisedPrompt: row.revised_prompt }),
          },
        }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeRequest(row: BatchRow): Record<string, unknown> {
  if (row.request_json === null)
    throw new Error(`Generation metadata migration is incomplete: ${row.id}`);
  const request: unknown = JSON.parse(row.request_json);
  if (!isRecord(request))
    throw new Error(`Invalid generation request snapshot: ${row.id}`);
  return {
    resolvedPrompt: request.resolvedPrompt,
    parameters: request.parameters,
    ...(request.sourcePromptVersion === undefined
      ? {}
      : { sourcePromptVersion: request.sourcePromptVersion }),
    ...(request.variableValues === undefined
      ? {}
      : { variableValues: request.variableValues }),
    ...(request.referenceImages === undefined
      ? {}
      : { referenceImages: request.referenceImages }),
    model: {
      id: request.modelId,
      provider: row.provider,
      model: row.model,
      ...(request.modelName === undefined ? {} : { name: request.modelName }),
    },
  };
}

function decodeBatch(
  row: BatchRow,
  slots: GenerationSlotRecord[],
): GenerationBatchManifest {
  return validateGenerationManifest({
    ...decodeRequest(row),
    kind: "prompthub-generation-batch",
    version: 1,
    id: row.id,
    title: row.title,
    status: row.status,
    ...(row.source_prompt_id === null
      ? {}
      : { sourcePromptId: row.source_prompt_id }),
    targetCount: row.requested_count,
    slots,
    counts: {
      total: row.requested_count,
      pending: slots.filter((slot) => slot.status === "pending").length,
      running: slots.filter((slot) => slot.status === "running").length,
      succeeded: row.succeeded_count,
      failed: row.failed_count,
      cancelled: row.cancelled_count,
      interrupted: row.interrupted_count,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
  }).manifest;
}

function requestSnapshot(manifest: GenerationBatchManifest): string {
  return JSON.stringify({
    resolvedPrompt: manifest.resolvedPrompt,
    modelId: manifest.model.id,
    modelName: manifest.model.name,
    sourcePromptVersion: manifest.sourcePromptVersion,
    variableValues: manifest.variableValues,
    referenceImages: manifest.referenceImages,
    parameters: manifest.parameters,
  });
}

export class GenerationDB {
  constructor(private readonly database: Database.Database) {}

  delete(id: string): void {
    this.database.run("DELETE FROM generation_batches WHERE id = ?", id);
  }

  get(id: string): GenerationBatchManifest | null {
    const row = this.database.get(
      "SELECT * FROM generation_batches WHERE id = ?",
      id,
    ) as BatchRow | undefined; // The owned SQL schema supplies columns; decodeBatch validates their public shape.
    if (!row) return null;
    const slots = this.database.all(
      "SELECT * FROM generation_outputs WHERE batch_id = ? ORDER BY slot_index",
      id,
    ) as SlotRow[]; // Adapter rows are unknown; the reconstructed manifest is validated below.
    return decodeBatch(row, slots.map(decodeSlot));
  }

  list(): GenerationBatchManifest[] {
    const rows = this.database.all(
      "SELECT * FROM generation_batches ORDER BY created_at DESC, id",
    ) as BatchRow[]; // The current table schema owns these columns.
    const slots = new Map<string, GenerationSlotRecord[]>();
    // The adapter is untyped; decodeBatch validates each reconstructed graph.
    for (const row of this.database.all(
      "SELECT * FROM generation_outputs ORDER BY batch_id, slot_index",
    ) as SlotRow[]) {
      const group = slots.get(row.batch_id) ?? [];
      group.push(decodeSlot(row));
      slots.set(row.batch_id, group);
    }
    return rows.map((row) => decodeBatch(row, slots.get(row.id) ?? []));
  }

  upsert(value: GenerationBatchManifest): void {
    const { manifest } = validateGenerationManifest(value);
    this.database.transaction(() => {
      this.writeBatch(manifest);
      this.database.run(
        "DELETE FROM generation_outputs WHERE batch_id = ?",
        manifest.id,
      );
      for (const slot of manifest.slots) this.writeSlot(manifest.id, slot);
    })();
  }

  private writeBatch(manifest: GenerationBatchManifest): void {
    const sourcePromptId =
      manifest.sourcePromptId &&
      this.database.get(
        "SELECT id FROM prompts WHERE id = ?",
        manifest.sourcePromptId,
      )
        ? manifest.sourcePromptId
        : null;
    this.database.run(
      `INSERT INTO generation_batches (
      id, request_json, status, title, source_prompt_id, provider, model,
      requested_count, succeeded_count, failed_count, cancelled_count, interrupted_count,
      created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET request_json = excluded.request_json,
      status = excluded.status, title = excluded.title, source_prompt_id = excluded.source_prompt_id,
      provider = excluded.provider, model = excluded.model, requested_count = excluded.requested_count,
      succeeded_count = excluded.succeeded_count, failed_count = excluded.failed_count,
      cancelled_count = excluded.cancelled_count, interrupted_count = excluded.interrupted_count,
      created_at = excluded.created_at, updated_at = excluded.updated_at, completed_at = excluded.completed_at`,
      manifest.id,
      requestSnapshot(manifest),
      manifest.status,
      manifest.title,
      sourcePromptId,
      manifest.model.provider,
      manifest.model.model,
      manifest.targetCount,
      manifest.counts.succeeded,
      manifest.counts.failed,
      manifest.counts.cancelled,
      manifest.counts.interrupted,
      manifest.createdAt,
      manifest.updatedAt,
      manifest.completedAt ?? null,
    );
  }

  private writeSlot(batchId: string, slot: GenerationSlotRecord): void {
    this.database.run(
      `INSERT INTO generation_outputs (
      id, batch_id, slot_index, status, file_name, mime_type, byte_size, sha256, favorite, created_at, error_json, revised_prompt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slot.output?.id ?? `${batchId}:${slot.index}`,
      batchId,
      slot.index,
      slot.status,
      slot.output?.fileName ?? null,
      slot.output?.mimeType ?? null,
      slot.output?.byteSize ?? null,
      slot.output?.sha256 ?? null,
      slot.output?.favorite ? 1 : 0,
      slot.output?.createdAt ?? null,
      slot.error ? JSON.stringify(slot.error) : null,
      slot.output?.revisedPrompt ?? null,
    );
  }
}
