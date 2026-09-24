import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { publishCanonicalEntries } from "../src/canonical-entry-publication";

it("uses writable staged-file handles for Windows durability flushes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-entry-io-"));
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const open = fs.openSync.bind(fs);
  let stagedWritable = false;
  const spy = vi
    .spyOn(fs, "openSync")
    .mockImplementation((name, flags, mode) => {
      if (fs.existsSync(name) && fs.statSync(name).isDirectory())
        throw Object.assign(new Error("Directory handle unavailable"), {
          code: "EPERM",
        });
      if (String(name).includes(".stage-") && typeof flags === "number")
        stagedWritable ||= (flags & fs.constants.O_RDWR) !== 0;
      return open(name, flags, mode);
    });
  try {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "windows-io",
      entries: [
        {
          targetPath: path.join(root, "asset"),
          prepare(stage) {
            fs.writeFileSync(stage, "content");
          },
        },
      ],
    });
    expect(stagedWritable).toBe(true);
  } finally {
    Object.defineProperty(process, "platform", platform);
    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("rejects a file changed between inventory and opening without publishing it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-entry-io-"));
  const target = path.join(root, "asset");
  fs.writeFileSync(target, "old");
  let stage = "";
  let mutated = false;
  const open = fs.openSync.bind(fs);
  const spy = vi
    .spyOn(fs, "openSync")
    .mockImplementation((name, flags, mode) => {
      if (!mutated && String(name) === stage && typeof flags === "number") {
        mutated = true;
        fs.appendFileSync(stage, "changed");
      }
      return open(name, flags, mode);
    });
  try {
    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "io",
        entries: [
          {
            targetPath: target,
            prepare(candidate) {
              stage = candidate;
              fs.writeFileSync(stage, "new");
            },
          },
        ],
      }),
    ).toThrow(/changed|unsafe/);
    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.readdirSync(root).some((name) => name.includes(".stage-"))).toBe(
      false,
    );
  } finally {
    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it.each(["grow", "truncate"] as const)(
  "stops reading a staged file that changes during hashing: %s",
  (change) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-entry-io-"));
    const target = path.join(root, "asset");
    fs.writeFileSync(target, "old");
    let stage = "";
    let observedFd = -1;
    let mutated = false;
    const open = fs.openSync.bind(fs);
    const fstat = fs.fstatSync.bind(fs);
    const openSpy = vi
      .spyOn(fs, "openSync")
      .mockImplementation((name, flags, mode) => {
        const fd = open(name, flags, mode);
        if (String(name) === stage && typeof flags === "number")
          observedFd = fd;
        return fd;
      });
    const statSpy = vi.spyOn(fs, "fstatSync").mockImplementation((fd) => {
      const result = fstat(fd);
      if (fd === observedFd && !mutated) {
        mutated = true;
        if (change === "grow") fs.appendFileSync(stage, "extra");
        else fs.truncateSync(stage, 0);
      }
      return result;
    });
    try {
      expect(() =>
        publishCanonicalEntries({
          rootPath: root,
          operationKey: "changing-io",
          entries: [
            {
              targetPath: target,
              prepare(candidate) {
                stage = candidate;
                fs.writeFileSync(stage, "new");
              },
            },
          ],
        }),
      ).toThrow(/changed while reading/);
      expect(fs.readFileSync(target, "utf8")).toBe("old");
    } finally {
      openSpy.mockRestore();
      statSpy.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
