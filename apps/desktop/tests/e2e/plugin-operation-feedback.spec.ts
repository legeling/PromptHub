import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

test("Plugin picker reports completion, closes and keeps repeat actions side by side", async () => {
  const userDataDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-plugin-feedback-e2e-")),
  );
  const home = path.join(userDataDir, "home");
  const source = path.join(userDataDir, "source");
  fs.mkdirSync(path.join(source, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(source, "assets"));
  fs.writeFileSync(
    path.join(source, ".codex-plugin/plugin.json"),
    JSON.stringify({
      name: "feedback-fixture",
      version: "1.0.0",
      description: "Plugin feedback acceptance",
    }),
  );
  const companion = "Companion package bytes";
  fs.writeFileSync(path.join(source, "assets/example.txt"), companion);
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: home },
  });
  try {
    // A running development renderer may be selected without replacing native IPC.
    if (process.env.VITE_DEV_SERVER_URL)
      await page.goto(process.env.VITE_DEV_SERVER_URL);
    await setAppSettings(page, {
      language: "en",
      themeMode: "light",
      autoCheckUpdate: false,
    });
    // Prepare an existing My Plugins entry; distribution itself uses only UI controls.
    await page.evaluate(
      (sourcePath) =>
        window.api.plugin.importLocalPluginPackage({ sourcePath }),
      source,
    );
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "My Plugins", exact: true }).click();
    const openPicker = page.getByRole("button", {
      name: "Select Agent targets for feedback-fixture",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "Select Agent targets",
      exact: true,
    });
    await openPicker.click();
    await dialog
      .getByRole("button", { name: "Shared Plugin directory", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Distributing..." }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Distributed Plugin to 1 Agent target(s)." }),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    for (const close of await page
      .getByRole("status")
      .getByRole("button", { name: "Close", exact: true })
      .all()) {
      await close.click();
    }
    await expect(page.getByRole("status").filter({ hasText: /Distributing\.\.\.|Distributed Plugin to/ })).toHaveCount(0);
    const target = path.join(
      home,
      ".agents/plugins/feedback-fixture/assets/example.txt",
    );
    expect(fs.readFileSync(target, "utf8")).toBe(companion);

    await openPicker.click();
    await dialog
      .getByRole("button", { name: "Shared Plugin directory", exact: true })
      .click();
    const apply = dialog.getByRole("button", {
      name: "Apply changes",
      exact: true,
    });
    const redistribute = dialog.getByRole("button", {
      name: "Redistribute",
      exact: true,
    });
    await expect(apply).toBeDisabled();
    await expect(redistribute).toBeEnabled();
    await expect(dialog).toHaveCSS("opacity", "1");
    const applyBounds = await apply.boundingBox();
    const repeatBounds = await redistribute.boundingBox();
    expect(applyBounds).not.toBeNull();
    expect(repeatBounds).not.toBeNull();
    expect(Math.abs(applyBounds!.y - repeatBounds!.y)).toBeLessThan(2);
    expect(repeatBounds!.x).toBeGreaterThanOrEqual(
      applyBounds!.x + applyBounds!.width,
    );
    await page.screenshot({
      path: test.info().outputPath("plugin-feedback-actions.png"),
    });
    await redistribute.click();
    await expect(dialog).toBeHidden();
    expect(fs.readFileSync(target, "utf8")).toBe(companion);
    await setAppSettings(page, { themeMode: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "My Plugins", exact: true }).click();
    await expect(openPicker).toBeVisible();
    await openPicker.click();
    await dialog
      .getByRole("button", { name: "Shared Plugin directory", exact: true })
      .click();
    await expect(redistribute).toBeEnabled();
    await expect(dialog).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: test.info().outputPath("plugin-feedback-actions-dark.png"),
    });
    const library = await page.evaluate(() => window.api.plugin.getLibrary());
    expect(
      library.plugins.find((plugin) => plugin.name === "feedback-fixture")
        ?.distributedTargetIds,
    ).toContain("shared-agents");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
