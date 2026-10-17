import { expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

test("returns to the searched MCP catalog and scroll position after real installation (#217)", async () => {
  test.setTimeout(90_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-217-market-"));
  const profile = path.join(root, "profile");
  const home = path.join(root, "home");
  fs.mkdirSync(home);
  let app: ElectronApplication | null = null;
  try {
    const launched = await launchPromptHub(null, {
      userDataDir: profile,
      env: { HOME: home, USERPROFILE: home },
    });
    app = launched.app;
    const { page } = launched;
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    // Only substitute the remote catalog. Installation and persistence use real IPC/SQLite.
    await app.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (_event, request: { url: string }) => {
        const url = new URL(request.url);
        const offset = url.searchParams.has("cursor") ? 48 : 0;
        return JSON.stringify({
          servers: Array.from({ length: 48 }, (_, index) => ({
            server: {
              name: `test.fixture/server-${offset + index}`,
              title: `Fixture Server ${offset + index}`,
              description: "Isolated registry fixture",
              packages: [
                {
                  registryType: "npm",
                  identifier: `fixture-server-${offset + index}`,
                  transport: { type: "stdio" },
                },
              ],
            },
          })),
          metadata: {
            count: 48,
            nextCursor: offset === 0 ? "second-page" : null,
          },
        });
      });
    }, IPC_CHANNELS.MCP_FETCH_REMOTE_CONTENT);
    await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
    await page
      .getByRole("dialog", { name: "New MCP" })
      .getByRole("button", { name: "Close" })
      .click();
    await page.getByRole("button", { name: "MCP Store", exact: true }).click();
    const registry = page.getByRole("button", {
      name: /^MCP Registry(?:\s|$)/,
    });
    await registry.click();
    const search = page.getByRole("textbox", { name: "Search MCP servers..." });
    await search.fill("fixture");
    await search.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "View detail: Fixture Server 47",
        exact: true,
      }),
    ).toBeAttached();
    await page.getByTestId("mcp-store-load-more").click();
    await expect(
      page.getByRole("button", {
        name: "View detail: Fixture Server 95",
        exact: true,
      }),
    ).toBeAttached();
    const scroll = page.getByTestId("mcp-store-scroll");
    await scroll.evaluate((element) => {
      element.scrollTop = 600;
    });
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    // Lazy card layout can adjust scrolling before installation finishes. Capture
    // the last position before departure, not an intermediate animation frame.
    const observedPosition = await scroll.evaluateHandle((element) => {
      const position = { scrollTop: element.scrollTop };
      element.addEventListener("scroll", () => {
        position.scrollTop = element.scrollTop;
      });
      return position;
    });
    const visibleItem = page.getByRole("button", {
      name: "View detail: Fixture Server 24",
      exact: true,
    });
    await visibleItem.click();
    const detail = page.getByRole("dialog", { name: "Fixture Server 24" });
    await detail
      .getByTestId("mcp-market-install-footer")
      .getByRole("button", { name: "Install", exact: true })
      .click();
    await expect(scroll).not.toBeAttached();
    const { scrollTop: position } = await observedPosition.jsonValue();
    await observedPosition.dispose();
    expect(position).toBeGreaterThan(0);
    const library = await page.evaluate(() => window.api.mcp.getLibrary());
    expect(library.servers).toHaveLength(1);
    expect(library.servers[0].name).toBe("test-fixture-server-24");
    expect(library.servers[0].id).toMatch(/^mcp_[a-z0-9]+$/);
    expect(library.servers[0].source.id).toBe(
      "modelcontextprotocol:test-fixture-server-24",
    );
    await page.getByPlaceholder("Search MCP...").fill("library-only query");
    await registry.click();
    await expect.soft(search).toHaveValue("fixture");
    await expect
      .soft(
        page.getByRole("button", {
          name: "View detail: Fixture Server 95",
          exact: true,
        }),
      )
      .toBeAttached();
    await expect.soft
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(position);
    await expect(visibleItem).toBeInViewport();
    await expect.soft(scroll).not.toHaveClass(/scrollbar-hide/);
    await search.fill("different");
    await search.press("Enter");
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(0);
  } finally {
    if (app) await closePromptHub(app, profile);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
