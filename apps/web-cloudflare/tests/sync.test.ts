import { describe, expect, it, vi } from "vitest";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";

import {
  emptySnapshot,
  loadSnapshot,
  normalizeSnapshot,
  saveSnapshot,
  snapshotCounts,
  SnapshotConflictError,
  SnapshotOutcomeUnknownError,
} from "../src/sync";

type WriteOutcome =
  | "normal"
  | "missing-meta"
  | "zero-changes"
  | "multiple-changes"
  | "failed";
type MemoryD1 = D1Database & {
  setWriteOutcome: (outcome: WriteOutcome) => void;
};

function createMemoryD1(
  initial?: SyncSnapshot,
  outcome: WriteOutcome = "normal",
): MemoryD1 {
  let payload = initial ? JSON.stringify(initial) : null;
  let currentOutcome = outcome;

  function result(changes: number): unknown {
    if (currentOutcome === "missing-meta") {
      return { success: true };
    }
    if (currentOutcome === "failed") {
      return { success: false, meta: { changes } };
    }
    if (currentOutcome === "zero-changes") {
      return { success: true, meta: { changes: 0 } };
    }
    if (currentOutcome === "multiple-changes") {
      return { success: true, meta: { changes: 2 } };
    }
    return { success: true, meta: { changes } };
  }

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () =>
          payload
            ? {
                payload_json: payload,
                exported_at: "2026-06-01T00:00:00.000Z",
                settings_updated_at: null,
              }
            : null,
        ),
        run: vi.fn(async () => {
          if (sql.includes("ON CONFLICT(user_id) DO NOTHING")) {
            if (payload !== null) {
              return result(0);
            }
            if (currentOutcome === "normal") {
              payload = String(args[1]);
            }
            return result(1);
          }

          if (sql.startsWith("UPDATE sync_snapshots")) {
            const expectedPayload = String(args[args.length - 1]);
            if (payload !== expectedPayload) {
              return result(0);
            }
            if (currentOutcome === "normal") {
              payload = String(args[0]);
            }
            return result(1);
          }

          return result(1);
        }),
      })),
    })),
  } as unknown as MemoryD1;
  db.setWriteOutcome = (nextOutcome) => {
    currentOutcome = nextOutcome;
  };
  return db;
}

