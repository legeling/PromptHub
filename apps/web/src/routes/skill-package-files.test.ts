import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SkillFileSnapshot } from "@prompthub/shared";
import {
  authHeaders,
  createTestApp,
  registerUser,
  setupSyncRouteTestLifecycle,
} from "./sync.test-helpers";

function expectPackage(actual: unknown, files: SkillFileSnapshot[]): void {
  expect(actual).toHaveLength(files.length);
  expect(actual).toEqual(expect.arrayContaining(files));
}

describe("hosted Skill packages", () => {
  setupSyncRouteTestLifecycle();
  it("saves full packages through HTTP, preserves versions and rejects cross-user and traversal writes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-skill-files-"));
    try {
      let app = await createTestApp(root);
      const owner = await registerUser(app, "package-owner", "debugpass001");
      const other = await registerUser(app, "package-other", "debugpass001");
      const headers = authHeaders(owner.payload.data.accessToken);
      const runtime = await app.request("/api/runtime", { headers });
      expect(runtime.status).toBe(200);
      expect((await runtime.json()).data).toMatchObject({
        mode: "self-hosted",
        capabilities: {
          agentManagement: true,
          skillSafetyScan: true,
          skillRemoteImport: false,
        },
      });
      const initialFiles = [
        { relativePath: "SKILL.md", content: "# Initial" },
        { relativePath: "initial.bin", content: "AP8D", encoding: "base64" },
      ];
      const created = await app.request("/api/skills/import-package", {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: { name: "writer", visibility: "private" },
          files: initialFiles,
        }),
      });
      expect(created.status).toBe(201);
      const { data: skill } = await created.json();
      const url = `/api/skills/${skill.id}/files`;
      expectPackage(
        (await (await app.request(url, { headers })).json()).data,
        initialFiles as SkillFileSnapshot[],
      );
      const files: SkillFileSnapshot[] = [
        { relativePath: "SKILL.md", content: "# Saved" },
        {
          relativePath: "assets/icon.bin",
          content: "AP8D",
          encoding: "base64",
        },
      ];
      const saved = await app.request(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({ files }),
      });
      expect(saved.status, await saved.clone().text()).toBe(200);
      expectPackage(
        (await (await app.request(url, { headers })).json()).data,
        files,
      );
      expect(
        (
          await (
            await app.request(`/api/skills/${skill.id}`, { headers })
          ).json()
        ).data.content,
      ).toBe("# Saved");
      const version = await app.request(`/api/skills/${skill.id}/versions`, {
        method: "POST",
        headers,
        body: "{}",
      });
      expect(version.status).toBe(201);
      expectPackage((await version.json()).data.filesSnapshot, files);
      expect(
        (
          await app.request(url, {
            headers: authHeaders(other.payload.data.accessToken),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await app.request(url, {
            method: "PUT",
            headers: authHeaders(other.payload.data.accessToken),
            body: JSON.stringify({ files }),
          })
        ).status,
      ).toBe(404);
      const stale = await app.request(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          files: [{ relativePath: "SKILL.md", content: "# stale" }],
          revision: "0".repeat(64),
        }),
      });
      expect(stale.status).toBe(409);
      expectPackage(
        (await (await app.request(url, { headers })).json()).data,
        files,
      );
      const malformed = await app.request(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          files: [...files, { relativePath: "../outside", content: "bad" }],
        }),
      });
      expect(malformed.status).toBe(422);
      expectPackage(
        (await (await app.request(url, { headers })).json()).data,
        files,
      );
      expect(fs.existsSync(path.join(root, "outside"))).toBe(false);
      // Fail the real SQL commit after the new filesystem package was staged.
      const { getServerDatabase } = await import("../database");
      const db = getServerDatabase();
      db.exec(
        "CREATE TEMP TRIGGER reject_package_update BEFORE UPDATE ON skills BEGIN SELECT RAISE(ABORT, 'test package commit rejected'); END;",
      );
      const failed = await app.request(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          files: [{ relativePath: "SKILL.md", content: "# Must not publish" }],
        }),
      });
      expect(failed.status).toBe(500);
      db.exec("DROP TRIGGER reject_package_update");
      expectPackage(
        (await (await app.request(url, { headers })).json()).data,
        files,
      );
      (await import("@prompthub/db")).closeDatabase();
      vi.resetModules();
      app = await createTestApp(root);
      expectPackage(
        (await (await app.request(url, { headers })).json()).data,
        files,
      );
      expect(
        (
          await (
            await app.request(`/api/skills/${skill.id}`, { headers })
          ).json()
        ).data.content,
      ).toBe("# Saved");
    } finally {
      (await import("@prompthub/db")).closeDatabase();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
