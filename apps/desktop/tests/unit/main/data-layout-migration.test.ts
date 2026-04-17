/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getDataLayoutMigrationMarkerPath,
  migrateLegacyDataLayout,
} from "../../../src/main/services/data-layout-migration";
import { getUpgradeBackupRoot } from "../../../src/main/services/upgrade-backup";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("data-layout-migration", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("data-layout-migration-");
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("migrates legacy root entries into data/config and writes a marker after snapshotting", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "workspace", "prompts", "ops"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "folders.json"),
      JSON.stringify([{ id: "folder-1", name: "Ops" }]),
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "prompts", "ops", "prompt.md"),
      "prompt-body",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "skills", "demo-skill"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo-skill", "SKILL.md"),
      "# skill",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "images"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "images", "demo.png"), "png", "utf8");
    fs.writeFileSync(
      path.join(userDataPath, "shortcuts.json"),
      '{"showApp":"Alt+Shift+P"}',
      "utf8",
    );
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-bytes", "utf8");

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("migrated");
    expect(result.backupId).toBeTruthy();
    expect(result.movedEntries).toEqual(
      expect.arrayContaining(["workspace", "skills", "images", "shortcuts.json"]),
    );

    expect(fs.existsSync(path.join(userDataPath, "workspace"))).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "skills"))).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "images"))).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "shortcuts.json"))).toBe(false);

    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "folders.json"),
        "utf8",
      ),
    ).toContain("folder-1");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "prompts", "ops", "prompt.md"),
        "utf8",
      ),
    ).toBe("prompt-body");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "skills", "demo-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# skill");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "assets", "images", "demo.png"),
        "utf8",
      ),
    ).toBe("png");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "config", "shortcuts.json"),
        "utf8",
      ),
    ).toContain("showApp");

    const markerPath = getDataLayoutMigrationMarkerPath(userDataPath);
    expect(fs.existsSync(markerPath)).toBe(true);

    const backupRoot = getUpgradeBackupRoot(userDataPath);
    const backupDirs = fs
      .readdirSync(backupRoot)
      .filter((entry) => !entry.startsWith("."));
    expect(backupDirs.length).toBeGreaterThan(0);
    const backupDir = path.join(backupRoot, backupDirs[0]);
    expect(fs.existsSync(path.join(backupDir, "workspace", "folders.json"))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
  });

  it("is a no-op when the marker already exists", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.5" }),
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "workspace"), { recursive: true });

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("already-migrated");
    expect(result.movedEntries).toEqual([]);
    expect(fs.existsSync(path.join(userDataPath, "workspace"))).toBe(true);
  });

  it("does nothing when there is no legacy data to move", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-bytes", "utf8");

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("no-legacy-data");
    expect(result.backupId).toBeNull();
    expect(fs.existsSync(getDataLayoutMigrationMarkerPath(userDataPath))).toBe(false);
  });
});
