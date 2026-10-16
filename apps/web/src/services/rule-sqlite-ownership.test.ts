import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RuleBackupRecord } from "@prompthub/shared";
import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
  authHeaders,
} from "../routes/import-export.test-helpers";

let root: string;
const TEST_TIMEOUT = 20000;
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-rule-sql-"));
});
afterEach(async () => {
  (await import("@prompthub/db")).closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});
function record(id: `project:${string}`, content: string): RuleBackupRecord {
  return {
    id,
    platformId: "workspace",
    platformName: "Shared identity",
    platformIcon: "Folder",
    platformDescription: "Project",
    name: "AGENTS.md",
    description: "Description",
    path: "/client/AGENTS.md",
    targetPath: "/client/AGENTS.md",
    projectRootPath: "/client",
    syncStatus: "target-missing",
    content,
    versions: [
      {
        id: "same-version",
        savedAt: "2026-01-01T00:00:00.000Z",
        source: "create",
        content,
      },
    ],
  };
}

it(
  "keeps same-ID tenant Rule content and history isolated through HTTP edits, history deletion and reopen",
  async () => {
    let app = await createTestApp(root);
    const owner = (await registerUser(app, "owner", "fixture-password")).payload
      .data;
    const other = (await registerUser(app, "other", "fixture-password")).payload
      .data;
    for (const [actor, body] of [
      [owner, "Owner original"],
      [other, "Other original"],
    ] as const) {
      const response = await app.request(
        new Request("http://local/api/rules/import-records", {
          method: "POST",
          headers: authHeaders(actor.accessToken),
          body: JSON.stringify({ records: [record("project:same", body)] }),
        }),
      );
      expect(response.status).toBe(200);
    }
    const { getServerDatabase } = await import("../database");
    expect(
      getServerDatabase().all(
        "SELECT owner_user_id, id FROM rules ORDER BY owner_user_id",
      ),
    ).toEqual(
      [owner.user.id, other.user.id]
        .sort()
        .map((owner_user_id) => ({ owner_user_id, id: "project:same" })),
    );
    const edited = await app.request(
      new Request("http://local/api/rules/project:same", {
        method: "PUT",
        headers: authHeaders(owner.accessToken),
        body: JSON.stringify({ content: "Owner edited" }),
      }),
    );
    expect(edited.status).toBe(200);
    const historyRemoved = await app.request(
      new Request("http://local/api/rules/project:same/versions/same-version", {
        method: "DELETE",
        headers: authHeaders(owner.accessToken),
      }),
    );
    expect(historyRemoved.status).toBe(200);
    (await import("@prompthub/db")).closeDatabase();
    vi.resetModules();
    app = await createTestApp(root);
    const read = async (token: string) =>
      (
        await app.request(
          new Request("http://local/api/rules/project:same", {
            headers: authHeaders(token),
          }),
        )
      ).json();
    expect(await read(owner.accessToken)).toMatchObject({
      data: {
        content: "Owner edited",
        versions: [{ content: "Owner edited" }],
      },
    });
    expect(await read(other.accessToken)).toMatchObject({
      data: {
        content: "Other original",
        versions: [{ id: "same-version", content: "Other original" }],
      },
    });
    expect(fs.existsSync(path.join(root, "data", "rules"))).toBe(false);
    const deleted = await app.request(
      new Request("http://local/api/rules/projects/same", {
        method: "DELETE",
        headers: authHeaders(owner.accessToken),
      }),
    );
    expect(deleted.status).toBe(200);
    expect(
      (
        await app.request(
          new Request("http://local/api/rules/project:same", {
            headers: authHeaders(owner.accessToken),
          }),
        )
      ).status,
    ).toBe(404);
    expect(await read(other.accessToken)).toMatchObject({
      data: { content: "Other original" },
    });
  },
  TEST_TIMEOUT,
);

it(
  "rolls back an entire Rule batch on a late SQL failure and preserves missing-file evidence",
  async () => {
    const app = await createTestApp(root);
    const actor = (await registerUser(app, "owner", "fixture-password")).payload
      .data;
    const workspace = await import("./rule-workspace");
    const first = record("project:first", "Before first");
    const second = record("project:second", "Before second");
    second.versions[0].id = "second-version";
    workspace.importRuleBackupRecords(actor.user.id, [first, second]);
    const { getServerDatabase } = await import("../database");
    getServerDatabase().exec(
      "CREATE TRIGGER fail_second BEFORE UPDATE ON rules WHEN NEW.id = 'project:second' BEGIN SELECT RAISE(ABORT,'injected late Rule failure'); END",
    );
    expect(() =>
      workspace.importRuleBackupRecords(actor.user.id, [
        { ...first, content: "After first" },
        { ...second, content: "After second" },
      ]),
    ).toThrow("injected late Rule failure");
    expect(
      workspace
        .exportRuleBackupRecords(actor.user.id)
        .map((r) => r.content)
        .sort(),
    ).toEqual(["Before first", "Before second"]);
    getServerDatabase().exec("DROP TRIGGER fail_second");
    workspace.importRuleBackupRecords(actor.user.id, [
      { ...first, content: "After first" },
      { ...second, content: "After second" },
    ]);
    const stored = workspace
      .exportRuleBackupRecords(actor.user.id)
      .find((r) => r.id === first.id)!;
    fs.unlinkSync(stored.managedPath!);
    expect(() => workspace.exportRuleBackupRecords(actor.user.id)).toThrow();
    expect(
      getServerDatabase().get(
        "SELECT id FROM rules WHERE owner_user_id = ? AND id = ?",
        actor.user.id,
        first.id,
      ),
    ).toEqual({ id: first.id });
  },
  TEST_TIMEOUT,
);
