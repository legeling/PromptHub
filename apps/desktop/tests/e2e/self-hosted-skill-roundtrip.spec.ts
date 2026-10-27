import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";
import { startSelfHostedTestServer } from "./helpers/self-hosted-web";

async function openBackupSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Data & Sync", exact: true }).click();
  await page.getByRole("button", { name: /Self-Hosted PromptHub/ }).click();
}

test("restores a local Skill package and history repeatedly through a live server (#185)", async () => {
  test.setTimeout(120_000);
  const userDataDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-skill-sync-e2e-")),
  );
  const source = path.join(userDataDir, "local-source");
  fs.mkdirSync(path.join(source, "assets"), { recursive: true });
  const content =
    "---\nname: sync-roundtrip\ndescription: Local source roundtrip\n---\n# Skill\n";
  const binary = Buffer.from([0, 255, 128, 17]);
  fs.writeFileSync(path.join(source, "SKILL.md"), content);
  fs.writeFileSync(path.join(source, "assets/sample.bin"), binary);
  let server: Awaited<ReturnType<typeof startSelfHostedTestServer>> | undefined;
  let active: Awaited<ReturnType<typeof launchPromptHub>> | undefined;
  try {
    server = await startSelfHostedTestServer();
    active = await launchPromptHub(null, { userDataDir });
    let { page } = active;
    page.on("console", (message) => {
      if (message.type() === "error") console.error(message.text());
    });
    await setAppSettings(page, {
      language: "en",
      autoCheckUpdate: false,
      syncProvider: "self-hosted",
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: server.baseUrl,
      selfHostedSyncUsername: server.username,
      selfHostedSyncPassword: server.password,
    });
    const installed = await page.evaluate(
      async ({ source, content }) => {
        const result = await window.api.skill.runPackageOperation({
          operation: "install",
          content,
          source: { kind: "local-directory", directory: source },
          registrySkill: {
            slug: "sync-roundtrip",
            name: "sync-roundtrip",
            description: "Local source roundtrip",
            category: "general",
            author: "Fixture",
            source_id: "sync-local-fixture",
            source_url: source,
            tags: [],
            version: "1.0.0",
            content,
          },
        });
        if (result.status !== "completed")
          throw new Error(JSON.stringify(result));
        await window.api.skill.update(result.skill.id, {
          versionTrackingEnabled: true,
        });
        await window.api.skill.writeLocalFile(
          result.skill.id,
          "notes.txt",
          "Second version companion\n",
        );
        await window.api.skill.versionCreate(
          result.skill.id,
          "Roundtrip version",
        );
        return {
          id: result.skill.id,
          files: await window.api.skill.readFilesSnapshot(result.skill.id),
          versions: await window.api.skill.versionGetAll(result.skill.id),
        };
      },
      { source, content },
    );
    expect(
      installed.files.some((file) => file.relativePath === "assets/sample.bin"),
    ).toBe(true);
    expect(installed.versions.length).toBeGreaterThan(1);
    await openBackupSettings(page);
    await page
      .getByRole("button", { name: "Test Connection", exact: true })
      .click();
    await expect(page.getByText(/Backup endpoint ready/i)).toBeVisible();
    const uploaded = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith("/api/backups/desktop/workspace/manifest.json") &&
        response.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Create remote backup", exact: true })
      .click();
    const uploadResponse = await uploaded;
    expect(uploadResponse.status(), await uploadResponse.text()).toBe(200);
    await expect(
      page.getByText(/Created a remote backup with.*1 skills/i),
    ).toBeVisible();
    await page.evaluate((id) => window.api.skill.delete(id), installed.id);
    expect(await page.evaluate(() => window.api.skill.getAll())).toHaveLength(
      0,
    );
    const restorePasses = 3;
    for (let pass = 0; pass < restorePasses; pass += 1) {
      await page
        .getByRole("button", { name: "Restore latest backup", exact: true })
        .click();
      await expect(page.getByText(/Restored.*1 skills/i)).toBeVisible();
      await closePromptHub(active.app, userDataDir, {
        preserveUserDataDir: true,
      });
      active = await launchPromptHub(null, { userDataDir });
      page = active.page;
      const restored = await page.evaluate(async () => {
        const skills = await window.api.skill.getAll();
        if (skills.length !== 1)
          throw new Error(`Expected one restored Skill, got ${skills.length}`);
        return {
          name: skills[0].name,
          files: await window.api.skill.readFilesSnapshot(skills[0].id),
          versions: await window.api.skill.versionGetAll(skills[0].id),
        };
      });
      expect(restored.name).toBe("sync-roundtrip");
      expect(restored.files).toEqual(installed.files);
      expect(
        restored.versions.map(({ version, filesSnapshot }) => ({
          version,
          filesSnapshot,
        })),
      ).toEqual(
        installed.versions.map(({ version, filesSnapshot }) => ({
          version,
          filesSnapshot,
        })),
      );
      if (pass < restorePasses - 1) await openBackupSettings(page);
    }
  } finally {
    try {
      if (active) await closePromptHub(active.app, userDataDir);
      else fs.rmSync(userDataDir, { recursive: true, force: true });
    } finally {
      await server?.stop();
    }
  }
});
