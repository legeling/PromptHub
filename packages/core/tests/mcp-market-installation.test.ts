import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { McpMarketTemplate } from "@prompthub/shared/types/mcp";
import { CoreMcpLibraryService } from "../src/mcp-library";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { createMcpTestStorage } from "./helpers/mcp-storage";

let root: string;
let storage: ReturnType<typeof createMcpTestStorage>;
let service: CoreMcpLibraryService;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-market-install-"));
  configureRuntimePaths({ userDataPath: root });
  storage = createMcpTestStorage();
  service = new CoreMcpLibraryService(storage.options);
});
afterEach(() => {
  storage.dispose();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function template(id: string): McpMarketTemplate {
  return {
    id,
    name: "context7",
    displayName: "Context7",
    description: "Documentation fixture",
    version: "4.4.2",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@4.4.2"],
    tags: ["docs"],
  };
}

it.each([
  "modelcontextprotocol:io-github-54yyyu-zotero-mcp",
  "modelcontextprotocol:io-github-upstash-context7",
  "custom/registry:context7",
  "CON",
])(
  "installs %s with a local identity and preserves source updates and history across reopen",
  (templateId) => {
    const source = template(templateId);
    const installed = service.installMarketTemplate(source);
    expect(installed.id).toMatch(/^mcp_[a-z0-9]+$/);
    expect(installed.id).not.toBe(templateId);
    expect(installed.source.id).toBe(templateId);
    const directory = path.join(root, "data", "mcp", installed.id, "versions");
    expect(fs.readdirSync(directory)).toEqual(["000001.json"]);
    expect(service.getVersion(installed.id, 1).server.args).toEqual(
      source.args,
    );
    const updated = {
      ...source,
      version: "4.4.3",
      args: ["-y", "@upstash/context7-mcp@4.4.3"],
    };
    expect(
      service.checkMarketTemplateUpdate(installed.id, updated).status,
    ).toBe("update-available");
    service.updateFromMarketTemplate(installed.id, updated);
    storage.dispose();
    storage = createMcpTestStorage();
    service = new CoreMcpLibraryService(storage.options);
    expect(service.read().servers).toEqual([
      expect.objectContaining({
        id: installed.id,
        args: updated.args,
        source: expect.objectContaining({ id: templateId }),
      }),
    ]);
    expect(
      service.listVersions(installed.id).items.map((v) => v.version),
    ).toEqual([2, 1]);
    service.restoreVersion(installed.id, 1);
    expect(service.getServer(installed.id)?.args).toEqual(source.args);
    expect(service.listVersions(installed.id).currentVersion).toBe(3);
  },
);

it("rolls back failed installation and can retry without a partial record", () => {
  const source = template("modelcontextprotocol:io-github-upstash-context7");
  const failing = new CoreMcpLibraryService({
    ...storage.options,
    injectPublicationFailure: () => {
      throw new Error("fixture publication failure");
    },
  });
  expect(() => failing.installMarketTemplate(source)).toThrow(
    "fixture publication failure",
  );
  expect(service.read().servers).toEqual([]);
  const installed = service.installMarketTemplate(source);
  expect(service.read().servers.map((s) => s.id)).toEqual([installed.id]);
  expect(
    service.listVersions(installed.id).items.map((v) => v.version),
  ).toEqual([1]);
  expect(service.checkMarketTemplateUpdate(installed.id, source).status).toBe(
    "up-to-date",
  );
});

it("retains existing local identities and bindings when installing another template", () => {
  const existing = service.createServer({
    id: "legacy-template",
    name: "legacy",
    command: "node",
  });
  const target = path.join(root, "native", "mcp.json");
  service.apply({
    target: "cursor",
    scope: "global",
    path: target,
    serverIds: [existing.id],
  });
  const before = service.read().bindings;
  service.installMarketTemplate(template("registry:context7"));
  expect(service.getServer(existing.id)?.id).toBe("legacy-template");
  expect(service.read().bindings).toEqual(before);
  expect(service.listVersions(existing.id).currentVersion).toBe(1);
});
