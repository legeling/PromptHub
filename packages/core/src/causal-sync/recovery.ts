import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { CausalSyncGeneration } from "@prompthub/shared/types/causal-sync";
import type { RemoteTextStorage } from "@prompthub/shared/types/remote-sync";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import { generationText, liveInventory } from "./session-state";
import type { CausalSyncPayload } from "./workflow";
import { flushDirectory } from "../canonical-entry-publication";

function hash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function preserveRemoteGeneration(
  store: RemoteTextStorage,
  headPath: string,
  generation: CausalSyncGeneration,
): Promise<void> {
  const text = generationText(generation),
    key = `${headPath}.generations/${hash(text)}`;
  const prior = await store.downloadText(key);
  if (prior.success && prior.data === text) return;
  if (!prior.notFound)
    throw new Error("Sync generation archive cannot be verified");
  await store.uploadText(key, text, { ifNoneMatch: "*" });
  const check = await store.downloadText(key);
  if (!check.success || check.data !== text)
    throw new Error("Sync generation archive publication is unconfirmed");
}

function durableText(file: string, text: string): void {
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function verifyRetainedRecovery(
  target: string,
  manifest: string,
  hashes: string[],
): void {
  const read = (file: string): string => {
    assertStoragePathComponentsSafe(target, file);
    const descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      if (!fs.fstatSync(descriptor).isFile())
        throw new Error("Unsafe sync recovery file");
      return fs.readFileSync(descriptor, "utf8");
    } finally {
      fs.closeSync(descriptor);
    }
  };
  if (read(path.join(target, "manifest.json")) !== manifest)
    throw new Error("Sync recovery manifest cannot be verified");
  for (const digest of hashes)
    if (hash(read(path.join(target, "objects", digest))) !== digest)
      throw new Error("Sync recovery payload cannot be verified");
}

/** Review replacement preserves both complete portable inventories before any overwrite. */
export async function preserveSyncResolution(input: {
  rootPath: string;
  token: string;
  local: CausalSyncPayload[];
  remote: CausalSyncGeneration | null;
  store: RemoteTextStorage;
  headPath: string;
}): Promise<void> {
  if (!/^[a-f0-9]{64}$/u.test(input.token))
    throw new Error("Invalid sync recovery identity");
  const target = path.join(
    input.rootPath,
    "recovery",
    "causal-sync",
    input.token,
  );
  assertStoragePathComponentsSafe(input.rootPath, target);
  const remoteEntries = input.remote ? liveInventory(input.remote) : [];
  const manifest = JSON.stringify({
    kind: "prompthub-sync-recovery",
    schemaVersion: 1,
    token: input.token,
    local: input.local.map(({ text: _text, ...entry }) => entry),
    remote: input.remote,
  });
  if (fs.existsSync(path.join(target, "manifest.json"))) {
    verifyRetainedRecovery(target, manifest, [
      ...new Set(
        [...input.local, ...remoteEntries].map((entry) => entry.contentHash),
      ),
    ]);
    return;
  }
  const stage = `${target}.${crypto.randomUUID()}.stage`;
  try {
    fs.mkdirSync(path.join(stage, "objects"), { recursive: true, mode: 0o700 });
    const objects = new Map(
      input.local.map((entry) => [entry.contentHash, entry.text]),
    );
    for (const entry of remoteEntries) {
      if (objects.has(entry.contentHash)) continue;
      const result = await input.store.downloadText(
        `${input.headPath}.objects/${entry.contentHash}`,
      );
      if (
        !result.success ||
        typeof result.data !== "string" ||
        hash(result.data) !== entry.contentHash
      )
        throw new Error("Sync recovery payload cannot be verified");
      objects.set(entry.contentHash, result.data);
    }
    for (const [digest, text] of objects)
      durableText(path.join(stage, "objects", digest), text);
    flushDirectory(path.join(stage, "objects"));
    durableText(path.join(stage, "manifest.json"), manifest);
    flushDirectory(stage);
    fs.renameSync(stage, target);
    flushDirectory(path.dirname(target));
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
