import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  emptySnapshot,
  getSyncData,
  putSyncData,
  normalizeSnapshot,
} from "../src/sync";
import {
  SKILL_SNAPSHOT_CAPABILITY_HEADER,
  SKILL_SNAPSHOT_SYNC_VERSION,
} from "@prompthub/shared/utils/skill-file-snapshot";

describe("lossless Skill sync capability", () => {
  const binary = () => ({
    ...emptySnapshot(),
    version: SKILL_SNAPSHOT_SYNC_VERSION,
    skills: [
      {
        id: "s",
        name: "skill",
        content: "# Skill",
        protocol_type: "skill",
        is_favorite: false,
        created_at: 1,
        updated_at: 2,
      },
    ],
    skillFiles: {
      s: [{ relativePath: "icon.bin", content: "AP+A", encoding: "base64" }],
    },
  });
  function application(payload: unknown) {
    const write = vi.fn();
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ payload_json: JSON.stringify(payload) }),
          run: write,
        }),
      }),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      Object.assign(c.env, { DB: db });
      c.set("authUser" as never, { userId: "u" } as never);
      await next();
    });
    app.onError((error, c) => c.json({ error: error.message }, 422));
    app.get("/data", getSyncData as never);
    app.put("/data", putSyncData as never);
    return { app, write };
  }
  it("retains binary encoding and refuses unknown encoding", () => {
    expect(normalizeSnapshot(binary()).skillFiles?.s[0].encoding).toBe(
      "base64",
    );
    const invalid = binary();
    invalid.skillFiles.s[0].encoding = "future";
    expect(() => normalizeSnapshot(invalid)).toThrow();
  });
  it("rejects an old reader before returning the encoded payload", async () => {
    const { app } = application(binary());
    expect((await app.request("/data", {}, {})).status).toBe(422);
    const response = await app.request(
      "/data",
      { headers: { [SKILL_SNAPSHOT_CAPABILITY_HEADER]: "2" } },
      {},
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain(
      '"encoding":"base64"',
    );
  });
  it("prevents an old writer from replacing existing binary data", async () => {
    const { app, write } = application(binary());
    const response = await app.request(
      "/data",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: emptySnapshot() }),
      },
      {},
    );
    expect(response.status).toBe(422);
    expect(write).not.toHaveBeenCalled();
  });
});
