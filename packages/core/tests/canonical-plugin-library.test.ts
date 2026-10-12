import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  PluginLibraryEntry,
  PluginLibraryFile,
} from "@prompthub/shared/types/plugin";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readCanonicalPluginLibrary,
  readCanonicalPluginVersions,
  writeCanonicalPluginState,
} from "../src/canonical-plugin-library";
import { CorePluginLibraryService } from "../src/plugin-library";
import { readPluginResourceBundle } from "../src/plugin-resource-schema";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";

function plugin(packagePath: string): PluginLibraryEntry {
  return {
    id: "plugin-1",
    name: "writing-tools",
    displayName: "Writing Tools",
    trustLevel: "custom",
    inventory: {
      skills: 1,
      mcpServers: 0,
      apps: 0,
      commands: 0,
      hooks: 0,
      agents: 0,
      assets: 0,
      docs: 0,
      lspServers: 0,
      scripts: 0,
    },
    classification: "bundle",
    source: { kind: "local", localPackagePath: packagePath },
    localPackagePath: packagePath,
    managedPath: path.dirname(packagePath),
    distributedTargetIds: ["codex"],
    installedAt: Date.parse("2026-08-12T00:00:00.000Z"),
    updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
  };
}

function library(plugins: PluginLibraryEntry[]): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: "2026-08-12T00:00:00.000Z",
    plugins,
  };
}

