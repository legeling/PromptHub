import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgentSessionService } from "../../../src/main/services/agent-session-service";

const SESSION_WITH_TRANSCRIPT = "936caf23-6be6-40f6-8709-2335ce13d395";
const SESSION_DATABASE_ONLY = "02e9cdcf-268a-4f07-a237-0db033c89298";

describe("Antigravity CLI conversation sessions", () => {
  let homeDir: string;
  let cliRoot: string;
  let conversationsRoot: string;

  beforeEach(async () => {
    homeDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-antigravity-session-"),
    );
    cliRoot = path.join(homeDir, ".gemini", "antigravity-cli");
    conversationsRoot = path.join(cliRoot, "conversations");
    await fs.mkdir(conversationsRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  async function writeConversation(
    sessionId: string,
    updatedAt: number,
  ): Promise<string> {
    const filePath = path.join(conversationsRoot, `${sessionId}.db`);
    await fs.writeFile(filePath, "SQLite format 3\0fixture", "utf8");
    const timestamp = new Date(updatedAt);
    await fs.utimes(filePath, timestamp, timestamp);
    return filePath;
  }

  async function writeTranscript(
    sessionId: string,
    lines: Array<string | Record<string, unknown>>,
  ): Promise<string> {
    const transcriptPath = path.join(
      cliRoot,
      "brain",
      sessionId,
      ".system_generated",
      "logs",
      "transcript.jsonl",
    );
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(
      transcriptPath,
      `${lines
        .map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
        .join("\n")}\n`,
      "utf8",
    );
    return transcriptPath;
  }

  it("lists, searches and reads the CLI-owned visible transcript projection", async () => {
    const sourcePath = await writeConversation(
      SESSION_WITH_TRANSCRIPT,
      Date.parse("2026-06-13T14:39:24.000Z"),
    );
    await writeConversation(
      SESSION_DATABASE_ONLY,
      Date.parse("2026-06-12T14:39:24.000Z"),
    );
    const projectPath = path.join(homeDir, "Projects", "release-console");
    await fs.mkdir(path.join(cliRoot, "cache"), { recursive: true });
    await fs.writeFile(
      path.join(cliRoot, "cache", "projects.json"),
      JSON.stringify({ [projectPath]: SESSION_WITH_TRANSCRIPT }),
      "utf8",
    );
    await writeTranscript(SESSION_WITH_TRANSCRIPT, [
      {
        step_index: 0,
        source: "USER_EXPLICIT",
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-06-13T14:30:00Z",
        content: "Review the Antigravity release plan",
      },
      {
        step_index: 1,
        source: "MODEL",
        type: "CODE_ACTION",
        status: "DONE",
        created_at: "2026-06-13T14:31:00Z",
        content: "PRIVATE_TOOL_PAYLOAD",
      },
      {
        step_index: 2,
        source: "MODEL",
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: "2026-06-13T14:32:00Z",
        content: "Add a rollback checkpoint before publishing.",
      },
      {
        step_index: 3,
        source: "SYSTEM",
        type: "SYSTEM_MESSAGE",
        status: "DONE",
        created_at: "2026-06-13T14:33:00Z",
        content: "Conversation resumed",
      },
      "{not-json",
    ]);
    const service = createAgentSessionService({ homeDir });

    await expect(
      service.list("antigravity-cli", { limit: 1 }),
    ).resolves.toEqual({
      agentId: "antigravity-cli",
      adapter: "antigravity-cli-transcript-v1",
      sessions: [
        {
          id: SESSION_WITH_TRANSCRIPT,
          title: "Review the Antigravity release plan",
          projectLabel: "release-console",
          projectPath,
          createdAt: Date.parse("2026-06-13T14:30:00Z"),
          updatedAt: Date.parse("2026-06-13T14:39:24.000Z"),
          model: null,
          messageCount: 3,
          sizeBytes: expect.any(Number),
          nativeDeleteSupported: true,
          sourcePath,
          resume: {
            executable: "agy",
            args: ["--conversation", SESSION_WITH_TRANSCRIPT],
            cwd: projectPath,
          },
        },
      ],
      total: 2,
      hasMore: true,
    });
    await expect(
      service.list("antigravity-cli", {
        limit: 20,
        search: "rollback checkpoint",
      }),
    ).resolves.toMatchObject({
      sessions: [{ id: SESSION_WITH_TRANSCRIPT }],
      total: 1,
      hasMore: false,
    });

    const detail = await service.read(
      "antigravity-cli",
      SESSION_WITH_TRANSCRIPT,
    );
    expect(detail).toEqual({
      agentId: "antigravity-cli",
      adapter: "antigravity-cli-transcript-v1",
      sessionId: SESSION_WITH_TRANSCRIPT,
      entries: [
        {
          id: "0",
          role: "user",
          timestamp: Date.parse("2026-06-13T14:30:00Z"),
          text: "Review the Antigravity release plan",
        },
        {
          id: "2",
          role: "assistant",
          timestamp: Date.parse("2026-06-13T14:32:00Z"),
          text: "Add a rollback checkpoint before publishing.",
        },
        {
          id: "3",
          role: "system",
          timestamp: Date.parse("2026-06-13T14:33:00Z"),
          text: "Conversation resumed",
        },
      ],
      parseErrors: 1,
      truncated: false,
    });
    expect(JSON.stringify(detail)).not.toContain("PRIVATE_TOOL_PAYLOAD");
  });

  it("keeps database-only conversations resumable without inventing body text", async () => {
    await writeConversation(SESSION_DATABASE_ONLY, Date.now());
    const service = createAgentSessionService({ homeDir });

    await expect(
      service.list("antigravity-cli", { limit: 20 }),
    ).resolves.toMatchObject({
      sessions: [
        {
          id: SESSION_DATABASE_ONLY,
          title: SESSION_DATABASE_ONLY,
          messageCount: null,
          resume: {
            executable: "agy",
            args: ["--conversation", SESSION_DATABASE_ONLY],
          },
        },
      ],
    });
    await expect(
      service.read("antigravity-cli", SESSION_DATABASE_ONLY),
    ).resolves.toEqual({
      agentId: "antigravity-cli",
      adapter: "antigravity-cli-transcript-v1",
      sessionId: SESSION_DATABASE_ONLY,
      entries: [],
      parseErrors: 0,
      truncated: false,
    });
  });

  it("rejects unsafe sources, hides legacy protobuf and bounds visible text", async () => {
    const safeId = "f0c705f4-7e6b-426f-91bf-817d9bf4ac8d";
    await writeConversation(safeId, Date.now());
    await fs.writeFile(
      path.join(conversationsRoot, "legacy-desktop.pb"),
      "PRIVATE_LEGACY_PROTOBUF",
      "utf8",
    );
    await fs.writeFile(
      path.join(conversationsRoot, "invalid.name.db"),
      "invalid",
      "utf8",
    );
    const outside = path.join(homeDir, "outside.db");
    await fs.writeFile(outside, "outside", "utf8");
    await fs.symlink(
      outside,
      path.join(conversationsRoot, "11111111-1111-4111-8111-111111111111.db"),
    );
    await writeTranscript(safeId, [
      {
        source: "USER_EXPLICIT",
        type: "USER_INPUT",
        content: "x".repeat(70 * 1024),
      },
      {
        source: "MODEL",
        type: "CODE_ACTION",
        content: "private".repeat(384 * 1024),
      },
    ]);
    const service = createAgentSessionService({ homeDir });

    const list = await service.list("antigravity-cli", { limit: 20 });
    expect(list.sessions.map((session) => session.id)).toEqual([safeId]);
    const detail = await service.read("antigravity-cli", safeId);
    expect(detail.entries).toHaveLength(1);
    expect(detail.entries[0]?.text).toHaveLength(64 * 1024);
    await expect(service.read("antigravity-cli", "../outside")).rejects.toThrow(
      "AGENT_SESSION_ID_INVALID",
    );
    await expect(
      service.read("antigravity-cli", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toThrow("AGENT_SESSION_NOT_FOUND");
  });
});
