import { expect, it } from "vitest";
import {
  data,
  object,
  register,
  request,
  restartWorker,
  string,
  useRuntime,
} from "./release-acceptance-cross-surface-runtime";

useRuntime();
it("manages tenant MCP definitions with optimistic concurrency across Worker restart", async () => {
  const owner = await register("resource-owner");
  const other = await register("resource-other");
  const endpoint = "/api/resource-libraries/mcp";
  const initial = object(await data(endpoint, owner.token));
  const create = {
    revision: initial.revision,
    mutation: {
      action: "create",
      value: { name: "writer", command: "not-executed" },
    },
  };
  const saved = object(await data(endpoint, owner.token, "POST", create));
  expect(object(saved.library).servers).toMatchObject([
    { name: "writer", command: "not-executed" },
  ]);
  expect((await request(endpoint, owner.token, "POST", create)).status).toBe(
    409,
  );
  expect(
    object(object(await data(endpoint, other.token)).library).servers,
  ).toEqual([]);
  await restartWorker();
  expect(await data(endpoint, owner.token)).toEqual(saved);
  const servers = object(saved.library).servers;
  if (!Array.isArray(servers)) throw new Error("Expected MCP inventory");
  const id = string(object(servers[0]).id);
  expect(
    (
      await request(endpoint, other.token, "POST", {
        revision: object(await data(endpoint, other.token)).revision,
        mutation: { action: "delete", id },
      })
    ).status,
  ).toBe(404);
  const edited = object(
    await data(endpoint, owner.token, "POST", {
      revision: saved.revision,
      mutation: {
        action: "update",
        id,
        value: { notes: "Saved note", isFavorite: true },
      },
    }),
  );
  expect(object(edited.library).servers).toMatchObject([
    { id, notes: "Saved note", isFavorite: true },
  ]);
  expect(object(await data("/api/sync/data", owner.token)).mcpLibrary).toEqual(
    edited.library,
  );
  await data(endpoint, owner.token, "POST", {
    revision: edited.revision,
    mutation: { action: "delete", id },
  });
  expect(
    object(object(await data(endpoint, owner.token)).library).servers,
  ).toEqual([]);
}, 60_000);

it("stores complete Plugin backups and versions in tenant D1 without distribution", async () => {
  const owner = await register("plugin-package-owner");
  const other = await register("plugin-package-other");
  const endpoint = "/api/resource-libraries/plugins";
  async function mutate(mutation: unknown) {
    const before = object(await data(endpoint, owner.token));
    return object(
      await data(endpoint, owner.token, "POST", {
        revision: before.revision,
        mutation,
      }),
    );
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
  const saved = object(await data(endpoint + query, owner.token));
  expect(object(saved.resource).files).toEqual(value.files);
  expect(object(saved.resource).versions).toHaveLength(2);
  expect(object(object(saved.resource).plugin).userNotes).toBeUndefined();
  expect((await request(endpoint + query, other.token)).status).toBe(404);
  await restartWorker();
  expect(await data(endpoint + query, owner.token)).toEqual(saved);
  const backup = object(await data(endpoint + "?export=1", owner.token)).files;
  await mutate({ action: "delete", id: plugin.id });
  await mutate({ action: "import-files", value: backup });
  expect(object(await data(endpoint + query, owner.token)).resource).toEqual(
    saved.resource,
  );
  const beforeInvalid = object(await data(endpoint, owner.token));
  expect(
    (
      await request(endpoint, owner.token, "POST", {
        revision: beforeInvalid.revision,
        mutation: {
          action: "import-files",
          value: [{ relativePath: "../bad", contentBase64: "AA==", size: 1 }],
        },
      })
    ).status,
  ).toBe(422);
  expect(await data(endpoint, owner.token)).toEqual(beforeInvalid);
}, 60_000);
