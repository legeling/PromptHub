import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it } from "vitest";
import { invoke, isolateAgents, object, string } from "./release-acceptance-cross-surface-runtime";

const WORKFLOW_TIMEOUT_MS = 30_000;
let root = "";
let profile = "";
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cross-cli-cleanup-")));
  profile = path.join(root, "profile");
  isolateAgents(profile, root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it("uses the real local HTTP status-to-manifest contract without opening or scanning a workspace", async () => {
  const requests: Array<{ url: string | undefined; authorization: string | undefined }> = [];
  const expected = { version: "web-cloudflare-backup-v1", counts: { prompts: 2, folders: 1 }, actor: { userId: "synthetic-user" } };
  const server = http.createServer((request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization });
    response.setHeader("Content-Type", "application/json");
    response.statusCode = request.url === "/api/sync/status" ? 404 : 200;
    response.end(JSON.stringify(response.statusCode === 200 ? { data: expected } : { error: { message: "Not found" } }));
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture socket address");
    const empty = path.join(root, "unopened-profile");
    const result = await invoke(empty, ["sync", "status", "--endpoint", `http://127.0.0.1:${address.port}/`, "--token", "synthetic-token"]);
    expect(result).toEqual(expected);
    expect(requests).toEqual([
      { url: "/api/sync/status", authorization: "Bearer synthetic-token" },
      { url: "/api/sync/manifest", authorization: "Bearer synthetic-token" },
    ]);
    expect(fs.existsSync(path.join(empty, "data", "prompthub.db"))).toBe(false);
    console.info("Acceptance CLI status port:", address.port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}, WORKFLOW_TIMEOUT_MS);

it("rejects mutually exclusive prompt text and file inputs before changing persisted content", async () => {
  const created = object(await invoke(profile, ["prompt", "create", "--title", "Preserve", "--user-prompt", "Original $&"]));
  const id = string(created.id);
  const textFile = path.join(root, "content.md");
  fs.writeFileSync(textFile, "Must not replace");
  const before = await invoke(profile, ["--full", "prompt", "get", id]);
  const versions = await invoke(profile, ["prompt", "versions", id]);
  const failed = await invoke(profile, ["prompt", "update", id, "--user-prompt", "Inline", "--user-prompt-file", textFile], 2);
  expect(failed).toMatchObject({ error: { code: "USAGE_ERROR" } });
  expect(await invoke(profile, ["--full", "prompt", "get", id])).toEqual(before);
  expect(await invoke(profile, ["prompt", "versions", id])).toEqual(versions);
}, WORKFLOW_TIMEOUT_MS);
