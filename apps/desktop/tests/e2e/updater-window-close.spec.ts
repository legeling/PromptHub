import { expect, test } from "@playwright/test";
import {
  captureAppPage,
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppLanguage,
} from "./helpers/electron";

// Exercises the real app's window policy with Electron's update-quit event.
// The event is injected: signed payload download/replacement is a separate gate.
test("update quit closes the window even when ordinary close keeps the app in the tray", async () => {
  const { app, page, userDataDir } =
    await test.step("launch isolated app", () => launchPromptHub(null));
  try {
    await page.evaluate(() => {
      window.electron.setMinimizeToTray(true);
      window.electron.setCloseAction("minimize");
    });
    // A round trip on the same renderer confirms the settings messages arrived.
    await page.evaluate(() => window.electron.updater?.getVersion());

    const ordinaryClose =
      await test.step("ordinary close keeps window alive", () =>
        app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (!win) throw new Error("PromptHub window was not created");
          win.close();
          return { destroyed: win.isDestroyed(), visible: win.isVisible() };
        }));
    expect(ordinaryClose).toEqual({ destroyed: false, visible: false });

    await test.step("update quit destroys the real window", async () => {
      await app.evaluate(({ autoUpdater, BrowserWindow }) => {
        autoUpdater.emit("before-quit-for-update");
        const win = BrowserWindow.getAllWindows()[0];
        if (!win)
          throw new Error("Ordinary close unexpectedly destroyed the window");
        win.close();
      });
      await expect.poll(() => page.isClosed()).toBe(true);
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("an installation IPC failure remains visible after clicking Install Now", async ({}, testInfo) => {
  const { app, page, userDataDir } = await launchPromptHub(null);
  try {
    await setAppLanguage(page, "en");
    await sendAppCommand(app, { type: "updater:open" });
    await expect(page.getByRole("dialog")).toBeVisible();
    // Prepare downloaded metadata and a failed transport, not a fake installer.
    // The click, preload invocation, IPC rejection and error rendering are real.
    await app.evaluate(({ BrowserWindow, ipcMain }) => {
      ipcMain.removeHandler("updater:install");
      BrowserWindow.getAllWindows()[0].webContents.send("updater:status", {
        status: "downloaded",
        info: {
          version: "0.6.2",
          releaseNotes: "Installation regression fixture",
        },
      });
    });
    await page.getByRole("button", { name: "Install Now" }).click();
    await expect(
      page.getByText(/No handler registered for 'updater:install'/),
    ).toBeVisible();
    await captureAppPage(
      app,
      page,
      testInfo.outputPath("install-ipc-error.png"),
    );
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
