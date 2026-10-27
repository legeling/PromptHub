import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

test("MCP and Plugin distribution show only available Agents", async () => {
  test.setTimeout(90_000);
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-distribution-visibility-"),
  );
  const home = path.join(userDataDir, "home");
  const emptyBin = path.join(home, "empty-bin");
  fs.mkdirSync(emptyBin, { recursive: true });
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  const sourcePath = path.join(userDataDir, "incoming", "visibility-fixture");
  fs.mkdirSync(path.join(sourcePath, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(sourcePath, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: "visibility-fixture",
      version: "1.0.0",
      description: "Agent visibility fixture",
    }),
  );
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: home, USERPROFILE: home, PATH: emptyBin },
  });
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    const detected = await page.evaluate(() =>
      window.api.skill.detectPlatforms(),
    );
    expect(detected).toContain("codex");
    expect(detected).not.toContain("qwen");
    expect(detected).not.toContain("kiro");
    await page.evaluate(async (pluginPath) => {
      await window.api.mcp.createServer({
        name: "visibility-fixture",
        displayName: "Visibility MCP",
        transport: "stdio",
        command: "fixture-command",
        enabled: true,
        tags: [],
        source: { type: "manual" },
      });
      await window.api.plugin.importLocalPluginPackage({
        sourcePath: pluginPath,
      });
    }, sourcePath);

    await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
    await page
      .getByRole("dialog", { name: "New MCP" })
      .getByRole("button", { name: "Close" })
      .click();
    await page
      .getByRole("button", { name: "MCP Detail: Visibility MCP" })
      .click();
    const mcp = page.getByTestId("mcp-full-detail-page");
    const codex = mcp.getByRole("button", { name: /Codex/ });
    await expect(codex).toBeEnabled();
    await expect(mcp.getByText("Qwen Code", { exact: true })).toHaveCount(0);
    await expect(mcp.getByText("Kiro", { exact: true })).toHaveCount(0);
    await codex.click();
    await expect(codex).toHaveAttribute("aria-pressed", "true");
    await expect(
      mcp.getByRole("button", { name: "Apply to 1 platform(s)" }),
    ).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("mcp-targets.png") });

    await sendAppCommand(app, { type: "asset:create", asset: "plugin" });
    await page
      .getByRole("dialog", { name: "New Plugin" })
      .getByRole("button", { name: "Close" })
      .click();
    await page
      .getByRole("button", {
        name: "visibility-fixture. Agent visibility fixture",
      })
      .click();
    const pluginTarget = page.getByRole("button", {
      name: "Codex",
      exact: true,
    });
    await expect(pluginTarget).toBeEnabled();
    await expect(page.getByText("Qwen Code", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Kiro", { exact: true })).toHaveCount(0);
    await pluginTarget.click();
    await expect(pluginTarget).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", {
        name: "Apply changes",
      }),
    ).toBeEnabled();
    await page.screenshot({
      path: test.info().outputPath("plugin-targets.png"),
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
