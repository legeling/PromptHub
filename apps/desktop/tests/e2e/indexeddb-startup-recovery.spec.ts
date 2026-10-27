import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { LaunchedElectronApp } from "./helpers/electron";
import {
  launchPromptHub,
  closePromptHub,
  setAppSettings,
  captureAppPage,
} from "./helpers/electron";

async function seedLegacy(
  instance: LaunchedElectronApp,
  conflict: boolean,
): Promise<string> {
  await setAppSettings(instance.page, {
    language: "en",
    themeMode: conflict ? "dark" : "light",
  });
  return instance.page.evaluate(async (hasConflict) => {
    const current = await window.api.prompt.create({
      title: "Current SQLite prompt",
      userPrompt: "Keep current content",
    });
    const legacy = {
      ...current,
      id: hasConflict ? current.id : "legacy-idb",
      title: hasConflict ? current.title : "Historical IndexedDB prompt",
      userPrompt: "Historical browser content",
    };
    const versions = await window.api.version.getAll(current.id);
    const snapshot = {
      prompts: [legacy],
      folders: [],
      versions: [
        {
          ...versions[0],
          id: "legacy-idb-version",
          promptId: legacy.id,
          userPrompt: legacy.userPrompt,
        },
      ],
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("PromptHubDB", 1);
      request.onupgradeneeded = () => {
        for (const name of ["prompts", "folders", "versions"])
          request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ["prompts", "folders", "versions"],
          "readwrite",
        );
        for (const [name, records] of Object.entries(snapshot)) {
          for (const record of records)
            transaction.objectStore(name).put(record);
        }
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
    return current.id;
  }, conflict);
}

function requireMigration(root: string): void {
  // Frozen persisted v1 fixture format; avoid importing the live main/keyring runtime into Playwright.
  const filename = path.join(
    root,
    "data/operations/migrations/renderer-persistence-v1.json",
  );
  const marker = JSON.parse(fs.readFileSync(filename, "utf8"));
  marker.indexedDbMigrationDone = false;
  delete marker.indexedDbVerificationVersion;
  fs.writeFileSync(filename, JSON.stringify(marker));
}

for (const choice of ["automatic", "database", "indexeddb"] as const) {
  test(`#247 upgrades, resolves ${choice} and survives real process restarts`, async ({}, info) => {
    test.setTimeout(120_000);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-idb-e2e-"));
    let instance: LaunchedElectronApp | undefined;
    const stop = async () => {
      if (instance) {
        await closePromptHub(instance.app, root, { preserveUserDataDir: true });
        instance = undefined;
      }
    };
    try {
      instance = await launchPromptHub(null, { userDataDir: root });
      const currentId = await seedLegacy(instance, choice !== "automatic");
      await stop();
      requireMigration(root);
      instance = await launchPromptHub(null, { userDataDir: root });
      const { page, app } = instance;
      if (choice !== "automatic") {
        await expect(page.locator("html")).toHaveClass(/dark/);
        await expect(
          page.getByRole("heading", { name: "Review historical Prompt data" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Review and apply", exact: true }),
        ).toBeDisabled();
        await captureAppPage(app, page, info.outputPath("conflict-review.png"));
        // Traverse every actual conflict; no direct resolver IPC is used for acceptance.
        const next = page.getByRole("button", { name: "Next", exact: true });
        for (;;) {
          await page
            .getByRole("radio", {
              name:
                choice === "database"
                  ? "Current database"
                  : "Historical browser data",
              exact: true,
            })
            .check();
          if (await next.isDisabled()) break;
          await next.click();
        }
        await page
          .getByRole("button", { name: "Review and apply", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Apply choices", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Recovery complete" }),
        ).toBeVisible();
        await captureAppPage(
          app,
          page,
          info.outputPath("recovery-complete.png"),
        );
        await page
          .getByRole("button", { name: "Restart PromptHub", exact: true })
          .click();
      }
      await expect(
        page.getByText("Current SQLite prompt", { exact: true }).first(),
      ).toBeVisible();
      if (choice === "automatic")
        await expect(
          page
            .getByText("Historical IndexedDB prompt", { exact: true })
            .first(),
        ).toBeVisible();
      const expected =
        choice === "indexeddb"
          ? "Historical browser content"
          : "Keep current content";
      expect(
        await page.evaluate(
          async (id) => (await window.api.prompt.get(id)).userPrompt,
          currentId,
        ),
      ).toBe(expected);
      await captureAppPage(app, page, info.outputPath("ready.png"));
      await stop();
      instance = await launchPromptHub(null, { userDataDir: root });
      expect(
        await instance.page.evaluate(
          async (id) => (await window.api.prompt.get(id)).userPrompt,
          currentId,
        ),
      ).toBe(expected);
      const deletedId = choice === "automatic" ? "legacy-idb" : currentId;
      await instance.page.evaluate(
        async (id) => window.api.prompt.delete(id),
        deletedId,
      );
      await stop();
      // Simulate a lost renderer marker after SQL commit: the SQL receipt must prevent resurrection.
      requireMigration(root);
      instance = await launchPromptHub(null, { userDataDir: root });
      await expect
        .poll(() =>
          instance!.page.evaluate(() =>
            window.api.settings.rendererPersistence.isIndexedDbMigrationDone(),
          ),
        )
        .toBe(true);
      expect(
        await instance.page.evaluate(
          async (id) => window.api.prompt.get(id),
          deletedId,
        ),
      ).toBeNull();
      expect(
        await instance.page.evaluate(async () =>
          (await indexedDB.databases()).some(
            (database) => database.name === "PromptHubDB",
          ),
        ),
      ).toBe(true);
    } finally {
      await stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
