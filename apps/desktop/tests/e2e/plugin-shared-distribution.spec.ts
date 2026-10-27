import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

async function openPlugin(app: ElectronApplication, page: Page): Promise<void> {
  await sendAppCommand(app, { type: "asset:create", asset: "plugin" });
  await page
    .getByRole("dialog", { name: "New Plugin" })
    .getByRole("button", { name: "Close" })
    .click();
  await page
    .getByRole("button", { name: "shared-fixture. Shared package fixture" })
    .click();
}

function createFixture(): {
  userDataDir: string;
  home: string;
  source: string;
  target: string;
} {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-shared-plugin-e2e-"),
  );
  const home = path.join(userDataDir, "home");
  const source = path.join(userDataDir, "source");
  fs.mkdirSync(path.join(source, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(source, "assets"));
  fs.writeFileSync(
    path.join(source, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: "shared-fixture",
      version: "1.0.0",
      description: "Shared package fixture",
    }),
  );
  fs.writeFileSync(
    path.join(source, "assets", "data.bin"),
    Buffer.from([0, 1, 255]),
  );
  return {
    userDataDir,
    home,
    source,
    target: path.join(home, ".agents", "plugins", "shared-fixture"),
  };
}

test("shared Plugin copy persists across reopen and removal keeps the library package", async () => {
  test.setTimeout(90_000);
  const { userDataDir, home, source, target } = createFixture();
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: home, USERPROFILE: home },
  });
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    await page.evaluate(
      (sourcePath) =>
        window.api.plugin.importLocalPluginPackage({ sourcePath }),
      source,
    );
    await openPlugin(app, page);
    const advanced = page.getByRole("region", { name: "Advanced targets" });
    const shared = advanced.getByRole("button", {
      name: "Shared Plugin directory",
    });
    await expect(shared).toHaveAttribute("aria-pressed", "false");
    await shared.click();
    await page.getByRole("button", { name: "Apply changes" }).click();
    await expect(
      advanced.getByText("Installed", { exact: true }),
    ).toBeVisible();
    expect(fs.readFileSync(path.join(target, "assets", "data.bin"))).toEqual(
      Buffer.from([0, 1, 255]),
    );
    await page.reload();
    await openPlugin(app, page);
    await expect(
      advanced.getByText("Installed", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await advanced.scrollIntoViewIfNeeded();
    const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage())
        .toPNG()
        .toString("base64"),
    );
    fs.writeFileSync(
      test.info().outputPath("shared-plugin.png"),
      Buffer.from(screenshot, "base64"),
    );
    await advanced.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove from Agent", exact: true })
      .click();
    await expect(shared).toBeVisible();
    expect(fs.existsSync(target)).toBe(false);
    const library = await page.evaluate(() => window.api.plugin.getLibrary());
    const retained = library.plugins.find(
      (entry) => entry.name === "shared-fixture",
    );
    expect(retained?.distributedTargetIds ?? []).not.toContain("shared-agents");
    expect(retained?.localPackagePath).toBeTruthy();
    expect(
      fs.readFileSync(
        path.join(retained!.localPackagePath!, "assets", "data.bin"),
      ),
    ).toEqual(Buffer.from([0, 1, 255]));
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
