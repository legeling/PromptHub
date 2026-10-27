import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_BACKUP_RETENTION } from "../services/desktop-backup-store.js";
const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("../runtime-paths.js", () => ({ getBackupsDir: () => fixture.root }));
import { workspaceBackups, listWorkspaceBackups } from "./workspace-backups.js";
afterEach(() => {
  if (fixture.root) fs.rmSync(fixture.root, { recursive: true, force: true });
});
it("publishes verified opaque chunks with tenant isolation, conflicts and retained history", async () => {
  fixture.root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-workspace-api-"),
  );
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => {
    c.set("userId", c.req.header("x-fixture-user") ?? "alice");
    await next();
  });
  app.route("/", workspaceBackups);
  const chunk = "opaque snapshot bytes";
  const hash = createHash("sha256").update(chunk).digest("hex");
  const objectId = `${randomUUID()}-0-${hash}`;
  const manifest = {
    kind: "prompthub-workspace-backup",
    version: 1,
    updatedAt: new Date().toISOString(),
    sizeBytes: 1,
    encrypted: false,
    counts: { prompts: 1 },
    chunks: [{ objectId, hash, sizeBytes: 1 }],
  };
  const put = (
    name: string,
    text: string,
    condition: Record<string, string> = {},
  ) =>
    app.request("/" + name, { method: "PUT", headers: condition, body: text });
  expect((await put("manifest.json", JSON.stringify(manifest))).status).toBe(
    400,
  );
  expect(
    (
      await put(`data.json.workspace-${objectId}`, chunk, {
        "if-none-match": "*",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await put("manifest.json", JSON.stringify(manifest), {
        "if-none-match": "*",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/manifest.json", {
        headers: { "x-fixture-user": "bob" },
      })
    ).status,
  ).toBe(404);
  const read = await app.request("/manifest.json");
  expect(JSON.parse(await read.text())).toEqual(manifest);
  expect(
    (
      await put("manifest.json", JSON.stringify(manifest), {
        "if-match": "wrong",
      })
    ).status,
  ).toBe(412);
  for (
    let generation = 0;
    generation < DEFAULT_DESKTOP_BACKUP_RETENTION + 1;
    generation++
  ) {
    const head = await app.request("/manifest.json");
    manifest.updatedAt = new Date(
      Date.UTC(2026, 0, generation + 1),
    ).toISOString();
    expect(
      (
        await put("manifest.json", JSON.stringify(manifest), {
          "if-match": head.headers.get("etag")!,
        })
      ).status,
    ).toBe(200);
  }
  expect(listWorkspaceBackups("alice")).toHaveLength(
    DEFAULT_DESKTOP_BACKUP_RETENTION,
  );
  expect(listWorkspaceBackups("alice")[0].summary.prompts).toBe(1);
  expect((await app.request("/invalid..object")).status).toBe(400);
  expect(
    (
      await app.request(`/${encodeURIComponent("../escape")}`, {
        method: "PUT",
        body: "no",
      })
    ).status,
  ).not.toBe(200);
});
