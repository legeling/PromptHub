import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import {
  acquireStorageMaintenanceIntent,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import {
  configureRuntimePaths,
  getGeneratedImagesDir,
  getImagesDir,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import { GenerationLibrary } from "../../../src/main/services/generation-library";

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0a00000000", "hex");
const JPEG_BYTES = Buffer.from("ffd8ffe000104a4649460001", "hex");
const WEBP_BYTES = Buffer.from("524946460400000057454250", "hex");

describe("GenerationLibrary", () => {
  let tempDir: string;
  let db: DatabaseAdapter.Database;
  let library: GenerationLibrary;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-generation-"));
    writeRuntimeLayoutState(tempDir);
    configureRuntimePaths({ userDataPath: tempDir });
    fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
    db = new DatabaseAdapter(path.join(tempDir, "data", "prompthub.db"));
    db.exec(SCHEMA);
    library = new GenerationLibrary(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists authoritative SQL metadata without a live manifest", async () => {
    const batch = await library.createBatch({
      title: "Architecture run",
      prompt: "Minimal white concrete house",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 2,
    });

    expect(batch.slots.map((slot) => slot.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(await library.listBatches()).toHaveLength(1);
    expect(
      db
        .prepare(
          "SELECT status, requested_count FROM generation_batches WHERE id = ?",
        )
        .get(batch.id),
    ).toMatchObject({ status: "queued", requested_count: 2 });
    expect(
      fs.existsSync(
        path.join(tempDir, "data", "generations", batch.id, "batch.json"),
      ),
    ).toBe(false);
  });

  it("stores one actual image and SQL metadata even with a historical authority marker", async () => {
    writeRuntimeLayoutState(tempDir);
    writeCanonicalStorageAuthority(tempDir, {
      consistencyId: "a".repeat(64),
      operationId: "generation-authority",
    });
    resetRuntimePaths();
    configureRuntimePaths({ userDataPath: tempDir });
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const completed = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: PNG_BYTES.toString("base64"),
    });
    expect(getGeneratedImagesDir()).toBe(
      path.join(tempDir, "data", "generations", "assets"),
    );
    expect(
      fs.readFileSync(
        path.join(
          getGeneratedImagesDir(),
          batch.id,
          completed.slots[0].output!.fileName,
        ),
      ),
    ).toEqual(PNG_BYTES);
    expect(
      fs.existsSync(path.join(tempDir, "data", "generations", batch.id)),
    ).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "cache", "generated-images"))).toBe(
      false,
    );
    expect(await library.getBatch(batch.id)).toEqual(completed);
  });

  it("listing an active batch never interrupts it; explicit startup recovery preserves the error across reopen", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "image" },
      targetCount: 1,
    });
    await library.markSlotRunning(batch.id, 0);
    expect((await library.listBatches())[0].slots[0].status).toBe("running");
    db.close();
    db = new DatabaseAdapter(path.join(tempDir, "data", "prompthub.db"));
    library = new GenerationLibrary(db);
    library.recoverInterrupted();
    const recovered = await library.getBatch(batch.id);
    expect(recovered.slots[0]).toMatchObject({
      status: "interrupted",
      error: { code: "interrupted", retryable: true },
    });
    db.close();
    db = new DatabaseAdapter(path.join(tempDir, "data", "prompthub.db"));
    expect(await new GenerationLibrary(db).getBatch(batch.id)).toEqual(
      recovered,
    );
  });

  it("blocks generation writes during structural storage maintenance", async () => {
    const maintenance = acquireStorageMaintenanceIntent(tempDir, {
      operationId: "generation-restore",
      operationKind: "restore",
    });
    try {
      await expect(
        library.createBatch({
          prompt: "Blocked",
          model: { id: "m1", provider: "openai", model: "gpt-image-1" },
          targetCount: 1,
        }),
      ).rejects.toMatchObject({ code: "STORAGE_MAINTENANCE_BUSY" });
    } finally {
      maintenance.release();
    }
  });

  it("commits validated image bytes before reporting a successful slot", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    await library.markSlotRunning(batch.id, 0);
    const updated = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });

    expect(updated.status).toBe("succeeded");
    expect(updated.counts.succeeded).toBe(1);
    const output = updated.slots[0].output;
    expect(output?.fileName).toMatch(/\.png$/);
    expect(
      fs.readFileSync(
        path.join(getGeneratedImagesDir(), batch.id, output!.fileName),
      ),
    ).toEqual(PNG_BYTES);
  });

  it("downloads remote outputs directly into the local generation library", async () => {
    const remoteDownloader = vi.fn().mockResolvedValue({
      buffer: JPEG_BYTES,
      finalUrl: "https://cdn.example.com/output.jpg",
      contentType: "image/jpeg",
    });
    library = new GenerationLibrary(db, remoteDownloader);
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });

    const successful = await library.commitRemoteOutput({
      batchId: batch.id,
      slotIndex: 0,
      url: "https://cdn.example.com/output.jpg",
    });

    expect(remoteDownloader).toHaveBeenCalledWith(
      "https://cdn.example.com/output.jpg",
    );
    expect(successful.slots[0].output).toMatchObject({
      mimeType: "image/jpeg",
    });
    expect(
      fs.existsSync(getImagesDir()) &&
        fs.readdirSync(getImagesDir()).some((name) => name.endsWith(".jpg")),
    ).toBe(false);
    expect(
      fs.readFileSync(
        path.join(
          getGeneratedImagesDir(),
          batch.id,
          successful.slots[0].output!.fileName,
        ),
      ),
    ).toEqual(JPEG_BYTES);
  });

  it("keeps generation originals outside Prompt media and leaves legacy attachments intact", async () => {
    const legacyImagesDir = path.join(tempDir, "images");
    fs.mkdirSync(path.join(tempDir, "data", "assets", "images", "generated"), {
      recursive: true,
    });
    fs.mkdirSync(legacyImagesDir, { recursive: true });
    fs.writeFileSync(path.join(legacyImagesDir, "legacy.png"), PNG_BYTES);
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });

    const updated = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: PNG_BYTES.toString("base64"),
    });

    expect(getImagesDir()).toBe(path.join(tempDir, "data", "assets", "images"));
    expect(fs.readFileSync(path.join(legacyImagesDir, "legacy.png"))).toEqual(
      PNG_BYTES,
    );
    expect(getGeneratedImagesDir()).not.toContain(
      path.join("assets", "images"),
    );
    expect(
      fs.existsSync(
        path.join(
          getGeneratedImagesDir(),
          batch.id,
          updated.slots[0].output!.fileName,
        ),
      ),
    ).toBe(true);
  });

  it("detects output MIME from bytes when the provider omits it", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });

    const updated = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: JPEG_BYTES.toString("base64"),
    });

    expect(updated.slots[0].output).toMatchObject({
      mimeType: "image/jpeg",
    });
    expect(updated.slots[0].output?.fileName).toMatch(/\.jpg$/);
  });

  it("rejects oversized base64 before decoding it into an image buffer", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });

    await expect(
      library.commitOutput({
        batchId: batch.id,
        slotIndex: 0,
        base64: "A".repeat(Math.ceil((20 * 1024 * 1024) / 3) * 4 + 4),
      }),
    ).rejects.toThrow(/payload size/i);
  });

  it("does not import legacy files or recreate a missing output during metadata reads", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const successful = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: PNG_BYTES.toString("base64"),
    });
    const fileName = successful.slots[0].output!.fileName;
    const correctedPath = path.join(
      getGeneratedImagesDir(),
      batch.id,
      fileName,
    );
    const legacyPath = path.join(
      tempDir,
      "data",
      "assets",
      "images",
      "generated",
      batch.id,
      fileName,
    );
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.renameSync(correctedPath, legacyPath);

    await library.getBatch(batch.id);

    expect(fs.existsSync(correctedPath)).toBe(false);
    expect(fs.readFileSync(legacyPath)).toEqual(PNG_BYTES);
    await expect(
      library.readOutputReference({
        batchId: batch.id,
        outputId: successful.slots[0].output!.id,
      }),
    ).rejects.toThrow();
  });

  it("rejects traversal-like IDs and invalid image payloads", async () => {
    await expect(library.getBatch("../escape")).rejects.toThrow(
      /invalid batch id/i,
    );
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    await expect(
      library.commitOutput({
        batchId: batch.id,
        slotIndex: 0,
        mimeType: "text/html",
        base64: Buffer.from("<script>").toString("base64"),
      }),
    ).rejects.toThrow(/image (type|bytes)/i);
    await expect(
      library.commitOutput({
        batchId: batch.id,
        slotIndex: 0,
        mimeType: "image/png",
        base64: Buffer.from("not-an-image").toString("base64"),
      }),
    ).rejects.toThrow(/image bytes/i);
  });

  it("keeps successful outputs when remaining slots fail or cancel", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 3,
    });
    await library.markSlotRunning(batch.id, 0);
    await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/webp",
      base64: WEBP_BYTES.toString("base64"),
    });
    await library.failSlot({
      batchId: batch.id,
      slotIndex: 1,
      error: { code: "provider_failed", retryable: false, message: "failed" },
    });
    const cancelled = await library.cancelBatch(batch.id);

    expect(cancelled.status).toBe("partially_succeeded");
    expect(cancelled.counts).toMatchObject({
      succeeded: 1,
      failed: 1,
      cancelled: 1,
    });
  });

  it("marks the in-flight slot cancelled and rejects a late provider result", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 2,
    });
    await library.markSlotRunning(batch.id, 0);

    const cancelled = await library.cancelBatch(batch.id);

    expect(cancelled.slots.map((slot) => slot.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    await expect(
      library.commitOutput({
        batchId: batch.id,
        slotIndex: 0,
        base64: PNG_BYTES.toString("base64"),
      }),
    ).rejects.toThrow(/cannot accept output/i);
  });

  it("persists favorite changes and requeues only failed or interrupted slots", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 3,
    });
    const successful = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });
    await library.failSlot({
      batchId: batch.id,
      slotIndex: 1,
      error: { code: "provider_failed", retryable: false, message: "failed" },
    });
    await library.markSlotRunning(batch.id, 2);

    const favorited = await library.setFavorite({
      batchId: batch.id,
      outputId: successful.slots[0].output!.id,
      favorite: true,
    });
    library.recoverInterrupted();
    const recovered = await library.listBatches();
    const retried = await library.retryFailed(batch.id);

    expect(favorited.slots[0].output?.favorite).toBe(true);
    expect(recovered[0].slots[2].status).toBe("interrupted");
    expect(retried.slots.map((slot) => slot.status)).toEqual([
      "succeeded",
      "pending",
      "pending",
    ]);
    expect(
      db
        .prepare(
          "SELECT favorite FROM generation_outputs WHERE batch_id = ? AND slot_index = 0",
        )
        .get(batch.id),
    ).toMatchObject({ favorite: 1 });
  });

  it("serializes concurrent favorite mutations without losing updates", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 2,
    });
    const first = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: PNG_BYTES.toString("base64"),
    });
    const second = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 1,
      base64: PNG_BYTES.toString("base64"),
    });

    await Promise.all([
      library.setFavorite({
        batchId: batch.id,
        outputId: first.slots[0].output!.id,
        favorite: true,
      }),
      library.setFavorite({
        batchId: batch.id,
        outputId: second.slots[1].output!.id,
        favorite: true,
      }),
    ]);

    const updated = await library.getBatch(batch.id);
    expect(updated.slots.map((slot) => slot.output?.favorite)).toEqual([
      true,
      true,
    ]);
  });

  it("preserves the original completion time for metadata-only changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T08:00:00.000Z"));
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const completed = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: PNG_BYTES.toString("base64"),
    });
    vi.setSystemTime(new Date("2026-07-15T09:00:00.000Z"));

    const favorited = await library.setFavorite({
      batchId: batch.id,
      outputId: completed.slots[0].output!.id,
      favorite: true,
    });

    expect(favorited.completedAt).toBe(completed.completedAt);
    expect(favorited.updatedAt).toBe("2026-07-15T09:00:00.000Z");
  });

  it("rejects favorite changes for outputs outside the requested batch", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });

    await expect(
      library.setFavorite({
        batchId: batch.id,
        outputId: "missing-output",
        favorite: true,
      }),
    ).rejects.toThrow(/output not found/i);
  });

  it("keeps manifest provenance usable after the source Prompt is deleted", async () => {
    db.run(
      `INSERT INTO prompts (id, title, user_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      "source-prompt",
      "Source",
      "Poster",
      Date.now(),
      Date.now(),
    );
    const batch = await library.createBatch({
      sourcePromptId: "source-prompt",
      sourcePromptVersion: 3,
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const successful = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });
    db.run("DELETE FROM prompts WHERE id = ?", "source-prompt");

    const updated = await library.setFavorite({
      batchId: batch.id,
      outputId: successful.slots[0].output!.id,
      favorite: true,
    });

    expect(updated.sourcePromptId).toBeUndefined();
    expect(updated.sourcePromptVersion).toBe(3);
    expect(
      db
        .prepare("SELECT source_prompt_id FROM generation_batches WHERE id = ?")
        .get(batch.id),
    ).toMatchObject({ source_prompt_id: null });
  });

  it("copies an explicitly attached output into normal Prompt media without moving the original", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const successful = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });
    const output = successful.slots[0].output!;

    const promptMediaName = await library.copyOutputToPromptMedia({
      batchId: batch.id,
      outputId: output.id,
    });

    expect(promptMediaName).toMatch(/^generated-.*\.png$/);
    expect(
      fs.readFileSync(
        path.join(tempDir, "data", "assets", "images", promptMediaName),
      ),
    ).toEqual(PNG_BYTES);
    expect(
      fs.existsSync(
        path.join(getGeneratedImagesDir(), batch.id, output.fileName),
      ),
    ).toBe(true);
  });

  it("returns verified generation bytes for whole-image editing", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const successful = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });
    const output = successful.slots[0].output!;

    await expect(
      library.readOutputReference({ batchId: batch.id, outputId: output.id }),
    ).resolves.toEqual({
      fileName: output.fileName,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });
  });

  it("rejects missing or tampered generation output references", async () => {
    const batch = await library.createBatch({
      prompt: "Poster",
      model: { id: "m1", provider: "openai", model: "gpt-image-1" },
      targetCount: 1,
    });
    const successful = await library.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: PNG_BYTES.toString("base64"),
    });
    const output = successful.slots[0].output!;

    await expect(
      library.readOutputReference({
        batchId: batch.id,
        outputId: "missing-output",
      }),
    ).rejects.toThrow(/output not found/i);

    fs.writeFileSync(
      path.join(getGeneratedImagesDir(), batch.id, output.fileName),
      JPEG_BYTES,
    );
    await expect(
      library.readOutputReference({ batchId: batch.id, outputId: output.id }),
    ).rejects.toThrow(/integrity/i);
  });
});
