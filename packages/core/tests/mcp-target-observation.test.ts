import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { createMcpTestStorage } from "./helpers/mcp-storage";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { CoreMcpLibraryService } from "../src/mcp-library";
import { mergeMcpTargetObservations } from "@prompthub/shared/utils/mcp-target-observation";
import type { McpTargetPreset } from "../src/mcp-target-presets";

it("distinguishes unreadable configuration from removal and retains the last observation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-mcp-status-"));
  configureRuntimePaths({ userDataPath: root });
  const storage = createMcpTestStorage();
  try {
    const file = path.join(root, "mcp.json");
    const preset: McpTargetPreset = {
      id: "cursor",
      label: "Cursor",
      target: "cursor",
      path: file,
      scope: "global",
    };
    const service = new CoreMcpLibraryService(storage.options);
    fs.writeFileSync(
      file,
      JSON.stringify({ mcpServers: { example: { command: "example" } } }),
    );
    const installed = service.getTargetStatus([preset]);
    expect(installed[0].serverNames).toEqual(["example"]);
    fs.writeFileSync(file, "{broken");
    const failed = service.getTargetStatus([preset]);
    expect(failed[0].error).toBe(
      "MCP target configuration could not be read: cursor",
    );
    expect(
      mergeMcpTargetObservations(installed, failed)[0].serverNames,
    ).toEqual(["example"]);
    fs.rmSync(file);
    const removed = mergeMcpTargetObservations(
      installed,
      service.getTargetStatus([preset]),
    );
    expect(removed[0]).toMatchObject({ exists: false, serverNames: [] });
    expect(removed[0].error).toBeUndefined();
  } finally {
    storage.dispose();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
