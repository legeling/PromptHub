# Image Generation Workbench Data Contract

## Status

This planning draft is superseded for persistence by
[Generation SQLite ownership](../foundation-integrity-redesign/design.md#generation-sqlite-ownership).
Current batches and slots are authoritative SQLite records; actual images remain
under `data/generations/assets/`. The historical manifest/index, tombstone and
rebuild descriptions below are not current runtime instructions. Batch deletion
(#248) uses the existing SQLite-receipt publication transaction, not a new tombstone
schema. Current shared types are in `packages/shared/types/image-generation.ts`.

- Phase: plan
- Source of truth: filesystem under `data/`
- SQLite role: rebuildable query and recovery index
- Remote sync: excluded in the first release

## Ownership And Layout

All paths are resolved through `packages/core/src/runtime-paths.ts`; app code must not
construct user-data paths directly.

```text
<userData>/
├── data/
│   ├── generations/
│   │   ├── <batch-id>/
│   │   │   └── batch.json
│   │   └── assets/
│   │       └── <batch-id>/
│   │           └── <output-id>.<ext>
│   └── assets/images/generated/ # legacy generation-output location only
└── cache/generated-thumbnails/
    └── <output-id>.<ext>
```

- `batch.json` is the durable source for batch, attempt, slot, output and provenance
  metadata.
- Generated originals are durable local assets. They are never written into a Prompt
  media list implicitly.
- Thumbnails are derived cache and may be deleted or rebuilt at any time.
- The renderer receives opaque IDs and `local-generation-image://` URLs, never arbitrary durable
  filesystem paths.

## Manifest Version 1

Every manifest uses the following logical contract. Shared TypeScript types and runtime
validation live in `packages/shared`; normalization and state invariants live in
`packages/core`.

```ts
interface GenerationBatchManifestV1 {
  kind: "prompthub-generation-batch";
  version: 1;
  id: string;
  status:
    | "queued"
    | "running"
    | "cancelling"
    | "succeeded"
    | "partially_succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";
  source: {
    kind: "prompt" | "adhoc";
    promptId?: string;
    promptVersion?: number;
    title?: string;
    userPrompt: string;
    variableValues: Record<string, string>;
    resolvedPrompt: string;
    referenceAssets: GenerationReferenceSnapshot[];
  };
  request: {
    model: GenerationModelSnapshot;
    targetCount: number;
    parameters: NormalizedImageGenerationParameters;
  };
  slots: GenerationSlotSnapshot[];
  attempts: GenerationAttemptSnapshot[];
  counts: GenerationBatchCounts;
  parentBatchId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

### Source Snapshot

- `promptId` is provenance, not a required live foreign key. Deleting a Prompt does not
  rewrite historical content.
- `resolvedPrompt` is the exact text sent to the provider after variable resolution.
- Reference snapshots contain local asset ID, MIME, byte count and SHA-256. They never
  contain arbitrary paths or API credentials.
- The model snapshot contains stable configured model/provider IDs when available plus
  provider and model display names. It excludes API keys, authorization headers and
  provider URLs containing credentials.

### Slots, Attempts And Outputs

- A batch creates exactly `targetCount` stable slots numbered `0..targetCount - 1`.
- One provider attempt may target one or more slots when a provider supports `n > 1`.
- Retrying a failed or interrupted slot appends an attempt; it does not create another
  slot or increase the batch target count.
- A successful slot owns at most one current output record. An adjusted generation or
  duplicate run creates a child batch rather than overwriting the original output.
- Output metadata includes ID, slot index, relative asset path, MIME, byte count,
  SHA-256, dimensions, revised Prompt/seed when returned, favorite state, parent output
  ID when applicable, creation time, deletion tombstone and cleanup status.
- Provider errors are normalized to a stable code, retryable flag, optional HTTP status
  and a sanitized message capped at 1,000 characters. Raw response bodies are not stored.

## Batch Invariants

- `targetCount` is an integer in `1..100`.
- `counts.total` always equals `targetCount`.
- Every slot has a unique index and exactly one terminal outcome at a time.
- `succeeded + failed + cancelled + interrupted + pending + running = total`.
- A terminal batch has no pending or running slot.
- `succeeded` requires every slot to succeed; mixed terminal outcomes use
  `partially_succeeded`; zero successes with failures uses `failed`.
- Deleting an output does not rewrite the historical slot outcome. It sets `deletedAt`
  and reduces the derived available-output count.

## Derived SQLite Index

`packages/db` adds rebuildable tables to fresh schema and migration initialization.
They are not exported as the only copy of generation history.

### `generation_batches`

- `id` primary key
- `manifest_path` unique relative path
- `status`, `source_kind`, nullable live `source_prompt_id`
- snapshot title/model/provider fields needed by filters
- requested and outcome counts
- `created_at`, `updated_at`, nullable `completed_at`
- indexes on `(created_at DESC)`, `(status, updated_at DESC)`,
  `(source_prompt_id, created_at DESC)` and `(provider, model)`

The live Prompt relation uses `ON DELETE SET NULL`. The manifest retains the historical
Prompt ID and content snapshot.

### `generation_outputs`

- `id` primary key
- `batch_id` with `ON DELETE CASCADE` inside the derived index
- `slot_index`, `status`, nullable relative asset path
- `favorite`, dimensions, MIME, hash, byte count, nullable `deleted_at`
- nullable `parent_output_id`
- unique `(batch_id, slot_index)` and relative asset path
- indexes on `(favorite, created_at DESC)`, `(status, created_at DESC)` and
  `(batch_id, slot_index)`

Attempt history remains in the manifest for the first release. It is not separately
indexed until a user-visible attempt query requires it.

## Atomic Write Order

### Create Batch

1. Validate and normalize the complete request in `packages/core`.
2. Create the batch and generated asset directories with owner-only permissions where
   supported.
3. Write `batch.json.tmp`, flush it, then atomically rename it to `batch.json`.
4. Upsert the derived batch and empty slot index rows in one SQLite transaction.
5. Notify renderer subscribers only after the manifest is durable.

If step 4 fails, the manifest remains authoritative and startup index rebuild repairs
SQLite. A failed manifest write leaves no visible batch.

### Commit Successful Output

1. Validate provider bytes/URL, MIME, extension and size at the main-process boundary.
2. Write the image to a same-directory staging file, flush and atomically rename it.
3. Update the manifest through temp-file plus atomic rename.
4. Update derived SQLite rows in one transaction.
5. Emit one batch-changed event containing IDs and counts, not image bytes.

The output is not counted as successful before step 3. SQLite failure after step 3 marks
the index dirty and schedules rebuild; it does not delete a durable manifest-owned image.

### Delete Output Or Batch

- Deleting one output first records `deletedAt` and `cleanupPending`, then updates the
  index, then removes the file. A failed file deletion remains visible as retryable local
  cleanup and cannot resurrect the output.
- Deleting a batch first writes a batch tombstone. It then cleans original files and the
  derived index before removing the manifest directory.
- No cross-batch content deduplication exists in the first release, so deletion never
  requires shared reference counts.
- “Add to Prompt” creates a normal Prompt media asset/reference. It does not make the
  workbench original dependent on that Prompt and does not sync other batch outputs.

## Startup Recovery And Rebuild

- Startup scans manifests whose index is missing, stale or marked dirty and rebuilds
  them idempotently.
- Invalid JSON, unknown future manifest versions, missing originals and hash mismatches
  are isolated as recovery candidates; one corrupt batch cannot hide healthy batches.
- Non-terminal slots with a recoverable provider job ID may resume polling. Other
  running slots become `interrupted` before the renderer receives initial state.
- Orphan files not referenced by a valid manifest are never deleted automatically.
  Diagnostics can list them for later explicit cleanup.

## Local Backup And Remote Exclusion

- Data-layout migration and pre-upgrade filesystem snapshots preserve both generation
  directories.
- Workbench batch export copies selected originals plus a provenance manifest to a
  user-selected local directory. It never mutates the library.
- Existing renderer-built `.phub.gz`/JSON database backups are not silently enlarged
  with hundreds of base64 images. The data settings UI and workbench must state that the
  generation library is device-local and should be protected through data-directory
  backup or batch export.
- WebDAV, S3, self-hosted and PromptHub cloud payload builders exclude
  `data/generations/` and the legacy `data/assets/images/generated/` location. Future
  member cloud storage is a separate versioned contract.

## Typed Desktop Contract

Shared IPC names use the `generation:*` domain. The preload exposes one typed
`window.api.generation` namespace with the minimum operations:

- `listBatches(query)` and `getBatch(id)`
- `createBatch(input)`
- `recordAttemptStarted(input)`
- `recordAttemptSucceeded(input)` and `recordAttemptFailed(input)`
- `requestCancel(id)` and `markInterrupted(input)`
- `setFavorite(outputIds, favorite)`
- `deleteOutputs(outputIds)` and `deleteBatch(id)`
- `exportOutputs(input)` using a main-process native destination dialog
- `addOutputToPrompt(input)`
- `onChanged(listener)` returning an unsubscribe function

Main handlers revalidate IDs, transition legality, count bounds, payload sizes and asset
ownership. Renderer input never supplies a destination path or durable relative path.

## Compatibility And Rollback

- Existing users receive empty generation directories and index tables; no Prompt media
  field changes and no existing image is reclassified.
- Removing the feature leaves self-describing local manifests and originals untouched.
- Downgrade builds ignore the new directories because remote sync collects only
  Prompt-referenced media.
- A migration failure does not block existing Prompt, AI testing or media behavior.
