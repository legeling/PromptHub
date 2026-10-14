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
  setAppSettings,
} from "./helpers/electron";

const SERVER_NAME = "agent-mcp-lifecycle";
const DISPLAY_NAME = "Agent MCP Lifecycle";
const UPDATED_DISPLAY_NAME = "Agent MCP Lifecycle Updated";
const SECRET_REFERENCE = "MCP_LIFECYCLE_TOKEN";

interface CapturedToast {
  message: string;
  type: "error" | "info" | "success" | "warning";
}

async function installToastRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const targetWindow = window as typeof window & {
      __PROMPTHUB_E2E_TOASTS__?: CapturedToast[];
    };
    targetWindow.__PROMPTHUB_E2E_TOASTS__ = [];

    const record = (element: Element) => {
      if (
        element.getAttribute("data-e2e-toast-recorded") === "true" ||
        !element.classList.contains("pointer-events-auto")
      ) {
        return;
      }
      const message = element.querySelector("span")?.textContent?.trim();
      if (!message) return;
      const className = element.getAttribute("class") ?? "";
      const type = className.includes("bg-red-50")
        ? "error"
        : className.includes("bg-yellow-50")
          ? "warning"
          : className.includes("bg-blue-50")
            ? "info"
            : "success";
      element.setAttribute("data-e2e-toast-recorded", "true");
      targetWindow.__PROMPTHUB_E2E_TOASTS__?.push({ message, type });
    };

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          record(node);
          node.querySelectorAll(".pointer-events-auto").forEach(record);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

async function readCapturedToasts(page: Page): Promise<CapturedToast[]> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __PROMPTHUB_E2E_TOASTS__?: CapturedToast[];
        }
      ).__PROMPTHUB_E2E_TOASTS__ ?? [],
  );
}

