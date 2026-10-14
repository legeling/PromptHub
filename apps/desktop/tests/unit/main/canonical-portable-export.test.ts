/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { deriveLocalResourceDeviceId } from "@prompthub/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCheckpointedPortableSnapshotZip } from "../../../src/main/services/canonical-portable-export";

function completeScope() {
  return {
    prompts: true,
    versions: true,
    images: true,
    videos: true,
    skills: true,
    rules: true,
    mcp: true,
    plugins: true,
    agents: true,
    generations: true,
    config: true,
    exportJson: "{}",
  };
}

describe("canonical portable export coordinator", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the database closed and maintenance barrier active through archive publication", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-export-"),
    );
    roots.push(root);
    const cachePath = path.join(root, "cache");
    const events: string[] = [];
    let barrierActive = false;
    let databaseOpen = true;
    let checkpointPath = "";

    const result = await createCheckpointedPortableSnapshotZip(
      {
        activeRoot: root,
        databasePath: path.join(root, "data", "prompthub.db"),
        cachePath,
        destinationPath: path.join(root, "export.zip"),
        sourcePaths: {
          rootPath: root,
          cachePath,
          promptsPath: path.join(root, "data", "prompts"),
          versionsPath: path.join(root, "workspace", ".versions"),
          skillsPath: path.join(root, "data", "skills"),
          rulesPath: path.join(root, "data", "rules"),
          pluginsPath: path.join(root, "data", "plugins"),
          imagesPath: path.join(root, "data", "assets", "images"),
          videosPath: path.join(root, "data", "assets", "videos"),
        },
        scope: completeScope(),
        persistExtractedMcpSecrets: vi.fn(),
        onDatabaseReopened: () => {
          expect(databaseOpen).toBe(true);
          events.push("rebind");
        },
      },
      {
        closeDatabase: () => {
          events.push("close");
          databaseOpen = false;
        },
        reopenDatabase: () => {
          events.push("reopen");
          databaseOpen = true;
        },
        createCheckpoint: async (options) => {
          events.push("checkpoint");
          expect(databaseOpen).toBe(false);
          expect(options.deviceId).toBe(deriveLocalResourceDeviceId(root));
          checkpointPath = options.targetPath;
          fs.mkdirSync(path.join(checkpointPath, "canonical"), {
            recursive: true,
          });
          fs.writeFileSync(path.join(checkpointPath, "checkpoint.json"), "{}");
          return { targetPath: checkpointPath, manifest: {} as never };
        },
        assertConsistency: () => {
          events.push("consistency");
        },
        acquireMaintenance: () => {
          events.push("barrier");
          barrierActive = true;
          return {
            release: () => {
              events.push("release");
              barrierActive = false;
            },
          };
        },
        createZip: async (options) => {
          events.push("zip");
          expect(databaseOpen).toBe(false);
          expect(barrierActive).toBe(true);
          expect(options.sourcePaths.canonicalCheckpointPath).toBe(
            checkpointPath,
          );
          fs.writeFileSync(options.destinationPath, "zip");
          return {
            filePath: options.destinationPath,
            consistencyId: "a".repeat(64),
          };
        },
      },
    );

    expect(result.consistencyId).toBe("a".repeat(64));
    expect(events).toEqual([
      "barrier",
      "close",
      "checkpoint",
      "consistency",
      "zip",
      "release",
      "reopen",
      "rebind",
    ]);
    expect(databaseOpen).toBe(true);
    expect(fs.existsSync(checkpointPath)).toBe(false);
  });

  it("releases, cleans, and reopens after archive failure", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-export-fail-"),
    );
    roots.push(root);
    const cachePath = path.join(root, "cache");
    const release = vi.fn();
    const reopen = vi.fn();
    const rebind = vi.fn(() => expect(reopen).toHaveBeenCalledTimes(1));

    await expect(
      createCheckpointedPortableSnapshotZip(
        {
          activeRoot: root,
          databasePath: path.join(root, "data", "prompthub.db"),
          cachePath,
          destinationPath: path.join(root, "export.zip"),
          sourcePaths: {
            rootPath: root,
            cachePath,
            promptsPath: "",
            versionsPath: "",
            skillsPath: "",
            rulesPath: "",
            pluginsPath: "",
            imagesPath: "",
            videosPath: "",
          },
          scope: completeScope(),
          onDatabaseReopened: rebind,
        },
        {
          closeDatabase: vi.fn(),
          reopenDatabase: reopen,
          createCheckpoint: async (options) => {
            fs.mkdirSync(path.join(options.targetPath, "canonical"), {
              recursive: true,
            });
            fs.writeFileSync(
              path.join(options.targetPath, "checkpoint.json"),
              "{}",
            );
            return { targetPath: options.targetPath, manifest: {} as never };
          },
          acquireMaintenance: () => ({ release }),
          assertConsistency: vi.fn(),
          createZip: async () => {
            throw new Error("archive failed");
          },
        },
      ),
    ).rejects.toThrow("archive failed");
    expect(release).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(rebind).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(cachePath, "canonical-checkpoints"))).toBe(
      true,
    );
    expect(
      fs.readdirSync(path.join(cachePath, "canonical-checkpoints")),
    ).toEqual([]);
  });
});
