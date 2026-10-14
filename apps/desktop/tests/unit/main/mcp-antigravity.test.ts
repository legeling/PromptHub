import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";
let mcpStorage: ReturnType<typeof createMcpTestStorage>;
/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "@prompthub/db";
import {
  CoreMcpLibraryService,
  getDatabasePath,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";
import {
  getMcpTargetEntryObject,
  redactMcpConfigContent,
  redactMcpLibraryForTransport,
  mergeMcpLibraryFromTransport,
  redactMcpServerConfig,
} from "@prompthub/shared/utils/mcp-config";

describe("Antigravity MCP import and projection", () => {
  let root: string;
  const nativeEntry = {
    serverUrl: "https://example.test/mcp",
    authProviderType: "google_credentials",
    oauth: { clientId: "test-client", clientSecret: "synthetic-secret" },
    disabledTools: ["delete_record"],
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-antigravity-"));
    configureRuntimePaths({ userDataPath: root });
    mcpStorage = createMcpTestStorage();
  });
  afterEach(() => {
    mcpStorage.dispose();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["file", "paste"])(
    "imports remote native config through %s, edits, reopens, applies and removes",
    async (input) => {
      const service = new CoreMcpLibraryService(mcpStorage.options);
      const content = JSON.stringify({ mcpServers: { remote: nativeEntry } });
      const source = path.join(root, "source.json");
      fs.writeFileSync(source, content);
      const result =
        input === "file"
          ? service.importFromFile(source)
          : await service.createFromSource({ kind: "config", input: content });
      expect(result.imported).toHaveLength(1);
      const server = result.imported[0];
      expect(getMcpTargetEntryObject("antigravity", server)).toEqual(
        nativeEntry,
      );
      service.updateServer(server.id, {
        ...redactMcpServerConfig(server),
        displayName: "Edited remote",
      });
      const reopened = new CoreMcpLibraryService(mcpStorage.options);
      expect(reopened.read().servers[0].oauth?.clientSecret).toBe(
        "synthetic-secret",
      );
      const target = path.join(root, "target.json");
      fs.writeFileSync(
        target,
        JSON.stringify({
          keep: true,
          mcpServers: { unrelated: { command: "node" } },
        }),
      );
      const applied = reopened.apply({
        target: "antigravity",
        scope: "custom",
        path: target,
        serverIds: [server.id],
      });
      expect(applied.content).not.toContain("synthetic-secret");
      expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({
        keep: true,
        mcpServers: { remote: nativeEntry, unrelated: { command: "node" } },
      });
      reopened.removeFromTarget({
        target: "antigravity",
        scope: "custom",
        path: target,
        serverIds: [server.id],
      });
      expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({
        keep: true,
        mcpServers: { unrelated: { command: "node" } },
      });
    },
  );

  it("redacts OAuth config previews and preserves local credentials across transport", async () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    await service.createFromSource({
      kind: "config",
      input: JSON.stringify({ mcpServers: { remote: nativeEntry } }),
    });
    const library = service.read();
    const redacted = redactMcpLibraryForTransport(library);
    expect(JSON.stringify(redacted)).not.toContain("synthetic-secret");
    expect(
      mergeMcpLibraryFromTransport(library, redacted).servers[0].oauth,
    ).toEqual(nativeEntry.oauth);
    expect(
      redactMcpConfigContent(
        "antigravity",
        JSON.stringify({ mcpServers: { remote: nativeEntry } }),
      ),
    ).not.toContain("synthetic-secret");
  });

  it("preserves native options and credentials across an actual SQLite close and reopen", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const imported = service.createFromSource({
      kind: "config",
      input: JSON.stringify({ mcpServers: { "Docs.API": nativeEntry } }),
    });
    expect(imported.imported).toHaveLength(1);
    const server = imported.imported[0];
    service.updateServer(server.id, {
      ...redactMcpServerConfig(server),
      enabled: false,
    });
    closeDatabase();
    const database = initDatabase(getDatabasePath());
    const reopened = new CoreMcpLibraryService({
      ...mcpStorage.options,
      database,
    });
    const persisted = reopened.read().servers;
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe(server.id);
    expect(persisted[0].name).toBe("Docs.API");
    expect(getMcpTargetEntryObject("antigravity", persisted[0])).toEqual({
      ...nativeEntry,
      disabled: true,
    });
    expect(
      JSON.stringify(redactMcpLibraryForTransport(reopened.read())),
    ).not.toContain("synthetic-secret");
  });

  it.each(["file", "paste"])(
    "preserves distinct native entry keys through %s import and duplicate detection",
    (input) => {
      const service = new CoreMcpLibraryService(mcpStorage.options);
      const entries = {
        "Docs.API": nativeEntry,
        "docs-api": { command: "node" },
      };
      const content = JSON.stringify({ mcpServers: entries });
      const source = path.join(root, "names.json");
      fs.writeFileSync(source, content);
      const result =
        input === "file"
          ? service.importFromFile(source)
          : service.createFromSource({ kind: "config", input: content });
      expect(result.imported.map((server) => server.name)).toEqual(
        Object.keys(entries),
      );
      expect(result.skipped).toEqual([]);
      const repeated = service.createFromSource({
        kind: "config",
        input: content,
      });
      expect(repeated.imported).toEqual([]);
      expect(repeated.skipped).toEqual(Object.keys(entries));
      const reopened = new CoreMcpLibraryService(mcpStorage.options);
      expect(
        reopened
          .read()
          .servers.map((server) => server.name)
          .sort(),
      ).toEqual(Object.keys(entries).sort());
    },
  );

  it("imports disabled native stdio entries without losing tool selection", async () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const result = await service.createFromSource({
      kind: "config",
      input: JSON.stringify({
        mcpServers: {
          local: { command: "node", disabled: true, disabledTools: ["write"] },
        },
      }),
    });
    expect(result.imported[0]).toMatchObject({
      enabled: false,
      disabledTools: ["write"],
    });
    expect(
      getMcpTargetEntryObject("antigravity", result.imported[0]),
    ).toMatchObject({
      command: "node",
      disabled: true,
      disabledTools: ["write"],
    });
  });

  it.each([{ oauth: { clientSecret: 42 } }, { disabledTools: "delete" }])(
    "rejects malformed native options without changing the library: %j",
    async (invalid) => {
      const service = new CoreMcpLibraryService(mcpStorage.options);
      const existing = service.createServer({ name: "keep", command: "node" });
      expect(() =>
        service.createFromSource({
          kind: "config",
          input: JSON.stringify({
            mcpServers: {
              invalid: { serverUrl: "https://example.test/mcp", ...invalid },
            },
          }),
        }),
      ).toThrow();
      expect(
        new CoreMcpLibraryService(mcpStorage.options).read().servers,
      ).toEqual([existing]);
    },
  );
});
