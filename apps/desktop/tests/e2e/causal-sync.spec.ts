import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  launchPromptHub,
  closePromptHub,
  setAppSettings,
  isAppWindowVisible,
  type LaunchedElectronApp,
} from "./helpers/electron";

// The protocol server is controlled; Electron, startup, preload, SQL and UI are real.
test("startup sync reviews a nonempty baseline and retains the chosen library across two cold reopens", async () => {
  test.setTimeout(120000);
  const objects = new Map<string, { data: string; etag: string }>();
  const server = http.createServer((request, response) => {
    void (async () => {
      const key = request.url ?? "/",
        prior = objects.get(key);
      if (request.method === "PROPFIND") {
        response.writeHead(207).end();
        return;
      }
      if (request.method === "GET") {
        if (prior)
          response.writeHead(200, { ETag: prior.etag }).end(prior.data);
        else response.writeHead(404).end();
        return;
      }
      if (
        (request.headers["if-none-match"] === "*" && prior) ||
        (request.headers["if-match"] &&
          request.headers["if-match"] !== prior?.etag)
      ) {
        response.writeHead(412).end();
        return;
      }
      if (request.method === "DELETE") {
        objects.delete(key);
        response.writeHead(204).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const data = Buffer.concat(chunks).toString("utf8"),
        etag = `"${createHash("sha256").update(data).digest("hex")}"`;
      objects.set(key, { data, etag });
      response.writeHead(200, { ETag: etag }).end();
    })().catch(() => response.writeHead(500).end());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  const settings = {
    minimizeOnLaunch: false,
    language: "en",
    autoCheckUpdate: false,
    syncProvider: "webdav",
    webdavEnabled: true,
    webdavUrl: `http://127.0.0.1:${address.port}/dav`,
    webdavUsername: "fixture",
    webdavPassword: "fixture",
    webdavSyncOnStartup: true,
    webdavSyncOnStartupDelay: 0,
    webdavAutoSyncInterval: 0,
    webdavSyncOnSave: false,
  };
  let active: LaunchedElectronApp | undefined;
  const persistenceErrors: string[] = [];
  const roots = new Set<string>();
  try {
    active = await launchPromptHub("causal-sync.seed.json", { headed: true });
    active.page.on("console", (message) => {
      if (message.text().includes("Failed to persist canonical"))
        persistenceErrors.push(message.text());
    });
    roots.add(active.userDataDir);
    await expect.poll(() => isAppWindowVisible(active!.app)).toBe(true);
    const prompt = await active.page.evaluate(() =>
      window.api.prompt.create({
        title: "Remote sync acceptance",
        userPrompt: "Durable remote content",
      }),
    );
    await setAppSettings(active.page, settings);
    await expect
      .poll(() => [...objects.keys()].some((key) => key.endsWith("/head.json")))
      .toBe(true);
    await closePromptHub(active.app, active.userDataDir);
    active = undefined;

    active = await launchPromptHub("causal-sync.seed.json", { headed: true });
    roots.add(active.userDataDir);
    await expect.poll(() => isAppWindowVisible(active!.app)).toBe(true);
    const local = await active.page.evaluate(() =>
      window.api.prompt.create({
        title: "Local before adoption",
        userPrompt: "Preserve in recovery",
      }),
    );
    await setAppSettings(active.page, settings);
    const dialog = active.page.getByRole("dialog");
    await expect(dialog).toContainText("starting library");
    expect(
      await active.page.evaluate((id) => window.api.prompt.get(id), local.id),
    ).toMatchObject({ title: "Local before adoption" });
    await dialog
      .getByRole("button", { name: "Use remote library as baseline" })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      active.page.getByText("Remote sync acceptance", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      active.page.getByText("Local before adoption", { exact: true }),
    ).toHaveCount(0);
    const recovery = path.join(active.userDataDir, "recovery", "causal-sync");
    expect(fs.readdirSync(recovery).length).toBeGreaterThan(0);
    for (let reopen = 0; reopen < 2; reopen++) {
      const userDataDir = active.userDataDir;
      await closePromptHub(active.app, userDataDir, {
        preserveUserDataDir: true,
      });
      active = undefined;
      active = await launchPromptHub(null, { userDataDir, headed: true });
      await expect.poll(() => isAppWindowVisible(active!.app)).toBe(true);
      await expect(
        active.page
          .getByText("Remote sync acceptance", { exact: true })
          .first(),
      ).toBeVisible();
      expect(
        await active.page.evaluate(
          (id) => window.api.prompt.get(id),
          prompt.id,
        ),
      ).toMatchObject({ userPrompt: "Durable remote content" });
      expect(
        await active.page.evaluate((id) => window.api.prompt.get(id), local.id),
      ).toBeNull();
    }
  } catch (error) {
    if (active) {
      const state = await active.page.evaluate(async () => {
        const settings = await window.api.settings.get();
        return {
          history: settings.autoSyncHistory,
          visible: document.visibilityState,
          minimizeOnLaunch: settings.minimizeOnLaunch,
        };
      });
      const nativeWindows = await active.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => ({
          visible: window.isVisible(),
          minimized: window.isMinimized(),
          focused: window.isFocused(),
          ready: window.webContents.isLoading() === false,
        })),
      );
      await test.info().attach("sync-state", {
        body: JSON.stringify({
          ...state,
          nativeWindows,
          objects: [...objects.keys()],
        }),
        contentType: "application/json",
      });
      fs.writeFileSync(
        test.info().outputPath("sync-state.json"),
        JSON.stringify({
          ...state,
          nativeWindows,
          persistenceErrors,
          objects: [...objects.keys()],
        }),
      );
    }
    throw error;
  } finally {
    if (active) await closePromptHub(active.app, active.userDataDir);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
});
