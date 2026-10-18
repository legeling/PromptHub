import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { closeDatabase } from "@prompthub/db";
import {
  authHeaders,
  createTestApp,
  registerUser,
  setupSyncRouteTestLifecycle,
} from "./sync.test-helpers";

setupSyncRouteTestLifecycle();
it("persists MCP management through authenticated HTTP, rejects stale writes and preserves data on failure", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-resource-library-"));
  try {
    let app = await createTestApp(root);
    const owner = await registerUser(app, "resource-owner", "debugpass001");
    const other = await registerUser(app, "resource-other", "debugpass001");
    const headers = authHeaders(owner.payload.data.accessToken);
    const endpoint = "/api/resource-libraries/mcp";
    const before = (await (await app.request(endpoint, { headers })).json())
      .data;
    const create = {
      revision: before.revision,
      mutation: {
        action: "create",
        value: {
          name: "writer",
          command: "not-executed",
          envRefs: { TOKEN: "${TOKEN}" },
        },
      },
    };
    const response = await app.request(endpoint, {
      headers,
      method: "POST",
      body: JSON.stringify(create),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const saved = (await response.json()).data;
    expect(saved.library.servers[0]).toMatchObject({
      name: "writer",
      command: "not-executed",
    });
    expect(
      (
        await app.request(endpoint, {
          headers,
          method: "POST",
          body: JSON.stringify(create),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await (
          await app.request(endpoint, {
            headers: authHeaders(other.payload.data.accessToken),
          })
        ).json()
      ).data.library.servers,
    ).toEqual([]);
    closeDatabase();
    vi.resetModules();
    app = await createTestApp(root);
    expect(
      (await (await app.request(endpoint, { headers })).json()).data,
    ).toEqual(saved);
    const failed = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("Injected publication failure");
    });
    const update = {
      revision: saved.revision,
      mutation: {
        action: "update",
        id: saved.library.servers[0].id,
        value: { notes: "should not persist" },
      },
    };
    expect(
      (
        await app.request(endpoint, {
          headers,
          method: "POST",
          body: JSON.stringify(update),
        })
      ).status,
    ).toBe(500);
    failed.mockRestore();
    expect(
      (await (await app.request(endpoint, { headers })).json()).data,
    ).toEqual(saved);
    const removed = await app.request(endpoint, {
      headers,
      method: "POST",
      body: JSON.stringify({
        revision: saved.revision,
        mutation: { action: "delete", id: saved.library.servers[0].id },
      }),
    });
    expect(removed.status).toBe(200);
    expect((await removed.json()).data.library.servers).toEqual([]);
    expect(
      fs
        .readdirSync(path.join(root, "data", "agent-assets"))
        .some((name) => name.includes(".tmp-")),
    ).toBe(false);
  } finally {
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
