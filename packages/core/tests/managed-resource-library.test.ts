import { describe, expect, it } from "vitest";
import {
  mutateManagedResourceLibrary,
  readManagedResourceLibrary,
} from "../src/managed-resources/library";
import type { ManagedResourceSnapshot } from "../src/managed-resources/library";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  materializePluginResourceBundle,
  readPluginResourceBundle,
} from "../src/plugin-resource-schema";
import {
  exportAgentAssetDirectorySnapshot,
  restoreAgentAssetDirectorySnapshot,
} from "../src/agent-asset-file-snapshot";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";

describe("managed resource libraries", () => {
  it("creates, edits and deletes MCP definitions without executing them or losing other domains", () => {
    const initial: ManagedResourceSnapshot = { pluginPackages: [] };
    const created = mutateManagedResourceLibrary(initial, "mcp", {
      action: "create",
      value: {
        name: "example",
        command: "never-execute",
        envRefs: { TOKEN: "${TOKEN}" },
      },
    });
    const server = created.mcpLibrary!.servers[0];
    expect(server).toMatchObject({
      name: "example",
      command: "never-execute",
      envRefs: { TOKEN: "${TOKEN}" },
    });
    expect(initial.mcpLibrary).toBeUndefined();
    const edited = mutateManagedResourceLibrary(created, "mcp", {
      action: "update",
      id: server.id,
      value: { description: "保存 👋", isFavorite: true },
    });
    expect(edited.mcpLibrary!.servers[0]).toMatchObject({
      id: server.id,
      description: "保存 👋",
      isFavorite: true,
      command: "never-execute",
    });
    expect(edited.pluginPackages).toEqual([]);
    const markerLibrary = {
      ...edited,
      mcpLibrary: {
        ...edited.mcpLibrary!,
        servers: [
          { ...edited.mcpLibrary!.servers[0], env: { TOKEN: "[REDACTED]" } },
        ],
      },
    };
    expect(
      mutateManagedResourceLibrary(markerLibrary, "mcp", {
        action: "update",
        id: server.id,
        value: { notes: "keep credentials" },
      }).mcpLibrary!.servers[0].env,
    ).toEqual({ TOKEN: "[REDACTED]" });
    expect(() =>
      mutateManagedResourceLibrary(edited, "mcp", {
        action: "create",
        value: { name: "example", command: "other" },
      }),
    ).toThrow(/already exists/);
    expect(() =>
      mutateManagedResourceLibrary(edited, "mcp", {
        action: "update",
        id: server.id,
        value: { env: { TOKEN: "secret-value" } },
      }),
    ).toThrow(/credential/);
    expect(() =>
      mutateManagedResourceLibrary(edited, "mcp", {
        action: "update",
        id: server.id,
        value: { notes: "bad\0note" },
      }),
    ).toThrow(/Invalid/);
    const deleted = mutateManagedResourceLibrary(edited, "mcp", {
      action: "delete",
      id: server.id,
    });
    expect(readManagedResourceLibrary(deleted, "mcp")).toMatchObject({
      servers: [],
      bindings: [],
    });
    expect(() =>
      mutateManagedResourceLibrary(deleted, "mcp", {
        action: "delete",
        id: server.id,
      }),
    ).toThrow(/not found/);
  });
  it("keeps Plugin edits and deletion consistent with portable bundles, history and binary files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-plugin-"));
    try {
      const source = path.join(root, "icon.bin");
      fs.writeFileSync(source, Buffer.from([0, 255, 3]));
      const plugin: PluginLibraryEntry = {
        id: "example",
        name: "example",
        displayName: "Example",
        trustLevel: "custom",
        source: { kind: "market" },
        classification: "bundle",
        inventory: {
          skills: 1,
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
      materializePluginResourceBundle({
        bundlePath: path.join(root, "before", "example"),
        plugin,
        versions: [
          {
            id: "v1",
            pluginId: plugin.id,
            version: 1,
            createdAt: new Date(1).toISOString(),
            plugin,
          },
        ],
        packageFiles: [{ path: "assets/icon.bin", sourcePath: source }],
      });
      const initial: ManagedResourceSnapshot = {
        pluginLibrary: {
          kind: "prompthub-plugin-library",
          version: 1,
          updatedAt: new Date(1).toISOString(),
          plugins: [plugin],
        },
        pluginPackages: [
          {
            pluginId: plugin.id,
            files: [
              {
                relativePath: "assets/icon.bin",
                contentBase64: "AP8D",
                size: 3,
              },
            ],
          },
        ],
        agentAssetFiles: {
          plugins: exportAgentAssetDirectorySnapshot(path.join(root, "before")),
        },
      };
      const updated = mutateManagedResourceLibrary(initial, "plugins", {
        action: "update",
        id: plugin.id,
        value: { userNotes: "My note", isFavorite: true },
      });
      restoreAgentAssetDirectorySnapshot(
        path.join(root, "after"),
        updated.agentAssetFiles!.plugins!,
      );
      const restored = readPluginResourceBundle(
        path.join(root, "after", "example"),
      );
      expect(restored.plugin).toMatchObject({
        userNotes: "My note",
        isFavorite: true,
      });
      expect(restored.versions[0].plugin.userNotes).toBeUndefined();
      expect(fs.readFileSync(restored.packageFiles[0].absolutePath)).toEqual(
        Buffer.from([0, 255, 3]),
      );
      const removed = mutateManagedResourceLibrary(updated, "plugins", {
        action: "delete",
        id: plugin.id,
      });
      expect(removed.pluginLibrary!.plugins).toEqual([]);
      expect(removed.agentAssetFiles!.plugins).toEqual([]);
      expect(removed.pluginPackages).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
