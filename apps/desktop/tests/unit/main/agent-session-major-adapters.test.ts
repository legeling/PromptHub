import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAgentSessionService } from "../../../src/main/services/agent-session-service";

const temporaryRoots: string[] = [];

async function createHome(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-major-agent-session-"),
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

describe("major Agent session adapters", () => {
  it("lists active and archived Codex sessions once and renders only visible messages", async () => {
    const homeDir = await createHome();
    const codexRootDir = path.join(homeDir, ".codex");
    const currentDir = path.join(codexRootDir, "sessions", "2026", "07", "22");
    const archiveDir = path.join(codexRootDir, "archived_sessions");
    const sessionId = "019f87f5-7cf6-7151-a7d2-226039ceda11";
    const currentPath = path.join(
      currentDir,
      `rollout-current-${sessionId}.jsonl`,
    );
    await fs.mkdir(currentDir, { recursive: true });
    await fs.mkdir(archiveDir, { recursive: true });
    const transcript = [
      JSON.stringify({
        timestamp: "2026-07-22T03:54:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd: "/workspace/current",
          timestamp: "2026-07-22T03:54:00.000Z",
        },
      }),
      JSON.stringify({
        timestamp: "2026-07-22T03:54:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "Hidden instructions" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-07-22T03:54:02.000Z",
        type: "event_msg",
        payload: { type: "user_message", message: "Fix the Codex history" },
      }),
      "{ malformed",
      JSON.stringify({
        timestamp: "2026-07-22T03:54:03.000Z",
        type: "event_msg",
        payload: { type: "agent_message", message: "History is visible." },
      }),
      JSON.stringify({
        timestamp: "2026-07-22T03:54:04.000Z",
        type: "response_item",
        payload: { type: "custom_tool_call", name: "exec" },
      }),
    ].join("\n");
    await fs.writeFile(currentPath, `${transcript}\n${"{}\n".repeat(700_000)}`);
    const duplicatePath = path.join(
      archiveDir,
      `rollout-duplicate-${sessionId}.jsonl`,
    );
    await fs.writeFile(duplicatePath, transcript);
    await fs.writeFile(
      path.join(codexRootDir, "session_index.jsonl"),
      [
        JSON.stringify({
          id: sessionId,
          thread_name: "Previous Codex thread name",
          updated_at: "2026-07-22T03:55:00.000Z",
        }),
        "{ malformed",
        JSON.stringify({
          id: "../../unsafe",
          thread_name: "Unsafe thread name",
          updated_at: "2026-07-22T03:56:00.000Z",
        }),
        JSON.stringify({
          id: sessionId,
          thread_name: " Renamed\u0000 Codex\nthread ",
          updated_at: "2026-07-22T03:57:00.000Z",
        }),
      ].join("\n"),
    );
    const archivedId = "019f1111-1111-7111-a111-111111111111";
    await fs.writeFile(
      path.join(archiveDir, `rollout-old-${archivedId}.jsonl`),
      [
        JSON.stringify({
          type: "session_meta",
          timestamp: "2026-07-20T01:00:00.000Z",
          payload: { id: archivedId, cwd: "/workspace/old" },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-07-20T01:00:01.000Z",
          payload: { type: "user_message", message: "Old session" },
        }),
      ].join("\n"),
    );
    const service = createAgentSessionService({ homeDir, codexRootDir });
    const list = await service.list("codex", { limit: 1 });

    expect(list).toMatchObject({
      agentId: "codex",
      adapter: "codex-rollout-jsonl-v1",
      total: 2,
      hasMore: true,
      sessions: [
        expect.objectContaining({
          id: sessionId,
          title: "Renamed Codex thread",
          projectPath: "/workspace/current",
          resume: {
            executable: "codex",
            args: ["resume", sessionId],
            environment: { CODEX_HOME: codexRootDir },
            cwd: "/workspace/current",
          },
        }),
      ],
    });

    const detail = await service.read("codex", sessionId);
    expect(detail).toMatchObject({
      adapter: "codex-rollout-jsonl-v1",
      parseErrors: 1,
      truncated: false,
      nextCursor: null,
    });
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Fix the Codex history"],
      ["assistant", "History is visible."],
    ]);
    await service.delete("codex", sessionId);
    await expect(fs.access(currentPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(duplicatePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reads current Codex response-item messages without exposing private records", async () => {
    const homeDir = await createHome();
    const codexRootDir = path.join(homeDir, ".codex");
    const sessionDir = path.join(codexRootDir, "sessions", "2026", "08", "10");
    const sessionId = "019fdfaa-d15a-7822-8ede-917f632d5b79";
    const sessionPath = path.join(sessionDir, `rollout-${sessionId}.jsonl`);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      sessionPath,
      [
        JSON.stringify({
          type: "session_meta",
          timestamp: "2026-08-10T06:03:00.000Z",
          payload: { id: sessionId, cwd: "/workspace/current-codex" },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-08-10T06:03:01.000Z",
          payload: {
            type: "message",
            id: "developer-message",
            role: "developer",
            content: [{ type: "input_text", text: "Hidden instructions" }],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-08-10T06:03:02.000Z",
          payload: {
            type: "message",
            id: "user-message",
            role: "user",
            content: [
              { type: "input_text", text: "Render the current Codex history" },
              {
                type: "input_image",
                image_url: "data:image/png;base64,hidden",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-08-10T06:03:03.000Z",
          payload: {
            type: "reasoning",
            id: "private-reasoning",
            summary: [{ type: "summary_text", text: "Hidden reasoning" }],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-08-10T06:03:04.000Z",
          payload: {
            type: "message",
            id: "assistant-message",
            role: "assistant",
            phase: "final_answer",
            content: [
              { type: "output_text", text: "The current history is visible." },
            ],
          },
        }),
      ].join("\n"),
    );
    const sessionBytes = (await fs.stat(sessionPath)).size;

    const service = createAgentSessionService({ homeDir, codexRootDir });
    const list = await service.list("codex", { limit: 20 });
    const detail = await service.read("codex", sessionId);

    expect(list.sessions).toEqual([
      expect.objectContaining({
        id: sessionId,
        title: "Render the current Codex history",
        projectPath: "/workspace/current-codex",
        sizeBytes: sessionBytes,
        nativeDeleteSupported: true,
      }),
    ]);
    expect(detail.entries).toEqual([
      expect.objectContaining({
        id: "user-message",
        role: "user",
        text: "Render the current Codex history",
      }),
      expect.objectContaining({
        id: "assistant-message",
        role: "assistant",
        text: "The current history is visible.",
      }),
    ]);

    await service.delete("codex", sessionId);
    await expect(fs.access(sessionPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(service.delete("codex", sessionId)).rejects.toThrow(
      "AGENT_SESSION_NOT_FOUND",
    );
    await expect(service.delete("grok", sessionId)).rejects.toThrow(
      "AGENT_SESSION_NOT_FOUND",
    );
    await expect(service.delete("codex", "../outside")).rejects.toThrow(
      "AGENT_SESSION_ID_INVALID",
    );
  });

  it("paginates visible Codex messages beyond a large hidden runtime prefix", async () => {
    const homeDir = await createHome();
    const codexRootDir = path.join(homeDir, ".codex");
    const sessionDir = path.join(codexRootDir, "sessions", "2026", "08", "01");
    const sessionId = "019f87f5-7cf6-7151-a7d2-226039ceda22";
    const sessionPath = path.join(sessionDir, `rollout-${sessionId}.jsonl`);
    await fs.mkdir(sessionDir, { recursive: true });
    const hiddenRecord = `${JSON.stringify({
      type: "response_item",
      payload: { type: "custom_tool_call", name: "exec" },
    })}\n`;
    await fs.writeFile(
      sessionPath,
      [
        `${JSON.stringify({
          type: "session_meta",
          timestamp: "2026-08-01T01:00:00.000Z",
          payload: { id: sessionId, cwd: "/workspace/large" },
        })}\n`,
        hiddenRecord.repeat(40_000),
        `${JSON.stringify({
          type: "event_msg",
          timestamp: "2026-08-01T01:01:00.000Z",
          payload: { type: "user_message", message: "Visible after 2 MiB" },
        })}\n`,
        hiddenRecord.repeat(2_000),
        `${JSON.stringify({
          type: "event_msg",
          timestamp: "2026-08-01T01:02:00.000Z",
          payload: { type: "agent_message", message: "Second visible page" },
        })}\n`,
      ].join(""),
    );
    expect((await fs.stat(sessionPath)).size).toBeGreaterThan(2 * 1024 * 1024);

    const service = createAgentSessionService({ homeDir, codexRootDir });
    const first = await service.read("codex", sessionId, { limit: 1 });

    expect(first).toMatchObject({
      entries: [expect.objectContaining({ text: "Visible after 2 MiB" })],
      truncated: false,
    });
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.read("codex", sessionId, {
      cursor: first.nextCursor!,
      limit: 1,
    });
    expect(second).toMatchObject({
      entries: [expect.objectContaining({ text: "Second visible page" })],
      nextCursor: null,
      truncated: false,
    });
    await expect(
      service.read("codex", sessionId, { cursor: "not-a-cursor", limit: 1 }),
    ).rejects.toThrow("AGENT_SESSION_CURSOR_INVALID");

    await fs.truncate(sessionPath, 0);
    await expect(
      service.read("codex", sessionId, {
        cursor: first.nextCursor!,
        limit: 1,
      }),
    ).rejects.toThrow("AGENT_SESSION_CURSOR_STALE");
  });

  it("continues Codex detail pagination after the per-page scan budget", async () => {
    const homeDir = await createHome();
    const codexRootDir = path.join(homeDir, ".codex");
    const sessionDir = path.join(codexRootDir, "sessions", "2026", "08", "01");
    const sessionId = "019f87f5-7cf6-7151-a7d2-226039ceda33";
    const sessionPath = path.join(sessionDir, `rollout-${sessionId}.jsonl`);
    await fs.mkdir(sessionDir, { recursive: true });
    const hiddenRecord = `${JSON.stringify({
      type: "response_item",
      payload: { type: "custom_tool_call", name: "exec" },
    })}\n`;
    const hiddenBytes = 17 * 1024 * 1024;
    const hiddenCount = Math.ceil(
      hiddenBytes / Buffer.byteLength(hiddenRecord),
    );
    await fs.writeFile(
      sessionPath,
      [
        hiddenRecord.repeat(hiddenCount),
        `${JSON.stringify({
          type: "event_msg",
          timestamp: "2026-08-01T02:00:00.000Z",
          payload: {
            type: "user_message",
            message: "Visible after the scan budget",
          },
        })}\n`,
      ].join(""),
    );

    const service = createAgentSessionService({ homeDir, codexRootDir });
    const first = await service.read("codex", sessionId, { limit: 1 });

    expect(first).toMatchObject({
      entries: [],
      truncated: false,
    });
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.read("codex", sessionId, {
      cursor: first.nextCursor!,
      limit: 1,
    });
    expect(second).toMatchObject({
      entries: [
        expect.objectContaining({ text: "Visible after the scan budget" }),
      ],
      nextCursor: null,
      truncated: false,
    });
  });

  it("reads bounded Grok Build summary and chat history without runtime artifacts", async () => {
    const homeDir = await createHome();
    const grokRootDir = path.join(homeDir, ".grok");
    const projectPath = "/workspace/grok-project";
    const sessionId = "019f82d7-9a58-75c2-a390-ef5ed6f38971";
    const sessionDir = path.join(
      grokRootDir,
      "sessions",
      encodeURIComponent(projectPath),
      sessionId,
    );
    await fs.mkdir(path.join(sessionDir, "terminal"), { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, "summary.json"),
      JSON.stringify({
        generated_title: "Review Grok session support",
        created_at: "2026-07-21T04:03:15.754Z",
        updated_at: "2026-07-21T04:45:46.152Z",
        current_model_id: "grok-4.5",
        num_chat_messages: 3,
      }),
    );
    const chatHistoryPath = path.join(sessionDir, "chat_history.jsonl");
    await fs.writeFile(
      chatHistoryPath,
      [
        JSON.stringify({ type: "system", content: "Hidden system prompt" }),
        JSON.stringify({
          type: "user",
          content: [{ type: "text", text: "Review Grok session support" }],
        }),
        "{ malformed",
        JSON.stringify({
          type: "assistant",
          content: "The format is bounded.",
        }),
        JSON.stringify({ type: "tool_result", content: "Hidden tool output" }),
      ].join("\n"),
    );
    const chatHistoryRealPath = await fs.realpath(chatHistoryPath);
    await fs.writeFile(path.join(sessionDir, "terminal", "call.log"), "secret");
    const sessionBytes =
      (await fs.stat(chatHistoryPath)).size +
      (await fs.stat(path.join(sessionDir, "summary.json"))).size +
      (await fs.stat(path.join(sessionDir, "terminal", "call.log"))).size;

    const service = createAgentSessionService({ homeDir, grokRootDir });
    const list = await service.list("grok", { limit: 20 });

    expect(list.sessions).toEqual([
      expect.objectContaining({
        id: sessionId,
        title: "Review Grok session support",
        projectPath,
        model: "grok-4.5",
        messageCount: 3,
        sourcePath: chatHistoryRealPath,
        sizeBytes: sessionBytes,
        nativeDeleteSupported: true,
        resume: {
          executable: "grok",
          args: ["--resume", sessionId],
          environment: { GROK_HOME: grokRootDir },
          cwd: projectPath,
        },
      }),
    ]);
    const detail = await service.read("grok", sessionId);
    expect(detail.parseErrors).toBe(1);
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Review Grok session support"],
      ["assistant", "The format is bounded."],
    ]);
    await service.delete("grok", sessionId);
    await expect(fs.access(sessionDir)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses a valid Codex thread name after an oversized partial index record", async () => {
    const homeDir = await createHome();
    const codexRootDir = path.join(homeDir, ".codex");
    const sessionDir = path.join(codexRootDir, "sessions", "2026", "08", "10");
    const sessionId = "019fdfab-1111-7222-8333-444444444444";
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, `rollout-${sessionId}.jsonl`),
      [
        JSON.stringify({
          type: "session_meta",
          payload: { id: sessionId, cwd: "/workspace/oversized-index" },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "user_message", message: "Fallback title" },
        }),
      ].join("\n"),
    );
    const lastRecord = Buffer.from(
      `\n${JSON.stringify({ id: sessionId, thread_name: "Bounded native title" })}\n`,
    );
    await fs.writeFile(
      path.join(codexRootDir, "session_index.jsonl"),
      Buffer.concat([
        Buffer.alloc(8 * 1024 * 1024 + 1 - lastRecord.length, 0x78),
        lastRecord,
      ]),
    );

    const service = createAgentSessionService({ homeDir, codexRootDir });
    const list = await service.list("codex", { limit: 20 });

    expect(list.sessions[0]?.title).toBe("Bounded native title");
  });

  it("reads OpenClaw indexed transcripts and rejects paths outside its root", async () => {
    const homeDir = await createHome();
    const openclawRootDir = path.join(homeDir, ".openclaw");
    const sessionsDir = path.join(
      openclawRootDir,
      "agents",
      "main",
      "sessions",
    );
    const sessionId = "e6226a20-a6e1-443e-8140-32ed60390454";
    const transcriptPath = path.join(sessionsDir, `${sessionId}.jsonl`);
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      transcriptPath,
      [
        JSON.stringify({
          type: "session",
          id: sessionId,
          cwd: "/workspace/openclaw",
          timestamp: "2026-07-19T01:00:00.000Z",
        }),
        JSON.stringify({
          type: "message",
          id: "message-1",
          timestamp: "2026-07-19T01:00:01.000Z",
          message: { role: "user", content: "Inspect OpenClaw history" },
        }),
        "{ malformed",
        JSON.stringify({
          type: "message",
          id: "message-2",
          timestamp: "2026-07-19T01:00:02.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "The transcript is local." }],
          },
        }),
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        "agent:main:main": {
          sessionId,
          sessionFile: transcriptPath,
          updatedAt: 1784422802000,
          model: "moonshotai/Kimi-K2.5",
        },
        "agent:main:escaped": {
          sessionId: "escaped-session",
          sessionFile: path.join(homeDir, "outside.jsonl"),
          updatedAt: 1784422803000,
        },
      }),
    );

    const service = createAgentSessionService({ homeDir, openclawRootDir });
    const list = await service.list("openclaw", { limit: 20 });

    expect(list).toMatchObject({
      adapter: "openclaw-session-store-v1",
      total: 1,
      hasMore: false,
    });
    expect(list.sessions[0]).toMatchObject({
      id: sessionId,
      title: "Inspect OpenClaw history",
      projectPath: "/workspace/openclaw",
      model: "moonshotai/Kimi-K2.5",
    });
    const detail = await service.read("openclaw", sessionId);
    expect(detail.parseErrors).toBe(1);
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Inspect OpenClaw history"],
      ["assistant", "The transcript is local."],
    ]);
    await expect(service.read("openclaw", "escaped-session")).rejects.toThrow(
      "AGENT_SESSION_NOT_FOUND",
    );
  });
});
