import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GenerationDB, type DatabaseAdapter } from "@prompthub/db";
import type {
  DeleteGenerationBatchResult,
  GenerationBatchManifest,
} from "@prompthub/shared/types";
import { validateGenerationManifest } from "@prompthub/shared/utils/generation-manifest";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { assertStorageMaintenanceAvailable } from "./storage-maintenance-intent";
import { publishSqliteEntries } from "./sqlite-entry-publication";
import type { CanonicalGenerationShadowInput } from "./canonical-storage-shadow";

export function collectGenerationResources(
  database: DatabaseAdapter.Database,
  root: string,
): CanonicalGenerationShadowInput[] {
  return new GenerationDB(database).list().map((manifest) => ({
    manifest,
    outputSources: Object.fromEntries(
      manifest.slots.flatMap((slot) =>
        slot.output
          ? [
              [
                slot.output.fileName,
                generationOutputPath(root, manifest.id, slot.output.fileName),
              ],
            ]
          : [],
      ),
    ),
  }));
}

function generationBatchPath(root: string, batchId: string): string {
  const target = path.join(
    root,
    "data",
    "generations",
    "assets",
    encodeCanonicalResourceDirectory(batchId),
  );
  assertStoragePathComponentsSafe(root, target);
  return target;
}

export function generationOutputPath(
  root: string,
  batchId: string,
  fileName: string,
): string {
  if (
    !fileName ||
    fileName === "." ||
    fileName === ".." ||
    /[\u0000-\u001f\u007f/\\]/u.test(fileName)
  )
    throw new Error("Invalid generation output fileName");
  const target = path.join(generationBatchPath(root, batchId), fileName);
  assertStoragePathComponentsSafe(root, target);
  return target;
}

/** SQLite metadata and a newly generated image share one recoverable commit. */
export class GenerationStorage {
  private readonly repository: GenerationDB;
  constructor(
    private readonly database: DatabaseAdapter.Database,
    private readonly root: string,
  ) {
    this.repository = new GenerationDB(database);
  }

  delete(batchId: string): DeleteGenerationBatchResult {
    assertStorageMaintenanceAvailable(this.root);
    if (typeof batchId !== "string" || !/^[0-9a-f-]{36}$/u.test(batchId))
      throw new Error("Invalid batch id");
    const manifest = this.repository.get(batchId);
    if (!manifest) return { cleanupPending: false };
    if (
      manifest.slots.some(
        (slot) => slot.status === "pending" || slot.status === "running",
      )
    )
      throw new Error("Cancel generation before deleting its batch");
    const targetPath = generationBatchPath(this.root, batchId);
    const result = publishSqliteEntries(this.database, {
      rootPath: this.root,
      operationKey: "generation-storage",
      entries: [{ targetPath, delete: true }],
      commit: () => this.repository.delete(batchId),
    });
    return { cleanupPending: result.cleanupPending };
  }

  save(
    manifest: GenerationBatchManifest,
    image?: { fileName: string; bytes: Buffer },
  ): void {
    assertStorageMaintenanceAvailable(this.root);
    validateGenerationManifest(manifest);
    if (!image) {
      this.repository.upsert(manifest);
      return;
    }
    const output = manifest.slots.find(
      (slot) => slot.output?.fileName === image.fileName,
    )?.output;
    if (
      !output ||
      image.bytes.length !== output.byteSize ||
      crypto.createHash("sha256").update(image.bytes).digest("hex") !==
        output.sha256
    )
      throw new Error("Generation image does not match its output metadata");
    const targetPath = generationOutputPath(
      this.root,
      manifest.id,
      image.fileName,
    );
    if (fs.existsSync(targetPath))
      throw new Error("Generation output file already exists");
    publishSqliteEntries(this.database, {
      rootPath: this.root,
      operationKey: "generation-storage",
      entries: [
        {
          targetPath,
          prepare(stage) {
            fs.writeFileSync(stage, image.bytes, { flag: "wx", mode: 0o600 });
          },
        },
      ],
      commit: () => this.repository.upsert(manifest),
    });
  }
}
