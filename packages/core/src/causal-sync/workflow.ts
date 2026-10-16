import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseAdapter } from "@prompthub/db";
import type {
  SyncResourceContent,
  CausalSyncResolution,
  CausalSyncReview,
} from "@prompthub/shared/types/causal-sync";
import type { RemoteTextStorage } from "@prompthub/shared/types/remote-sync";
import {
  flushDirectory,
  type CanonicalEntryMutation,
} from "../canonical-entry-publication";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import { verifyConditionalPublication } from "../remote-publication";
import {
  parseCausalSyncGeneration,
  parseLocalSyncInventory,
} from "./validation";
import { CausalSyncSession, type CausalSyncOperation } from "./session";
import {
  publishCausalSyncOperation,
  type CausalSyncPublicationResult,
} from "./publication";
import { generationText, inventoryHash, liveInventory } from "./session-state";
import { preserveSyncResolution } from "./recovery";
import { planCausalSync } from "./index";
import { syncReviewLabels } from "./review-labels";

export interface CausalSyncPayload extends SyncResourceContent {
  text: string;
}

/** Domain owners validate payloads and construct SQL/file writes before publication. */
export interface CausalSyncWorkspace {
  capture(): CausalSyncPayload[];
  prepareApplication(resources: CausalSyncPayload[]): {
    entries: CanonicalEntryMutation[];
    apply(): void;
  };
}

export interface RunCausalSyncOptions {
  database: DatabaseAdapter.Database;
  rootPath: string;
  targetId: string;
  headPath: string;
  store: RemoteTextStorage;
  workspace: CausalSyncWorkspace;
  resolution?: CausalSyncResolution;
}

export function syncPayloadHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function assertPayload(text: string, hash: string): void {
  if (!/^[a-f0-9]{64}$/u.test(hash) || syncPayloadHash(text) !== hash)
    throw new Error("Causal sync payload hash mismatch");
}

function capture(workspace: CausalSyncWorkspace): CausalSyncPayload[] {
  const resources = workspace.capture();
  // Only protocol metadata enters SQLite; payloads remain immutable transport files.
  parseLocalSyncInventory(resources.map(({ text: _text, ...entry }) => entry));
  for (const resource of resources)
    assertPayload(resource.text, resource.contentHash);
  return resources;
}

