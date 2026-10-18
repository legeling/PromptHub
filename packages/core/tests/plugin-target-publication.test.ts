import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  assertPluginTargetWritable,
  publishPluginTarget,
  inspectPluginTargetContent,
} from "../src/plugin-target-publication";

it("publishes complete copies, detects source updates and rejects externally modified targets", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-plugin-publish-"),
  );
  const source = path.join(root, "source"),
    target = path.join(root, "target");
  try {
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "asset.bin"), Buffer.from([0, 255]));
    const publish = () =>
      publishPluginTarget(source, target, "plugin-1", (stage) =>
        fs.cpSync(source, stage, { recursive: true }),
      );
    expect(() => assertPluginTargetWritable(source, root, "plugin-1")).toThrow(
      /overlap/i,
    );
    expect(() =>
      assertPluginTargetWritable(
        source,
        path.join(source, "child"),
        "plugin-1",
      ),
    ).toThrow(/overlap/i);
    const alias = path.join(root, "alias");
    fs.symlinkSync(
      source,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() =>
      assertPluginTargetWritable(source, path.join(alias, "child"), "plugin-1"),
    ).toThrow(/symlink/i);
    publish();
    expect(inspectPluginTargetContent(source, target, "plugin-1")).toBe(
      "synced",
    );
    fs.writeFileSync(path.join(source, "asset.bin"), Buffer.from([1, 255]));
    expect(inspectPluginTargetContent(source, target, "plugin-1")).toBe(
      "needs-sync",
    );
    expect(() =>
      publishPluginTarget(source, target, "plugin-1", () => {
        throw new Error("Disk full");
      }),
    ).toThrow("Disk full");
    expect(fs.readFileSync(path.join(target, "asset.bin"))).toEqual(
      Buffer.from([0, 255]),
    );
    publish();
    fs.writeFileSync(path.join(target, "asset.bin"), Buffer.from([2, 255]));
    expect(inspectPluginTargetContent(source, target, "plugin-1")).toBe(
      "conflict",
    );
    expect(publish).toThrow(/conflict/i);
    expect(() =>
      assertPluginTargetWritable(source, target, "plugin-1"),
    ).toThrow(/conflict/i);
    expect(fs.readFileSync(path.join(target, "asset.bin"))).toEqual(
      Buffer.from([2, 255]),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
