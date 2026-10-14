import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { getDatabase, AgentSessionIndexDB } from "@prompthub/db";
import { AGENT_DEFINITIONS } from "@prompthub/shared/constants/agent-definitions";
import { getPlatformMcpRelativePath } from "@prompthub/shared/constants/platforms";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { mcpApi } from "../../src/preload/api/mcp";
import {
  createAgentSessionIndexOperations,
  resolveAgentSessionIndexSource,
} from "../../src/main/services/agent-session-index-operations";

let fixture: SkillTestRuntime;
beforeEach(async () => {
  fixture = await createSkillTestRuntime();
  registerMcpIPC();
});
afterEach(() => fixture?.dispose());

it("resolves every registered primary MCP target from persisted Agent roots before and after reopen", async () => {
  for (const reopen of [false, true]) {
    if (reopen) {
      await fixture.reopen();
      registerMcpIPC();
    }
    const presets = await mcpApi.getTargetPresets();
    for (const preset of presets.filter((p) => p.id === p.platformId)) {
      const definition = AGENT_DEFINITIONS.find(
        (d) => d.platform.id === preset.id,
      );
      if (!definition) throw new Error(`Unregistered target ${preset.id}`);
      expect(preset.path).toBe(
        path.join(
          fixture.platformRoot(preset.id),
          getPlatformMcpRelativePath(definition.platform, true)!,
        ),
      );
    }
  }
});

it("reads and indexes Gemini sessions only from the persisted selected root, including reopen and backup descriptors", async () => {
  const root = fixture.platformRoot("gemini");
  const sessionPath = path.join(
    root,
    "tmp",
    "project",
    "chats",
    "session-fixture.json",
  );
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    JSON.stringify({
      sessionId: "selected-gemini-session",
      summary: "Selected session",
      startTime: "2026-10-14T01:00:00Z",
      lastUpdated: "2026-10-14T01:01:00Z",
      messages: [{ id: "user", type: "user", content: "Selected content" }],
    }),
  );
  for (const reopen of [false, true]) {
    if (reopen) await fixture.reopen();
    const operations = createAgentSessionIndexOperations(
      new AgentSessionIndexDB(getDatabase()),
      "gemini",
    );
    expect(
      (await operations.list("gemini", { limit: 20 })).sessions.map(
        (s) => s.id,
      ),
    ).toEqual(["selected-gemini-session"]);
    expect(resolveAgentSessionIndexSource("gemini")?.rootPath).toBe(
      path.join(root, "tmp"),
    );
    operations.setEnabled("gemini", true);
    await operations.refresh("gemini");
    expect(
      (await operations.list("gemini", { limit: 20 })).sessions[0].sourcePath,
    ).toBe(sessionPath);
    expect(
      (await operations.read("gemini", "selected-gemini-session")).entries[0]
        .text,
    ).toBe("Selected content");
  }
});