describe("canonical Plugin library", () => {
  let root: string;
  let packagePath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-plugin-"),
    );
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "c".repeat(64),
      operationId: "canonical-plugin-test",
    });
    const rendererPath = path.join(root, "config", "devices", "renderer.json");
    fs.mkdirSync(path.dirname(rendererPath), { recursive: true });
    fs.writeFileSync(
      rendererPath,
      JSON.stringify({ selfHostedDeviceId: "device-1" }),
    );
    packagePath = path.join(root, "incoming", "package");
    fs.mkdirSync(path.join(packagePath, ".codex-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, ".codex-plugin", "plugin.json"),
      '{"name":"writing-tools"}\n',
    );
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("routes production reads, metadata writes, versions, and deletion through bundles", () => {
    const service = new CorePluginLibraryService();
    service.write(library([plugin(packagePath)]));
    const bundlePath = path.join(root, "data", "plugins", "plugin-1");

    expect(service.read().plugins[0]).toMatchObject({
      id: "plugin-1",
      distributedTargetIds: ["codex"],
      localPackagePath: path.join(bundlePath, "files"),
    });
    expect(
      fs.readFileSync(
        path.join(bundlePath, "files", ".codex-plugin", "plugin.json"),
        "utf8",
      ),
    ).toContain("writing-tools");
    const createdVersion = service.createPluginVersion("plugin-1", "baseline");
    expect(createdVersion.version).toBe(1);
    expect(readCanonicalPluginVersions().versions).toHaveLength(1);

    const metadata = service.updatePluginMetadata("plugin-1", {
      userNotes: "daily",
    });
    expect(metadata.plugins[0].userNotes).toBe("daily");
    expect(readPluginResourceBundle(bundlePath).bundleManifest.revision).toBe(
      3,
    );
    expect(
      fs.existsSync(path.join(root, "data", "plugins", "library.json")),
    ).toBe(false);

    service.deletePlugin("plugin-1");
    expect(readCanonicalPluginLibrary().plugins).toEqual([]);
    expect(fs.existsSync(bundlePath)).toBe(false);
  });

  it("persists a local source outside the canonical bundle and updates after reread", async () => {
    fs.mkdirSync(path.join(packagePath, "commands"), { recursive: true });
    fs.mkdirSync(path.join(packagePath, "skills", "reviewer"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(packagePath, "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "writing-tools",
        version: "1.0.0",
        commands: ["./commands/review.md"],
      }),
    );
    fs.writeFileSync(
      path.join(packagePath, "commands", "review.md"),
      "review\n",
    );
    fs.writeFileSync(
      path.join(packagePath, "skills", "reviewer", "SKILL.md"),
      "---\nname: reviewer\n---\n\nReview carefully.\n",
    );
    fs.writeFileSync(
      path.join(packagePath, "workflows", "release.md"),
      "release\n",
    );
    fs.writeFileSync(path.join(packagePath, ".mcp.json"), "{}\n");
    fs.writeFileSync(path.join(packagePath, "README.md"), "unrelated\n");

    const targetPath = path.join(root, "target", "writing-tools");
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: () => targetPath,
    });
    const result = service.importLocalPluginPackage({
      sourcePath: packagePath,
      sourceTargetId: "codex",
      sourceTargetName: "Codex",
    });
    const bundlePath = path.join(
      root,
      "data",
      "plugins",
      "agent-codex%3Awriting-tools",
    );

    expect(result.plugin.localPackagePath).toBe(path.join(bundlePath, "files"));
    expect(result.plugin.source.url).toBe(packagePath);
    expect(
      fs.readFileSync(
        path.join(bundlePath, "files", "commands", "review.md"),
        "utf8",
      ),
    ).toBe("review\n");
    expect(fs.readdirSync(path.join(root, "data", "plugins")).sort()).toEqual([
      "agent-codex%3Awriting-tools",
    ]);
    expect(
      fs.readFileSync(path.join(bundlePath, "plugin.json"), "utf8"),
    ).not.toContain(packagePath);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "config", "devices", "plugin-projections.json"),
          "utf8",
        ),
      ).sources,
    ).toEqual({ "agent-codex:writing-tools": packagePath });
    service.distributePlugin({
      pluginId: result.plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    service.removePluginDistribution({
      pluginId: result.plugin.id,
      targetIds: ["codex"],
    });

    fs.writeFileSync(
      path.join(packagePath, "commands", "review.md"),
      "review v2\n",
    );
    fs.writeFileSync(
      path.join(packagePath, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "writing-tools",
        version: "2.0.0",
        commands: ["./commands/review.md"],
      }),
    );
    const restarted = new CorePluginLibraryService();
    await expect(
      restarted.getPluginSourceUpdateStatus(result.plugin.id),
    ).resolves.toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });
    await expect(
      restarted.updatePluginFromSource(result.plugin.id),
    ).resolves.toMatchObject({ status: "updated" });
    expect(
      fs.readFileSync(
        path.join(bundlePath, "files", "commands", "review.md"),
        "utf8",
      ),
    ).toBe("review v2\n");
    expect(
      readCanonicalPluginVersions().versions[0].packageSnapshot?.files.find(
        (file) => file.relativePath === "commands/review.md",
      )?.contentBase64,
    ).toBe(Buffer.from("review\n").toString("base64"));

    const sourceTarget = `${packagePath}-target`;
    fs.renameSync(packagePath, sourceTarget);
    fs.symlinkSync(sourceTarget, packagePath, "dir");
    const revision =
      readPluginResourceBundle(bundlePath).bundleManifest.revision;
    await expect(
      restarted.getPluginSourceUpdateStatus(result.plugin.id),
    ).rejects.toMatchObject({ code: "INVALID_PATH" });
    expect(readPluginResourceBundle(bundlePath).bundleManifest.revision).toBe(
      revision,
    );
    expect(readCanonicalPluginVersions().versions).toHaveLength(1);

    fs.rmSync(packagePath);
    fs.rmSync(sourceTarget, { recursive: true });
    await expect(
      restarted.getPluginSourceUpdateStatus(result.plugin.id),
    ).rejects.toMatchObject({ code: "MISSING_SOURCE" });
    expect(readPluginResourceBundle(bundlePath).bundleManifest.revision).toBe(
      revision,
    );
  });

  it("rolls back bundle and device projection publication together", () => {
    writeCanonicalPluginState({
      library: library([plugin(packagePath)]),
      versions: {
        kind: "prompthub-plugin-versions",
        version: 1,
        updatedAt: "2026-08-12T00:00:00.000Z",
        versions: [],
      },
    });
    const current = readCanonicalPluginLibrary().plugins[0];
    const projectionPath = path.join(
      root,
      "config",
      "devices",
      "plugin-projections.json",
    );
    const beforeProjection = fs.readFileSync(projectionPath, "utf8");

    expect(() =>
      writeCanonicalPluginState({
        library: library([
          {
            ...current,
            userNotes: "should roll back",
            distributedTargetIds: ["claude-code"],
            updatedAt: Date.parse("2026-08-12T01:00:00.000Z"),
          },
        ]),
        versions: readCanonicalPluginVersions(),
        injectPublicationFailure(targetPath) {
          if (targetPath === projectionPath) throw new Error("disk full");
        },
      }),
    ).toThrow("disk full");

    const restored = readCanonicalPluginLibrary().plugins[0];
    expect(restored).toMatchObject({
      distributedTargetIds: ["codex"],
    });
    expect(restored.userNotes).toBeUndefined();
    expect(fs.readFileSync(projectionPath, "utf8")).toBe(beforeProjection);
  });

  it("coexists with exact superseded Plugin metadata files", () => {
    const pluginRoot = path.join(root, "data", "plugins");
    fs.mkdirSync(pluginRoot, { recursive: true });
    for (const fileName of [
      "library.json",
      "market-cache.json",
      "versions.json",
    ]) {
      fs.writeFileSync(path.join(pluginRoot, fileName), "{}\n", "utf8");
    }

    expect(readCanonicalPluginLibrary().plugins).toEqual([]);
    expect(readCanonicalPluginVersions().versions).toEqual([]);
  });

  it("migrates a superseded Plugin library into canonical bundles", () => {
    const pluginRoot = path.join(root, "data", "plugins");
    const libraryPath = path.join(pluginRoot, "library.json");
    const versionsPath = path.join(pluginRoot, "versions.json");
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(
      libraryPath,
      JSON.stringify(library([plugin(packagePath)])),
    );
    fs.writeFileSync(
      versionsPath,
      JSON.stringify({
        kind: "prompthub-plugin-versions",
        version: 1,
        updatedAt: "2026-08-12T00:00:00.000Z",
        versions: [],
      }),
    );

    const migrated = new CorePluginLibraryService().read();

    expect(migrated.plugins).toHaveLength(1);
    expect(migrated.plugins[0]).toMatchObject({
      id: "plugin-1",
      displayName: "Writing Tools",
    });
    expect(fs.existsSync(libraryPath)).toBe(false);
    expect(fs.existsSync(versionsPath)).toBe(false);
    expect(
      fs.existsSync(path.join(pluginRoot, "plugin-1", "manifest.json")),
    ).toBe(true);
  });

  it("keeps canonical Plugin bundles authoritative over stale metadata", () => {
    const service = new CorePluginLibraryService();
    service.write(library([plugin(packagePath)]));
    const pluginRoot = path.join(root, "data", "plugins");
    const libraryPath = path.join(pluginRoot, "library.json");
    const versionsPath = path.join(pluginRoot, "versions.json");
    fs.writeFileSync(libraryPath, JSON.stringify(library([])));
    fs.writeFileSync(
      versionsPath,
      JSON.stringify({
        kind: "prompthub-plugin-versions",
        version: 1,
        updatedAt: "2026-08-12T00:00:00.000Z",
        versions: [],
      }),
    );

    expect(service.read().plugins).toHaveLength(1);
    expect(fs.existsSync(libraryPath)).toBe(false);
    expect(fs.existsSync(versionsPath)).toBe(false);
  });

  it("migrates superseded Plugin metadata when no version file exists", () => {
    const pluginRoot = path.join(root, "data", "plugins");
    const libraryPath = path.join(pluginRoot, "library.json");
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(
      libraryPath,
      JSON.stringify(library([plugin(packagePath)])),
    );

    expect(new CorePluginLibraryService().read().plugins).toHaveLength(1);
    expect(fs.existsSync(libraryPath)).toBe(false);
  });

  it("migrates with a stable local identity before self-hosted sync is configured", () => {
    const rendererPath = path.join(root, "config", "devices", "renderer.json");
    fs.writeFileSync(
      rendererPath,
      JSON.stringify({
        kind: "prompthub-renderer-devices",
        version: 1,
        updatedAt: "2026-08-12T00:00:00.000Z",
        selfHostedDeviceId: null,
      }),
    );
    const pluginRoot = path.join(root, "data", "plugins");
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, "library.json"),
      JSON.stringify(library([plugin(packagePath)])),
    );

    const migrated = new CorePluginLibraryService().read();
    const projection = JSON.parse(
      fs.readFileSync(
        path.join(root, "config", "devices", "plugin-projections.json"),
        "utf8",
      ),
    ) as { deviceId: string; targets: Record<string, string[]> };

    expect(migrated.plugins).toHaveLength(1);
    expect(projection.deviceId).toMatch(/^device-[a-f0-9]{32}$/u);
    expect(projection.targets).toEqual({ "plugin-1": ["codex"] });
  });

  it("removes empty superseded Plugin metadata without creating bundles", () => {
    const pluginRoot = path.join(root, "data", "plugins");
    const libraryPath = path.join(pluginRoot, "library.json");
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(libraryPath, JSON.stringify(library([])));

    expect(new CorePluginLibraryService().read().plugins).toEqual([]);
    expect(fs.existsSync(libraryPath)).toBe(false);
  });

  it.each(["library.json", "market-cache.json", "versions.json"])(
    "rejects an unsafe Plugin coexistence artifact at %s",
    (fileName) => {
      const artifactPath = path.join(root, "data", "plugins", fileName);
      fs.mkdirSync(artifactPath, { recursive: true });

      expect(() => readCanonicalPluginLibrary()).toThrow(
        /Canonical Plugin legacy metadata path is unsafe/u,
      );
    },
  );

  it("rejects a symlinked Plugin coexistence artifact", () => {
    const pluginRoot = path.join(root, "data", "plugins");
    const targetPath = path.join(root, "legacy-plugin-library.json");
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(targetPath, "{}\n", "utf8");
    fs.symlinkSync(targetPath, path.join(pluginRoot, "library.json"));

    expect(() => readCanonicalPluginLibrary()).toThrow(
      /Canonical Plugin legacy metadata path is unsafe/u,
    );
  });

  it("continues to reject undeclared Plugin root files", () => {
    const pluginRoot = path.join(root, "data", "plugins");
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, "unexpected.json"), "{}\n", "utf8");

    expect(() => readCanonicalPluginLibrary()).toThrow(
      /Canonical Plugin resource path is unsafe/u,
    );
  });
});
