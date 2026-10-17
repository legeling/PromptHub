import { expect, test } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

test("creates a personal MCP, retains failed edits, retries, preserves arguments and deletes", async () => {
  test.setTimeout(90_000);
  const { app, page, userDataDir } = await launchPromptHub(null);
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
    const create = page.getByRole("dialog", { name: "New MCP" });
    await create.getByRole("button", { name: /Manual setup/ }).click();
    await create.getByLabel("Name", { exact: true }).fill("personal");
    await create.getByLabel("Command", { exact: true }).fill("node");
    await create.getByLabel("Args", { exact: true }).fill("server.js\n--flag");
    await create.getByRole("button", { name: "Save", exact: true }).click();
    await expect(create).not.toBeVisible();
    const id = await page.evaluate(
      async () => (await window.api.mcp.getLibrary()).servers[0].id,
    );
    // An unrelated existing server supplies a real duplicate-name refusal.
    await page.evaluate(() =>
      window.api.mcp.createServer({ name: "occupied", command: "node" }),
    );
    await page.getByTestId(`mcp-server-card-${id}`).click();
    await page.getByRole("button", { name: "Edit MCP", exact: true }).click();
    const form = page.getByTestId("mcp-server-form");
    await form.getByLabel("Name", { exact: true }).fill("occupied");
    await form.getByLabel("Display Name").fill("Retained draft");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText(/MCP server name already exists/).last(),
    ).toBeVisible();
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Display Name")).toHaveValue("Retained draft");
    expect(
      await page.evaluate(
        async (serverId) =>
          (await window.api.mcp.getLibrary()).servers.find(
            (s) => s.id === serverId,
          )?.name,
        id,
      ),
    ).toBe("personal");
    await form.getByLabel("Name", { exact: true }).fill("personal");
    await form.getByLabel("Args", { exact: true }).fill(" padded \n\nend");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.reload();
    await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
    await page
      .getByRole("dialog", { name: "New MCP" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByTestId(`mcp-server-card-${id}`).click();
    await page.getByRole("button", { name: "Edit MCP", exact: true }).click();
    await expect(form.getByLabel("Display Name")).toHaveValue("Retained draft");
    await expect(form.getByLabel("Args", { exact: true })).toHaveValue(
      " padded \n\nend",
    );
    await form.getByRole("button", { name: "Close", exact: true }).click();
    expect(
      await page.evaluate(
        async (serverId) =>
          (await window.api.mcp.getLibrary()).servers.find(
            (s) => s.id === serverId,
          )?.args,
        id,
      ),
    ).toEqual([" padded ", "", "end"]);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByTestId(`mcp-server-card-${id}`)).not.toBeVisible();
    await page.reload();
    expect(
      (await page.evaluate(() => window.api.mcp.getLibrary())).servers.map(
        (s) => s.name,
      ),
    ).toEqual(["occupied"]);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
