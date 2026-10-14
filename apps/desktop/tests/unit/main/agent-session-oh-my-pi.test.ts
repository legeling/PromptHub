import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAgentSessionService } from "../../../src/main/services/agent-session-service";

const temporaryRoots: string[] = [];

async function createHome(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-oh-my-pi-session-"),
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

describe("Oh My Pi session adapter", () => {
  it("indexes cwd-scoped JSONL sessions and reads visible messages lazily", async () => {
    const homeDir = await createHome();
    const ohMyPiRootDir = path.join(homeDir, ".omp", "agent");
    const sessionId = "019f9b36-25a2-7c31-b5cf-0b3d5b5a7d77";
    const sessionsDir = path.join(
      ohMyPiRootDir,
      "sessions",
      "-workspace-oh-my-pi",
    );
    const sessionPath = path.join(sessionsDir, `${sessionId}.jsonl`);
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      sessionPath,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: sessionId,
          title: "Oh My Pi integration",
          timestamp: "2026-07-25T08:00:00.000Z",
          cwd: "/workspace/oh-my-pi",
        }),
        JSON.stringify({
          type: "model_change",
          id: "model-1",
          parentId: null,
          timestamp: "2026-07-25T08:00:01.000Z",
          model: "anthropic/claude-sonnet-4",
        }),
        JSON.stringify({
          type: "message",
          id: "message-1",
          parentId: null,
          timestamp: "2026-07-25T08:00:02.000Z",
          message: { role: "user", content: "Review Oh My Pi support" },
        }),
        JSON.stringify({
          type: "title",
          v: 1,
          title: "Review Oh My Pi support",
          source: "auto",
          updatedAt: "2026-07-25T08:00:03.000Z",
          pad: "",
        }),
        "{ malformed session row",
        JSON.stringify({
          type: "message",
          id: "message-2",
          parentId: "message-1",
          timestamp: "2026-07-25T08:00:04.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "The adapter can stay read-only." },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "message-3",
          parentId: "message-2",
          timestamp: "2026-07-25T08:00:05.000Z",
          message: {
            role: "toolResult",
            content: [{ type: "text", text: "tool output" }],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "message-4",
          parentId: "message-3",
          message: { role: "developer", content: "internal note" },
        }),
        JSON.stringify({
          type: "message",
          id: "message-5",
          parentId: "message-4",
          message: { role: "unknown", content: "ignored role" },
        }),
      ].join("\n"),
    );

    const service = createAgentSessionService({ homeDir, ohMyPiRootDir });
    const list = await service.list("oh-my-pi", { limit: 20 });

    expect(list).toMatchObject({
      agentId: "oh-my-pi",
      adapter: "oh-my-pi-session-jsonl-v1",
      total: 1,
      hasMore: false,
      sessions: [
        {
          id: sessionId,
          title: "Review Oh My Pi support",
          projectLabel: "oh-my-pi",
          projectPath: "/workspace/oh-my-pi",
          model: "anthropic/claude-sonnet-4",
          messageCount: 5,
          sourcePath: sessionPath,
          resume: {
            executable: "omp",
            args: ["--resume", sessionId],
            environment: { PI_CODING_AGENT_DIR: ohMyPiRootDir },
            cwd: "/workspace/oh-my-pi",
          },
        },
      ],
    });

    const detail = await service.read("oh-my-pi", sessionId);
    expect(detail).toMatchObject({
      agentId: "oh-my-pi",
      adapter: "oh-my-pi-session-jsonl-v1",
      sessionId,
      parseErrors: 1,
      truncated: false,
    });
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Review Oh My Pi support"],
      ["assistant", "The adapter can stay read-only."],
      ["tool", "tool output"],
      ["system", "internal note"],
    ]);
  });

  it("ignores nested subagent transcripts, unsafe ids, and symlinks", async () => {
    const homeDir = await createHome();
    const ohMyPiRootDir = path.join(homeDir, ".omp", "agent");
    const sessionsDir = path.join(ohMyPiRootDir, "sessions", "-workspace");
    await fs.mkdir(path.join(sessionsDir, "nested"), { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "not-a-session.jsonl"),
      JSON.stringify({ type: "session", id: "../escape", cwd: "/tmp" }),
    );
    await fs.writeFile(
      path.join(sessionsDir, "not-a-header.jsonl"),
      JSON.stringify({ type: "message", id: "missing-header" }),
    );
    await fs.writeFile(
      path.join(sessionsDir, "nested", "subagent.jsonl"),
      JSON.stringify({ type: "session", id: "nested", cwd: "/tmp" }),
    );
    const outsidePath = path.join(homeDir, "outside.jsonl");
    await fs.writeFile(
      outsidePath,
      JSON.stringify({ type: "session", id: "linked", cwd: "/tmp" }),
    );
    if (process.platform !== "win32") {
      await fs.symlink(outsidePath, path.join(sessionsDir, "linked.jsonl"));
    }

    const service = createAgentSessionService({ homeDir, ohMyPiRootDir });
    await expect(
      service.list("oh-my-pi", { limit: 20 }),
    ).resolves.toMatchObject({
      total: 0,
      sessions: [],
    });
    await expect(service.read("oh-my-pi", "../escape")).rejects.toThrow(
      "AGENT_SESSION_ID_INVALID",
    );
  });

  it("falls back to the first user message and message model when metadata is absent", async () => {
    const homeDir = await createHome();
    const ohMyPiRootDir = path.join(homeDir, ".omp", "agent");
    const sessionsDir = path.join(ohMyPiRootDir, "sessions", "-workspace");
    const fallbackId = "session-with-fallbacks";
    const emptyId = "session-without-title";
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, `${fallbackId}.jsonl`),
      [
        JSON.stringify({ type: "session", id: fallbackId }),
        JSON.stringify({
          type: "message",
          id: "fallback-message",
          message: {
            role: "user",
            model: "openai/gpt-5",
            content: "Use the first user message as the title",
          },
        }),
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(sessionsDir, `${emptyId}.jsonl`),
      JSON.stringify({ type: "session", id: emptyId }),
    );

    const service = createAgentSessionService({ homeDir, ohMyPiRootDir });
    const list = await service.list("oh-my-pi", { limit: 20 });

    expect(list.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fallbackId,
          title: "Use the first user message as the title",
          model: "openai/gpt-5",
          messageCount: 1,
        }),
        expect.objectContaining({
          id: emptyId,
          title: emptyId,
          model: null,
          messageCount: 0,
        }),
      ]),
    );
  });
});
