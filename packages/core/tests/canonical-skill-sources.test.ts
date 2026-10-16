import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readHistoricalSkillBinding } from "../src/migrations/skill-source-bindings-v1";
import { deriveLocalResourceDeviceId } from "../src/storage-root-identity";

let root: string;
let file: string;
const id = "historical-binding";
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "historical-skill-binding-"));
  file = path.join(root, "config", "devices", "skill-sources", `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function write(
  sourceUrl = path.join(root, "source"),
  deviceId = deriveLocalResourceDeviceId(root),
): void {
  fs.writeFileSync(
    file,
    JSON.stringify({
      kind: "prompthub-skill-source-binding",
      version: 1,
      skillId: id,
      deviceId,
      sourceUrl,
      localRepoPath: sourceUrl,
    }),
  );
}
it("reads this device's historical binding without creating any current binding", () => {
  expect(readHistoricalSkillBinding(root, id)).toBeUndefined();
  write();
  expect(readHistoricalSkillBinding(root, id)).toEqual({
    sourceUrl: path.join(root, "source"),
    localRepoPath: path.join(root, "source"),
  });
  write(path.join(root, "source"), "another-device");
  expect(readHistoricalSkillBinding(root, id)).toBeUndefined();
});
it.each(["relative/path", "/bad\0path"])(
  "rejects an invalid historical path %j",
  (source) => {
    write(source);
    expect(() => readHistoricalSkillBinding(root, id)).toThrow(
      "binding is invalid",
    );
  },
);
it("rejects linked binding files without reading their targets", () => {
  const target = path.join(root, "target");
  fs.writeFileSync(target, "private bytes");
  fs.symlinkSync(target, file);
  expect(() => readHistoricalSkillBinding(root, id)).toThrow();
  expect(fs.readFileSync(target, "utf8")).toBe("private bytes");
});
