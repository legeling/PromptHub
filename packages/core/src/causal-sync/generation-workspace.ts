import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GenerationDB, type DatabaseAdapter } from "@prompthub/db";
import type { GenerationBatchManifest } from "@prompthub/shared/types";
import { validateGenerationManifest } from "@prompthub/shared/utils/generation-manifest";
import { generationOutputPath } from "../generation-storage";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

function references(manifest: GenerationBatchManifest) {
  return manifest.sourcePromptId
    ? [{ resourceType: "prompt", resourceId: manifest.sourcePromptId }]
    : [];
}

function verifyFiles(
  manifest: GenerationBatchManifest,
  value: unknown,
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid generation sync outputs");
  const files = value as Record<string, unknown>; // Record shape checked; each file is validated below.
  const result: Record<string, string> = {};
  for (const slot of manifest.slots) {
    if (!slot.output) continue;
    const output = slot.output,
      text = files[output.fileName];
    if (typeof text !== "string")
      throw new Error("Missing generation sync output");
    const bytes = Buffer.from(text, "base64");
    if (
      bytes.toString("base64") !== text ||
      bytes.length !== output.byteSize ||
      crypto.createHash("sha256").update(bytes).digest("hex") !== output.sha256
    )
      throw new Error("Generation sync output hash mismatch");
    result[output.fileName] = text;
  }
  if (Object.keys(result).length !== Object.keys(files).length)
    throw new Error("Undeclared generation sync output");
  return result;
}

export class GenerationCausalSyncWorkspace implements CausalSyncWorkspace {
  private readonly repository: GenerationDB;
  constructor(
    database: DatabaseAdapter.Database,
    private readonly root: string,
  ) {
    this.repository = new GenerationDB(database);
  }

  capture(): CausalSyncPayload[] {
    return this.repository.list().map((manifest) => {
      const files: Record<string, string> = {};
      for (const slot of manifest.slots) {
        if (!slot.output) continue;
        const file = generationOutputPath(
          this.root,
          manifest.id,
          slot.output.fileName,
        );
        if (!fs.lstatSync(file).isFile())
          throw new Error("Unsafe generation sync output");
        files[slot.output.fileName] = fs.readFileSync(file).toString("base64");
      }
      verifyFiles(manifest, files);
      return syncPayload(
        "generation",
        manifest.id,
        { manifest, files },
        references(manifest),
      );
    });
  }

  private decode(resource: CausalSyncPayload) {
    if (resource.resourceType !== "generation")
      throw new Error("Invalid generation sync resource");
    const value = syncPayloadRecord(resource),
      { manifest } = validateGenerationManifest(value.manifest);
    const files = verifyFiles(manifest, value.files);
    const expected = syncPayload(
      "generation",
      manifest.id,
      { manifest, files },
      references(manifest),
    );
    if (
      resource.resourceId !== manifest.id ||
      expected.contentHash !== resource.contentHash ||
      JSON.stringify(expected.references) !==
        JSON.stringify(resource.references)
    )
      throw new Error("Invalid generation sync identity or references");
    return { manifest, files };
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const incoming = resources.map((resource) => this.decode(resource));
    const ids = new Set(incoming.map((entry) => entry.manifest.id));
    if (ids.size !== incoming.length)
      throw new Error("Duplicate generation sync identity");
    const previous = this.repository.list();
    const current = new Map(
      this.capture().map((resource) => [
        resource.resourceId,
        resource.contentHash,
      ]),
    );
    const changed = incoming.filter(
      (entry, index) =>
        current.get(entry.manifest.id) !== resources[index].contentHash,
    );
    const entries: CanonicalEntryMutation[] = changed.map(
      ({ manifest, files }) => ({
        targetPath: path.dirname(
          generationOutputPath(this.root, manifest.id, "output"),
        ),
        prepare(stage) {
          fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
          for (const [name, text] of Object.entries(files))
            fs.writeFileSync(
              path.join(stage, name),
              Buffer.from(text, "base64"),
              { flag: "wx", mode: 0o600 },
            );
        },
      }),
    );
    for (const manifest of previous)
      if (!ids.has(manifest.id)) {
        const targetPath = path.dirname(
          generationOutputPath(this.root, manifest.id, "output"),
        );
        if (fs.existsSync(targetPath))
          entries.push({ targetPath, delete: true });
      }
    return {
      entries,
      apply: () => {
        for (const manifest of previous)
          if (!ids.has(manifest.id)) this.repository.delete(manifest.id);
        for (const entry of changed) this.repository.upsert(entry.manifest);
      },
    };
  }
}
