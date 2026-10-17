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

async function openDetail(app: ElectronApplication, page: Page): Promise<void> {
  await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
  await page
    .getByRole("dialog", { name: "New MCP" })
    .getByRole("button", { name: "Close" })
    .click();
  await page
    .getByRole("button", { name: "MCP Detail: Shared Fixture" })
    .click();
}

function createFixture(): {
  userDataDir: string;
  home: string;
  config: string;
  legacyFiles: string[];
} {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-native-mcp-"),
  );
  const home = path.join(userDataDir, "home");
  const config = path.join(home, ".agents", "mcp", "mcp.json");
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(
    config,
    JSON.stringify({
      mcpServers: { unrelated: { command: "keep-me" } },
      marker: "preserved",
    }),
  );
  const legacyFiles = [".config/mcp/mcp.json", ".agents/mcp.json"].map(
    (relative) => path.join(home, relative),
  );
  for (const file of legacyFiles) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        mcpServers: { "shared-fixture": { url: "https://example.com/mcp" } },
        marker: "preserved",
      }),
    );
  }
  return { userDataDir, home, config, legacyFiles };
}

test("single shared MCP target writes, reopens and removes without touching other paths", async () => {
  test.setTimeout(90_000);
  const { userDataDir, home, config, legacyFiles } = createFixture();
  const originalFiles = legacyFiles.map((file) =>
    fs.readFileSync(file, "utf8"),
  );
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: home, USERPROFILE: home },
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setAppSettings(page, {
      language: "en",
      autoCheckUpdate: false,
      disabledPlatformIds: ["pi"],
    });
    await page.evaluate(async () => {
      await window.api.mcp.createServer({
        name: "shared-fixture",
        displayName: "Shared Fixture",
        transport: "streamable-http",
        url: "https://example.com/mcp",
        enabled: true,
        tags: [],
        source: { type: "manual" },
      });
    });
    await openDetail(app, page);
    const advanced = page.getByRole("region", { name: "Advanced targets" });
    const shared = advanced.getByRole("button", {
      name: "Shared MCP config (~/.agents/mcp/mcp.json)",
      exact: true,
    });
    await expect(advanced.getByRole("button")).toHaveCount(1);
    await expect(shared).toHaveAttribute("aria-pressed", "false");
    await shared.click();
    await page.getByRole("button", { name: "Apply to 1 platform(s)" }).click();
    await expect
      .poll(() => fs.readFileSync(config, "utf8"))
      .toContain("https://example.com/mcp");
    await page.reload();
    await openDetail(app, page);
    await expect(page.getByText("Distributed", { exact: true })).toBeVisible();
    await expect(
      advanced.getByRole("button", { name: "Remove from platform" }),
    ).toHaveCount(1);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].showInactive(),
    );
    await page
      .getByRole("button", { name: "Remove from platform" })
      .scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage())
        .toPNG()
        .toString("base64"),
    );
    fs.writeFileSync(
      test.info().outputPath("shared-mcp-single.png"),
      Buffer.from(screenshot, "base64"),
    );
    await page.getByRole("button", { name: "Remove from platform" }).click();
    await expect
      .poll(() => fs.readFileSync(config, "utf8"))
      .not.toContain("shared-fixture");
    expect(fs.readFileSync(config, "utf8")).toContain("keep-me");
    expect(legacyFiles.map((file) => fs.readFileSync(file, "utf8"))).toEqual(
      originalFiles,
    );
    const library = await page.evaluate(() => window.api.mcp.getLibrary());
    expect(library.bindings).toEqual([]);
    expect(fs.readFileSync(config, "utf8")).toContain("preserved");
    await expect(shared).toBeVisible();
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
