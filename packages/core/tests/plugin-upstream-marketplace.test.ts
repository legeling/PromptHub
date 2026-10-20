import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { closeDatabase } from "@prompthub/db";
import type { PluginMarketSource } from "@prompthub/shared/types/plugin";
import { CorePluginLibraryService } from "../src/plugin-library/service";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { initDatabase } from "../src/database";

const sources: Array<{ source: PluginMarketSource; name: string }> = [
  {
    name: "gdocs",
    source: {
      id: "upstream-antigravity",
      displayName: "Antigravity",
      trustLevel: "custom",
      repository: "",
      marketplaceFile: "marketplace.json",
      rawJsonUrl:
        "https://www.gstatic.com/antigravity/plugins/marketplace.json",
    },
  },
  {
    name: "code-review",
    source: {
      id: "upstream-claude",
      displayName: "Claude",
      trustLevel: "custom",
      repository: "https://github.com/anthropics/claude-plugins-official",
      marketplaceFile: ".claude-plugin/marketplace.json",
      rawJsonUrl:
        "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
    },
  },
];
it.skipIf(process.env.PROMPTHUB_UPSTREAM_PLUGIN_TESTS !== "1").each(sources)(
  "previews, installs and reopens the upstream $name package (#242/#243)",
  async ({ source, name }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-upstream-plugin-"));
    configureRuntimePaths({ userDataPath: root });
    try {
      initDatabase();
      const options = { marketSources: [source], materializePackages: true };
      const library = new CorePluginLibraryService(options);
      const entries = await library.getMarketEntries();
      const entry = entries.find((entry) => entry.name === name);
      expect(entry).toBeDefined();
      const preview = await library.previewMarketPlugin(entry!.id);
      expect(preview.canInstall).toBe(true);
      const installed = await library.installMarketPlugin(entry!.id);
      const plugin = installed.plugin;
      expect(plugin.localPackagePath).toBeTruthy();
      const files = fs
        .readdirSync(plugin.localPackagePath!, { recursive: true })
        .filter((file) => typeof file === "string");
      expect(files.some((file) => file.endsWith(".md"))).toBe(true);
      closeDatabase();
      initDatabase();
      const reopened = new CorePluginLibraryService(options)
        .read()
        .plugins.find((item) => item.id === plugin.id);
      expect(reopened).toMatchObject({
        name,
        localPackagePath: plugin.localPackagePath,
      });
      expect(
        fs.readdirSync(reopened!.localPackagePath!, { recursive: true }),
      ).toEqual(files);
      console.info(
        JSON.stringify({
          issue: name === "gdocs" ? 242 : 243,
          name,
          version: plugin.version,
          files: files.length,
          inventory: plugin.inventory,
        }),
      );
    } finally {
      closeDatabase();
      resetRuntimePaths();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  120_000,
);
