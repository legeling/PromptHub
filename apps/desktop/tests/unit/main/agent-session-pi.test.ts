import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAgentSessionService } from "../../../src/main/services/agent-session-service";

const temporaryRoots: string[] = [];

async function createHome(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-pi-session-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Pi session adapter", () => {
  it("reads only Pi sessions and preserves upstream model metadata", async () => {
    const homeDir = await createHome();
    const piRootDir = path.join(homeDir, ".pi", "agent");
    const ohMyPiRootDir = path.join(homeDir, ".omp", "agent");
    const sessionId = "019f9b36-25a2-7c31-b5cf-0b3d5b5a7d77";
    const sessionsDir = path.join(piRootDir, "sessions", "-workspace-pi");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(path.join(ohMyPiRootDir, "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, `${sessionId}.jsonl`),
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: sessionId,
          timestamp: "2026-07-30T08:00:00.000Z",
          cwd: "/workspace/pi",
        }),
        JSON.stringify({
          type: "model_change",
          id: "model-1",
          parentId: null,
          timestamp: "2026-07-30T08:00:01.000Z",
          provider: "anthropic",
          modelId: "claude-sonnet-4-5",
        }),
        JSON.stringify({
          type: "message",
          id: "message-1",
          parentId: "model-1",
          timestamp: "2026-07-30T08:00:02.000Z",
          message: { role: "user", content: "Keep Pi separate from OMP" },
        }),
        JSON.stringify({
          type: "message",
          id: "message-2",
          parentId: "message-1",
          timestamp: "2026-07-30T08:00:03.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "They now have separate roots." }],
          },
        }),
      ].join("\n"),
    );

    const service = createAgentSessionService({
      homeDir,
      piRootDir,
      ohMyPiRootDir,
    });
    const list = await service.list("pi", { limit: 20 });

    expect(list).toMatchObject({
      agentId: "pi",
      adapter: "pi-session-jsonl-v1",
      total: 1,
      hasMore: false,
      sessions: [
        {
          id: sessionId,
          title: "Keep Pi separate from OMP",
          projectLabel: "pi",
          projectPath: "/workspace/pi",
          model: "anthropic/claude-sonnet-4-5",
          messageCount: 2,
          resume: {
            executable: "pi",
            args: ["--session", sessionId],
            environment: { PI_CODING_AGENT_DIR: piRootDir },
            cwd: "/workspace/pi",
          },
        },
      ],
    });

    await expect(
      service.list("oh-my-pi", { limit: 20 }),
    ).resolves.toMatchObject({ agentId: "oh-my-pi", total: 0, sessions: [] });
    await expect(service.read("pi", sessionId)).resolves.toMatchObject({
      agentId: "pi",
      adapter: "pi-session-jsonl-v1",
      sessionId,
      entries: [
        expect.objectContaining({
          role: "user",
          text: "Keep Pi separate from OMP",
        }),
        expect.objectContaining({
          role: "assistant",
          text: "They now have separate roots.",
        }),
      ],
    });
  });

  it("cursor-pages the complete Pi transcript instead of stopping at a bounded preview", async () => {
    const homeDir = await createHome();
    const piRootDir = path.join(homeDir, ".pi", "agent");
    const sessionsDir = path.join(piRootDir, "sessions", "-workspace-pi");
    const sessionId = "complete-pi-history";
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, `${sessionId}.jsonl`),
      [
        JSON.stringify({ type: "session", id: sessionId }),
        ...Array.from({ length: 5 }, (_, index) => [
          ...(index === 2
            ? [
                JSON.stringify({
                  type: "runtime_record",
                  payload: "x".repeat(2 * 1024 * 1024 + 1),
                }),
              ]
            : []),
          JSON.stringify({
            type: "message",
            id: `message-${index}`,
            message: { role: "user", content: `Pi message ${index}` },
          }),
        ]).flat(),
      ].join("\n"),
    );

    const service = createAgentSessionService({ homeDir, piRootDir });
    const first = await service.read("pi", sessionId, { limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.read("pi", sessionId, {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.entries).toHaveLength(2);
    expect(second.nextCursor).toEqual(expect.any(String));

    const final = await service.read("pi", sessionId, {
      limit: 2,
      cursor: second.nextCursor,
    });
    expect(final.entries).toHaveLength(1);
    expect(final.nextCursor).toBeNull();
    expect(first.truncated || second.truncated || final.truncated).toBe(false);

    expect(
      [...first.entries, ...second.entries, ...final.entries].map(
        (item) => item.text,
      ),
    ).toEqual([
      "Pi message 0",
      "Pi message 1",
      "Pi message 2",
      "Pi message 3",
      "Pi message 4",
    ]);
  });

  it("rejects unsafe Pi session ids", async () => {
    const homeDir = await createHome();
    const service = createAgentSessionService({ homeDir });

    await expect(service.read("pi", "../escape")).rejects.toThrow(
      "AGENT_SESSION_ID_INVALID",
    );
  });

  it("falls back to provider-qualified message metadata", async () => {
    const homeDir = await createHome();
    const piRootDir = path.join(homeDir, ".pi", "agent");
    const sessionsDir = path.join(piRootDir, "sessions", "-workspace");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "message-model.jsonl"),
      [
        JSON.stringify({ type: "session", id: "message-model" }),
        JSON.stringify({
          type: "message",
          id: "assistant-message",
          message: {
            role: "assistant",
            provider: "openai",
            model: "gpt-5.2",
            content: "Model metadata comes from the message.",
          },
        }),
      ].join("\n"),
    );

    const service = createAgentSessionService({ homeDir, piRootDir });
    await expect(service.list("pi", { limit: 20 })).resolves.toMatchObject({
      sessions: [
        expect.objectContaining({
          id: "message-model",
          model: "openai/gpt-5.2",
        }),
      ],
    });
  });
});
