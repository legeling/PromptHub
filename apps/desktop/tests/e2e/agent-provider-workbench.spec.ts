import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeCanonicalStorageAuthority } from "@prompthub/core/canonical-storage-authority";
import { writeRuntimeLayoutState } from "@prompthub/core/runtime-storage-context";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppLanguage,
} from "./helpers/electron";

async function selectAgent(page: Page, name: string): Promise<void> {
  const search = page.getByPlaceholder("Search Agents");
  await search.fill(name);
  await page.getByRole("button", { name, exact: true }).click();
  await search.fill("");
}

async function openClaudeProviderWorkbench(page: Page): Promise<void> {
  await selectAgent(page, "Claude Code");
  await page.getByRole("tab", { name: "Provider & Model" }).click();
  await expect(page.getByTestId("agent-provider-workbench")).toBeVisible();
}

async function createClaudeProvider(
  page: Page,
  input: {
    name: string;
    endpoint: string;
    primaryModel: string;
    sonnetModel?: string;
  },
): Promise<void> {
  await page
    .getByTestId("agent-provider-workbench-toolbar")
    .getByRole("button", { name: "Add custom provider" })
    .click();
  const editor = page.getByRole("region", { name: "Add provider" });
  await editor.getByLabel("Name").fill(input.name);
  await editor.getByLabel("Provider kind").fill("openai-compatible");
  await expect(editor.getByRole("button", { name: "Protocol" })).toContainText(
    "Anthropic Messages",
  );
  await editor.getByLabel("Endpoint (optional)").fill(input.endpoint);
  await editor.getByLabel("Primary model").fill(input.primaryModel);
  if (input.sonnetModel) {
    await editor.getByLabel("Sonnet model (optional)").fill(input.sonnetModel);
  }
  await editor.getByRole("button", { name: "Save provider" }).click();
  await expect(editor).toBeHidden();
}

async function listClaudeProviders(page: Page) {
  return page.evaluate(() =>
    window.api.agent.listProviderProfiles({ platformId: "claude" }),
  );
}

function readProviderResource(userDataDir: string, profileId: string) {
  return JSON.parse(
    fs.readFileSync(
      path.join(userDataDir, "data", "agents", profileId, "agent.json"),
      "utf8",
    ),
  );
}