function pinDirectory(options: RunCausalSyncOptions): string {
  const directory = path.join(
    options.rootPath,
    "cache",
    "causal-sync",
    syncPayloadHash(options.targetId),
  );
  assertStoragePathComponentsSafe(options.rootPath, directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

function readPinned(directory: string, hash: string): string | null {
  if (!/^[a-f0-9]{64}$/u.test(hash))
    throw new Error("Invalid sync object hash");
  const file = path.join(directory, hash);
  if (!fs.existsSync(file)) return null;
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    if (!fs.fstatSync(descriptor).isFile())
      throw new Error("Unsafe sync object");
    const text = fs.readFileSync(descriptor, "utf8");
    assertPayload(text, hash);
    return text;
  } finally {
    fs.closeSync(descriptor);
  }
}

function pin(directory: string, resource: CausalSyncPayload): void {
  assertPayload(resource.text, resource.contentHash);
  if (readPinned(directory, resource.contentHash) !== null) return;
  const file = path.join(directory, resource.contentHash);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, resource.text, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
    flushDirectory(directory);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

async function remoteGeneration(options: RunCausalSyncOptions) {
  const response = await options.store.downloadText(options.headPath);
  if (response.notFound && !response.success)
    return { remote: null, remoteEtag: null };
  if (!response.success || typeof response.data !== "string")
    throw new Error("Causal sync HEAD could not be read");
  return {
    remote: parseCausalSyncGeneration(JSON.parse(response.data)),
    remoteEtag: response.etag ?? null,
  };
}

async function collectPayloads(
  options: RunCausalSyncOptions,
  operation: CausalSyncOperation,
  directory: string,
): Promise<CausalSyncPayload[]> {
  const resources: CausalSyncPayload[] = [];
  for (const resource of liveInventory(operation.generation)) {
    const cached = readPinned(directory, resource.contentHash);
    if (cached !== null && operation.phase === "remote-confirmed") {
      resources.push({ ...resource, text: cached });
      continue;
    }
    const key = `${options.headPath}.objects/${resource.contentHash}`;
    const remote = await options.store.downloadText(key);
    let text: string;
    if (remote.success && typeof remote.data === "string") {
      text = remote.data;
      assertPayload(text, resource.contentHash);
    } else if (
      remote.notFound &&
      cached !== null &&
      operation.mode === "publish"
    ) {
      text = cached;
      const uploaded = await options.store.uploadText(key, text, {
        ifNoneMatch: "*",
      });
      // Even a lost response is settled by reading the immutable bytes; never overwrite.
      const check = await options.store.downloadText(key);
      if (!check.success || check.data !== text)
        throw new Error(
          uploaded.conflict
            ? "Sync object identity conflict"
            : "Sync object upload was not confirmed",
        );
    } else {
      throw new Error("Causal sync immutable payload is unavailable");
    }
    const payload = { ...resource, text };
    pin(directory, payload);
    resources.push(payload);
  }
  return resources;
}

async function prepare(
  options: RunCausalSyncOptions,
  session: CausalSyncSession,
  directory: string,
) {
  const state = session.state();
  if (state?.pending)
    return { status: "pending" as const, operation: state.pending };
  const observed = await remoteGeneration(options);
  const local = capture(options.workspace);
  for (const resource of local) pin(directory, resource);
  const input = {
    ...observed,
    syncId: state?.syncId ?? observed.remote?.syncId ?? crypto.randomUUID(),
    deviceId: state?.deviceId ?? crypto.randomUUID(),
    local: local.map(({ text: _text, ...entry }) => entry),
  };
  const review = planCausalSync({
    ...input,
    base: state?.base ?? null,
    commitId: crypto.randomUUID(),
  });
  if (review.status === "conflict" || review.status === "baseline-required") {
    const token = syncPayloadHash(
      JSON.stringify({
        targetId: options.targetId,
        base: state?.base ? generationText(state.base) : null,
        local: inventoryHash(input.local),
        remote: observed.remote ? generationText(observed.remote) : null,
        etag: observed.remoteEtag,
      }),
    );
    const labels = syncReviewLabels(local);
    if (!options.resolution) return { ...review, token, labels };
    if (options.resolution.token !== token)
      return { status: "review-changed" as const };
    await preserveSyncResolution({
      ...options,
      token,
      local,
      remote: observed.remote,
    });
    const result = session.prepare({ ...input, selection: options.resolution });
    if (result.status === "conflict" || result.status === "baseline-required")
      return { ...result, token, labels };
    return result;
  } else if (options.resolution) {
    return { status: "review-changed" as const };
  }
  const result = session.prepare(input);
  if (result.status === "conflict" || result.status === "baseline-required")
    throw new Error("Sync plan changed within synchronous preparation");
  return result;
}

export type CausalSyncWorkflowResult =
  | CausalSyncReview
  | Exclude<CausalSyncPublicationResult, { status: "published" }>
  | { status: "local-changed" }
  | { status: "review-changed" }
  | { status: "committed"; cleanupPending: boolean; localChanged: boolean };

export async function runCausalSync(
  options: RunCausalSyncOptions,
): Promise<CausalSyncWorkflowResult> {
  const session = new CausalSyncSession(options.database, options.targetId);
  const directory = pinDirectory(options);
  try {
    const capability =
      session.state()?.pending?.phase === "remote-confirmed"
        ? undefined
        : await verifyConditionalPublication(options.store, options.headPath);
    if (capability?.supported === false)
      return { status: "unsupported", capability };
    const prepared = await prepare(options, session, directory);
    if (
      prepared.status === "conflict" ||
      prepared.status === "baseline-required" ||
      prepared.status === "review-changed"
    )
      return prepared;
    const operation = prepared.operation;
    if (operation.mode === "unchanged") {
      const result = session.complete(
        operation.operationId,
        () =>
          capture(options.workspace).map(({ text: _text, ...entry }) => entry),
        () => {},
      );
      if (result.status === "local-changed") {
        session.releaseForReplan(operation.operationId);
        return { status: "local-changed" };
      }
      return {
        status: "committed",
        cleanupPending: false,
        localChanged: false,
      };
    }
    const resources = await collectPayloads(options, operation, directory);
    // Invalid domain data cannot become the new remote authority.
    const application = options.workspace.prepareApplication(resources);
    if (operation.mode === "publish") {
      const publication = await publishCausalSyncOperation(
        session,
        options.store,
        options.headPath,
        operation.operationId,
        capability,
      );
      if (publication.status !== "published") return publication;
    }
    const localChanged =
      inventoryHash(
        capture(options.workspace).map(({ text: _text, ...entry }) => entry),
      ) !== inventoryHash(liveInventory(operation.generation));
    const result = session.completeWithFiles(operation.operationId, {
      rootPath: options.rootPath,
      entries: application.entries,
      readLocal: () =>
        capture(options.workspace).map(({ text: _text, ...entry }) => entry),
      apply: () => application.apply(),
    });
    if (result.status === "local-changed") {
      session.releaseForReplan(operation.operationId);
      return result;
    }
    return { ...result, localChanged };
  } finally {
    // Pending operations retain only their pinned immutable payloads for restart.
    if (!session.state()?.pending)
      fs.rmSync(directory, { recursive: true, force: true });
  }
}
