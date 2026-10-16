import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  PromptDB,
  FolderDB,
  PromptRelationDB,
  SCHEMA,
  SkillDB,
} from "@prompthub/db";
import type { RemoteTextStorage } from "@prompthub/shared/types/remote-sync";
import { CausalSyncSession } from "../src/causal-sync/session";
import { runCausalSync } from "../src/causal-sync/workflow";

import { PromptCausalSyncWorkspace } from "../src/causal-sync/prompt-workspace";
import { resolveRuntimeStorageContext } from "../src/runtime-storage-context";
import { composeCausalSyncWorkspace } from "../src/causal-sync/workspace";
import { SkillCausalSyncWorkspace } from "../src/causal-sync/skill-workspace";

const roots: string[] = [];
const databases: DatabaseAdapter[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function remote() {
  const values = new Map<string, { data: string; etag: string }>();
  let revision = 0;
  let offline = false;
  let loseHead = false;
  const writes: string[] = [];
  const store: RemoteTextStorage = {
    async downloadText(key) {
      if (offline) return { success: false, error: "offline" };
      const value = values.get(key);
      return value
        ? { success: true, ...value }
        : { success: false, notFound: true };
    },
    async uploadText(key, data, condition) {
      writes.push(key);
      const current = values.get(key);
      if (
        condition &&
        (("ifNoneMatch" in condition && current) ||
          ("ifMatch" in condition && current?.etag !== condition.ifMatch))
      )
        return { success: false, conflict: true };
      const etag = `"${++revision}"`;
      values.set(key, { data, etag });
      if (key === "sync/head" && loseHead) {
        offline = true;
        return { success: false, error: "lost acknowledgement" };
      }
      return { success: true, etag };
    },
    async deleteText(key) {
      values.delete(key);
      return { success: true };
    },
  };
  return {
    store,
    values,
    writes,
    disconnect() {
      offline = true;
    },
    loseHead() {
      loseHead = true;
    },
    reconnect() {
      offline = false;
      loseHead = false;
    },
  };
}

// Real application Prompt rows and histories; only remote transport is replaced.
function device() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-workflow-"));
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "database.sqlite"));
  databases.push(database);
  database.exec(SCHEMA);
  const prompts = new PromptDB(database);
  const workspace = new PromptCausalSyncWorkspace(database, root);
  const options = {
    database,
    rootPath: root,
    targetId: "destination",
    headPath: "sync/head",
    workspace,
  };
  return {
    root,
    database,
    prompts,
    options,
    run: (store: RemoteTextStorage) => runCausalSync({ ...options, store }),
  };
}

it("joins two devices, merges independent edits and propagates deletions without resurrection", async () => {
  const a = device();
  const b = device();
  const server = remote();
  const first = a.prompts.create({ title: "First", userPrompt: "中文 🦌" });
  const second = a.prompts.create({ title: "Second", userPrompt: "original" });
  expect(await a.run(server.store)).toMatchObject({ status: "committed" });
  expect(await b.run(server.store)).toMatchObject({
    status: "committed",
    localChanged: true,
  });
  expect(b.prompts.getById(first.id)?.userPrompt).toBe("中文 🦌");
  a.prompts.update(first.id, { userPrompt: "A edit" });
  b.prompts.update(second.id, { userPrompt: "B edit" });
  await a.run(server.store);
  expect(await b.run(server.store)).toMatchObject({ status: "committed" });
  await a.run(server.store);
  expect(a.prompts.getById(second.id)?.userPrompt).toBe("B edit");
  expect(b.prompts.getById(first.id)?.userPrompt).toBe("A edit");
  a.prompts.delete(first.id);
  await a.run(server.store);
  await b.run(server.store);
  expect(b.prompts.getById(first.id)).toBeNull();
  expect(await b.run(server.store)).toMatchObject({
    status: "committed",
    localChanged: false,
  });
  const head = JSON.parse(server.values.get("sync/head")!.data);
  expect(
    head.resources.find(
      (entry: { resourceId: string }) => entry.resourceId === first.id,
    ).state,
  ).toBe("deleted");
});

