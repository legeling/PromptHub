import { expect, test, type Page } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

async function readCommand(page: Page): Promise<string | undefined> {
  return page.evaluate(
    async () => (await window.api.mcp.getLibrary()).servers[0].command,
  );
}

test("edits MCP JSON through real IPC, validates drafts, cancels, and keeps saved changes after reload", async () => {
  test.setTimeout(90_000);
  const { app, page, userDataDir } = await launchPromptHub(null);
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    await page.evaluate(() =>
      window.api.mcp.createServer({
        name: "json-fixture",
        displayName: "JSON Fixture",
        command: "original",
        env: { TOKEN: "fixture-secret", REMOVE: "remove" },
        envRefs: { HOME: "${HOME}" },
      }),
    );
    await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page
      .getByRole("button", { name: /JSON Fixture/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Copy JSON", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "MCP JSON configuration" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit JSON", exact: true }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(
      page
        .getByTestId("mcp-json-editor")
        .getByRole("button", { name: "mcp.json", exact: true }),
    ).toBeVisible();
    await page
      .getByTestId("mcp-json-editor")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    const editor = page.getByRole("textbox", {
      name: "MCP JSON configuration",
    });
    await expect(page.getByTestId("mcp-file-code-editor")).toHaveAttribute(
      "data-language",
      "json",
    );
    await expect(page.locator(".cm-lineNumbers")).toBeVisible();
    expect(await editor.innerText()).not.toContain("fixture-secret");
    await editor.fill("{");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid JSON");
    expect(await readCommand(page)).toBe("original");
    await editor.fill(
      JSON.stringify({
        mcpServers: {
          "json-fixture": {
            command: "updated",
            env: { TOKEN: "[REDACTED]", ADD: "new-value", HOME: "${HOME}" },
          },
        },
      }),
    );
    await page
      .getByRole("button", { name: "Format JSON", exact: true })
      .click();
    expect(await editor.innerText()).toContain('\n  "mcpServers"');
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(editor).toContainText("updated");
    await editor.press("Control+s");
    await expect(editor).toHaveAttribute("contenteditable", "false");
    expect(await readCommand(page)).toBe("updated");
    const stored = await page.evaluate(async () => {
      const server = (await window.api.mcp.getLibrary()).servers[0];
      const history = await window.api.mcp.listVersions(server.id);
      return { server, history };
    });
    expect(stored.server.env).toEqual({
      TOKEN: "[REDACTED]",
      ADD: "[REDACTED]",
    });
    expect(stored.server.envRefs).toEqual({ HOME: "${HOME}" });
    expect(stored.history.currentVersion).toBe(2);
    await page
      .getByTestId("mcp-json-editor")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await editor.fill("discard this draft");
    await page
      .getByTestId("mcp-json-editor")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page
      .getByTestId("mcp-json-editor")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    expect(await editor.innerText()).toContain("updated");
    await page
      .getByTestId("mcp-json-editor")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].showInactive();
    });
    await page.getByTestId("mcp-json-editor").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath("mcp-json-editor.png"),
    });
    await page
      .getByTestId("mcp-json-editor")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.setViewportSize({ width: 900, height: 850 });
    await editor.scrollIntoViewIfNeeded();
    await expect(editor).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("mcp-json-edit-dark.png"),
    });
    await page.reload();
    expect(await readCommand(page)).toBe("updated");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
