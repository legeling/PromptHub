import { createS3Fixture } from "./helpers/s3-fixture";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, type ElectronApplication } from "@playwright/test";
import {
  launchPromptHub,
  closePromptHub,
  setAppSettings,
  captureAppPage,
} from "./helpers/electron";
import { createWebDAVFixture } from "./helpers/webdav-fixture";
import { startSelfHostedTestServer } from "./helpers/self-hosted-web";

for (const provider of ["webdav", "self-hosted", "s3"] as const) {
  test(`restores a full ${provider} backup through Settings and preserves files across restart`, async ({}, testInfo) => {
    test.setTimeout(150_000);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-remote-ui-"));
    const profile = path.join(root, "profile");
    const remote = provider === "webdav" ? await createWebDAVFixture() : null;
    const server =
      provider === "self-hosted" ? await startSelfHostedTestServer() : null;
    const s3 = provider === "s3" ? await createS3Fixture() : null;
    let app: ElectronApplication | null = null;
    try {
      let launched = await launchPromptHub(null, { userDataDir: profile });
      app = launched.app;
      await setAppSettings(launched.page, {
        language: "en",
        autoCheckUpdate: false,
        minimizeOnLaunch: false,
        syncProvider: provider,
        s3StorageEnabled: provider === "s3",
        s3Endpoint: s3?.endpoint ?? "",
        s3Region: "us-east-1",
        s3Bucket: "fixture",
        s3AccessKeyId: "fixture-key",
        s3SecretAccessKey: "fixture-secret",
        s3SyncOnStartup: false,
        webdavEnabled: provider === "webdav",
        webdavUrl: remote?.url ?? "",
        webdavUsername: "fixture",
        webdavPassword: "fixture",
        webdavSyncOnStartup: false,
        webdavAutoSync: false,
        selfHostedSyncEnabled: provider === "self-hosted",
        selfHostedSyncUrl: server?.baseUrl ?? "",
        selfHostedSyncUsername: server?.username ?? "",
        selfHostedSyncPassword: server?.password ?? "",
        selfHostedSyncOnStartup: false,
      });
      const prompt = await launched.page.evaluate(() =>
        window.api.prompt.create({
          title: "Remote UI fixture",
          promptType: "text",
          userPrompt: "Original full snapshot",
        }),
      );
      const file = path.join(profile, "data/future-feature/nested.bin");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from([0, 255, 42]));
      await launched.page
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await launched.page
        .getByRole("button", { name: "Data & Sync", exact: true })
        .click();
      await launched.page
        .getByRole("button", {
          name:
            provider === "webdav"
              ? /^WebDAV/
              : provider === "s3"
                ? /^S3 Compatible Storage/
                : /Self-Hosted PromptHub/,
          exact: true,
        })
        .click();
      await launched.page
        .getByRole("button", { name: "Create remote backup", exact: true })
        .click();
      await expect(
        launched.page
          .getByText(
            provider !== "self-hosted"
              ? /Upload successful|Uploaded successfully|Backup uploaded/i
              : /Created a remote backup with 1 prompts/i,
          )
          .first(),
      ).toBeVisible();
      await launched.page.evaluate(
        (id) =>
          window.api.prompt.update(id, {
            userPrompt: "Changed after remote backup",
          }),
        prompt.id,
      );
      fs.writeFileSync(file, "changed");
      await launched.page
        .getByRole("button", { name: "Restore latest backup", exact: true })
        .click();
      await expect(
        launched.page.getByText(
          provider !== "self-hosted"
            ? /Data imported successfully/i
            : /Restored 1 prompts/i,
        ),
      ).toBeVisible();
      await captureAppPage(
        app,
        launched.page,
        testInfo.outputPath("restore-result.png"),
      );
      await closePromptHub(app, profile, { preserveUserDataDir: true });
      app = null;
      launched = await launchPromptHub(null, { userDataDir: profile });
      app = launched.app;
      expect(
        await launched.page.evaluate(
          async (id) =>
            (await window.api.prompt.getAll()).find((p) => p.id === id)
              ?.userPrompt,
          prompt.id,
        ),
      ).toBe("Original full snapshot");
      expect(fs.readFileSync(file)).toEqual(Buffer.from([0, 255, 42]));
      await expect(
        launched.page.getByText("Remote UI fixture", { exact: true }).first(),
      ).toBeVisible();
      await captureAppPage(
        app,
        launched.page,
        testInfo.outputPath("reopened.png"),
      );
    } finally {
      if (app) await closePromptHub(app, profile);
      await remote?.close();
      await s3?.close();
      await server?.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
