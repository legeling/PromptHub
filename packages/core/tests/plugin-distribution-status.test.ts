import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { readPluginDistributionStatus } from "../src/plugin-distribution-status";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { emptyPluginInventory } from "../src/plugin-library/shared";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

it("verifies actual packages, preserves older versions and reports unreadable native config separately", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-plugin-status-"),
  );
  directories.push(root);
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(source, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "example", version: "1.0.0" }),
  );
  const plugin: PluginLibraryEntry = {
    id: "source:example",
    name: "example",
    displayName: "Example",
    source: { kind: "local" },
    trustLevel: "custom",
    classification: "bundle",
    inventory: emptyPluginInventory(),
    installedAt: 1,
    updatedAt: 1,
  };
  const target = path.join(root, "target", "2.0.0");
  const previous = path.join(root, "target", "1.0.0");
  fs.cpSync(source, previous, { recursive: true });
  const options = {
    resolvePath: () => target,
    nativeRegistered: () => true,
    targetIds: ["claude-code"],
  };
  expect(
    readPluginDistributionStatus([plugin], options)[plugin.id]["claude-code"]
      .installed,
  ).toBe(true);
  expect(
    readPluginDistributionStatus([plugin], {
      ...options,
      includeContent: true,
    })[plugin.id]["claude-code"].contentState,
  ).toBe("needs-sync");
  fs.rmSync(previous, { recursive: true });
  expect(
    readPluginDistributionStatus([plugin], options)[plugin.id]["claude-code"]
      .installed,
  ).toBe(false);
  fs.cpSync(source, target, { recursive: true });
  expect(
    readPluginDistributionStatus([plugin], {
      ...options,
      nativeRegistered: () => false,
    })[plugin.id]["claude-code"].installed,
  ).toBe(false);
  const failed = readPluginDistributionStatus([plugin], {
    ...options,
    nativeRegistered: () => {
      throw new Error("Configuration unreadable");
    },
  });
  expect(failed[plugin.id]["claude-code"]).toMatchObject({
    error: "Configuration unreadable",
  });
  expect(failed[plugin.id]["claude-code"].installed).toBeUndefined();
});
