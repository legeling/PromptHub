import { expect, it } from "vitest";
import { createPrompt } from "../../../../apps/web-cloudflare/src/web-data";
import {
  emptySnapshot,
  normalizeSnapshot,
} from "../../../../apps/web-cloudflare/src/sync";

it("A08: concurrent successful creates must both survive snapshot persistence", async () => {
  let stored = JSON.stringify(emptySnapshot());
  let reads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Faithful D1 row storage with a deterministic barrier after both SELECTs.
  const db = {
    prepare(sql: string) {
      let args: unknown[];
      return {
        bind(...values: unknown[]) {
          args = values;
          return this;
        },
        async first() {
          const snapshot = stored;
          reads++;
          if (reads === 2) release();
          await bothRead;
          return {
            payload_json: snapshot,
            exported_at: "2026-01-01",
            settings_updated_at: null,
          };
        },
        async run() {
          expect(sql).toContain("ON CONFLICT(user_id) DO UPDATE");
          stored = String(args[1]);
          return { success: true };
        },
      };
    },
  };
  const context = (title: string) => ({
    env: { DB: db },
    get: () => ({ userId: "audit-user", role: "user" }),
    req: { json: async () => ({ title, userPrompt: title }) },
    json: (data: unknown, status: number) =>
      new Response(JSON.stringify(data), { status }),
  });
  const results = await Promise.all([
    createPrompt(context("first") as Parameters<typeof createPrompt>[0]),
    createPrompt(context("second") as Parameters<typeof createPrompt>[0]),
  ]);
  expect(results.map((result) => result.status)).toEqual([201, 201]);
  const final = normalizeSnapshot(JSON.parse(stored));
  console.log(
    "A08 two 201 responses, stored prompts",
    final.prompts.map((p) => p.title),
  );
  expect(final.prompts).toHaveLength(2);
});

it("A09: malformed snapshot inventory must not normalize into a valid empty replacement", () => {
  expect(() =>
    normalizeSnapshot({
      version: "future-v999",
      prompts: "invalid",
      skills: {},
    }),
  ).toThrow();
});