it("does not create a sync baseline on a destination that ignores conditional writes", async () => {
  const a = device();
  const server = remote();
  const unsafe: RemoteTextStorage = {
    ...server.store,
    uploadText: (key, text) => server.store.uploadText(key, text),
  };
  a.prompts.create({ title: "preserved", userPrompt: "local" });
  expect(await a.run(unsafe)).toMatchObject({ status: "unsupported" });
  expect(new CausalSyncSession(a.database, "destination").state()).toBeNull();
  expect(server.values.has("sync/head")).toBe(false);
  expect(a.prompts.getAll()).toHaveLength(1);
});

it("keeps both edits and the previous baseline when the same resource conflicts", async () => {
  const a = device();
  const b = device();
  const server = remote();
  const prompt = a.prompts.create({ title: "Conflict", userPrompt: "base" });
  await a.run(server.store);
  await b.run(server.store);
  const before = new CausalSyncSession(b.database, "destination").state()?.base;
  a.prompts.update(prompt.id, { userPrompt: "remote" });
  b.prompts.update(prompt.id, { userPrompt: "local" });
  await a.run(server.store);
  const head = server.values.get("sync/head");
  expect(await b.run(server.store)).toMatchObject({ status: "conflict" });
  expect(b.prompts.getById(prompt.id)?.userPrompt).toBe("local");
  expect(server.values.get("sync/head")).toEqual(head);
  expect(
    new CausalSyncSession(b.database, "destination").state()?.base,
  ).toEqual(before);
});

it("resumes an uncertain HEAD using pinned payloads after local edits", async () => {
  const a = device();
  const server = remote();
  const prompt = a.prompts.create({ title: "Retry", userPrompt: "published" });
  server.loseHead();
  expect(await a.run(server.store)).toMatchObject({ status: "uncertain" });
  const pending = new CausalSyncSession(a.database, "destination").state()
    ?.pending;
  a.prompts.update(prompt.id, { userPrompt: "new local edit" });
  server.reconnect();
  expect(await a.run(server.store)).toMatchObject({ status: "local-changed" });
  expect(a.prompts.getById(prompt.id)?.userPrompt).toBe("new local edit");
  expect(server.writes.filter((key) => key === "sync/head")).toHaveLength(1);
  expect(JSON.parse(server.values.get("sync/head")!.data).commitId).toBe(
    pending?.operationId,
  );
});

it("rejects corrupt remote payloads before changing local data or advancing the baseline", async () => {
  const a = device();
  const b = device();
  const server = remote();
  a.prompts.create({ title: "Integrity", userPrompt: "untouched" });
  await a.run(server.store);
  const objectKey = [...server.values.keys()].find((key) =>
    key.startsWith("sync/head.objects/"),
  )!;
  server.values.set(objectKey, { data: "corrupt", etag: '"corrupt"' });
  await expect(b.run(server.store)).rejects.toThrow(/hash/i);
  expect(b.prompts.getAll()).toEqual([]);
  expect(
    new CausalSyncSession(b.database, "destination").state()?.base,
  ).toBeNull();
});

it("preserves nested folders, Prompt versions, graph links and binary media across a destination reopen", async () => {
  const a = device();
  const b = device();
  const server = remote();
  const folders = new FolderDB(a.database);
  const parent = folders.create({ name: "Parent" });
  const child = folders.create({ name: "Child", parentId: parent.id });
  const imageRoot = resolveRuntimeStorageContext(a.root).imagesPath;
  fs.mkdirSync(imageRoot, { recursive: true });
  const bytes = Buffer.from([0, 128, 255, 42]);
  fs.writeFileSync(path.join(imageRoot, "binary.png"), bytes);
  const first = a.prompts.create({
    title: "With image",
    userPrompt: "v1",
    folderId: child.id,
    images: ["binary.png"],
  });
  a.prompts.update(first.id, { userPrompt: "v2 — 中文" });
  const next = a.prompts.create({ title: "Related", userPrompt: "other" });
  const relation = new PromptRelationDB(a.database).create({
    sourcePromptId: first.id,
    targetPromptId: next.id,
    kind: "related_to",
  });
  await a.run(server.store);
  await b.run(server.store);
  b.database.close();
  databases.splice(databases.indexOf(b.database), 1);
  const reopened = new DatabaseAdapter(path.join(b.root, "database.sqlite"));
  databases.push(reopened);
  const prompts = new PromptDB(reopened);
  expect(prompts.getById(first.id)).toMatchObject({
    userPrompt: "v2 — 中文",
    folderId: child.id,
  });
  expect(prompts.getVersions(first.id)).toEqual(
    a.prompts.getVersions(first.id),
  );
  expect(new FolderDB(reopened).getById(child.id)?.parentId).toBe(parent.id);
  expect(new PromptRelationDB(reopened).list()).toEqual([relation]);
  expect(
    fs.readFileSync(
      path.join(resolveRuntimeStorageContext(b.root).imagesPath, "binary.png"),
    ),
  ).toEqual(bytes);
  expect(
    await runCausalSync({
      ...b.options,
      database: reopened,
      workspace: new PromptCausalSyncWorkspace(reopened, b.root),
      store: server.store,
    }),
  ).toMatchObject({ status: "committed", localChanged: false });
});

