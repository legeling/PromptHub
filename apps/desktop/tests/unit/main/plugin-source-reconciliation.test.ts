/**
 * @vitest-environment node
 */
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

import {
  CorePluginLibraryService,
  configureRuntimePaths,
  initDatabase,
  closeDatabase,
  resetRuntimePaths,
} from "@prompthub/core";
import {
  materializeGitSourcePackage,
  normalizePluginSourceImportRequest,
} from "@prompthub/core/plugin-library/package-materialization";
import {
  attachMarketSourcePackageHash,
  getPluginPackageUpdateSignals,
} from "@prompthub/core/plugin-library/source-reconciliation";
import type { PluginMarketPreview } from "@prompthub/shared/types/plugin";

function writeBundle(rootDir: string): string {
  const packagePath = path.join(rootDir, "bundle");
  fs.mkdirSync(path.join(packagePath, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(packagePath, "skills", "review"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(packagePath, "commands"), { recursive: true });
  fs.writeFileSync(
    path.join(packagePath, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: "bundle",
      version: "1.0.0",
      skills: "./skills",
      commands: ["./commands/review.md"],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(packagePath, "skills", "review", "SKILL.md"),
    "---\nname: review\n---\nVersion one",
    "utf8",
  );
  fs.writeFileSync(
    path.join(packagePath, "commands", "review.md"),
    "Review command",
    "utf8",
  );
  return packagePath;
}

function createMarketPreview(): PluginMarketPreview {
  return {
    entry: {
      id: "market:bundle",
      marketplaceId: "market",
      name: "bundle",
      displayName: "Bundle",
      trustLevel: "community",
      source: {
        kind: "market",
        repository: "https://gitea.example.test/team/plugins.git",
        packagePath: "plugins/bundle",
      },
    },
    displayName: "Bundle",
    inventory: {
      skills: 1,
      mcpServers: 0,
      apps: 0,
      commands: 1,
      hooks: 0,
      agents: 0,
      assets: 0,
      docs: 0,
      lspServers: 0,
      scripts: 0,
    },
    classification: "bundle",
    tags: [],
    canInstall: true,
    warnings: [],
  };
}

describe("Plugin source reconciliation", () => {
  let userDataPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "plugin-source-reconciliation-"),
    );
    configureRuntimePaths({ userDataPath });
    initDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("detects child-file-only changes in a Git-backed Plugin source", async () => {
    const sourceRoot = path.join(userDataPath, "source");
    const sourcePath = writeBundle(sourceRoot);
    const service = new CorePluginLibraryService({
      materializeSourcePackageFn: async () => ({
        localRepositoryPath: sourceRoot,
        sourcePath,
      }),
    });

    const installed = await service.importSourcePlugin({
      url: "https://gitea.example.test/team/plugins.git",
    });
    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "up-to-date",
      localModified: false,
      remoteChanged: false,
    });

    fs.writeFileSync(
      path.join(sourcePath, "skills", "review", "SKILL.md"),
      "---\nname: review\n---\nVersion two",
      "utf8",
    );

    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });

    const updated = await service.updatePluginFromSource(installed.plugin.id);
    expect(updated.status).toBe("updated");
    expect(
      fs.readFileSync(
        path.join(
          updated.status === "updated"
            ? (updated.plugin.localPackagePath ?? "")
            : "",
          "skills",
          "review",
          "SKILL.md",
        ),
        "utf8",
      ),
    ).toContain("Version two");
    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({ status: "up-to-date" });
  });

  it("checks and applies a content-only update through a real local Git repository", async () => {
    const repositoryPath = writeBundle(path.join(userDataPath, "git-fixture"));
    childProcess.execFileSync("git", ["init", "-q"], { cwd: repositoryPath });
    childProcess.execFileSync(
      "git",
      ["config", "user.email", "test@example.com"],
      {
        cwd: repositoryPath,
      },
    );
    childProcess.execFileSync(
      "git",
      ["config", "user.name", "PromptHub Test"],
      {
        cwd: repositoryPath,
      },
    );
    childProcess.execFileSync("git", ["add", "."], { cwd: repositoryPath });
    childProcess.execFileSync("git", ["commit", "-qm", "initial"], {
      cwd: repositoryPath,
    });
    const service = new CorePluginLibraryService();
    const installed = await service.importSourcePlugin({ url: repositoryPath });

    fs.writeFileSync(
      path.join(repositoryPath, "commands", "review.md"),
      "Real Git content update",
      "utf8",
    );
    childProcess.execFileSync("git", ["add", "."], { cwd: repositoryPath });
    childProcess.execFileSync("git", ["commit", "-qm", "content update"], {
      cwd: repositoryPath,
    });

    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });
    const updated = await service.updatePluginFromSource(installed.plugin.id);

    expect(updated.status).toBe("updated");
    expect(
      fs.readFileSync(
        path.join(
          updated.status === "updated"
            ? (updated.plugin.localPackagePath ?? "")
            : "",
          "commands",
          "review.md",
        ),
        "utf8",
      ),
    ).toBe("Real Git content update");
  });

  it("checks and applies updates from the original local Plugin folder", async () => {
    const sourcePath = writeBundle(path.join(userDataPath, "local-source"));
    const service = new CorePluginLibraryService();
    const installed = service.importLocalPluginPackage({
      sourcePath,
      sourceTargetId: "local",
    });
    fs.writeFileSync(
      path.join(sourcePath, "commands", "review.md"),
      "Updated local command",
      "utf8",
    );

    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });
    const updated = await service.updatePluginFromSource(installed.plugin.id);

    expect(updated.status).toBe("updated");
    expect(
      fs.readFileSync(
        path.join(
          updated.status === "updated"
            ? (updated.plugin.localPackagePath ?? "")
            : "",
          "commands",
          "review.md",
        ),
        "utf8",
      ),
    ).toBe("Updated local command");
    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({ status: "up-to-date" });
  });

  it("skips marketplace package materialization without a complete source location", async () => {
    const materialize = vi.fn();
    const preview = createMarketPreview();
    const withoutRepository: PluginMarketPreview = {
      ...preview,
      entry: {
        ...preview.entry,
        source: { ...preview.entry.source, repository: undefined },
      },
    };
    const withoutPackagePath: PluginMarketPreview = {
      ...preview,
      entry: {
        ...preview.entry,
        source: { ...preview.entry.source, packagePath: undefined },
      },
    };

    await expect(
      attachMarketSourcePackageHash(withoutRepository, materialize),
    ).resolves.toBe(withoutRepository);
    await expect(
      attachMarketSourcePackageHash(withoutPackagePath, materialize),
    ).resolves.toBe(withoutPackagePath);
    expect(materialize).not.toHaveBeenCalled();
  });

  it("rejects and cleans a marketplace package without a Plugin manifest", async () => {
    const cleanupPath = path.join(userDataPath, "market-stage");
    const sourcePath = path.join(cleanupPath, "plugins", "bundle");
    fs.mkdirSync(sourcePath, { recursive: true });

    await expect(
      attachMarketSourcePackageHash(createMarketPreview(), async () => ({
        cleanupPath,
        localRepositoryPath: cleanupPath,
        sourcePath,
      })),
    ).rejects.toMatchObject({ code: "MISSING_MANIFEST" });
    expect(fs.existsSync(cleanupPath)).toBe(false);
  });

  it("does not report a legacy package as up to date when its baseline is missing", async () => {
    const sourceRoot = path.join(userDataPath, "legacy-source");
    const sourcePath = writeBundle(sourceRoot);
    const service = new CorePluginLibraryService({
      materializeSourcePackageFn: async () => ({
        localRepositoryPath: sourceRoot,
        sourcePath,
      }),
    });
    const installed = await service.importSourcePlugin({
      url: "https://gitea.example.test/team/legacy-plugins.git",
    });
    const legacyLibrary = service.read();
    legacyLibrary.plugins = legacyLibrary.plugins.map((plugin) =>
      plugin.id === installed.plugin.id
        ? { ...plugin, installedPackageHash: undefined }
        : plugin,
    );
    service.write(legacyLibrary);
    fs.writeFileSync(
      path.join(sourcePath, "commands", "review.md"),
      "Changed without a baseline",
      "utf8",
    );

    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "conflict",
      localModified: true,
      remoteChanged: true,
    });
  });

  it("derives the same source identity after HTTP credentials rotate", () => {
    const first = normalizePluginSourceImportRequest({
      url: "https://alice:first-secret@gitea.example.test/team/plugins.git?token=one#main",
    });
    const second = normalizePluginSourceImportRequest({
      url: "https://bob:second-secret@gitea.example.test/team/plugins.git?token=two#other",
    });

    expect(first.sourceId).toBe(second.sourceId);
    expect(first.url).toContain("first-secret");
  });

  it("redacts credentials from Git source failures", async () => {
    const stderrHandlers: Array<(chunk: Buffer) => void> = [];
    const closeHandlers: Array<(code: number) => void> = [];
    vi.mocked(childProcess.spawn).mockReturnValue({
      stderr: {
        on: vi.fn((event, callback) => {
          if (event === "data") stderrHandlers.push(callback);
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === "close") closeHandlers.push(callback);
      }),
      kill: vi.fn(),
    } as unknown as childProcess.ChildProcess);

    const request = normalizePluginSourceImportRequest({
      url: "https://alice:secret@gitea.example.test/team/plugins.git?token=hidden",
    });
    const promise = materializeGitSourcePackage(request);
    await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
    stderrHandlers[0]?.(
      Buffer.from(
        "fatal: unable to access 'https://alice:secret@gitea.example.test/team/plugins.git?token=hidden': authentication failed",
      ),
    );
    closeHandlers[0]?.(128);

    const error = await promise.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("gitea.example.test");
    expect((error as Error).message).not.toContain("alice");
    expect((error as Error).message).not.toContain("secret");
    expect((error as Error).message).not.toContain("hidden");
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
  });

  it("does not override the proxy mode selected by the desktop settings", async () => {
    const originalProxyEnv = {
      ALL_PROXY: process.env.ALL_PROXY,
      HTTP_PROXY: process.env.HTTP_PROXY,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      all_proxy: process.env.all_proxy,
      http_proxy: process.env.http_proxy,
      https_proxy: process.env.https_proxy,
    };
    process.env.ALL_PROXY = "http://broken-proxy.test:8080";
    process.env.HTTP_PROXY = "http://broken-proxy.test:8080";
    process.env.HTTPS_PROXY = "http://broken-proxy.test:8080";
    process.env.all_proxy = "http://broken-proxy.test:8080";
    process.env.http_proxy = "http://broken-proxy.test:8080";
    process.env.https_proxy = "http://broken-proxy.test:8080";

    vi.mocked(childProcess.spawn).mockImplementation(() => {
      const proc = new EventEmitter() as childProcess.ChildProcess;
      const stderr = new EventEmitter();
      Object.assign(proc, { stderr, kill: vi.fn() });
      queueMicrotask(() => {
        stderr.emit("data", Buffer.from("CONNECT tunnel failed, response 503"));
        proc.emit("close", 128);
      });
      return proc;
    });

    try {
      const request = normalizePluginSourceImportRequest({
        url: "https://github.com/openai/plugins",
      });
      const error = await materializeGitSourcePackage(request).catch(
        (reason: unknown) => reason,
      );
      const spawnOptions = vi.mocked(childProcess.spawn).mock.calls[0]?.[2] as
        | childProcess.SpawnOptions
        | undefined;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("CONNECT tunnel failed");
      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
      expect(spawnOptions?.env).toBeUndefined();
      expect(process.env.HTTP_PROXY).toBe("http://broken-proxy.test:8080");
      expect(process.env.http_proxy).toBe("http://broken-proxy.test:8080");
    } finally {
      for (const [key, value] of Object.entries(originalProxyEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("terminates a stalled Git source clone", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    vi.mocked(childProcess.spawn).mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill,
    } as unknown as childProcess.ChildProcess);

    const request = normalizePluginSourceImportRequest({
      url: "ssh://git@gitea.example.test/team/plugins.git",
    });
    const promise = materializeGitSourcePackage(request);
    const rejection = expect(promise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(kill).toHaveBeenCalledWith("SIGKILL");
    await rejection;
  });

  it("uses equal local and remote packages as a safe legacy baseline", () => {
    expect(
      getPluginPackageUpdateSignals({
        installedManifestHash: "manifest-v1",
        localPackageHash: "package-v1",
        remoteManifestHash: "manifest-v1",
        remotePackageHash: "package-v1",
      }),
    ).toEqual({ localModified: false, remoteChanged: false });
  });

  it("falls back to manifest changes when a source has no package snapshot", () => {
    expect(
      getPluginPackageUpdateSignals({
        installedManifestHash: "manifest-v1",
        remoteManifestHash: "manifest-v2",
      }),
    ).toEqual({ localModified: false, remoteChanged: true });
    expect(
      getPluginPackageUpdateSignals({
        installedManifestHash: "manifest-v1",
        installedPackageHash: "package-v1",
        localPackageHash: "package-v1",
        remoteManifestHash: "manifest-v2",
      }),
    ).toEqual({ localModified: false, remoteChanged: true });
  });
});
