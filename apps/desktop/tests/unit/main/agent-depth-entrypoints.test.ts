/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";
import type { AgentDepthCapabilityConfig } from "@prompthub/shared/types/agent-platform";
import { createAgentSessionService } from "../../../src/main/services/agent-session-service";
import { AgentAppearanceService } from "../../../src/main/services/agent-appearance-service";

const temporaryRoots: string[] = [];
const restoreCapabilities: Array<() => void> = [];

function changeCapability(agentId: string, key: "sessions" | "appearance") {
  const definition = getAgentDefinitionById(agentId);
  if (!definition) throw new Error(`Missing ${agentId} fixture`);
  const capability = definition.capabilities[key];
  const original: AgentDepthCapabilityConfig = { ...capability };
  restoreCapabilities.push(() => Object.assign(capability, original));
  return capability;
}

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-depth-entry-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  restoreCapabilities
    .splice(0)
    .reverse()
    .forEach((restore) => restore());
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Agent depth execution switches", () => {
  it("blocks disabled session reads, indexing and deletion without touching the transcript", async () => {
    const homeDir = await temporaryRoot();
    const transcript = path.join(
      homeDir,
      ".claude",
      "projects",
      "project",
      "session-a.jsonl",
    );
    await fs.mkdir(path.dirname(transcript), { recursive: true });
    const raw = `${JSON.stringify({
      type: "user",
      uuid: "message-a",
      sessionId: "session-a",
      timestamp: "2026-10-13T00:00:00Z",
      message: { role: "user", content: "Preserve this transcript" },
    })}\n`;
    await fs.writeFile(transcript, raw);
    const service = createAgentSessionService({ homeDir });
    const capability = changeCapability("claude", "sessions");
    capability.enabled = false;
    expect(service.getIndexSource("claude")).toBeNull();
    expect(service.canDelete("claude")).toBe(false);
    await expect(service.list("claude", { limit: 10 })).rejects.toThrow(
      "AGENT_SESSION_UNSUPPORTED",
    );
    await expect(service.read("claude", "session-a")).rejects.toThrow(
      "AGENT_SESSION_UNSUPPORTED",
    );
    await expect(service.delete("claude", "session-a")).rejects.toThrow(
      "AGENT_SESSION_UNSUPPORTED",
    );
    await expect(
      service.scanIndex("claude", {
        previous: [],
        adapterVersionChanged: false,
      }),
    ).rejects.toThrow("AGENT_SESSION_UNSUPPORTED");
    expect(await fs.readFile(transcript, "utf8")).toBe(raw);
    capability.enabled = true;
    capability.status = "planned";
    await expect(service.list("claude", { limit: 10 })).rejects.toThrow(
      "AGENT_SESSION_UNSUPPORTED",
    );
    capability.status = "partial";
    expect((await service.list("claude", { limit: 10 })).sessions).toHaveLength(
      1,
    );
    expect((await service.read("claude", "session-a")).entries).toHaveLength(1);
    await service.delete("claude", "session-a");
    expect((await service.list("claude", { limit: 10 })).total).toBe(0);
  });

  it("blocks direct appearance operations before filesystem or engine activity", async () => {
    const root = await temporaryRoot();
    const dataRoot = path.join(root, "data");
    const engine = {
      version: "test",
      sourceCommit: "test",
      readThemePackage: vi.fn(),
      applyTheme: vi.fn(),
      restoreTheme: vi.fn(),
    };
    const service = new AgentAppearanceService({
      dataRoot,
      codexRoot: path.join(root, ".codex"),
      engine,
    });
    const capability = changeCapability("codex", "appearance");
    capability.enabled = false;
    const operations = [
      () => service.getOverview(),
      () => service.importTheme(root),
      () => service.deleteTheme("test"),
      () => service.exportTheme("test", root),
      () => service.getThemePreview("test"),
      () => service.applyTheme("test"),
      () => service.restoreTheme(),
      () => service.importPet(root),
      () => service.exportPet("test", root),
      () => service.deletePet("test"),
      () => service.getPetPreview("test"),
      () =>
        service.updatePetMetadata({
          agentId: "codex",
          petId: "test",
          name: "Test",
          description: "Test",
        }),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toThrow("AGENT_APPEARANCE_UNSUPPORTED");
    }
    expect(engine.readThemePackage).not.toHaveBeenCalled();
    expect(engine.applyTheme).not.toHaveBeenCalled();
    expect(engine.restoreTheme).not.toHaveBeenCalled();
    expect(await fs.readdir(root)).toEqual([]);
    capability.enabled = true;
    capability.status = "planned";
    await expect(service.getOverview()).rejects.toThrow(
      "AGENT_APPEARANCE_UNSUPPORTED",
    );
    capability.status = "partial";
    await expect(service.getOverview()).resolves.toMatchObject({
      supported: true,
      themes: [],
      pets: [],
    });
  });
});