it("rolls back domain writes and retains the pending operation when local application fails", async () => {
  const a = device();
  const b = device();
  const server = remote();
  const prompt = a.prompts.create({
    title: "Rollback",
    userPrompt: "preserve",
  });
  await a.run(server.store);
  const workspace = b.options.workspace;
  await expect(
    runCausalSync({
      ...b.options,
      store: server.store,
      workspace: {
        capture: () => workspace.capture(),
        prepareApplication(resources) {
          const planned = workspace.prepareApplication(resources);
          return {
            entries: planned.entries,
            apply() {
              planned.apply();
              throw new Error("injected SQL failure");
            },
          };
        },
      },
    }),
  ).rejects.toThrow("injected SQL failure");
  expect(b.prompts.getAll()).toEqual([]);
  const pending = new CausalSyncSession(b.database, "destination").state();
  expect(pending?.base).toBeNull();
  expect(pending?.pending?.phase).toBe("remote-confirmed");
  server.disconnect();
  expect(await b.run(server.store)).toMatchObject({ status: "committed" });
  expect(b.prompts.getById(prompt.id)?.userPrompt).toBe("preserve");
});

it("commits Prompt and Skill domains together and rolls both back on a later domain failure", async () => {
  const a = device(),
    b = device(),
    server = remote();
  const prompt = a.prompts.create({
    title: "Both domains",
    userPrompt: "source",
  });
  new SkillDB(a.database).create({
    name: "metadata-only",
    protocol_type: "mcp",
    is_favorite: false,
  });
  const combined = (d: ReturnType<typeof device>) =>
    composeCausalSyncWorkspace([
      {
        resourceTypes: [
          "prompt",
          "folder",
          "prompt-relation",
          "prompt-output-format",
          "image",
          "video",
        ],
        workspace: d.options.workspace,
      },
      {
        resourceTypes: ["skill"],
        workspace: new SkillCausalSyncWorkspace(d.database, d.root),
      },
    ]);
  await runCausalSync({
    ...a.options,
    store: server.store,
    workspace: combined(a),
  });
  b.database.exec(
    "CREATE TRIGGER reject_sync_skill BEFORE INSERT ON skills BEGIN SELECT RAISE(ABORT, 'injected Skill failure'); END",
  );
  await expect(
    runCausalSync({
      ...b.options,
      store: server.store,
      workspace: combined(b),
    }),
  ).rejects.toThrow("injected Skill failure");
  expect(b.prompts.getAll()).toEqual([]);
  expect(new SkillDB(b.database).getAll()).toEqual([]);
  expect(
    new CausalSyncSession(b.database, "destination").state()?.base,
  ).toBeNull();
  b.database.exec("DROP TRIGGER reject_sync_skill");
  expect(
    await runCausalSync({
      ...b.options,
      store: server.store,
      workspace: combined(b),
    }),
  ).toMatchObject({ status: "committed" });
  expect(b.prompts.getById(prompt.id)?.userPrompt).toBe("source");
  expect(combined(b).capture()).toEqual(combined(a).capture());
  expect(() =>
    combined(b).prepareApplication([
      {
        resourceType: "unknown",
        resourceId: "bad",
        references: [],
        contentHash: "0".repeat(64),
        text: "{}",
      },
    ]),
  ).toThrow(/owner/);
});

