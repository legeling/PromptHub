import { validateGenerationManifest } from "@prompthub/shared/utils/generation-manifest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  GenerationBatchManifest,
  GenerationOutputRecord,
} from "@prompthub/shared/types";

import {
  readContentAddressedObject,
  storeContentAddressedObject,
} from "./content-addressed-object-store";
import {
  readResourceBundle,
  type ResourceBundleManifest,
} from "./resource-bundle";
import {
  resolveResourceBundleWriteRevision,
  writeResourceBundle,
  type ResourceBundleWritePolicy,
} from "./resource-bundle-publication";

const GENERATION_RESOURCE_TYPE = "generation";
const GENERATION_PAYLOAD_PATH = "batch.json";
const GENERATION_SCHEMA_VERSION = 1;
const MAX_GENERATION_MANIFEST_BYTES = 8 * 1024 * 1024;

/** Historical standalone manifests are accepted only by explicit migration/import. */
export function readGenerationManifestFile(file: string): GenerationBatchManifest {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_GENERATION_MANIFEST_BYTES)
    throw new Error("Historical generation manifest is unsafe");
  return validateGenerationManifest(JSON.parse(fs.readFileSync(file, "utf8"))).manifest;
}
export interface MaterializeGenerationResourceInput {
  bundlePath: string;
  objectsRoot: string;
  manifest: GenerationBatchManifest;
  outputSources: Readonly<Record<string, string>>;
  writePolicy?: ResourceBundleWritePolicy;
}

export interface MaterializedGenerationResource {
  bundleManifest: ResourceBundleManifest;
  objectHashes: string[];
}

export interface ReadGenerationResourceResult {
  manifest: GenerationBatchManifest;
  outputs: GenerationOutputRecord[];
  bundleManifest: ResourceBundleManifest;
}

function validateOutputSources(
  outputs: readonly GenerationOutputRecord[],
  sources: Readonly<Record<string, string>>,
): void {
  const expected = new Set(outputs.map((output) => output.fileName));
  for (const fileName of expected) {
    if (!Object.prototype.hasOwnProperty.call(sources, fileName)) {
      throw new Error(`generation resource missing output source: ${fileName}`);
    }
  }
  for (const fileName of Object.keys(sources)) {
    if (!expected.has(fileName)) {
      throw new Error(
        `generation resource has an undeclared output source: ${fileName}`,
      );
    }
  }
}

function materializeObjects(
  objectsRoot: string,
  outputs: readonly GenerationOutputRecord[],
  sources: Readonly<Record<string, string>>,
): string[] {
  const hashes = new Set<string>();
  for (const output of outputs) {
    const sourcePath = sources[output.fileName];
    const stat = fs.lstatSync(sourcePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== output.byteSize
    ) {
      throw new Error(
        `generation resource output source size is invalid: ${output.fileName}`,
      );
    }
    const stored = storeContentAddressedObject(objectsRoot, sourcePath, {
      expectedHash: output.sha256,
      maxBytes: output.byteSize,
    });
    hashes.add(stored.hash);
  }
  return [...hashes].sort();
}

function writeManifestSource(
  parentPath: string,
  manifest: GenerationBatchManifest,
): string {
  const sourcePath = path.join(
    parentPath,
    `.generation-${crypto.randomUUID()}.json`,
  );
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(text, "utf8") > MAX_GENERATION_MANIFEST_BYTES) {
    throw new Error("generation resource manifest byte limit exceeded");
  }
  fs.mkdirSync(parentPath, { recursive: true });
  fs.writeFileSync(sourcePath, text, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return sourcePath;
}

export function materializeGenerationResourceBundle(
  input: MaterializeGenerationResourceInput,
): MaterializedGenerationResource {
  const parsed = validateGenerationManifest(structuredClone(input.manifest));
  validateOutputSources(parsed.outputs, input.outputSources);
  const objectHashes = materializeObjects(
    input.objectsRoot,
    parsed.outputs,
    input.outputSources,
  );
  const sourcePath = writeManifestSource(
    path.dirname(input.bundlePath),
    parsed.manifest,
  );
  try {
    const revision = resolveResourceBundleWriteRevision(
      input.bundlePath,
      GENERATION_RESOURCE_TYPE,
      parsed.manifest.id,
      parsed.manifest.version,
      input.writePolicy,
    );
    const bundleManifest = writeResourceBundle(
      {
        bundlePath: input.bundlePath,
        resourceType: GENERATION_RESOURCE_TYPE,
        resourceId: parsed.manifest.id,
        schemaVersion: GENERATION_SCHEMA_VERSION,
        revision,
        createdAt: parsed.manifest.createdAt,
        updatedAt: parsed.manifest.updatedAt,
        provenance: { source: "generation-library" },
        objectHashes,
        payloads: [
          { path: GENERATION_PAYLOAD_PATH, sourcePath, role: "manifest" },
        ],
      },
      { mode: input.writePolicy?.mode },
    ).manifest;
    return { bundleManifest, objectHashes };
  } finally {
    fs.rmSync(sourcePath, { force: true });
  }
}

function readManifestPayload(bundlePath: string): unknown {
  const filePath = path.join(bundlePath, GENERATION_PAYLOAD_PATH);
  const stat = fs.lstatSync(filePath);
  if (stat.size > MAX_GENERATION_MANIFEST_BYTES) {
    throw new Error("generation resource manifest byte limit exceeded");
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("generation resource manifest contains invalid JSON", {
      cause: error,
    });
  }
}

export function readGenerationResourceBundle(
  bundlePath: string,
  objectsRoot: string,
): ReadGenerationResourceResult {
  const bundle = readResourceBundle(bundlePath, {
    expectedResourceType: GENERATION_RESOURCE_TYPE,
  });
  const payload = bundle.manifest.payloadFiles;
  if (
    payload.length !== 1 ||
    payload[0].path !== GENERATION_PAYLOAD_PATH ||
    payload[0].role !== "manifest"
  ) {
    throw new Error("generation resource bundle payload is invalid");
  }
  const parsed = validateGenerationManifest(readManifestPayload(bundlePath));
  if (parsed.manifest.id !== bundle.manifest.resourceId) {
    throw new Error("generation resource id does not match its bundle");
  }
  const hashes = [
    ...new Set(parsed.outputs.map((output) => output.sha256)),
  ].sort();
  if (JSON.stringify(hashes) !== JSON.stringify(bundle.manifest.objectHashes)) {
    throw new Error("generation resource object hashes do not match outputs");
  }
  for (const output of parsed.outputs) {
    const object = readContentAddressedObject(objectsRoot, output.sha256, {
      maxBytes: output.byteSize,
    });
    if (object.size !== output.byteSize) {
      throw new Error("generation resource object size does not match output");
    }
  }
  return {
    manifest: parsed.manifest,
    outputs: parsed.outputs,
    bundleManifest: bundle.manifest,
  };
}
