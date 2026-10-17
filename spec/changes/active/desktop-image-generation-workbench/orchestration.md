# Image Generation Workbench Orchestration

## Status

- Phase: plan
- Network execution owner: Desktop renderer application service
- Durable transition owner: Desktop main generation-library service
- Pure policy owner: `packages/core`

## Architecture Decision

The current image provider adapters live in
`apps/desktop/src/renderer/services/ai.ts` and already route HTTP through the typed main
AI transport. The first workbench release reuses those adapters rather than duplicating
provider logic in main or `packages/core`.

Long-running work must not belong to a React component. A renderer application service
owns scheduling for the lifetime of the renderer process, while every meaningful state
transition is validated and persisted by the main generation-library service before the
UI is notified. Navigating away from the workbench therefore does not cancel a batch.

`apps/desktop/src/renderer/services/ai.ts` is already near the 2,000-line project limit.
Before adding workbench behavior, existing image-generation adapters must be extracted
into focused renderer service modules; the feature must not expand that legacy file.

## Module Boundaries

### `packages/shared`

- Manifest, batch, slot, output, error and capability types.
- IPC channel constants and preload request/response contracts.
- No Electron, filesystem or provider-specific request code.

### `packages/core`

- Request normalization and `1..100` count validation.
- Capability resolution and provider request splitting.
- Pure batch/slot state reducer and terminal-status derivation.
- Retry classification, bounded backoff calculation and idempotency keys.
- Manifest runtime validation and index-rebuild projection.

### Desktop Renderer Service

- Resolves the configured image model from the existing AI settings source.
- Holds API credentials only in memory and calls the extracted existing adapters.
- Schedules provider requests using the core plan.
- Sends transition commands and provider results to main.
- Maintains a small Zustand projection for visible queue/filter/selection state; durable
  truth always comes back from main.

### Desktop Main Service

- Owns manifests, generated originals, derived SQLite index and recovery scan.
- Validates every transition through core policy.
- Downloads remote output URLs using existing SSRF protections or validates base64
  output bytes before commit.
- Emits typed changed events after durable writes.
- Owns native export dialog and safe filename collision handling.

## Capability Contract

Image model configuration gains a shared optional `imageGeneration` capability object:

```ts
interface ImageGenerationCapabilities {
  maxImagesPerRequest: number;
  supportedSizes?: string[];
  supportedAspectRatios?: string[];
  supportedQualities?: string[];
  supportsReferenceImages: boolean;
  maxReferenceImages?: number;
  supportsSeed: boolean;
  supportsStyle: boolean;
  supportsRemoteCancel: boolean;
  maxConcurrency?: number;
}
```

- Missing capability data uses conservative adapter defaults, normally one image per
  request, four concurrent requests per endpoint, no seed and no reference images.
- Existing provider/model heuristics are centralized in one resolver; UI and request
  code cannot maintain separate support matrices.
- Unsupported parameters are disabled before submission. A stored batch snapshot still
  records capability-normalized values, not ignored UI input.
- Provider-specific custom parameters remain an advanced allowlisted object with scalar
  values only and explicit payload size limits.

## Batch Planning

1. Resolve the source Prompt/adhoc text, variables and stable reference snapshots.
2. Resolve one configured image model and its capabilities.
3. Normalize count, size/aspect, quality, style, seed and references.
4. Create `targetCount` stable slots.
5. Partition slots into provider requests no larger than `maxImagesPerRequest`.
6. Persist the complete queued manifest before starting network work.

The local product maximum is 100 regardless of a provider's larger limit. One batch uses
one model. “Copy batch and switch model” creates a child batch with a new immutable model
snapshot.

## Scheduling And Concurrency

- Default concurrency is four in-flight requests per provider endpoint. A four-image
  batch starts all four requests without waiting for earlier images to finish. Larger
  batches wait for a free slot. Batches sharing an endpoint share this cap.
- Confirmed 2026-10-17: this replaces the former serial default. Current model settings
  do not expose a concurrency override; no new stored capability field is introduced.
- Cancellation stops queued work and ignores late provider results. Each execution has
  a separate identity so a retry cannot reactivate results from a cancelled run.
