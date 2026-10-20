import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createNativeCommandRunner } from "../src/native-command";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);
const limits = { timeout: 5_000, maxBuffer: 4_096 };

it("preserves argument boundaries and drains separate output streams", async () => {
  const args = [
    "path with spaces",
    "a&b",
    "a|b",
    "%PATH%",
    'quote"value',
    "中文",
    "end\\",
  ];
  const runner = createNativeCommandRunner();
  const output = await runner.run(
    process.execPath,
    [
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1))); process.stderr.write('warning')",
      ...args,
    ],
    limits,
  );
  expect(JSON.parse(output.stdout)).toEqual(args);
  expect(output.stderr).toBe("warning");
});

it("reports exit status and stops commands exceeding the output budget", async () => {
  const runner = createNativeCommandRunner();
  await expect(
    runner.run(process.execPath, ["-e", "process.exit(7)"], limits),
  ).rejects.toMatchObject({ code: 7 });
  await expect(
    runner.run(
      process.execPath,
      [
        "-e",
        "process.stdout.write('x'.repeat(8192)); setInterval(() => {}, 1000)",
      ],
      limits,
    ),
  ).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
});

it.runIf(process.platform === "win32")(
  "runs an npm-style cmd shim with literal arguments (#244)",
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ph cmd & args-"));
    roots.push(root);
    const script = path.join(root, "args.cjs");
    const shim = path.join(root, "codex.cmd");
    fs.writeFileSync(
      script,
      "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
    );
    fs.writeFileSync(
      shim,
      `@echo off\r\n"${process.execPath}" "%~dp0args.cjs" %*\r\n`,
    );
    const args = [
      "plugin",
      "marketplace",
      "add",
      "C:\\a b\\中文 & docs",
      "a|b",
      "%PATH%",
      'quote"value',
    ];
    const result = await createNativeCommandRunner().run(shim, args, limits);
    expect(JSON.parse(result.stdout)).toEqual(args);
  },
);
