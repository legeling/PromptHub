import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

import { readPersistedMcp } from "./helpers/mcp-persistence";

import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppLanguage,
} from "./helpers/electron";

async function selectAgent(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder("Search Agents").fill(name);
  const agent = page.getByRole("button", { name, exact: true });
  await expect(agent).toBeVisible();
  await agent.click();
}

const EXTERNAL_SERVER_NAME = "pi-external-lifecycle";
const EXTERNAL_SECRET = "pi-literal-secret-must-not-cross-renderer";

test("enables Pi's compatible MCP workspace without creating config eagerly", async ({}, testInfo) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-pi-mcp-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const piRoot = path.join(homeDir, ".pi", "agent");
  const mcpPath = path.join(piRoot, "mcp.json");
  fs.mkdirSync(piRoot, { recursive: true });
  fs.writeFileSync(
    path.join(piRoot, "settings.json"),
    JSON.stringify({ defaultProvider: "test", defaultModel: "test" }),
    "utf8",
  );

  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  });

  try {
    await setAppLanguage(page, "en");
    await page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(app, { type: "agent:manage" });
    await selectAgent(page, "Pi");

    const mcpTab = page.getByRole("tab", { name: "MCP" });
    await expect(mcpTab).toBeEnabled();
    await expect(page.getByText(mcpPath, { exact: true })).toBeVisible();
    expect(fs.existsSync(mcpPath)).toBe(false);

    await mcpTab.click();
    await expect(page.getByRole("button", { name: "Add MCP" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Search assets" }),
    ).toBeVisible();
    expect(fs.existsSync(mcpPath)).toBe(false);

    await page.screenshot({
      path: testInfo.outputPath("pi-mcp-workspace.png"),
      animations: "disabled",
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("imports and removes an external Pi MCP without leaking its secret or coupling library deletion", async () => {
  test.setTimeout(90_000);
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-pi-mcp-import-e2e-"),
  );

  const homeDir = path.join(userDataDir, "home");
  const piRoot = path.join(homeDir, ".pi", "agent");
  const mcpPath = path.join(piRoot, "mcp.json");
  fs.mkdirSync(piRoot, { recursive: true });
  fs.writeFileSync(
    path.join(piRoot, "settings.json"),
    JSON.stringify({ defaultProvider: "test", defaultModel: "test" }),
    "utf8",
  );
  const nativeFixture = `${JSON.stringify(
    {
      keep: { untouched: true },
      mcpServers: {
        [EXTERNAL_SERVER_NAME]: {
          command: "node",
          args: ["external.js"],
          env: { ACCESS_TOKEN: EXTERNAL_SECRET },
        },
      },
    },
    null,
    2,
  )}\n`;
  fs.writeFileSync(mcpPath, nativeFixture, "utf8");

  const launchOptions = {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  };
  let activeApp = (await launchPromptHub(null, launchOptions)).app;

  try {
    let page = await activeApp.firstWindow();
    await setAppLanguage(page, "en");
    await page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(activeApp, { type: "agent:manage" });
    await selectAgent(page, "Pi");
    await page.getByRole("tab", { name: "MCP" }).click();

    const externalCard = page
      .getByTestId("mcp-agent-server-card")
      .filter({ hasText: EXTERNAL_SERVER_NAME });
    await expect(externalCard).toBeVisible();
    await expect(page.getByText(EXTERNAL_SECRET, { exact: true })).toHaveCount(
      0,
    );
    await externalCard.click();
    const detail = page.getByTestId("mcp-agent-entry-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("ACCESS_TOKEN=[REDACTED]")).toBeVisible();
    await expect(
      detail.getByText(EXTERNAL_SECRET, { exact: true }),
    ).toHaveCount(0);
    await detail
      .getByTestId("mcp-agent-detail-actions")
      .getByRole("button", { name: "Import to My MCP" })
      .click();
    await expect(
      page.getByText("MCP imported", { exact: true }).last(),
    ).toBeVisible();

    const importedLibrary = await page.evaluate(() =>
      window.api.mcp.getLibrary(),
    );
    expect(importedLibrary.servers).toHaveLength(1);
    const imported = importedLibrary.servers[0];
    expect(imported).toMatchObject({
      name: EXTERNAL_SERVER_NAME,
      command: "node",
      args: ["external.js"],
      env: { ACCESS_TOKEN: "[REDACTED]" },
      source: { type: "import", id: "pi", label: "Pi" },
    });
    expect(fs.readFileSync(mcpPath, "utf8")).toBe(nativeFixture);

    const bundlePath = path.join(userDataDir, "data", "mcp", imported.id);
    const persisted = readPersistedMcp(userDataDir, imported.id);
    expect(persisted.server?.server.env).toBeUndefined();
    expect(Object.keys(persisted.version?.secretReferences.env ?? {})).toEqual([
      "ACCESS_TOKEN",
    ]);
    expect(persisted.secrets).toHaveLength(1);
    expect(persisted.secrets[0]).toMatchObject({
      availability: "available",
      ciphertext: expect.any(String),
    });
    expect(JSON.stringify(persisted)).not.toContain(EXTERNAL_SECRET);
    expect(
      fs
        .readdirSync(path.join(bundlePath, "versions"))
        .map((name) =>
          fs.readFileSync(path.join(bundlePath, "versions", name), "utf8"),
        )
        .join("\n"),
    ).not.toContain(EXTERNAL_SECRET);

    await sendAppCommand(activeApp, { type: "agent:manage" });
    await selectAgent(page, "Pi");
    await page.getByRole("tab", { name: "MCP" }).click();
    const managedCard = page
      .getByTestId("mcp-agent-server-card")
      .filter({ hasText: EXTERNAL_SERVER_NAME });
    await managedCard.click();
    await page
      .getByTestId("mcp-agent-entry-detail")
      .getByRole("button", { name: "Uninstall from Agent" })
      .click();
    const uninstallDialog = page.getByRole("alertdialog", {
      name: "Uninstall from Agent",
    });
    await uninstallDialog.getByRole("button", { name: "Uninstall" }).click();
    await expect(
      page.getByText("MCP removed", { exact: true }).last(),
    ).toBeVisible();

    const afterUninstall = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    expect(afterUninstall.keep).toEqual({ untouched: true });
    expect(afterUninstall.mcpServers[EXTERNAL_SERVER_NAME]).toBeUndefined();
    expect(
      (await page.evaluate(() => window.api.mcp.getLibrary())).servers,
    ).toHaveLength(1);

    await sendAppCommand(activeApp, { type: "asset:create", asset: "mcp" });
    const createDialog = page.getByRole("dialog", { name: "New MCP" });
    await createDialog.getByRole("button", { name: "Close" }).click();
    await page.getByTestId(`mcp-server-card-${imported.id}`).click();
    await page.getByRole("button", { name: "Delete" }).click();
    const deleteDialog = page.getByRole("alertdialog", { name: "Delete MCP" });
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByText("MCP deleted", { exact: true }).last(),
    ).toBeVisible();
    expect(fs.existsSync(bundlePath)).toBe(false);

    await closePromptHub(activeApp, userDataDir, { preserveUserDataDir: true });
    const relaunched = await launchPromptHub(null, launchOptions);
    activeApp = relaunched.app;
    page = relaunched.page;
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.api.mcp.getLibrary())).servers
            .length,
      )
      .toBe(0);
    const finalNative = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    expect(finalNative.keep).toEqual({ untouched: true });
    expect(finalNative.mcpServers[EXTERNAL_SERVER_NAME]).toBeUndefined();
  } finally {
    await closePromptHub(activeApp, userDataDir);
  }
});
