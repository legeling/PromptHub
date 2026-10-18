import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { mutateManagedResourceLibrary } from "../src/managed-resources/library";
import {
  readHostedPlugin,
  exportHostedPluginFiles,
  readHostedPluginFiles,
} from "../src/managed-resources/plugin-packages";
import { restoreAgentAssetDirectorySnapshot } from "../src/agent-asset-file-snapshot";
import { readPluginResourceBundle } from "../src/plugin-resource-schema";
import type { ManagedResourceSnapshot } from "@prompthub/shared/types/managed-resources";
import { encodeCanonicalResourceDirectory } from "../src/canonical-resource-path";

it("imports, versions, rolls back and exports portable Plugin packages without losing binary files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hosted-plugin-"));
  try {
    const plugin = {
      id: "source:example",
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
    let snapshot: ManagedResourceSnapshot = mutateManagedResourceLibrary(
      {},
      "plugins",
      { action: "import-package", value },
    );
    snapshot = mutateManagedResourceLibrary(snapshot, "plugins", {
      action: "create-version",
      id: plugin.id,
      note: "before",
    });
    snapshot = mutateManagedResourceLibrary(snapshot, "plugins", {
      action: "update",
      id: plugin.id,
      value: { userNotes: "changed" },
    });
    snapshot = mutateManagedResourceLibrary(snapshot, "plugins", {
      action: "rollback",
      id: plugin.id,
      version: 1,
    });
    const restored = readHostedPlugin(snapshot, plugin.id);
    expect(restored.plugin.userNotes).toBeUndefined();
    expect(restored.versions).toHaveLength(2);
    expect(restored.versions[1].plugin.userNotes).toBe("changed");
    expect(restored.files).toEqual(value.files);
    expect(() =>
      mutateManagedResourceLibrary(snapshot, "plugins", {
        action: "import-package",
        value,
      }),
    ).toThrow(/already exists/);
    restoreAgentAssetDirectorySnapshot(root, exportHostedPluginFiles(snapshot));
    const disk = readPluginResourceBundle(
      path.join(root, encodeCanonicalResourceDirectory(plugin.id)),
    );
    expect(disk.versions).toHaveLength(2);
    expect(fs.readFileSync(disk.packageFiles[0].absolutePath)).toEqual(
      Buffer.from([0, 255, 3]),
    );
    const backup = exportHostedPluginFiles(snapshot);
    expect(readHostedPluginFiles(backup)[0].files).toEqual(value.files);
    expect(() =>
      readHostedPluginFiles([
        ...backup,
        { relativePath: "../orphan", contentBase64: "AA==", size: 1 },
      ]),
    ).toThrow(/path|inventory/i);
    expect(() =>
      mutateManagedResourceLibrary({}, "plugins", {
        action: "import-files",
        value: [...backup, backup[0]],
      }),
    ).toThrow(/Invalid Plugin import/);
    const corrupted = structuredClone(snapshot);
    const asset = corrupted.agentAssetFiles!.plugins!.find((file) =>
      file.relativePath.endsWith("/files/asset.bin"),
    )!;
    asset.contentBase64 = "AAAA";
    expect(() => readHostedPlugin(corrupted, plugin.id)).toThrow(/hash/i);
    expect(() =>
      mutateManagedResourceLibrary(corrupted, "plugins", {
        action: "update",
        id: plugin.id,
        value: { userNotes: "do not repair" },
      }),
    ).toThrow(/hash/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