it("resolves only selected conflicts, retains independent edits and preserves both pre-resolution inventories", async () => {
  const a = device(),
    b = device(),
    server = remote();
  const first = a.prompts.create({ title: "Conflict", userPrompt: "base" });
  const other = a.prompts.create({ title: "Independent", userPrompt: "base" });
  await a.run(server.store);
  await b.run(server.store);
  a.prompts.update(first.id, { userPrompt: "remote conflicting text" });
  a.prompts.update(other.id, { userPrompt: "remote independent text" });
  b.prompts.update(first.id, { userPrompt: "local conflicting text" });
  await a.run(server.store);
  const conflict = await b.run(server.store);
  if (conflict.status !== "conflict" || !("token" in conflict))
    throw new Error("Missing review token");
  const result = await runCausalSync({
    ...b.options,
    store: server.store,
    resolution: {
      token: conflict.token,
      kind: "conflicts",
      choices: [
        { resourceType: "prompt", resourceId: first.id, choice: "local" },
      ],
    },
  });
  expect(result.status).toBe("committed");
  expect(b.prompts.getById(first.id)?.userPrompt).toBe(
    "local conflicting text",
  );
  expect(b.prompts.getById(other.id)?.userPrompt).toBe(
    "remote independent text",
  );
  await a.run(server.store);
  expect(a.prompts.getById(first.id)?.userPrompt).toBe(
    "local conflicting text",
  );
  const recovery = path.join(b.root, "recovery", "causal-sync", conflict.token);
  const saved = fs
    .readdirSync(path.join(recovery, "objects"))
    .map((name) =>
      fs.readFileSync(path.join(recovery, "objects", name), "utf8"),
    )
    .join("\n");
  expect(saved).toContain("local conflicting text");
  expect(saved).toContain("remote conflicting text");
  expect(
    [...server.values.keys()].some((key) =>
      key.startsWith("sync/head.generations/"),
    ),
  ).toBe(true);
});

it("requires a current review token for baseline replacement and retains the overwritten local profile", async () => {
  const a = device(),
    b = device(),
    server = remote();
  const remotePrompt = a.prompts.create({
    title: "Remote",
    userPrompt: "remote baseline",
  });
  const local = b.prompts.create({
    title: "Local",
    userPrompt: "local baseline",
  });
  await a.run(server.store);
  const review = await b.run(server.store);
  if (review.status !== "baseline-required")
    throw new Error("Missing baseline review");
  b.prompts.update(local.id, { userPrompt: "edited after review" });
  const head = server.values.get("sync/head");
  expect(
    await runCausalSync({
      ...b.options,
      store: server.store,
      resolution: { token: review.token, kind: "baseline", choice: "remote" },
    }),
  ).toMatchObject({ status: "review-changed" });
  expect(server.values.get("sync/head")).toEqual(head);
  const current = await b.run(server.store);
  if (current.status !== "baseline-required")
    throw new Error("Missing refreshed review");
  expect(
    await runCausalSync({
      ...b.options,
      store: server.store,
      resolution: { token: current.token, kind: "baseline", choice: "remote" },
    }),
  ).toMatchObject({ status: "committed" });
  expect(b.prompts.getById(local.id)).toBeNull();
  expect(b.prompts.getById(remotePrompt.id)?.userPrompt).toBe(
    "remote baseline",
  );
  expect(
    fs.existsSync(
      path.join(
        b.root,
        "recovery",
        "causal-sync",
        current.token,
        "manifest.json",
      ),
    ),
  ).toBe(true);
});

it("leaves actual media files and the remote HEAD untouched when inventories already match", async () => {
  const a = device(),
    server = remote();
  const context = resolveRuntimeStorageContext(a.root);
  fs.mkdirSync(context.imagesPath, { recursive: true });
  const media = path.join(context.imagesPath, "stable.bin");
  fs.writeFileSync(media, Buffer.from([0, 255, 128]));
  a.prompts.create({
    title: "Unchanged",
    userPrompt: "same",
    images: ["stable.bin"],
  });
  await a.run(server.store);
  const before = fs.statSync(media, { bigint: true }),
    head = server.values.get("sync/head");
  const headWrites = server.writes.filter((key) => key === "sync/head").length;
  expect(await a.run(server.store)).toMatchObject({
    status: "committed",
    localChanged: false,
  });
  const after = fs.statSync(media, { bigint: true });
  expect({ inode: after.ino, mtime: after.mtimeNs }).toEqual({
    inode: before.ino,
    mtime: before.mtimeNs,
  });
  expect(server.values.get("sync/head")).toEqual(head);
  expect(server.writes.filter((key) => key === "sync/head").length).toBe(
    headWrites,
  );
});
