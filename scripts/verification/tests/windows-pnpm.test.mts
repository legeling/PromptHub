import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveWindowsPnpm } from "../windows-pnpm.mts";

test("Windows pnpm resolution preserves spaces and uses the installed CLI without a shell", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "prompthub-pnpm path-"));
  try {
    const cli = path.join(root, "node_modules/pnpm/bin/pnpm.cjs");
    mkdirSync(path.dirname(cli), { recursive: true });
    writeFileSync(cli, "");
    assert.equal(resolveWindowsPnpm({ Path: root }), cli);
    assert.equal(resolveWindowsPnpm({ npm_execpath: cli }), cli);
    assert.throws(
      () => resolveWindowsPnpm({ Path: path.join(root, "missing") }),
      /Cannot locate/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
