import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { expect, it } from "vitest";

it("rejects reads and writes on an invalidated catalog until its handle is closed", () => {
  const db = new DatabaseAdapter(":memory:");
  db.exec(SCHEMA);
  const cached = db.prepare("SELECT id FROM prompts");
  const reason = new Error("Canonical projection requires recovery");
  db.invalidate(reason);
  for (const read of [
    () => db.get("SELECT 1"),
    () => db.all("SELECT 1"),
    () => db.prepare("SELECT 1"),
    () => cached.all(),
    () => db.run("DELETE FROM prompts"),
    () => db.exec("DELETE FROM prompts"),
    () => db.pragma("quick_check"),
  ])
    expect(read).toThrow(reason);
  expect(() => db.close()).not.toThrow();
});
