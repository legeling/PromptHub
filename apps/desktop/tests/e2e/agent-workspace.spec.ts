import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "fs";
import { createServer } from "http";
import os from "os";
import path from "path";
import { once } from "events";
import { parse as parseJsonc } from "jsonc-parser";

import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppLanguage,
} from "./helpers/electron";

async function selectAgent(page: Page, name: string): Promise<void> {
  const search = page.getByPlaceholder("Search Agents");
  await search.fill(name);
  const agent = page.getByRole("button", { name, exact: true });
  await expect(agent).toBeVisible();
  await agent.click();
  await search.fill("");
}

async function chooseAllProviderValues(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  const groups = dialog.locator("fieldset");
  await expect(groups.first()).toBeVisible();
  const count = await groups.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const choices = groups.nth(index).getByRole("radio");
    await expect(choices).toHaveCount(2);
    const choice = choices.nth(1);
    await expect(choice).toHaveAccessibleName(/Use provider value/);
    await choice.check();
    await expect(choice).toBeChecked();
  }
}

test.describe("E2E: Agent workspace", () => {
  test("shows the installed Agent registry in one capability-aware shell", async ({}, testInfo) => {
    let receivedProviderAuthorization = "";
    let receivedProviderModelBody = "";
    const providerServer = createServer((request, response) => {
      receivedProviderAuthorization = String(
        request.headers.authorization ?? "",
      );
      if (request.method === "POST" && request.url === "/v1/responses") {
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          receivedProviderModelBody += chunk;
        });
        request.on("end", () => {
          response.writeHead(200, { "content-type": "text/event-stream" });
          response.write(
            'data: {"type":"response.output_text.delta","delta":"OK"}\n\n',
          );
          response.end(
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":8,"output_tokens":1}}}\n\ndata: [DONE]\n\n',
          );
        });
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "gpt-5.4" }] }));
    });
    providerServer.listen(0, "127.0.0.1");
    await once(providerServer, "listening");
    const providerAddress = providerServer.address();
    if (!providerAddress || typeof providerAddress === "string") {
      throw new Error("Expected a TCP provider test server");
    }
    const providerEndpoint = `http://127.0.0.1:${providerAddress.port}/v1`;
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-agent-e2e-"),
    );
    const homeDir = path.join(userDataDir, "home");
    fs.mkdirSync(path.join(homeDir, ".cline"), { recursive: true });
    const claudeDir = path.join(homeDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ language: "en", model: "claude-sonnet" }, null, 2),
      "utf8",
    );
    const claudeProjectDir = path.join(
      claudeDir,
      "projects",
      "isolated-project",
    );
    fs.mkdirSync(claudeProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeProjectDir, "session-1.jsonl"),
      [
        JSON.stringify({
          type: "user",
          timestamp: "2026-07-15T10:00:00.000Z",
          message: {
            role: "user",
            content: "Review the isolated Agent session",
          },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-07-15T10:01:00.000Z",
          message: {
            role: "assistant",
            content: "The isolated session is readable.",
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const kimiDir = path.join(homeDir, ".kimi-code");
    const kimiSessionId = "session_e2e_kimi_1";
    const kimiSessionDir = path.join(
      kimiDir,
      "sessions",
      "wd_isolated-project",
      kimiSessionId,
    );
    fs.mkdirSync(path.join(kimiSessionDir, "agents", "main"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(kimiDir, "config.toml"),
      [
        'default_model = "kimi-code/kimi-for-coding"',
        "",
        '[models."kimi-code/kimi-for-coding"]',
        'provider = "managed:kimi-code"',
        'model = "kimi-for-coding"',
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(kimiDir, "session_index.jsonl"),
      `${JSON.stringify({
        sessionId: kimiSessionId,
        sessionDir: kimiSessionDir,
        workDir: path.join(homeDir, "isolated-project"),
      })}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(kimiSessionDir, "state.json"),
      JSON.stringify({
        title: "Review isolated Kimi session",
        createdAt: "2026-07-17T08:00:00.000Z",
        updatedAt: "2026-07-17T08:01:00.000Z",
        workDir: path.join(homeDir, "isolated-project"),
        lastPrompt: "Inspect the Kimi session adapter",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(kimiSessionDir, "agents", "main", "wire.jsonl"),
      [
        JSON.stringify({
          type: "metadata",
          protocol_version: "1.1",
          created_at: 1784275200000,
        }),
        JSON.stringify({
          type: "turn.prompt",
          input: [{ type: "text", text: "Inspect the Kimi session adapter" }],
          origin: { kind: "user" },
          time: 1784275201000,
        }),
        JSON.stringify({
          type: "context.append_loop_event",
          event: {
            type: "content.part",
            part: { type: "text", text: "The Kimi transcript is isolated." },
          },
          time: 1784275202000,
        }),
      ].join("\n"),
      "utf8",
    );

    const qwenDir = path.join(homeDir, ".qwen");
    const qwenSettingsPath = path.join(qwenDir, "settings.json");
    const qwenEnvPath = path.join(qwenDir, ".env");
    fs.mkdirSync(qwenDir, { recursive: true });
    fs.writeFileSync(
      qwenSettingsPath,
      JSON.stringify({ $version: 4, language: "en" }, null, 2),
      "utf8",
    );
    fs.writeFileSync(qwenEnvPath, "UNRELATED_QWEN_SETTING=preserved\n", "utf8");
    fs.mkdirSync(path.join(qwenDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(qwenDir, "commands", "review"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(qwenDir, "agents", "reviewer.md"),
      [
        "---",
        "name: reviewer",
        "description: Reviews isolated changes",
        "model: qwen3-coder",
        "---",
        "PRIVATE_QWEN_DEFINITION_BODY",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(qwenDir, "commands", "review", "frontend.md"),
      [
        "---",
        "description: Review the frontend",
        "---",
        "PRIVATE_QWEN_COMMAND_BODY",
      ].join("\n"),
      "utf8",
    );

    const openCodeDir = path.join(homeDir, ".config", "opencode");
    const openCodeConfigPath = path.join(openCodeDir, "opencode.jsonc");
    const xdgDataHome = path.join(homeDir, ".local", "share");
    const openCodeAuthPath = path.join(xdgDataHome, "opencode", "auth.json");
    fs.mkdirSync(openCodeDir, { recursive: true });
    fs.mkdirSync(path.dirname(openCodeAuthPath), { recursive: true });
    fs.writeFileSync(
      openCodeConfigPath,
      `{
        // preserve native OpenCode settings
        "share": "disabled",
        "model": "native/original",
        "provider": {
          "native": { "npm": "@ai-sdk/native" }
        }
      }\n`,
      "utf8",
    );
    fs.writeFileSync(
      openCodeAuthPath,
      JSON.stringify(
        {
          native: {
            type: "oauth",
            refresh: "native-refresh-preserved",
            access: "native-access-preserved",
            expires: 9_999_999_999,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const codexPetDir = path.join(homeDir, ".codex", "pets", "orbit");
    fs.mkdirSync(codexPetDir, { recursive: true });
    fs.writeFileSync(
      path.join(codexPetDir, "pet.json"),
      JSON.stringify({
        id: "orbit",
        displayName: "Orbit",
        description: "A local Codex Pet managed from the shared Agent UI.",
        spritesheetPath: "spritesheet.png",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(codexPetDir, "spritesheet.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const codexConfigPath = path.join(homeDir, ".codex", "config.toml");
    const initialCodexConfig = [
      'model_provider = "legacy_gateway"',
      'model = "gpt-5.3-codex"',
      "",
      "[model_providers.legacy_gateway]",
      'name = "Legacy Gateway"',
      'base_url = "https://legacy.example.com/v1"',
      'wire_api = "responses"',
      'experimental_bearer_token = "legacy-e2e-secret"',
      "",
      "[profiles.legacy_gateway]",
      'model = "gpt-5.3-codex"',
      'model_provider = "legacy_gateway"',
      "",
    ].join("\n");
    fs.writeFileSync(codexConfigPath, initialCodexConfig, "utf8");
    const themeDir = path.join(userDataDir, "fixtures", "themes", "codex");
    fs.mkdirSync(themeDir, { recursive: true });
    const midnightThemeDir = path.join(themeDir, "midnight");
    fs.mkdirSync(midnightThemeDir, { recursive: true });
    fs.writeFileSync(
      path.join(midnightThemeDir, "theme.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "midnight",
        name: "Midnight",
        image: "background.png",
        appearance: "dark",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(midnightThemeDir, "background.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    const { app, page } = await launchPromptHub(null, {
      userDataDir,
      env: {
        HOME: homeDir,
        USERPROFILE: homeDir,
        XDG_DATA_HOME: xdgDataHome,
      },
    });

    try {
      await setAppLanguage(page, "en");
      await page.setViewportSize({ width: 1440, height: 900 });
      await sendAppCommand(app, { type: "agent:manage" });

      const supportedPlatforms = await page.evaluate(() =>
        window.api.skill.getSupportedPlatforms(),
      );
      await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
      const installedCount = page.getByText(/^\d+ available$/);
      await expect(installedCount).toBeVisible();
      const installedCountText = await installedCount.textContent();
      const installedTotal = Number(installedCountText?.match(/^\d+/)?.[0]);
      expect(installedTotal).toBeGreaterThan(0);
      expect(installedTotal).toBeLessThanOrEqual(supportedPlatforms.length);

      await selectAgent(page, "Cline");
      await expect(page.getByRole("heading", { name: "Cline" })).toBeVisible();

      await selectAgent(page, "Claude Code");
      await expect(
        page.getByRole("heading", { name: "Claude Code" }),
      ).toBeVisible();

      await expect(
        page.getByRole("tab", { name: "Provider & Model" }),
      ).toBeEnabled();
      await expect(page.getByRole("tab", { name: "Usage" })).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-overview.png"),
        animations: "disabled",
      });
      await expect(page.getByRole("tab", { name: "Assets" })).toHaveCount(0);
      await page.getByRole("tab", { name: "Skills" }).click();
      await expect(
        page.getByRole("button", { name: "Add Skill" }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-skills.png"),
        animations: "disabled",
      });
      await page.getByRole("tab", { name: "MCP" }).click();
      await expect(page.getByRole("button", { name: "Add MCP" })).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Search assets" }),
      ).toBeVisible();
      await expect(page.getByRole("tab", { name: "Rules" })).toBeEnabled();
      await expect(page.getByRole("tab", { name: "Plugins" })).toBeEnabled();
      await page.getByRole("tab", { name: "Provider & Model" }).click();
      await expect(
        page.getByRole("navigation", { name: "Providers" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Import current configuration" }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Default model")).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-provider.png"),
        animations: "disabled",
      });

      await page.getByRole("tab", { name: "Sessions" }).click();
      await expect(
        page.getByText("Review the isolated Agent session").first(),
      ).toBeVisible();
      await expect(
        page.getByText("The isolated session is readable."),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-sessions.png"),
        animations: "disabled",
      });

      await selectAgent(page, "Codex");
      await expect(page.getByRole("tab", { name: "Appearance" })).toBeEnabled();
      await page.getByRole("tab", { name: "Appearance" }).click();
      await expect(
        page.getByRole("heading", { name: "Codex appearance" }),
      ).toBeVisible();
      await app.evaluate(({ dialog }, folder) => {
        Reflect.set(dialog, "showOpenDialog", async () => ({
          canceled: false,
          filePaths: [folder],
        }));
      }, midnightThemeDir);
      await page
        .getByRole("button", { name: "Import skin", exact: true })
        .click();
      await expect(page.getByText("Midnight")).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-appearance.png"),
        animations: "disabled",
      });
      await page.getByRole("button", { name: /^Pets/ }).click();
      await expect(page.getByText("Orbit")).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-appearance-pets.png"),
        animations: "disabled",
      });

      await page.getByRole("tab", { name: "Provider & Model" }).click();
      await expect(page.getByText("1 providers can be migrated")).toBeVisible();
      await page.getByRole("button", { name: "Review migration" }).click();
      const migration = page.getByRole("dialog", {
        name: "Migrate provider credentials",
      });
      await expect(
        migration.getByRole("button", { name: "Migrate selected (0)" }),
      ).toBeDisabled();
      await migration.getByRole("checkbox", { name: /Legacy Gateway/ }).check();
      await migration
        .getByRole("button", { name: "Migrate selected (1)" })
        .click();
      await expect(migration).toHaveCount(0);
      expect(fs.readFileSync(codexConfigPath, "utf8")).toBe(initialCodexConfig);
      await expect(page.getByText("legacy-e2e-secret")).toHaveCount(0);
      await expect(
        page.getByText("Configured auth token", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Legacy Gateway gpt-5.3-codex",
          exact: true,
        })
        .click();
      await expect(page.getByText("Credential available")).toBeVisible();

      await page.getByRole("button", { name: "Add custom provider" }).click();
      const codexProfile = page.getByRole("region", {
        name: "Add provider",
      });
      await codexProfile.getByLabel("Name").fill("E2E gateway");
      await codexProfile.getByLabel("Provider kind").fill("openai-compatible");
      await codexProfile.getByLabel("Provider ID").fill("e2e-gateway");
      await codexProfile.getByLabel("Endpoint").fill(providerEndpoint);
      await codexProfile.getByLabel("Primary model").fill("gpt-5.4");
      await codexProfile
        .getByLabel("Credential (write-only)")
        .fill("e2e-secret-token");
      await codexProfile.getByRole("button", { name: "Save provider" }).click();
      await expect(page.getByText("Credential available")).toBeVisible();
      await expect(page.getByText("e2e-secret-token")).toHaveCount(0);
      await page.getByRole("button", { name: "Test connection" }).click();
      await expect(page.getByText("Connection successful")).toBeVisible();
      expect(receivedProviderAuthorization).toBe("Bearer e2e-secret-token");
      await expect(page.locator("body")).not.toContainText("e2e-secret-token");
      await page.getByRole("button", { name: "Test model" }).click();
      const modelTestConfirmation = page.getByRole("alertdialog", {
        name: "Run model test?",
      });
      await expect(modelTestConfirmation).toContainText(
        "may consume provider quota",
      );
      await modelTestConfirmation
        .getByRole("button", { name: "Run test" })
        .click();
      await expect(page.getByText("Model responded")).toBeVisible();
      await expect(page.getByText("Response preview")).toBeVisible();
      expect(JSON.parse(receivedProviderModelBody)).toMatchObject({
        model: "gpt-5.4",
        stream: true,
      });
      await expect(page.locator("body")).not.toContainText("e2e-secret-token");
      await page.getByRole("switch", { name: "Activate E2E gateway" }).click();
      const activation = page.getByRole("dialog", {
        name: "Review provider activation",
      });
      await chooseAllProviderValues(activation);
      await activation
        .getByRole("button", { name: "Activate provider" })
        .click();
      await expect(activation.getByText("Activation verified")).toBeVisible();
      await expect
        .poll(() => fs.readFileSync(codexConfigPath, "utf8"))
        .toContain('model_provider = "e2e-gateway"');
      await expect(page.locator("body")).not.toContainText("e2e-secret-token");
      await activation
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();

      await selectAgent(page, "Kimi Code");
      await expect(
        page.getByRole("heading", { name: "Kimi Code" }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Provider & Model" }),
      ).toBeDisabled();
      await page.getByRole("tab", { name: "Sessions" }).click();
      await expect(
        page.getByText("Review isolated Kimi session").first(),
      ).toBeVisible();
      await expect(
        page.getByText("The Kimi transcript is isolated."),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-kimi.png"),
        animations: "disabled",
      });

      await selectAgent(page, "Qwen Code");
      await expect(
        page.getByRole("heading", { name: "Qwen Code" }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Definitions" }).click();
      await expect(page.getByText("reviewer").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "PRIVATE_QWEN_DEFINITION_BODY",
      );
      await page.getByRole("button", { name: "Commands" }).click();
      await expect(page.getByText("review:frontend").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "PRIVATE_QWEN_COMMAND_BODY",
      );
      await expect(
        page.getByRole("tab", { name: "Provider & Model" }),
      ).toBeDisabled();
      expect(
        JSON.parse(fs.readFileSync(qwenSettingsPath, "utf8")),
      ).toMatchObject({ language: "en" });
      expect(fs.readFileSync(qwenEnvPath, "utf8")).toContain(
        "UNRELATED_QWEN_SETTING=preserved",
      );

      await selectAgent(page, "OpenCode");
      await expect(
        page.getByRole("heading", { name: "OpenCode" }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Provider & Model" }).click();
      await page.getByRole("button", { name: "Add custom provider" }).click();
      const openCodeProfile = page.getByRole("region", {
        name: "Add provider",
      });
      await openCodeProfile
        .getByRole("textbox", { name: "Name" })
        .fill("OpenCode E2E gateway");
      await openCodeProfile.getByLabel("Provider ID").fill("team-opencode");
      await openCodeProfile.getByLabel("Endpoint").fill(providerEndpoint);
      await openCodeProfile.getByLabel("Primary model").fill("gpt-5.4");
      await openCodeProfile
        .getByLabel("Secondary model (optional)")
        .fill("gpt-5.4-mini");
      await openCodeProfile
        .getByLabel("Credential (write-only)")
        .fill("opencode-e2e-secret");
      await openCodeProfile
        .getByRole("button", { name: "Save provider" })
        .click();
      await expect(page.getByText("Credential available")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "opencode-e2e-secret",
      );
      await page
        .getByRole("switch", { name: "Activate OpenCode E2E gateway" })
        .click();
      const openCodeActivation = page.getByRole("dialog", {
        name: "Review provider activation",
      });
      await chooseAllProviderValues(openCodeActivation);
      await openCodeActivation
        .getByRole("button", { name: "Activate provider" })
        .click();
      await expect(
        openCodeActivation.getByText("Activation verified"),
      ).toBeVisible();
      await expect
        .poll(() => parseJsonc(fs.readFileSync(openCodeConfigPath, "utf8")))
        .toMatchObject({
          share: "disabled",
          model: "team-opencode/gpt-5.4",
          small_model: "team-opencode/gpt-5.4-mini",
          provider: {
            native: { npm: "@ai-sdk/native" },
            "team-opencode": {
              npm: "@ai-sdk/openai-compatible",
              options: { baseURL: providerEndpoint },
              models: {
                "gpt-5.4": { name: "gpt-5.4" },
                "gpt-5.4-mini": { name: "gpt-5.4-mini" },
              },
            },
          },
        });
      await expect
        .poll(() => JSON.parse(fs.readFileSync(openCodeAuthPath, "utf8")))
        .toMatchObject({
          native: {
            type: "oauth",
            refresh: "native-refresh-preserved",
            access: "native-access-preserved",
          },
          "team-opencode": {
            type: "api",
            key: "opencode-e2e-secret",
          },
        });
      await expect(page.locator("body")).not.toContainText(
        "native-refresh-preserved",
      );
      await expect(page.locator("body")).not.toContainText(
        "opencode-e2e-secret",
      );
      await openCodeActivation
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();

      await selectAgent(page, "Claude Code");

      await expect(
        page.getByRole("tab", { name: "Config Files" }),
      ).toBeEnabled();
      await page.getByRole("tab", { name: "Config Files" }).click();
      await expect(
        page.getByRole("heading", { name: "Native config files" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "settings.json", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Open Agent folder" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Edit" }).click();
      await page
        .getByRole("textbox", { name: "Code editor" })
        .fill(
          JSON.stringify({ language: "en", model: "claude-haiku" }, null, 2),
        );
      await page.getByRole("button", { name: "Save" }).click();
      await expect
        .poll(() =>
          fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8"),
        )
        .toContain('"model": "claude-haiku"');
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-config-files.png"),
        animations: "disabled",
      });

      await page.screenshot({
        path: testInfo.outputPath("agent-workspace.png"),
        animations: "disabled",
      });

      await page.setViewportSize({ width: 920, height: 700 });
      await page
        .getByRole("tab", { name: "Config Files" })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("tablist", { name: "Agent workspace" }),
      ).toBeVisible();
      await expect(
        page.getByRole("tabpanel", { name: "Config Files" }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-workspace-narrow.png"),
        animations: "disabled",
      });
    } finally {
      await closePromptHub(app, userDataDir);
      await new Promise<void>((resolve) =>
        providerServer.close(() => resolve()),
      );
    }
  });
});
