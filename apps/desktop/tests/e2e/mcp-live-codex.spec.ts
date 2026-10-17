import {
  expect,
  test,
  type Page,
  type ElectronApplication,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexMcpClient } from "./helpers/codex-mcp-client";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

// Opt-in: downloads published MCP packages and calls public documentation services.
// The regular desktop suite still owns deterministic MCP lifecycle coverage.
test.skip(
  process.env.PROMPTHUB_LIVE_MCP !== "1",
  "Requires an explicitly requested live MCP run",
);

async function openLibrary(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
  await page
    .getByRole("dialog", { name: "New MCP" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
}

test("Codex consumes PromptHub distributions and calls real Context7 and Filesystem tools", async () => {
  test.setTimeout(360_000);
  const executable = process.env.PROMPTHUB_LIVE_CODEX;
  if (!executable || !fs.existsSync(executable))
    throw new Error("Set PROMPTHUB_LIVE_CODEX to the native Codex executable");
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-live-codex-"),
  );
  const home = path.join(userDataDir, "home");
  const workspace = path.join(userDataDir, "sample files 中文");
  const codexConfig = path.join(home, ".codex/config.toml");
  fs.mkdirSync(path.dirname(codexConfig), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "hello.txt"),
    "PromptHub live MCP verification: 你好\n",
  );
  fs.writeFileSync(
    codexConfig,
    '# retained fixture\n[mcp_servers.unrelated_keep]\ncommand = "never-run-fixture"\nenabled = false\n',
  );
  const cache =
    process.env.PROMPTHUB_LIVE_NPM_CACHE ?? path.join(userDataDir, "npm-cache");
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: path.dirname(codexConfig),
    },
  });
  let client: CodexMcpClient | undefined;
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
    const dialog = page.getByRole("dialog", { name: "New MCP" });
    await dialog.getByRole("button", { name: /Paste config/ }).click();
    await dialog.getByLabel("MCP config JSON or TOML").fill(
      JSON.stringify({
        mcpServers: {
          context7: { url: "https://mcp.context7.com/mcp" },
          "context7-local": {
            command: "npx",
            args: ["-y", "@upstash/context7-mcp@4.4.2"],
            startupTimeoutSec: 90,
            env: { NPM_CONFIG_CACHE: cache },
          },
          filesystem: {
            command: "npx",
            args: [
              "-y",
              "@modelcontextprotocol/server-filesystem@1.0.0",
              workspace,
            ],
            startupTimeoutSec: 90,
            env: { NPM_CONFIG_CACHE: cache },
          },
        },
      }),
    );
    await dialog
      .getByRole("button", { name: "Import config", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const servers = (await page.evaluate(() => window.api.mcp.getLibrary()))
      .servers;
    expect(servers.map((s) => s.name).sort()).toEqual([
      "context7",
      "context7-local",
      "filesystem",
    ]);
    for (const server of servers) {
      await openLibrary(app, page);
      await page.getByTestId(`mcp-server-card-${server.id}`).click();
      await page.getByRole("button", { name: "Codex", exact: true }).click();
      await page.getByRole("button", { name: /Apply to 1 platform/ }).click();
      await expect(
        page.getByText("MCP applied", { exact: true }).last(),
      ).toBeVisible();
    }
    const projected = fs.readFileSync(codexConfig, "utf8");
    expect(projected).toContain("[mcp_servers.unrelated_keep]");
    expect(projected).toContain("[mcp_servers.context7]");
    expect(projected).toContain("[mcp_servers.filesystem]");
    expect(projected.match(/startup_timeout_sec = 90/g)).toHaveLength(2);
    expect(projected).not.toContain("[REDACTED]");
    await test
      .info()
      .attach("codex-config", { body: projected, contentType: "text/plain" });
    client = new CodexMcpClient(
      executable,
      home,
      workspace,
      test.info().outputPath("codex-stderr.log"),
    );
    await client.initialize(workspace);
    const inventory = await client.inventory();
    await test.info().attach("codex-tools", {
      body: JSON.stringify(inventory, null, 2),
      contentType: "application/json",
    });
    const remote = inventory.find((s) => s.name === "context7");
    expect(remote?.tools).toEqual(
      expect.arrayContaining(["resolve-library-id", "query-docs"]),
    );
    const resolved = await client.callTool("context7", "resolve-library-id", {
      libraryName: "react",
      query: "How do I use useState in React?",
    });
    expect(resolved.isError, resolved.text).toBe(false);
    const libraryId = resolved.text.match(/library ID: (\/[^\s]+)/)?.[1];
    expect(libraryId, resolved.text).toBeTruthy();
    const docs = await client.callTool("context7", "query-docs", {
      libraryId,
      query: "How do I update state with useState?",
    });
    expect(docs.isError, docs.text).toBe(false);
    expect(docs.text).toMatch(/useState/);
    const local = inventory.find((s) => s.name === "context7-local");
    expect(local?.tools).toEqual(
      expect.arrayContaining(["resolve-library-id", "query-docs"]),
    );
    const localDocs = await client.callTool("context7-local", "query-docs", {
      libraryId,
      query: "How do I update state with useState?",
    });
    expect(localDocs.isError, localDocs.text).toBe(false);
    expect(localDocs.text).toMatch(/useState/);
    const fileTools =
      inventory.find((s) => s.name === "filesystem")?.tools ?? [];
    const reader = fileTools.includes("read_text_file")
      ? "read_text_file"
      : "read_file";
    expect(fileTools).toContain(reader);
    const content = await client.callTool("filesystem", reader, {
      path: path.join(workspace, "hello.txt"),
    });
    expect(content).toEqual({
      isError: false,
      text: "PromptHub live MCP verification: 你好\n",
    });
    const denied = await client.callTool("filesystem", reader, {
      path: codexConfig,
    });
    expect(denied.isError, denied.text).toBe(true);
    await test.info().attach("live-call-summary", {
      body: JSON.stringify({
        remoteDocs: docs.text.slice(0, 200),
        localDocs: localDocs.text.slice(0, 200),
        file: content,
        denied: denied.isError,
      }),
      contentType: "application/json",
    });
    await client.close();
    const localServer = servers.find(
      (server) => server.name === "context7-local",
    );
    if (!localServer) throw new Error("Missing local Context7 fixture");
    await openLibrary(app, page);
    await page.getByTestId(`mcp-server-card-${localServer.id}`).click();
    await page.getByTitle("Remove from platform").click();
    await expect(
      page.getByText("MCP removed", { exact: true }).last(),
    ).toBeVisible();
    expect(fs.readFileSync(codexConfig, "utf8")).not.toContain(
      "[mcp_servers.context7-local]",
    );
    client = new CodexMcpClient(
      executable,
      home,
      workspace,
      test.info().outputPath("codex-restarted.log"),
    );
    await client.initialize(workspace);
    const restarted = await client.inventory();
    expect(restarted.map((server) => server.name)).not.toContain(
      "context7-local",
    );
    expect(
      restarted.find((server) => server.name === "context7")?.tools,
    ).toContain("query-docs");
    expect(
      await client.callTool("filesystem", reader, {
        path: path.join(workspace, "hello.txt"),
      }),
    ).toEqual(content);
  } finally {
    await client?.close();
    await closePromptHub(app, userDataDir);
  }
});