describe("sync snapshot helpers", () => {
  it("creates an empty snapshot with cloudflare backup version", () => {
    const snapshot = emptySnapshot();

    expect(snapshot.version).toBe("web-cloudflare-backup-v1");
    expect(snapshot.prompts).toEqual([]);
    expect(snapshot.promptVersions).toEqual([]);
    expect(snapshot.versions).toEqual([]);
    expect(snapshot.skills).toEqual([]);
  });

  it("normalizes versions and promptVersions symmetrically", () => {
    const version = {
      id: "v1",
      promptId: "p1",
      version: 1,
      systemPrompt: null,
      systemPromptEn: null,
      userPrompt: "hello",
      userPromptEn: null,
      variables: [],
      aiResponse: null,
      note: null,
      createdAt: "2026-05-29T00:00:00.000Z",
    };

    const normalized = normalizeSnapshot({
      exportedAt: "2026-05-29T00:00:00.000Z",
      prompts: [],
      versions: [version],
      folders: [],
      skills: [],
      skillVersions: [],
    });

    expect(normalized.versions).toEqual([version]);
    expect(normalized.promptVersions).toEqual([version]);
  });

  it("preserves current sync snapshot agent asset fields and counts them", () => {
    const normalized = normalizeSnapshot({
      exportedAt: "2026-06-28T00:00:00.000Z",
      prompts: [],
      promptVersions: [],
      folders: [],
      rules: [],
      skills: [],
      skillVersions: [],
      mcpLibrary: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-06-28T00:00:00.000Z",
        bindings: [],
        servers: [
          {
            id: "mcp-1",
            name: "Docs MCP",
            transport: "stdio",
            command: "node",
            enabled: true,
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      pluginLibrary: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-06-28T00:00:00.000Z",
        plugins: [
          {
            id: "plugin-1",
            name: "demo-plugin",
            displayName: "Demo Plugin",
            trustLevel: "custom",
            inventory: {
              skills: 0,
              mcpServers: 0,
              apps: 0,
              commands: 0,
              hooks: 0,
              agents: 0,
              assets: 0,
              docs: 0,
              lspServers: 0,
              scripts: 0,
            },
            classification: "bundle",
            source: { kind: "local" },
            installedAt: 1,
            updatedAt: 1,
          },
        ],
      },
      pluginPackages: [
        {
          pluginId: "plugin-1",
          files: [
            {
              relativePath: "plugin.json",
              contentBase64: "e30=",
              size: 2,
            },
          ],
        },
      ],
      storeSources: {
        plugins: {
          selectedSourceId: "custom-source",
          customStoreSources: [
            {
              id: "custom-source",
              name: "Custom",
              type: "marketplace-json",
              url: "https://example.com/plugins.json",
            },
          ],
        },
      },
      agentAssetFiles: {
        plugins: [
          {
            relativePath: "plugin-note.txt",
            contentBase64: "bm90ZQ==",
            size: 4,
          },
        ],
      },
    });

    expect(normalized.mcpLibrary?.servers).toHaveLength(1);
    expect(normalized.pluginLibrary?.plugins).toHaveLength(1);
    expect(normalized.pluginPackages?.[0]?.files[0]?.relativePath).toBe(
      "plugin.json",
    );
    expect(normalized.storeSources?.plugins?.selectedSourceId).toBe(
      "custom-source",
    );
    expect(normalized.agentAssetFiles?.plugins?.[0]?.relativePath).toBe(
      "plugin-note.txt",
    );
    expect(snapshotCounts(normalized)).toMatchObject({
      prompts: 0,
      folders: 0,
      rules: 0,
      skills: 0,
      mcpServers: 1,
      plugins: 1,
    });
  });

  it("keeps the acknowledged write when two reads race to initialize a tenant", async () => {
    const db = createMemoryD1();
    const first = await loadSnapshot(db, "user-1");
    const second = await loadSnapshot(db, "user-1");
    first.prompts.push({
      id: "first",
      title: "First",
      userPrompt: "First body",
    } as never);
    second.prompts.push({
      id: "second",
      title: "Second",
      userPrompt: "Second body",
    } as never);

    await saveSnapshot(db, "user-1", first);
    await expect(saveSnapshot(db, "user-1", second)).rejects.toBeInstanceOf(
      SnapshotConflictError,
    );

    const stored = await loadSnapshot(db, "user-1");
    expect(stored.prompts.map((prompt) => prompt.id)).toEqual(["first"]);
  });

  it("rejects a stale update without overwriting the newer snapshot", async () => {
    const db = createMemoryD1(emptySnapshot());
    const first = await loadSnapshot(db, "user-1");
    const second = await loadSnapshot(db, "user-1");
    first.prompts.push({
      id: "first",
      title: "First",
      userPrompt: "First body",
    } as never);
    second.prompts.push({
      id: "second",
      title: "Second",
      userPrompt: "Second body",
    } as never);

    await saveSnapshot(db, "user-1", first);
    await expect(saveSnapshot(db, "user-1", second)).rejects.toMatchObject({
      status: 409,
    });

    const stored = await loadSnapshot(db, "user-1");
    expect(stored.prompts.map((prompt) => prompt.id)).toEqual(["first"]);
  });

  it("rejects malformed and future snapshots instead of defaulting collections", () => {
    expect(() => normalizeSnapshot(null)).toThrow(/object/iu);
    expect(() =>
      normalizeSnapshot({
        version: "web-cloudflare-backup-v1",
        exportedAt: "2026-06-01T00:00:00.000Z",
        prompts: "not-an-array",
        folders: [],
        skills: [],
      }),
    ).toThrow(/prompts/iu);
    expect(() =>
      normalizeSnapshot({
        version: "web-cloudflare-backup-v9",
        exportedAt: "2026-06-01T00:00:00.000Z",
        prompts: [],
        folders: [],
        skills: [],
      }),
    ).toThrow(/unsupported/iu);
  });

  it("rejects cross-tenant reuse of a loaded snapshot", async () => {
    const db = createMemoryD1(emptySnapshot());
    const snapshot = await loadSnapshot(db, "user-1");

    await expect(saveSnapshot(db, "user-2", snapshot)).rejects.toThrow(
      /identity/iu,
    );
  });

  it.each(["missing-meta", "multiple-changes", "failed"] as WriteOutcome[])(
    "fails closed when D1 write outcome is %s",
    async (outcome) => {
      const db = createMemoryD1(emptySnapshot(), outcome);
      const snapshot = await loadSnapshot(db, "user-1");
      snapshot.exportedAt = "2026-06-02T00:00:00.000Z";

      await expect(saveSnapshot(db, "user-1", snapshot)).rejects.toBeInstanceOf(
        SnapshotOutcomeUnknownError,
      );
    },
  );

  it("keeps the original baseline after an unknown write result", async () => {
    const db = createMemoryD1(emptySnapshot(), "missing-meta");
    const snapshot = await loadSnapshot(db, "user-1");
    snapshot.exportedAt = "2026-06-02T00:00:00.000Z";

    await expect(saveSnapshot(db, "user-1", snapshot)).rejects.toBeInstanceOf(
      SnapshotOutcomeUnknownError,
    );
    db.setWriteOutcome("normal");
    await expect(saveSnapshot(db, "user-1", snapshot)).resolves.toMatchObject({
      prompts: 0,
    });
  });

  it("does not accept an unbound snapshot as a write input", async () => {
    const db = createMemoryD1();
    await expect(saveSnapshot(db, "user-1", emptySnapshot())).rejects.toThrow(
      /load/i,
    );
  });

  it("requires stable fields and unique identities in primary collections", () => {
    const base = {
      version: "web-cloudflare-backup-v1",
      exportedAt: "2026-06-01T00:00:00.000Z",
      prompts: [],
      folders: [],
      skills: [],
    };

    expect(() =>
      normalizeSnapshot({ ...base, prompts: [{ id: "p1" }] }),
    ).toThrow(/title|userPrompt/iu);
    expect(() =>
      normalizeSnapshot({
        ...base,
        prompts: [
          { id: "p1", title: "One", userPrompt: "one" },
          { id: "p1", title: "Two", userPrompt: "two" },
        ],
      }),
    ).toThrow(/duplicate.*prompts/iu);
    expect(() =>
      normalizeSnapshot({ ...base, folders: [{ id: "f1" }] }),
    ).toThrow(/name/iu);
    expect(() =>
      normalizeSnapshot({
        ...base,
        folders: [
          { id: "f1", name: "One" },
          { id: "f1", name: "Two" },
        ],
      }),
    ).toThrow(/duplicate.*folders/iu);
    expect(() =>
      normalizeSnapshot({
        ...base,
        skills: [{ id: "s1", name: "Skill", protocol_type: "skill" }],
      }),
    ).toThrow(/content|instructions/iu);
    expect(() =>
      normalizeSnapshot({
        ...base,
        skills: [
          { id: "s1", name: "Skill", content: "body", protocol_type: "future" },
        ],
      }),
    ).toThrow(/protocol_type/iu);
    expect(() =>
      normalizeSnapshot({
        ...base,
        skills: [
          { id: "s1", name: "One", content: "one", protocol_type: "skill" },
          { id: "s1", name: "Two", content: "two", protocol_type: "skill" },
        ],
      }),
    ).toThrow(/duplicate.*skills/iu);
  });

  it("rejects invalid timestamps and snapshots over the object limit", () => {
    const base = {
      version: "web-cloudflare-backup-v1",
      prompts: [],
      folders: [],
      skills: [],
    };
    expect(() =>
      normalizeSnapshot({ ...base, exportedAt: "not-a-date" }),
    ).toThrow(/date|time|exportedAt/iu);
    const tooManyPrompts = Array.from({ length: 100_001 }, (_, index) => ({
      id: `p-${index}`,
      title: `Prompt ${index}`,
      userPrompt: "body",
    }));
    expect(() =>
      normalizeSnapshot({
        ...base,
        exportedAt: "2026-06-01T00:00:00.000Z",
        prompts: tooManyPrompts,
      }),
    ).toThrow(/entries|limit|100000/iu);
  });
});
