import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

const PLUGIN_ID = "agent-agent:writing-tools";
const PLUGIN_NAME = "writing-tools";

function writePluginSource(
  sourcePath: string,
  version: string,
  commandContent: string,
) {
  fs.mkdirSync(path.join(sourcePath, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(sourcePath, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: PLUGIN_NAME,
      version,
      description: "Deterministic Agent Plugin fixture",
    }),
  );
  fs.mkdirSync(path.join(sourcePath, "commands"), { recursive: true });
  fs.mkdirSync(path.join(sourcePath, "skills", "reviewer"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(sourcePath, "workflows"), { recursive: true });
  fs.writeFileSync(
    path.join(sourcePath, ".codex-plugin", "plugin.json"),
    `${JSON.stringify(
      {
        name: PLUGIN_NAME,
        version,
        description: "Deterministic Agent Plugin fixture",
        commands: ["./commands/review.md"],
        skills: ["./skills/reviewer/SKILL.md"],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(sourcePath, "commands", "review.md"),
    commandContent,
  );
  fs.writeFileSync(
    path.join(sourcePath, "skills", "reviewer", "SKILL.md"),
    "---\nname: reviewer\ndescription: Reviews changes\n---\n\nReview carefully.\n",
  );
  fs.writeFileSync(
    path.join(sourcePath, "workflows", "release.md"),
    "release\n",
  );
  fs.writeFileSync(path.join(sourcePath, ".mcp.json"), '{"mcpServers":{}}\n');
  fs.writeFileSync(
    path.join(sourcePath, "README.md"),
    "unrelated package file\n",
  );
}

async function openPluginLibrary(app: ElectronApplication, page: Page) {
  await sendAppCommand(app, { type: "asset:create", asset: "plugin" });
  const dialog = page.getByRole("dialog", { name: "New Plugin" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
}

test("imports, distributes, restarts, and deletes a local Plugin", async ({}, testInfo) => {
  test.setTimeout(120_000);

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-plugin-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const sourcePath = path.join(userDataDir, "incoming", PLUGIN_NAME);
  const codexRoot = path.join(homeDir, ".codex");
  fs.mkdirSync(path.join(codexRoot, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "plugins", "keep.txt"), "keep\n");
  writePluginSource(sourcePath, "1.0.0", "review v1\n");

  const launchOptions = {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  };
  let activeApp: ElectronApplication | null = null;

  try {
    let launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    let { page } = launched;
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppSettings(page, {
      language: "en",
      minimizeOnLaunch: false,
      autoCheckUpdate: false,
    });
    await activeApp.evaluate(({ dialog }, folder) => {
      Reflect.set(dialog, "showOpenDialog", async () => ({
        canceled: false,
        filePaths: [folder],
      }));
    }, sourcePath);

    await sendAppCommand(activeApp, { type: "asset:create", asset: "plugin" });
    const createDialog = page.getByRole("dialog", { name: "New Plugin" });
    await createDialog
      .getByRole("button", { name: "Import local Plugin" })
      .click();
    await expect(
      page.getByText(`Imported ${PLUGIN_NAME} to My Plugins`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("The Plugin package failed validation", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /^writing-tools\. Deterministic Agent Plugin fixture/,
      }),
    ).toBeVisible();

    let library = await page.evaluate(() => window.api.plugin.getLibrary());
    expect(library.plugins).toHaveLength(1);
    expect(library.plugins[0]).toMatchObject({
      id: PLUGIN_ID,
      name: PLUGIN_NAME,
      version: "1.0.0",
    });
    const bundlePath = library.plugins[0].localPackagePath;
    if (!bundlePath) throw new Error("Imported Plugin package path missing");
    expect(fs.readFileSync(path.join(bundlePath, "README.md"), "utf8")).toBe(
      "unrelated package file\n",
    );

    const distribution = await page.evaluate(
      (pluginId) =>
        window.api.plugin.distributePlugin({
          pluginId,
          targetIds: ["codex"],
          mode: "copy",
        }),
      PLUGIN_ID,
    );
    expect(distribution.targets).toHaveLength(1);
    const targetPath = distribution.targets[0].path;
    expect(
      fs.readFileSync(path.join(targetPath, "commands", "review.md"), "utf8"),
    ).toBe("review v1\n");
    await page
      .getByRole("button", { name: "Agent Plugin", exact: true })
      .click();
    await page
      .getByTestId("agent-plugin-target-row")
      .filter({ hasText: "Codex" })
      .click();
    await page
      .getByTestId("agent-plugin-detail-header")
      .getByTitle("Refresh", { exact: true })
      .click();
    await page.getByTestId("agent-plugin-filter-agent-installed").click();
    await page
      .getByTestId("agent-plugin-list")
      .getByRole("button", { name: /Open Plugin details/ })
      .click();
    const actions = page.getByTestId("codex-plugin-actions");
    await expect(
      actions.getByRole("button", { name: "Disable", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("codex-plugin-actions.png"),
    });
    await actions.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(
      actions.getByRole("button", { name: "Enable", exact: true }),
    ).toBeVisible();
    await actions.getByRole("button", { name: "Update", exact: true }).click();
    await expect(
      actions.getByRole("button", { name: "Enable", exact: true }),
    ).toBeEnabled();
    await actions.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(
      actions.getByRole("button", { name: "Disable", exact: true }),
    ).toBeVisible();
    await actions
      .getByRole("button", { name: "Uninstall", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Uninstall", exact: true })
      .click();
    await expect(actions).not.toBeVisible();
    const afterUninstall = await page.evaluate(() =>
      window.api.plugin.getLibrary(),
    );
    expect(afterUninstall.plugins).toHaveLength(1);
    expect(afterUninstall.plugins[0].distributedTargetIds).toEqual([]);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(
      fs.readFileSync(path.join(codexRoot, "plugins", "keep.txt"), "utf8"),
    ).toBe("keep\n");

    await closePromptHub(activeApp, userDataDir, { preserveUserDataDir: true });
    activeApp = null;
    launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    page = launched.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPluginLibrary(activeApp, page);

    library = await page.evaluate(() => window.api.plugin.getLibrary());
    expect(library.plugins[0]).toMatchObject({
      id: PLUGIN_ID,
      version: "1.0.0",
      distributedTargetIds: [],
    });
    writePluginSource(sourcePath, "2.0.0", "review v2\n");
    const updateCheck = await page.evaluate(
      (pluginId) => window.api.plugin.getPluginSourceUpdateStatus(pluginId),
      PLUGIN_ID,
    );
    expect(updateCheck).toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });
    const update = await page.evaluate(
      (pluginId) => window.api.plugin.updatePluginFromSource(pluginId),
      PLUGIN_ID,
    );
    expect(update).toMatchObject({ status: "updated" });
    expect(
      fs.readFileSync(path.join(bundlePath, "commands", "review.md"), "utf8"),
    ).toBe("review v2\n");
    const versions = await page.evaluate(
      (pluginId) => window.api.plugin.versionGetAll(pluginId),
      PLUGIN_ID,
    );
    expect(versions).toHaveLength(1);
    expect(
      versions[0].packageSnapshot?.files.find(
        (file) => file.relativePath === "commands/review.md",
      )?.contentBase64,
    ).toBe(Buffer.from("review v1\n").toString("base64"));
    const card = page.getByRole("button", {
      name: /^writing-tools\. Deterministic Agent Plugin fixture/,
    });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Delete Plugin" }).click();
    const deleteDialog = page.getByRole("alertdialog", {
      name: "Delete Plugin",
    });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByText(`Deleted ${PLUGIN_NAME}`, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const current = await page.evaluate(() =>
          window.api.plugin.getLibrary(),
        );
        return current.plugins.length;
      })
      .toBe(0);
    expect(fs.existsSync(bundlePath)).toBe(false);

    await closePromptHub(activeApp, userDataDir, { preserveUserDataDir: true });
    activeApp = null;
    launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    page = launched.page;
    await expect
      .poll(async () => {
        const current = await page.evaluate(() =>
          window.api.plugin.getLibrary(),
        );
        return current.plugins.length;
      })
      .toBe(0);
    expect(fs.existsSync(bundlePath)).toBe(false);
    expect(
      fs.readFileSync(path.join(codexRoot, "plugins", "keep.txt"), "utf8"),
    ).toBe("keep\n");
  } finally {
    if (activeApp) await closePromptHub(activeApp, userDataDir);
    else if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
});