async function openMcpLibrary(app: ElectronApplication, page: Page) {
  await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
  const dialog = page.getByRole("dialog", { name: "New MCP" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
}

test("creates, reads, updates, distributes, reconciles, removes, restarts, and deletes MCP", async () => {
  test.setTimeout(90_000);

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-mcp-e2e-"),
  );
  writeRuntimeLayoutState(userDataDir);
  writeCanonicalStorageAuthority(userDataDir, {
    consistencyId: "b".repeat(64),
    operationId: "agent-mcp-lifecycle-e2e",
  });
  const homeDir = path.join(userDataDir, "home");
  const emptyBinDir = path.join(homeDir, "empty-bin");
  fs.mkdirSync(emptyBinDir, { recursive: true });
  const codexConfigPath = path.join(homeDir, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(codexConfigPath), { recursive: true });
  fs.writeFileSync(
    codexConfigPath,
    [
      'model = "gpt-5"',
      "",
      "[mcp_servers.unrelated]",
      'command = "keep-me"',
      "",
    ].join("\n"),
    "utf8",
  );

  const launchOptions = {
    userDataDir,
    env: { HOME: homeDir, PATH: emptyBinDir, USERPROFILE: homeDir },
  };
  let activeApp: ElectronApplication | null = null;

  try {
    let launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    let { page } = launched;
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppSettings(page, {
      language: "en",
      minimizeOnLaunch: false,
      autoCheckUpdate: false,
    });
    await installToastRecorder(page);

    await sendAppCommand(activeApp, { type: "asset:create", asset: "mcp" });
    const createDialog = page.getByRole("dialog", { name: "New MCP" });
    await createDialog.getByRole("button", { name: /Manual setup/ }).click();
    await createDialog.getByLabel("Name", { exact: true }).fill(SERVER_NAME);
    await createDialog.getByLabel("Display Name").fill(DISPLAY_NAME);
    await createDialog.getByLabel("Command").fill("node");
    await createDialog.getByLabel("Args").fill("server.js\n--alpha");
    await createDialog
      .getByLabel("Environment references")
      .fill(`AUTH_TOKEN=${SECRET_REFERENCE}`);
    await createDialog.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByText("MCP saved", { exact: true }).last(),
    ).toBeVisible();
    await expect(createDialog).not.toBeVisible();

    let library = await page.evaluate(() => window.api.mcp.getLibrary());
    expect(library.servers).toHaveLength(1);
    const serverId = library.servers[0].id;
    expect(library.servers[0]).toMatchObject({
      id: serverId,
      name: SERVER_NAME,
      displayName: DISPLAY_NAME,
      command: "node",
      args: ["server.js", "--alpha"],
      env: undefined,
      envRefs: { AUTH_TOKEN: `\${${SECRET_REFERENCE}}` },
    });

    const bundlePath = path.join(userDataDir, "data", "mcp", serverId);
    expect(fs.existsSync(path.join(bundlePath, "server.json"))).toBe(true);
    expect(fs.existsSync(path.join(bundlePath, "manifest.json"))).toBe(true);
    const canonicalServer = JSON.parse(
      fs.readFileSync(path.join(bundlePath, "server.json"), "utf8"),
    );
    expect(canonicalServer.server.envRefs).toEqual({
      AUTH_TOKEN: `\${${SECRET_REFERENCE}}`,
    });
    expect(canonicalServer.server.env).toBeUndefined();

    await sendAppCommand(activeApp, { type: "asset:create", asset: "mcp" });
    const duplicateDialog = page.getByRole("dialog", { name: "New MCP" });
    await duplicateDialog.getByRole("button", { name: /Manual setup/ }).click();
    await duplicateDialog.getByLabel("Name", { exact: true }).fill(SERVER_NAME);
    await duplicateDialog.getByLabel("Display Name").fill("Duplicate MCP");
    await duplicateDialog.getByLabel("Command").fill("node");
    await duplicateDialog.getByRole("button", { name: "Save" }).click();
    const duplicateError = `MCP 服务名已存在: ${SERVER_NAME}`;
    await expect
      .poll(async () =>
        (await readCapturedToasts(page))
          .filter((toast) => toast.type === "error")
          .map((toast) => toast.message),
      )
      .toEqual([expect.stringContaining(duplicateError)]);
    await expect(duplicateDialog).toBeVisible();
    expect(
      (await page.evaluate(() => window.api.mcp.getLibrary())).servers,
    ).toHaveLength(1);
    await duplicateDialog.getByRole("button", { name: "Close" }).click();

    await page.getByTestId(`mcp-server-card-${serverId}`).click();
    fs.appendFileSync(
      codexConfigPath,
      [
        "",
        `[mcp_servers.${SERVER_NAME}]`,
        'command = "external-before-apply"',
        "",
      ].join("\n"),
      "utf8",
    );
    await page.getByRole("button", { name: "Codex", exact: true }).click();
    const overwriteConfirmation = new Promise<string>((resolve) => {
      page.once("dialog", async (dialog) => {
        resolve(dialog.message());
        await dialog.accept();
      });
    });
    await page.getByRole("button", { name: /Apply to 1 platform/ }).click();
    expect(await overwriteConfirmation).toContain(SERVER_NAME);
    await expect(
      page.getByText("MCP applied", { exact: true }).last(),
    ).toBeVisible();

    let codexConfig = fs.readFileSync(codexConfigPath, "utf8");
    expect(codexConfig).toContain('model = "gpt-5"');
    expect(codexConfig).toContain("[mcp_servers.unrelated]");
    expect(codexConfig).toContain('command = "keep-me"');
    expect(codexConfig).toContain(`[mcp_servers.${SERVER_NAME}]`);
    expect(codexConfig).toContain('args = ["server.js", "--alpha"]');
    expect(codexConfig).toContain(`AUTH_TOKEN = "\${${SECRET_REFERENCE}}"`);

    const bindingPath = path.join(
      userDataDir,
      "config",
      "devices",
      "mcp-bindings.json",
    );
    expect(fs.existsSync(bindingPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(bindingPath, "utf8")).bindings).toEqual([
      expect.objectContaining({
        path: codexConfigPath,
        serverIds: [serverId],
        target: "codex",
      }),
    ]);

    await page.getByRole("button", { name: "Edit MCP" }).click();
    const editor = page.getByTestId("mcp-server-form");
    await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(
      SERVER_NAME,
    );
    await expect(editor.getByLabel("Display Name")).toHaveValue(DISPLAY_NAME);
    await expect(editor.getByLabel("Command")).toHaveValue("node");
    await expect(editor.getByLabel("Args")).toHaveValue("server.js\n--alpha");

    await editor.getByLabel("Display Name").fill(UPDATED_DISPLAY_NAME);
    await editor.getByLabel("Args").fill("server.js\n--beta");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(async () => {
        const current = await page.evaluate(() => window.api.mcp.getLibrary());
        return current.servers[0]?.displayName;
      })
      .toBe(UPDATED_DISPLAY_NAME);

    library = await page.evaluate(() => window.api.mcp.getLibrary());
    expect(library.servers[0]).toMatchObject({
      id: serverId,
      name: SERVER_NAME,
      displayName: UPDATED_DISPLAY_NAME,
      args: ["server.js", "--beta"],
    });

    codexConfig = fs.readFileSync(codexConfigPath, "utf8");
    expect(codexConfig).toContain('args = ["server.js", "--alpha"]');
    expect(codexConfig).not.toContain('args = ["server.js", "--beta"]');

    await page.getByRole("button", { name: "Check sync" }).click();
    await expect(page.getByText("Needs sync", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Sync distributed targets" })
      .click();
    await expect(
      page.getByText("1 target(s) synced", { exact: true }).last(),
    ).toBeVisible();
    codexConfig = fs.readFileSync(codexConfigPath, "utf8");
    expect(codexConfig).toContain('args = ["server.js", "--beta"]');
    expect(codexConfig).toContain("[mcp_servers.unrelated]");

    fs.writeFileSync(
      codexConfigPath,
      codexConfig.replace('command = "node"', 'command = "external-node"'),
      "utf8",
    );
    await page.getByRole("button", { name: "Check sync" }).click();
    await expect(
      page.getByText("External edit", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("1 target(s) need review", { exact: true }).last(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Sync distributed targets" })
      .click();
    await expect(
      page
        .getByText("0 target(s) synced, 1 need review", { exact: true })
        .last(),
    ).toBeVisible();
    expect(fs.readFileSync(codexConfigPath, "utf8")).toContain(
      'command = "external-node"',
    );

    const firstRunToasts = await readCapturedToasts(page);
    expect(firstRunToasts).toEqual(
      expect.arrayContaining([
        { message: "MCP saved", type: "success" },
        { message: "MCP applied", type: "success" },
        expect.objectContaining({
          message: expect.stringContaining(duplicateError),
          type: "error",
        }),
        { message: "1 target(s) need review", type: "warning" },
        {
          message: "0 target(s) synced, 1 need review",
          type: "warning",
        },
      ]),
    );
    expect(firstRunToasts.filter((toast) => toast.type === "error")).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(duplicateError),
        type: "error",
      }),
    ]);

    await closePromptHub(activeApp, userDataDir, {
      preserveUserDataDir: true,
    });
    activeApp = null;

    launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    page = launched.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await installToastRecorder(page);
    await openMcpLibrary(activeApp, page);

    library = await page.evaluate(() => window.api.mcp.getLibrary());
    expect(library.servers).toHaveLength(1);
    expect(library.servers[0]).toMatchObject({
      id: serverId,
      displayName: UPDATED_DISPLAY_NAME,
      args: ["server.js", "--beta"],
    });
    await page.getByTestId(`mcp-server-card-${serverId}`).click();
    await expect(
      page.getByText("1 target(s) distributed", { exact: true }).first(),
    ).toBeVisible();
    expect(fs.readFileSync(codexConfigPath, "utf8")).toContain(
      'command = "external-node"',
    );

    await page.getByTitle("Remove from platform").click();
    await expect(
      page.getByText("MCP removed", { exact: true }).last(),
    ).toBeVisible();
    codexConfig = fs.readFileSync(codexConfigPath, "utf8");
    expect(codexConfig).toContain('model = "gpt-5"');
    expect(codexConfig).toContain("[mcp_servers.unrelated]");
    expect(codexConfig).toContain('command = "keep-me"');
    expect(codexConfig).not.toContain(`[mcp_servers.${SERVER_NAME}]`);
    expect(JSON.parse(fs.readFileSync(bindingPath, "utf8")).bindings).toEqual(
      [],
    );

    await page.getByRole("button", { name: "Delete" }).click();
    const deleteDialog = page.getByRole("alertdialog", { name: "Delete MCP" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByText("MCP deleted", { exact: true }).last(),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const current = await page.evaluate(() => window.api.mcp.getLibrary());
        return current.servers.length;
      })
      .toBe(0);
    expect(fs.existsSync(bundlePath)).toBe(false);
    const secondRunToasts = await readCapturedToasts(page);
    expect(secondRunToasts).toEqual(
      expect.arrayContaining([
        { message: "MCP removed", type: "success" },
        { message: "MCP deleted", type: "success" },
      ]),
    );
    expect(secondRunToasts.filter((toast) => toast.type === "error")).toEqual(
      [],
    );

    await closePromptHub(activeApp, userDataDir, {
      preserveUserDataDir: true,
    });
    activeApp = null;
    launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    page = launched.page;
    await expect
      .poll(async () => {
        const current = await page.evaluate(() => window.api.mcp.getLibrary());
        return current.servers.length;
      })
      .toBe(0);
    expect(fs.existsSync(bundlePath)).toBe(false);
    codexConfig = fs.readFileSync(codexConfigPath, "utf8");
    expect(codexConfig).toContain("[mcp_servers.unrelated]");
    expect(codexConfig).not.toContain(`[mcp_servers.${SERVER_NAME}]`);
  } finally {
    if (activeApp) await closePromptHub(activeApp, userDataDir);
    else if (fs.existsSync(userDataDir))
      fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("rejects malformed config and keeps HTTP credentials outside renderer and canonical files", async () => {
  test.setTimeout(60_000);

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-mcp-http-import-e2e-"),
  );
  writeRuntimeLayoutState(userDataDir);
  writeCanonicalStorageAuthority(userDataDir, {
    consistencyId: "d".repeat(64),
    operationId: "mcp-http-import-e2e",
  });
  const homeDir = path.join(userDataDir, "home");
  const codexConfigPath = path.join(homeDir, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(codexConfigPath), { recursive: true });
  fs.writeFileSync(codexConfigPath, 'model = "gpt-5"\n', "utf8");

  const headerSecret = "Bearer e2e-http-secret";
  const tenantSecret = "e2e-tenant-secret";
  const validConfig = JSON.stringify({
    mcpServers: {
      "secure-http": {
        url: "https://mcp.example.invalid/api",
        headers: {
          Authorization: headerSecret,
          "X-Tenant": tenantSecret,
        },
      },
    },
  });
  let activeApp: ElectronApplication | null = null;

  try {
    const launched = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    activeApp = launched.app;
    const { page } = launched;
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppSettings(page, {
      language: "en",
      minimizeOnLaunch: false,
      autoCheckUpdate: false,
    });
    await installToastRecorder(page);

    await sendAppCommand(activeApp, { type: "asset:create", asset: "mcp" });
    const createDialog = page.getByRole("dialog", { name: "New MCP" });
    await createDialog.getByRole("button", { name: /Paste config/ }).click();
    const configInput = createDialog.getByLabel("MCP config JSON or TOML");
    const mcpRoot = path.join(userDataDir, "data", "mcp");
    const initialMcpEntries = fs.readdirSync(mcpRoot).sort();
    await configInput.fill("{not-json");
    await createDialog.getByRole("button", { name: "Import config" }).click();
    await expect(
      createDialog.getByText("Invalid MCP config content"),
    ).toBeVisible();
    await expect(createDialog).toBeVisible();
    expect(
      (await page.evaluate(() => window.api.mcp.getLibrary())).servers,
    ).toEqual([]);
    expect(fs.readdirSync(mcpRoot).sort()).toEqual(initialMcpEntries);

    await configInput.fill(validConfig);
    await createDialog.getByRole("button", { name: "Import config" }).click();
    await expect(createDialog).not.toBeVisible();
    await expect(
      page.getByText("1 MCP source(s) added", { exact: true }).last(),
    ).toBeVisible();

    const library = await page.evaluate(() => window.api.mcp.getLibrary());
    expect(library.servers).toHaveLength(1);
    const server = library.servers[0];
    expect(server).toMatchObject({
      name: "secure-http",
      transport: "streamable-http",
      url: "https://mcp.example.invalid/api",
      headers: {
        Authorization: "[REDACTED]",
        "X-Tenant": "[REDACTED]",
      },
    });
    await expect(page.locator("body")).not.toContainText(headerSecret);
    await expect(page.locator("body")).not.toContainText(tenantSecret);

    const bundlePath = path.join(userDataDir, "data", "mcp", server.id);
    const canonicalText = fs.readFileSync(
      path.join(bundlePath, "server.json"),
      "utf8",
    );
    expect(canonicalText).not.toContain(headerSecret);
    expect(canonicalText).not.toContain(tenantSecret);
    const canonicalDocument = JSON.parse(canonicalText);
    expect(canonicalDocument.server.headers).toBeUndefined();
    expect(
      Object.keys(canonicalDocument.secretReferences.headers).sort(),
    ).toEqual(["Authorization", "X-Tenant"]);
    expect(
      Object.values(canonicalDocument.secretReferences.headers).join("\n"),
    ).not.toContain("secret");
    const versionText = fs
      .readdirSync(path.join(bundlePath, "versions"))
      .map((name) =>
        fs.readFileSync(path.join(bundlePath, "versions", name), "utf8"),
      )
      .join("\n");
    expect(versionText).not.toContain(headerSecret);
    expect(versionText).not.toContain(tenantSecret);

    const secretStorePath = path.join(
      userDataDir,
      "secrets",
      "mcp-resource-secrets.json",
    );
    const secretStoreText = fs.readFileSync(secretStorePath, "utf8");
    expect(secretStoreText).not.toContain(headerSecret);
    expect(secretStoreText).not.toContain(tenantSecret);
    expect(fs.statSync(secretStorePath).mode & 0o777).toBe(0o600);

    await page.getByTestId(`mcp-server-card-${server.id}`).click();
    await page.getByRole("button", { name: "Codex", exact: true }).click();
    await page.getByRole("button", { name: /Apply to 1 platform/ }).click();
    await expect(
      page.getByText("MCP applied", { exact: true }).last(),
    ).toBeVisible();
    const codexConfig = fs.readFileSync(codexConfigPath, "utf8");
    expect(codexConfig).toContain('model = "gpt-5"');
    expect(codexConfig).toContain('url = "https://mcp.example.invalid/api"');
    expect(codexConfig).toContain(headerSecret);
    expect(codexConfig).toContain(tenantSecret);
    expect(
      (await readCapturedToasts(page)).filter(({ type }) => type === "error"),
    ).toEqual([]);
  } finally {
    if (activeApp) await closePromptHub(activeApp, userDataDir);
    else if (fs.existsSync(userDataDir))
      fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
