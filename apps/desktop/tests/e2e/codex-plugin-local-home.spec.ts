import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "smol-toml";
import { getPluginNativeSourceRoot } from "@prompthub/core/plugin-library/shared";
import { launchPromptHub, closePromptHub } from "./helpers/electron";

// Explicit opt-in: only the uniquely named test plugin is changed in this home.
const codexHome = process.env.PROMPTHUB_TEST_CODEX_HOME;
test.skip(
  !codexHome,
  "Requires explicit authorization and PROMPTHUB_TEST_CODEX_HOME",
);

test("manages a disposable plugin in the authorized local Codex home", async () => {
  test.setTimeout(120_000);
  if (!codexHome) throw new Error("Explicit Codex home required");
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-local-codex-"),
  );
  const name = `prompthub-acceptance-${randomUUID().slice(0, 8)}`;
  const source = path.join(userDataDir, "source");
  const configPath = path.join(codexHome, "config.toml");
  const configBefore = parse(fs.readFileSync(configPath, "utf8"));
  fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
  fs.writeFileSync(
    path.join(source, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name,
      version: "1.0.0",
      description: "Disposable PromptHub acceptance fixture",
    }),
  );
  fs.writeFileSync(
    path.join(source, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Harmless test fixture\n---\nReturn the word probe.\n`,
  );
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { CODEX_HOME: codexHome },
  });
  let libraryId: string | undefined;
  let removed = false;
  try {
    const before = await page.evaluate(async () =>
      (await window.api.plugin.getTargetMatrix()).find(
        (target) => target.id === "codex",
      ),
    );
    expect(before?.inventoryError).toBeUndefined();
    const imported = await page.evaluate(
      (sourcePath) =>
        window.api.plugin.importLocalPluginPackage({ sourcePath }),
      source,
    );
    libraryId = imported.plugin.id;
    const installed = await page.evaluate(
      (pluginId) =>
        window.api.plugin.distributePlugin({
          pluginId,
          targetIds: ["codex"],
          mode: "copy",
        }),
      libraryId,
    );
    expect(installed.failures).toEqual([]);
    expect(installed.targets).toHaveLength(1);
    const target = await page.evaluate(async () =>
      (await window.api.plugin.getTargetMatrix()).find(
        (target) => target.id === "codex",
      ),
    );
    const native = target?.installedPlugins?.find(
      (plugin) => plugin.name === name,
    )?.nativeCodex;
    if (!native)
      throw new Error("Native test plugin missing after installation");
    expect(native.enabled).toBe(true);
    for (const operation of ["disable", "update", "enable"] as const) {
      const result = await page.evaluate(
        (request) => window.api.plugin.mutateCodexPlugin(request),
        { pluginId: native.pluginId, operation },
      );
      expect(result.success).toBe(true);
      if (result.success)
        expect(
          result.target.installedPlugins?.find(
            (plugin) => plugin.nativeCodex?.pluginId === native.pluginId,
          )?.nativeCodex?.enabled,
        ).toBe(operation === "enable");
    }
    const removal = await page.evaluate(
      (pluginId) =>
        window.api.plugin.mutateCodexPlugin({
          pluginId,
          operation: "uninstall",
        }),
      native.pluginId,
    );
    expect(removal.success).toBe(true);
    removed = true;
    expect(
      (await page.evaluate(() => window.api.plugin.getLibrary())).plugins,
    ).toHaveLength(1);
    const after = await page.evaluate(async () =>
      (await window.api.plugin.getTargetMatrix()).find(
        (target) => target.id === "codex",
      ),
    );
    // Boolean assertion avoids putting the user's configuration or inventory in failure output.
    expect(
      JSON.stringify(after?.installedPlugins?.map((p) => p.nativeCodex)) ===
        JSON.stringify(before?.installedPlugins?.map((p) => p.nativeCodex)),
    ).toBe(true);
    expect(
      JSON.stringify(parse(fs.readFileSync(configPath, "utf8"))) ===
        JSON.stringify(configBefore),
    ).toBe(true);
  } finally {
    let cleanupComplete = removed || !libraryId;
    try {
      if (libraryId && !removed) {
        const cleanup = await page.evaluate(
          (pluginId) =>
            window.api.plugin.removePluginDistribution({
              pluginId,
              targetIds: ["codex"],
            }),
          libraryId,
        );
        if (cleanup.failures?.length)
          throw new Error(
            `Test plugin cleanup failed; retain profile: ${userDataDir}`,
          );
        cleanupComplete = true;
      }
      if (libraryId) {
        // This unique fixture owns its unregistered marketplace marker as well as the package.
        fs.rmSync(getPluginNativeSourceRoot(codexHome, libraryId), {
          recursive: true,
          force: true,
        });
      }
    } finally {
      await closePromptHub(app, userDataDir, {
        preserveUserDataDir: !cleanupComplete,
      });
    }
  }
});
