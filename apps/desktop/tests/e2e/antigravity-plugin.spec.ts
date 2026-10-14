import { expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

test("imports and distributes the reported Antigravity plugin.json package and retains it after restart (#226)", async () => {
  test.setTimeout(120_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "issue-226-gui-"));
  const home = path.join(profile, "home");
  const source = path.join(profile, "incoming", "zotero");
  const target = path.join(home, ".gemini", "config", "plugins", "zotero");
  const manifest =
    JSON.stringify(
      {
        name: "zotero",
        displayName: "Zotero",
        version: "0.1.2",
        description: "Work with Zotero: search your local library.",
        logo: "assets/icon.png",
        suggestedPrompts: ["Search my Zotero library for recent papers"],
      },
      null,
      2,
    ) + "\n";
  fs.mkdirSync(path.join(source, "assets"), { recursive: true });
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(source, "plugin.json"), manifest);
  const icon = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOioAAAAASUVORK5CYII=",
    "base64",
  );
  fs.writeFileSync(path.join(source, "assets", "icon.png"), icon);
  const options = {
    userDataDir: profile,
    env: { HOME: home, USERPROFILE: home },
  };
  let app: ElectronApplication | null = null;
  try {
    let launched = await launchPromptHub(null, options);
    app = launched.app;
    let page = launched.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppSettings(page, {
      language: "en",
      autoCheckUpdate: false,
      minimizeOnLaunch: false,
    });
    // Only the OS folder picker is substituted; the import UI and IPC are real.
    await app.evaluate(({ dialog }, folder) => {
      Reflect.set(dialog, "showOpenDialog", async () => ({
        canceled: false,
        filePaths: [folder],
      }));
    }, source);
    await sendAppCommand(app, { type: "asset:create", asset: "plugin" });
    await page
      .getByRole("dialog", { name: "New Plugin" })
      .getByRole("button", { name: "Import local Plugin" })
      .click();
    await expect(
      page.getByText("Imported Zotero to My Plugins", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Select Agent targets for Zotero",
        exact: true,
      })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Select Agent targets",
      exact: true,
    });
    await picker
      .getByRole("button", { name: "Antigravity", exact: true })
      .click();
    await picker
      .getByRole("button", {
        name: "Distribute to selected Agents",
        exact: true,
      })
      .click();
    await expect(picker).not.toBeVisible();
    await expect
      .poll(() => fs.existsSync(path.join(target, "plugin.json")))
      .toBe(true);
    expect(fs.readFileSync(path.join(target, "plugin.json"), "utf8")).toBe(
      manifest,
    );
    expect(fs.readFileSync(path.join(target, "assets", "icon.png"))).toEqual(
      icon,
    );
    expect(fs.existsSync(path.join(target, "0.1.2"))).toBe(false);
    expect(fs.existsSync(path.join(target, "gemini-extension.json"))).toBe(
      false,
    );

    await closePromptHub(app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, options);
    app = launched.app;
    page = launched.page;
    await sendAppCommand(app, { type: "asset:create", asset: "plugin" });
    await page
      .getByRole("dialog", { name: "New Plugin" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Select Agent targets for Zotero",
        exact: true,
      }),
    ).toBeVisible();
    const library = await page.evaluate(() => window.api.plugin.getLibrary());
    expect(library.plugins).toHaveLength(1);
    expect(library.plugins[0]).toMatchObject({
      name: "zotero",
      version: "0.1.2",
      distributedTargetIds: ["antigravity"],
    });
    const matrix = await page.evaluate(() =>
      window.api.plugin.getTargetMatrix(),
    );
    expect(
      matrix.find((entry) => entry.id === "antigravity")?.installedPlugins,
    ).toEqual([
      expect.objectContaining({ name: "zotero", sourcePath: target }),
    ]);
    expect(fs.readFileSync(path.join(source, "plugin.json"), "utf8")).toBe(
      manifest,
    );
  } finally {
    if (app) await closePromptHub(app, profile);
    else fs.rmSync(profile, { recursive: true, force: true });
  }
});