- The application-wide scheduler is fair between batches: after one request settles, a
  waiting batch receives a turn before the same batch consumes another slot group.
- Reference image decoding, hashing and filesystem writes do not run on the renderer
  main thread.
- Queue order is stable by submission time; retry groups join after already queued
  initial work unless the user explicitly pauses newer batches in a later version.

## Attempt Lifecycle

```text
queued -> running -> succeeded
                  -> failed
                  -> interrupted
queued -----------> cancelled
running ----------> cancelled (local outcome; provider compute may continue)
```

- Main persists `running` before the renderer sends the provider request.
- A provider response may contain fewer outputs than requested. Returned outputs fill
  slots in order; missing slots fail with `provider_incomplete_result`.
- A successful adapter response is not a successful slot until main has durably saved
  and hashed the original.
- Duplicate callbacks use attempt ID and slot ID idempotency. They cannot create another
  output or increment counts twice.

## Retry Policy

Automatic retry applies only to transient network failures, timeouts, HTTP 408/425/429
and provider 5xx responses.

- Maximum automatic attempts per provider request: 3 total.
- Honor a valid `Retry-After` value, capped at 60 seconds.
- Otherwise use bounded exponential delays of approximately 1, 2 and 4 seconds with
  jitter supplied by an injectable testable clock/random source.
- Validation, authentication, insufficient quota, safety rejection and unsupported
  parameter failures are terminal and actionable; they are never hot-looped.
- User “retry failed” targets only failed/interrupted slots and appends new attempts
  without changing successful outputs.

## Cancellation

- `requestCancel` immediately marks pending and locally running slots cancelled and
  stops scheduling new requests.
- If a provider supports real remote cancellation, the adapter may cancel and then
  persist the confirmed result.
- Aborting local HTTP transport alone does not prove provider-side cancellation. The
  provider may continue computing, but the local slot remains cancelled.
- Results that return after local cancellation are discarded and cannot overwrite a
  cancelled slot or enter the local generation library.
- Final batch status derives from the locally durable slot outcomes. The UI must not
  imply that local cancellation guarantees provider-side compute cancellation.

## Restart Recovery

- Startup main recovery validates manifests and converts unprovable running attempts to
  `interrupted` before initial list response.
- A provider job ID may resume polling only when that adapter declares a reliable poll
  contract and the current model configuration still exists.
- API keys are never stored in manifests. Retrying after restart re-resolves credentials
  from current settings; missing or changed credentials produce a visible blocked/error
  state without corrupting history.
- Successful outputs and partial progress remain usable regardless of whether remaining
  work can resume.

## Error Taxonomy

Stable local codes include:

- `invalid_request`, `unsupported_parameter`, `missing_model_config`
- `authentication_failed`, `quota_exceeded`, `rate_limited`, `safety_rejected`
- `provider_timeout`, `provider_unavailable`, `provider_incomplete_result`
- `remote_output_blocked`, `invalid_image_bytes`, `image_too_large`
- `disk_full`, `asset_write_failed`, `manifest_write_failed`, `index_rebuild_required`
- `interrupted`, `cancelled_by_user`

User-visible copy is localized from codes. Provider messages are sanitized supporting
detail and never become executable HTML or the sole stable error identity.

## Verification Matrix

| Risk                         | Required proof                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Provider request splitting   | 50 and 100 targets split correctly for limits 1 and 4.                                                         |
| Fair concurrency             | Multiple batches respect endpoint caps without starvation.                                                     |
| Partial provider result      | Returned outputs persist; missing slots fail once with accurate counts.                                        |
| Rate limiting                | `Retry-After`, bounded retry and terminal quota/auth branches are exercised.                                   |
| Cancellation                 | Pending/running local slots cancel; uncancellable provider compute may continue, but late output is discarded. |
| Idempotency                  | Duplicate responses cannot duplicate files, rows or counts.                                                    |
| Navigation away              | Component unmount does not stop the application service.                                                       |
| Renderer/app restart         | Durable successes remain; unprovable work becomes interrupted.                                                 |
| Secret handling              | API keys never appear in manifest, DB index, logs, events or errors.                                           |
| Main-process storage failure | No slot becomes successful without durable original and manifest.                                              |