test("uses one Provider workbench shell for Claude Code, Codex and Pi", async ({}, testInfo) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-provider-workbench-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const claudeDir = path.join(homeDir, ".claude");
  const codexDir = path.join(homeDir, ".codex");
  const piDir = path.join(homeDir, ".pi", "agent");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "settings.json"),
    JSON.stringify({ model: "claude-sonnet" }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(codexDir, "config.toml"),
    'model = "gpt-5.6-sol"\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(piDir, "settings.json"),
    JSON.stringify({ defaultProvider: "kimi-coding", defaultModel: "k3" }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(piDir, "models-store.json"),
    JSON.stringify({
      "kimi-coding": {
        models: [
          {
            id: "k3",
            name: "Kimi K3",
            api: "anthropic-messages",
            baseUrl: "https://api.kimi.com/coding",
          },
        ],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(piDir, "models.json"),
    JSON.stringify({
      providers: {
        foxcode: {
          baseUrl: "https://gateway.example.com/v1",
          api: "openai-responses",
          models: [
            {
              id: "gpt-work",
              name: "GPT Work",
              contextWindow: 256000,
              reasoning: true,
            },
          ],
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(piDir, "auth.json"),
    JSON.stringify({ foxcode: { type: "api_key", key: "pi-e2e-secret" } }),
    "utf8",
  );
  const configDir = path.join(userDataDir, "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "ai-models.json"),
    JSON.stringify({
      kind: "prompthub-ai-config",
      version: 1,
      updatedAt: "2026-08-11T00:00:00.000Z",
      providers: [
        {
          id: "deepseek-work",
          name: "DeepSeek Work",
          provider: "deepseek",
          apiProtocol: "openai",
          apiKey: "",
          apiUrl: "https://api.deepseek.com/v1",
        },
      ],
      models: [
        {
          id: "gpt-work",
          providerId: "deepseek-work",
          provider: "deepseek",
          apiProtocol: "openai",
          apiKey: "",
          apiUrl: "https://api.deepseek.com/v1",
          model: "gpt-5.6-sol",
          name: "GPT 5.6 Sol",
          type: "chat",
          isDefault: true,
        },
      ],
      modelRouteDefaults: {},
    }),
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

    await selectAgent(page, "Claude Code");
    await page.getByRole("tab", { name: "Provider & Model" }).click();
    const claudeShellClass = await page
      .getByTestId("agent-provider-workbench")
      .getAttribute("class");
    const claudeToolbarBox = await page
      .getByTestId("agent-provider-workbench-toolbar")
      .boundingBox();
    await expect(
      page.getByRole("button", { name: "Import current configuration" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByTestId("agent-provider-workbench-toolbar")
        .getByText("Import from PromptHub"),
    ).toBeVisible();
    const currentProviderSwitch = page
      .getByTestId("agent-provider-workbench-sidebar")
      .getByRole("switch");
    await expect(currentProviderSwitch).toHaveCount(1);
    await expect(currentProviderSwitch).toHaveAttribute("aria-checked", "true");
    await expect(currentProviderSwitch).toBeDisabled();
    const switchTrackBox = await currentProviderSwitch.boundingBox();
    const switchThumbBox = await currentProviderSwitch
      .getByTestId("provider-activation-switch-thumb")
      .boundingBox();
    expect(switchTrackBox).not.toBeNull();
    expect(switchThumbBox).not.toBeNull();
    expect(switchThumbBox!.x).toBeGreaterThan(switchTrackBox!.x);
    expect(switchThumbBox!.x + switchThumbBox!.width).toBeLessThanOrEqual(
      switchTrackBox!.x + switchTrackBox!.width,
    );
    expect(switchThumbBox!.x).toBeGreaterThan(
      switchTrackBox!.x + switchTrackBox!.width / 2 - 2,
    );
    await expect(
      page.getByRole("button", { name: "Test connection" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Test model" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("provider-native-test-and-switch.png"),
      animations: "disabled",
    });
    expect(
      await page
        .getByTestId("agent-provider-workbench-sidebar")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page
      .getByTestId("agent-provider-workbench-toolbar")
      .getByRole("button", { name: "Add custom provider" })
      .click();
    const providerEditor = page.getByRole("region", { name: "Add provider" });
    await expect(providerEditor).toBeVisible();
    await expect(
      providerEditor.getByTestId("agent-provider-form-surface"),
    ).toBeVisible();
    await expect(
      providerEditor.getByTestId("agent-provider-form-section"),
    ).toHaveCount(4);
    await expect(providerEditor.locator("select")).toHaveCount(0);
    await expect(
      providerEditor.getByLabel("Sonnet model (optional)"),
    ).toBeVisible();
    await expect(
      providerEditor.getByLabel("Opus model (optional)"),
    ).toBeVisible();
    await expect(
      providerEditor.getByLabel("Haiku model (optional)"),
    ).toBeVisible();
    await expect(
      providerEditor.getByLabel("Subagent model (optional)"),
    ).toBeVisible();
    await providerEditor.getByRole("button", { name: "Protocol" }).click();
    await expect(page.getByRole("listbox", { name: "Protocol" })).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Anthropic Messages" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await providerEditor.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("provider-inline-editor.png"),
      animations: "disabled",
    });
    await page.getByRole("option", { name: "Anthropic Messages" }).click();
    await providerEditor.getByRole("button", { name: "Cancel" }).click();

    await selectAgent(page, "Codex");
    await page.getByRole("tab", { name: "Provider & Model" }).click();
    await page
      .getByTestId("agent-provider-workbench-toolbar")
      .getByRole("button", { name: "Add custom provider" })
      .click();
    const codexEditor = page.getByRole("region", { name: "Add provider" });
    await expect(codexEditor).toBeVisible();
    await expect(
      codexEditor.getByRole("button", { name: "Reasoning effort (optional)" }),
    ).toBeVisible();
    await expect(
      codexEditor.getByLabel("Context window (optional)"),
    ).toBeVisible();
    const formSurface = codexEditor.getByTestId("agent-provider-form-surface");
    const formSurfaceBox = await formSurface.boundingBox();
    const fullWidthControls = formSurface.locator(
      '[data-testid="agent-provider-form-fields"] input, [data-testid="agent-provider-form-fields"] button[aria-haspopup="listbox"]',
    );
    const controlCount = await fullWidthControls.count();
    expect(controlCount).toBeGreaterThan(6);
    for (let index = 0; index < controlCount; index += 1) {
      const controlBox = await fullWidthControls.nth(index).boundingBox();
      expect(controlBox?.width ?? 0).toBeGreaterThan(
        (formSurfaceBox?.width ?? 0) * 0.9,
      );
    }
    await codexEditor
      .getByRole("button", { name: "Authentication source" })
      .click();
    const authenticationListbox = page.getByRole("listbox", {
      name: "Authentication source",
    });
    await expect(authenticationListbox).toBeVisible();
    await expect(authenticationListbox).toHaveClass(/rounded-md/);
    await expect(authenticationListbox).not.toHaveClass(/rounded-xl/);
    expect(
      await codexEditor.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("codex-provider-full-width-form.png"),
      animations: "disabled",
    });
    await page
      .getByRole("option", { name: "PromptHub-managed credential" })
      .click();
    await codexEditor.getByRole("button", { name: "Cancel" }).click();

    await selectAgent(page, "Pi");
    await page.getByRole("tab", { name: "Provider & Model" }).click();
    const piShell = page.getByTestId("agent-provider-workbench");
    await expect(piShell).toBeVisible();
    expect(await piShell.getAttribute("class")).toBe(claudeShellClass);
    await expect(
      page.getByRole("navigation", { name: "Pi providers" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import from PromptHub" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add custom provider" }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("agent-provider-workbench-toolbar")
        .locator("svg.lucide-plus"),
    ).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Import current configuration" }),
    ).toHaveCount(0);
    await expect(page.getByText("foxcode").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("pi-e2e-secret");
    const piToolbarBox = await page
      .getByTestId("agent-provider-workbench-toolbar")
      .boundingBox();
    expect(piToolbarBox?.height).toBe(claudeToolbarBox?.height);
    expect(
      await page
        .getByTestId("agent-provider-workbench-sidebar")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);

    await page
      .getByRole("navigation", { name: "Pi providers" })
      .click({ button: "right" });
    await page
      .getByRole("button", { name: "Import from PromptHub" })
      .last()
      .click();
    await expect(
      page.getByRole("dialog", { name: "Import PromptHub provider" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    const models = JSON.parse(
      fs.readFileSync(path.join(piDir, "models.json"), "utf8"),
    );
    expect(models.providers["kimi-coding"]?.modelOverrides?.k3).toBeUndefined();

    await page.screenshot({
      path: testInfo.outputPath("pi-provider-workbench.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page
      .getByTestId("agent-provider-workbench-toolbar")
      .getByRole("button", { name: "Import from PromptHub" })
      .click();
    const sourceDialog = page.getByRole("dialog", {
      name: "Import PromptHub provider",
    });
    await expect(sourceDialog).toBeVisible();
    await expect(
      sourceDialog.getByRole("img", { name: "DeepSeek" }),
    ).toBeVisible();
    await expect(sourceDialog.getByRole("img", { name: "GPT" })).toBeVisible();
    await sourceDialog.getByRole("button", { name: "Protocol" }).click();
    await expect(
      page.getByRole("option", { name: "OpenAI Responses" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("provider-source-import-dark.png"),
      animations: "disabled",
    });
    await page.getByRole("option", { name: "OpenAI Responses" }).click();
    await expect(
      sourceDialog.getByRole("button", { name: "Protocol" }),
    ).toContainText("OpenAI Responses");
    await expect(
      sourceDialog.getByRole("button", { name: "Import", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("provider-source-import-selected-dark.png"),
      animations: "disabled",
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("creates, updates, restarts, and deletes a Claude provider without changing native config", async () => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-provider-lifecycle-e2e-"),
  );
  writeRuntimeLayoutState(userDataDir);
  writeCanonicalStorageAuthority(userDataDir, {
    consistencyId: "a".repeat(64),
    operationId: "provider-lifecycle-e2e",
  });
  const homeDir = path.join(userDataDir, "home");
  const claudeDir = path.join(homeDir, ".claude");
  const nativeConfigPath = path.join(claudeDir, "settings.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    nativeConfigPath,
    `${JSON.stringify({ model: "claude-native", keepUnknown: true }, null, 2)}\n`,
    "utf8",
  );
  const nativeConfigBefore = fs.readFileSync(nativeConfigPath, "utf8");
  let currentApp: ElectronApplication | null = null;

  try {
    let launched = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    currentApp = launched.app;
    await setAppLanguage(launched.page, "en");
    await launched.page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(launched.app, { type: "agent:manage" });
    await openClaudeProviderWorkbench(launched.page);

    await launched.page
      .getByTestId("agent-provider-workbench-toolbar")
      .getByRole("button", { name: "Add custom provider" })
      .click();
    const cancelledCreate = launched.page.getByRole("region", {
      name: "Add provider",
    });
    await cancelledCreate.getByLabel("Name").fill("Cancelled Provider");
    await cancelledCreate.getByRole("button", { name: "Cancel" }).click();
    await expect(cancelledCreate).toBeHidden();
    expect(await listClaudeProviders(launched.page)).toHaveLength(0);
    expect(fs.existsSync(path.join(userDataDir, "data", "agents"))).toBe(false);

    await createClaudeProvider(launched.page, {
      name: "E2E Provider Lifecycle",
      endpoint: "http://127.0.0.1:43119/v1",
      primaryModel: "e2e-model-v1",
      sonnetModel: "e2e-sonnet-preserved",
    });
    await expect(
      launched.page.getByRole("heading", {
        name: "E2E Provider Lifecycle",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      launched.page.getByText("openai-compatible · anthropic-messages"),
    ).toBeVisible();
    await expect(
      launched.page.getByText("http://127.0.0.1:43119/v1"),
    ).toBeVisible();
    const providerDetail = launched.page.getByTestId(
      "agent-provider-workbench-detail",
    );
    await expect(
      providerDetail.getByText("e2e-model-v1", { exact: true }),
    ).toBeVisible();
    await expect(
      providerDetail.getByText("No credential", { exact: true }),
    ).toBeVisible();

    const createdProfiles = await listClaudeProviders(launched.page);
    expect(createdProfiles).toHaveLength(1);
    const created = createdProfiles[0];
    expect(created).toMatchObject({
      platformId: "claude",
      name: "E2E Provider Lifecycle",
      providerKind: "openai-compatible",
      protocol: "anthropic-messages",
      endpoint: "http://127.0.0.1:43119/v1",
      source: "manual",
      secretState: "none",
      archived: false,
    });
    expect(created.config).toEqual({ credentialEnvKey: "ANTHROPIC_API_KEY" });
    expect(created.modelMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeKey: "primary",
          modelId: "e2e-model-v1",
        }),
        expect.objectContaining({
          routeKey: "sonnet",
          modelId: "e2e-sonnet-preserved",
        }),
      ]),
    );
    const createdResource = readProviderResource(userDataDir, created.id);
    expect(createdResource).toMatchObject({
      kind: "prompthub-agent-provider-resource",
      schemaVersion: 1,
      requiresSecret: false,
      profile: {
        id: created.id,
        name: "E2E Provider Lifecycle",
        endpoint: "http://127.0.0.1:43119/v1",
      },
    });
    expect(JSON.stringify(createdResource)).not.toContain("secretRef");
    const exported = await launched.page.evaluate(
      (profileId) => window.api.agent.exportProviderProfile(profileId),
      created.id,
    );
    expect(exported.requiresSecret).toBe(false);
    expect(JSON.stringify(exported)).not.toContain("secretRef");
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);

    await createClaudeProvider(launched.page, {
      name: "E2E Provider Duplicate",
      endpoint: "http://127.0.0.1:43120/v1",
      primaryModel: "duplicate-model",
    });
    const duplicateProfiles = await listClaudeProviders(launched.page);
    expect(duplicateProfiles).toHaveLength(2);
    expect(new Set(duplicateProfiles.map((profile) => profile.id)).size).toBe(
      2,
    );
    expect(duplicateProfiles.map((profile) => profile.name).sort()).toEqual([
      "E2E Provider Duplicate",
      "E2E Provider Lifecycle",
    ]);

    await launched.page
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    let deleteDialog = launched.page.getByRole("alertdialog", {
      name: "Delete provider",
    });
    await expect(deleteDialog).toContainText(
      "does not rewrite the Agent configuration",
    );
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toBeHidden();
    expect(await listClaudeProviders(launched.page)).toHaveLength(2);
    await launched.page
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    deleteDialog = launched.page.getByRole("alertdialog", {
      name: "Delete provider",
    });
    await deleteDialog
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(deleteDialog).toBeHidden();
    expect(await listClaudeProviders(launched.page)).toHaveLength(1);

    await launched.page
      .getByTestId("agent-provider-workbench-sidebar")
      .getByRole("button", { name: /^E2E Provider Lifecycle\b/ })
      .click();
    await launched.page
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    let editor = launched.page.getByRole("region", { name: "Edit provider" });
    await editor.getByLabel("Name").fill("Cancelled Provider Update");
    await editor.getByRole("button", { name: "Cancel" }).click();
    await expect(editor).toBeHidden();
    expect((await listClaudeProviders(launched.page))[0].name).toBe(
      "E2E Provider Lifecycle",
    );

    await launched.page
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    editor = launched.page.getByRole("region", { name: "Edit provider" });
    await editor.getByLabel("Name").fill("E2E Provider Updated");
    await editor
      .getByLabel("Endpoint (optional)")
      .fill("http://127.0.0.1:43121/v1");
    await editor.getByLabel("Primary model").fill("e2e-model-v2");
    await editor.getByRole("button", { name: "Save provider" }).click();
    await expect(editor).toBeHidden();

    const updatedProfiles = await listClaudeProviders(launched.page);
    expect(updatedProfiles).toHaveLength(1);
    const updated = updatedProfiles[0];
    expect(updated.id).toBe(created.id);
    expect(updated).toMatchObject({
      name: "E2E Provider Updated",
      endpoint: "http://127.0.0.1:43121/v1",
      providerKind: "openai-compatible",
      protocol: "anthropic-messages",
      config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
      secretState: "none",
    });
    expect(updated.modelMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeKey: "primary",
          modelId: "e2e-model-v2",
        }),
        expect.objectContaining({
          routeKey: "sonnet",
          modelId: "e2e-sonnet-preserved",
        }),
      ]),
    );
    const updatedResourceText = fs.readFileSync(
      path.join(userDataDir, "data", "agents", created.id, "agent.json"),
      "utf8",
    );
    expect(JSON.parse(updatedResourceText)).toMatchObject({
      requiresSecret: false,
      profile: {
        id: created.id,
        name: "E2E Provider Updated",
        endpoint: "http://127.0.0.1:43121/v1",
      },
      modelMappings: expect.arrayContaining([
        expect.objectContaining({
          routeKey: "primary",
          modelId: "e2e-model-v2",
        }),
        expect.objectContaining({
          routeKey: "sonnet",
          modelId: "e2e-sonnet-preserved",
        }),
      ]),
    });
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);

    await closePromptHub(launched.app, userDataDir, {
      preserveUserDataDir: true,
    });
    currentApp = null;
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);
    expect(
      fs.readFileSync(
        path.join(userDataDir, "data", "agents", created.id, "agent.json"),
        "utf8",
      ),
    ).toBe(updatedResourceText);

    launched = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    currentApp = launched.app;
    await launched.page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(launched.app, { type: "agent:manage" });
    await openClaudeProviderWorkbench(launched.page);
    await expect(
      launched.page.getByRole("heading", {
        name: "E2E Provider Updated",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      launched.page
        .getByTestId("agent-provider-workbench-detail")
        .getByText("e2e-model-v2", { exact: true }),
    ).toBeVisible();
    const restartedProfiles = await listClaudeProviders(launched.page);
    expect(restartedProfiles).toHaveLength(1);
    expect(restartedProfiles[0].id).toBe(created.id);
    expect(restartedProfiles[0].name).toBe("E2E Provider Updated");
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);

    await launched.page
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    deleteDialog = launched.page.getByRole("alertdialog", {
      name: "Delete provider",
    });
    await deleteDialog
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(deleteDialog).toBeHidden();
    await expect.poll(() => listClaudeProviders(launched.page)).toHaveLength(0);
    await expect
      .poll(() =>
        fs.existsSync(path.join(userDataDir, "data", "agents", created.id)),
      )
      .toBe(false);
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);
  } finally {
    if (currentApp) {
      await closePromptHub(currentApp, userDataDir).catch(() => {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      });
    } else {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
});

test("keeps credential writes atomic when system encryption is unavailable", async () => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-provider-credential-e2e-"),
  );
  writeRuntimeLayoutState(userDataDir);
  writeCanonicalStorageAuthority(userDataDir, {
    consistencyId: "c".repeat(64),
    operationId: "provider-credential-e2e",
  });
  const homeDir = path.join(userDataDir, "home");
  const claudeDir = path.join(homeDir, ".claude");
  const nativeConfigPath = path.join(claudeDir, "settings.json");
  const secretStorePath = path.join(userDataDir, "agent-secrets.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(nativeConfigPath, '{"model":"claude-native"}\n', "utf8");
  const nativeConfigBefore = fs.readFileSync(nativeConfigPath, "utf8");
  const credential = ["e2e", "provider", "credential", "value"].join("-");
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    app = launched.app;
    const encryptionAvailable = await launched.app.evaluate(({ safeStorage }) =>
      safeStorage.isEncryptionAvailable(),
    );
    await setAppLanguage(launched.page, "en");
    await launched.page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(launched.app, { type: "agent:manage" });
    await openClaudeProviderWorkbench(launched.page);
    await launched.page
      .getByTestId("agent-provider-workbench-toolbar")
      .getByRole("button", { name: "Add custom provider" })
      .click();
    const editor = launched.page.getByRole("region", { name: "Add provider" });
    await editor.getByLabel("Name").fill("Credential Boundary Provider");
    await editor.getByLabel("Provider kind").fill("openai-compatible");
    await editor
      .getByLabel("Endpoint (optional)")
      .fill("http://127.0.0.1:43141/v1");
    await editor.getByLabel("Primary model").fill("credential-model");
    await editor.getByLabel("Credential (write-only)").fill(credential);
    await editor.getByRole("button", { name: "Save provider" }).click();

    if (!encryptionAvailable) {
      await expect(launched.page.getByRole("alert")).toHaveText(
        "Provider operation failed",
      );
      await expect(editor).toBeVisible();
      expect(await listClaudeProviders(launched.page)).toHaveLength(0);
      expect(fs.existsSync(path.join(userDataDir, "data", "agents"))).toBe(
        false,
      );
      expect(fs.existsSync(secretStorePath)).toBe(false);
    } else {
      await expect(editor).toBeHidden();
      const profiles = await listClaudeProviders(launched.page);
      expect(profiles).toHaveLength(1);
      expect(profiles[0].secretState).toBe("available");
      const resource = readProviderResource(userDataDir, profiles[0].id);
      expect(resource.requiresSecret).toBe(true);
      expect(JSON.stringify(resource)).not.toContain(credential);
      expect(fs.readFileSync(secretStorePath, "utf8")).not.toContain(
        credential,
      );
      const exported = await launched.page.evaluate(
        (profileId) => window.api.agent.exportProviderProfile(profileId),
        profiles[0].id,
      );
      expect(exported.requiresSecret).toBe(true);
      expect(JSON.stringify(exported)).not.toContain(credential);
    }

    await expect(launched.page.locator("body")).not.toContainText(credential);
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);
  } finally {
    if (app) {
      await closePromptHub(app, userDataDir).catch(() => {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      });
    } else {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
});

test("keeps duplicate provider display names as separate stable profiles", async () => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-provider-duplicate-name-e2e-"),
  );
  writeRuntimeLayoutState(userDataDir);
  writeCanonicalStorageAuthority(userDataDir, {
    consistencyId: "b".repeat(64),
    operationId: "provider-duplicate-name-e2e",
  });
  const homeDir = path.join(userDataDir, "home");
  const claudeDir = path.join(homeDir, ".claude");
  const nativeConfigPath = path.join(claudeDir, "settings.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    nativeConfigPath,
    `${JSON.stringify({ model: "claude-native" }, null, 2)}\n`,
    "utf8",
  );
  const nativeConfigBefore = fs.readFileSync(nativeConfigPath, "utf8");
  let app: ElectronApplication | null = null;

  try {
    let launched = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    app = launched.app;
    await setAppLanguage(launched.page, "en");
    await launched.page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(launched.app, { type: "agent:manage" });
    await openClaudeProviderWorkbench(launched.page);
    await createClaudeProvider(launched.page, {
      name: "Duplicate Display Name",
      endpoint: "http://127.0.0.1:43131/v1",
      primaryModel: "duplicate-a",
    });

    await launched.page
      .getByTestId("agent-provider-workbench-toolbar")
      .getByRole("button", { name: "Add custom provider" })
      .click();
    const editor = launched.page.getByRole("region", { name: "Add provider" });
    await editor.getByLabel("Name").fill("Duplicate Display Name");
    await editor.getByLabel("Provider kind").fill("openai-compatible");
    await editor
      .getByLabel("Endpoint (optional)")
      .fill("http://127.0.0.1:43132/v1");
    await editor.getByLabel("Primary model").fill("duplicate-b");
    await editor.getByRole("button", { name: "Save provider" }).click();
    await expect(editor).toBeHidden();

    await createClaudeProvider(launched.page, {
      name: "duplicate display name",
      endpoint: "http://127.0.0.1:43133/v1",
      primaryModel: "duplicate-c",
    });

    let profiles = await listClaudeProviders(launched.page);
    expect(profiles).toHaveLength(3);
    const profileIds = new Set(profiles.map((profile) => profile.id));
    expect(profileIds.size).toBe(3);
    expect(
      profiles.filter((profile) => profile.name === "Duplicate Display Name"),
    ).toHaveLength(2);
    expect(
      profiles.filter((profile) => profile.name === "duplicate display name"),
    ).toHaveLength(1);
    expect(
      profiles.map((profile) => readProviderResource(userDataDir, profile.id)),
    ).toHaveLength(3);
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);

    await closePromptHub(app, userDataDir, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    app = launched.app;
    profiles = await listClaudeProviders(launched.page);
    expect(new Set(profiles.map((profile) => profile.id))).toEqual(profileIds);
    expect(profiles.map((profile) => profile.name).sort()).toEqual(
      [
        "Duplicate Display Name",
        "Duplicate Display Name",
        "duplicate display name",
      ].sort(),
    );
    expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(nativeConfigBefore);
  } finally {
    if (app) {
      await closePromptHub(app, userDataDir).catch(() => {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      });
    } else {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
});
