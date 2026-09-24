import { describe, expect, it, vi } from "vitest";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";

import {
  deletePromptVersionById,
  getPrompt,
  insertFolderDirect,
  insertPromptDirect,
  insertPromptVersionDirect,
  listPromptVersions,
  syncPromptWorkspace,
} from "../src/web-data";

function createMemoryD1(initial?: SyncSnapshot): D1Database {
  let row: {
    payload_json: string;
    exported_at: string;
    settings_updated_at: string | null;
  } | null = initial
    ? {
        payload_json: JSON.stringify(initial),
        exported_at: initial.exportedAt,
        settings_updated_at: initial.settingsUpdatedAt ?? null,
      }
    : null;

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => row),
        run: vi.fn(async () => {
          if (sql.includes("INSERT INTO sync_snapshots")) {
            if (row) {
              return { success: true, meta: { changes: 0 } };
            }
            row = {
              payload_json: String(args[1]),
              exported_at: String(args[2]),
              settings_updated_at: typeof args[3] === "string" ? args[3] : null,
            };
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE sync_snapshots")) {
            const expectedPayload = String(args[args.length - 1]);
            if (!row || row.payload_json !== expectedPayload) {
              return { success: true, meta: { changes: 0 } };
            }
            row = {
              payload_json: String(args[0]),
              exported_at: String(args[1]),
              settings_updated_at: typeof args[2] === "string" ? args[2] : null,
            };
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        }),
      })),
    })),
  } as unknown as D1Database;
}

function createContext(input: {
  db: D1Database;
  body?: unknown;
  params?: Record<string, string>;
}) {
  const params = input.params ?? {};

  return {
    env: { DB: input.db },
    get: vi.fn().mockReturnValue({
      userId: "user-1",
      username: "owner",
      role: "admin",
    }),
    req: {
      json: vi.fn().mockResolvedValue(input.body),
      param: vi.fn((name: string) => params[name] ?? ""),
      query: vi.fn(() => undefined),
    },
    json: (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  } as any;
}

describe("Cloudflare web-data direct restore compatibility", () => {
  it("persists desktop-compatible direct folder, prompt, and version restores", async () => {
    const db = createMemoryD1();
    const timestamp = "2026-06-01T00:00:00.000Z";

    const folderResponse = await insertFolderDirect(
      createContext({
        db,
        body: {
          id: "folder_restore",
          name: "Restored Folder",
          order: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    );
    expect(folderResponse.status).toBe(201);

    const promptResponse = await insertPromptDirect(
      createContext({
        db,
        body: {
          id: "prompt_restore",
          title: "Restored Prompt",
          userPrompt: "Restored body",
          variables: [],
          tags: ["restore"],
          folderId: "folder_restore",
          images: [],
          videos: [],
          isFavorite: true,
          isPinned: false,
          version: 2,
          currentVersion: 2,
          usageCount: 3,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    );
    expect(promptResponse.status).toBe(201);

    const versionResponse = await insertPromptVersionDirect(
      createContext({
        db,
        body: {
          id: "version_restore",
          promptId: "prompt_restore",
          version: 2,
          userPrompt: "Restored body",
          variables: [],
          note: "desktop restore",
          createdAt: timestamp,
        },
      }),
    );
    expect(versionResponse.status).toBe(201);

    const promptReadResponse = await getPrompt(
      createContext({
        db,
        params: { id: "prompt_restore" },
      }),
    );
    const promptReadPayload = (await promptReadResponse.json()) as {
      data: { id: string; title: string; folderId: string; usageCount: number };
    };
    expect(promptReadPayload.data).toMatchObject({
      id: "prompt_restore",
      title: "Restored Prompt",
      folderId: "folder_restore",
      usageCount: 3,
    });

    const versionsResponse = await listPromptVersions(
      createContext({
        db,
        params: { id: "prompt_restore" },
      }),
    );
    const versionsPayload = (await versionsResponse.json()) as {
      data: Array<{ id: string; note?: string | null }>;
    };
    expect(versionsPayload.data).toEqual([
      expect.objectContaining({
        id: "version_restore",
        note: "desktop restore",
      }),
    ]);

    const deleteResponse = await deletePromptVersionById(
      createContext({
        db,
        params: { versionId: "version_restore" },
      }),
    );
    expect(deleteResponse.status).toBe(200);

    const afterDeleteVersionsResponse = await listPromptVersions(
      createContext({
        db,
        params: { id: "prompt_restore" },
      }),
    );
    const afterDeleteVersionsPayload =
      (await afterDeleteVersionsResponse.json()) as {
        data: Array<{ id: string }>;
      };
    expect(afterDeleteVersionsPayload.data).toEqual([]);

    await expect(
      syncPromptWorkspace(createContext({ db })),
    ).resolves.toHaveProperty("status", 200);
  });
});
