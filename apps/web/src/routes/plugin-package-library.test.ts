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
it("preserves Plugin packages and safety versions through authenticated HTTP and reopen", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-plugin-package-"));
  try {
    let app = await createTestApp(root);
    const owner = await registerUser(app, "package-owner", "debugpass001");
    const other = await registerUser(app, "package-other", "debugpass001");
    const headers = authHeaders(owner.payload.data.accessToken);
    const endpoint = "/api/resource-libraries/plugins";
    async function read(query = "") {
      const response = await app.request(endpoint + query, { headers });
      expect(response.status).toBe(200);
      return (await response.json()).data;
    }
    async function mutate(mutation: unknown) {
      const before = await read();
      const response = await app.request(endpoint, {
        headers,
        method: "POST",
        body: JSON.stringify({ revision: before.revision, mutation }),
      });
      expect(response.status, await response.clone().text()).toBe(200);
      return (await response.json()).data;
    }
    const plugin = {
      id: "example:bundle",
      name: "example",
      displayName: "Example",
      source: { kind: "local" },
      trustLevel: "custom",
      classification: "bundle",
      inventory: {
        skills: 0,
        mcpServers: 0,
        apps: 0,
        commands: 0,
        hooks: 0,
        agents: 0,
        assets: 1,
        docs: 0,
        lspServers: 0,
        scripts: 0,
      },
      installedAt: 1,
      updatedAt: 1,
    };
    const value = {
      plugin,
      versions: [],
      files: [{ relativePath: "asset.bin", contentBase64: "AP8D", size: 3 }],
    };
    await mutate({ action: "import-package", value });
    await mutate({ action: "create-version", id: plugin.id });
    await mutate({
      action: "update",
      id: plugin.id,
      value: { userNotes: "changed" },
    });
    await mutate({ action: "rollback", id: plugin.id, version: 1 });
    const query = "?plugin=" + encodeURIComponent(plugin.id);
    const saved = await read(query);
    expect(saved.resource.files).toEqual(value.files);
    expect(saved.resource.versions).toHaveLength(2);
    expect(saved.resource.versions[1].plugin.userNotes).toBe("changed");
    expect(saved.resource.plugin.userNotes).toBeUndefined();
    expect(
      (
        await app.request(endpoint + query, {
          headers: authHeaders(other.payload.data.accessToken),
        })
      ).status,
    ).toBe(404);
    closeDatabase();
    vi.resetModules();
    app = await createTestApp(root);
    expect(await read(query)).toEqual(saved);
    const backup = (await read("?export=1")).files;
    await mutate({ action: "delete", id: plugin.id });
    expect((await read()).library.plugins).toEqual([]);
    await mutate({ action: "import-files", value: backup });
    expect((await read(query)).resource).toEqual(saved.resource);
    const beforeInvalid = await read();
    const invalid = await app.request(endpoint, {
      headers,
      method: "POST",
      body: JSON.stringify({
        revision: beforeInvalid.revision,
        mutation: {
          action: "import-files",
          value: [{ relativePath: "../bad", contentBase64: "AA==", size: 1 }],
        },
      }),
    });
    expect(invalid.status).toBe(422);
    expect(await read()).toEqual(beforeInvalid);
  } finally {
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
