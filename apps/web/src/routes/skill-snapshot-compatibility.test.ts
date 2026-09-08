import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SKILL_SNAPSHOT_CAPABILITY_HEADER } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  authHeaders,
  createSkill,
  createTestApp,
  registerUser,
  setupSyncRouteTestLifecycle,
} from "./sync.test-helpers";

describe("Web Skill snapshot transport compatibility", () => {
  setupSyncRouteTestLifecycle();
  it("round-trips binary packages while blocking old clients and malformed replacement", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-skill-lossless-"));
    try {
      const app = await createTestApp(root);
      const { payload } = await registerUser(
        app,
        "losslessowner",
        "debugpass001",
      );
      const headers = new Headers(authHeaders(payload.data.accessToken));
      const created = await createSkill(app, payload.data.accessToken, {
        name: "lossless",
        content: "# Skill",
      });
      expect(created.status).toBe(201);
      const skill = (await created.json()).data;
      const textResponse = await app.request("/api/sync/data", { headers });
      expect(textResponse.status).toBe(200);
      const textPayload = (await textResponse.json()).data;
      const assetPath = path.join(
        root,
        "data",
        "skills",
        `lossless__${skill.id}`,
        "asset.bin",
      );
      fs.writeFileSync(assetPath, Buffer.from([0, 255, 128]));
      expect((await app.request("/api/sync/data", { headers })).status).toBe(
        422,
      );
      const rejected = await app.request("/api/sync/data", {
        method: "PUT",
        headers,
        body: JSON.stringify({ payload: textPayload }),
      });
      expect(rejected.status).toBe(422);
      expect(fs.readFileSync(assetPath)).toEqual(Buffer.from([0, 255, 128]));
      headers.set(SKILL_SNAPSHOT_CAPABILITY_HEADER, "2");
      const supported = await app.request("/api/sync/data", { headers });
      expect(supported.status).toBe(200);
      const snapshot = (await supported.json()).data;
      expect(snapshot.skillFiles[skill.id]).toContainEqual({
        relativePath: "asset.bin",
        content: "AP+A",
        encoding: "base64",
      });
      const malformed = structuredClone(snapshot);
      malformed.skillFiles[skill.id][1].encoding = "future";
      expect(
        (
          await app.request("/api/sync/data", {
            method: "PUT",
            headers,
            body: JSON.stringify({ payload: malformed }),
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await app.request("/api/sync/data", {
            method: "PUT",
            headers,
            body: JSON.stringify({ payload: snapshot }),
          })
        ).status,
      ).toBe(200);
      expect(fs.readFileSync(assetPath)).toEqual(Buffer.from([0, 255, 128]));
      const exported = await app.request("/api/export", { headers });
      expect(exported.status).toBe(200);
      expect((await exported.json()).kind).toBe("prompthub-backup-v2");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
