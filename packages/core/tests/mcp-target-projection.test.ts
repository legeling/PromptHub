import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { commitMcpTargetProjection } from "../src/mcp-target-projection";

describe("commitMcpTargetProjection", () => {
  let root: string;
  let targetPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-projection-"));
    targetPath = path.join(root, "agent", "mcp.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("publishes, verifies, and persists a changed projection without sidecars", () => {
    const verify = vi.fn(() => {
      expect(fs.readFileSync(targetPath, "utf8")).toBe('{"next":true}\n');
    });
    const persist = vi.fn();

    const result = commitMcpTargetProjection({
      filePath: targetPath,
      previousContent: undefined,
      nextContent: '{"next":true}\n',
      verify,
      persist,
    });

    expect(result).toEqual({ changed: true });
    expect(verify).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
    // Windows does not expose POSIX owner/group permission bits through stat.
    if (process.platform !== "win32") {
      expect(fs.statSync(targetPath).mode & 0o777).toBe(0o600);
    }
  });

  it("verifies and persists an unchanged projection without replacing the file", () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "stable", "utf8");
    const timestamp = new Date("2020-01-02T03:04:05.000Z");
    fs.utimesSync(targetPath, timestamp, timestamp);
    const before = fs.statSync(targetPath);

    const result = commitMcpTargetProjection({
      filePath: targetPath,
      previousContent: "stable",
      nextContent: "stable",
      verify: () => undefined,
      persist: () => undefined,
    });

    const after = fs.statSync(targetPath);
    expect(result).toEqual({ changed: false });
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("restores an existing projection when verification fails", () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "original", { encoding: "utf8", mode: 0o640 });
    const originalMode = fs.statSync(targetPath).mode & 0o777;

    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: "original",
        nextContent: "candidate",
        verify: () => {
          throw new Error("verification failed");
        },
        persist: () => undefined,
      }),
    ).toThrow("verification failed");

    expect(fs.readFileSync(targetPath, "utf8")).toBe("original");
    expect(fs.statSync(targetPath).mode & 0o777).toBe(originalMode);
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
  });

  it("removes a newly created projection when persistence fails", () => {
    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: undefined,
        nextContent: "candidate",
        verify: () => undefined,
        persist: () => {
          throw new Error("persistence failed");
        },
      }),
    ).toThrow("persistence failed");

    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual([]);
  });

  it("cleans the temporary file when replacement fails before publication", () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "original", "utf8");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: "original",
        nextContent: "candidate",
        verify: () => undefined,
        persist: () => undefined,
      }),
    ).toThrow("rename failed");

    expect(fs.readFileSync(targetPath, "utf8")).toBe("original");
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
  });

  it("closes the temporary descriptor when writing the candidate fails", () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "original", "utf8");
    const write = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number") throw new Error("write failed");
      return write(file, data, options);
    });

    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: "original",
        nextContent: "candidate",
        verify: () => undefined,
        persist: () => undefined,
      }),
    ).toThrow("write failed");

    expect(fs.readFileSync(targetPath, "utf8")).toBe("original");
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
  });

  it("fails rollback when a new target cannot be removed", () => {
    const remove = fs.rmSync.bind(fs);
    vi.spyOn(fs, "rmSync").mockImplementation((candidate, options) => {
      if (candidate === targetPath) return;
      remove(candidate, options);
    });

    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: undefined,
        nextContent: "candidate",
        verify: () => undefined,
        persist: () => {
          throw new Error("persistence failed");
        },
      }),
    ).toThrow(
      "MCP target update failed (persistence failed) and rollback failed (new target file still exists after rollback)",
    );
  });

  it("fails rollback when restored bytes do not match the original", () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "original", "utf8");
    const read = fs.readFileSync.bind(fs);
    vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
      if (file === targetPath) return "tampered";
      return read(file, options);
    });

    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: "original",
        nextContent: "candidate",
        verify: () => undefined,
        persist: () => {
          throw new Error("persistence failed");
        },
      }),
    ).toThrow(
      "MCP target update failed (persistence failed) and rollback failed (target content differs after rollback)",
    );
  });

  it("reports both the update and rollback errors when restoration fails", () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "original", "utf8");
    const rename = fs.renameSync.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      renameCount += 1;
      if (renameCount === 2) throw "rollback rename failed";
      rename(source, destination);
    });

    expect(() =>
      commitMcpTargetProjection({
        filePath: targetPath,
        previousContent: "original",
        nextContent: "candidate",
        verify: () => undefined,
        persist: () => {
          throw "persistence failed";
        },
      }),
    ).toThrow(
      "MCP target update failed (persistence failed) and rollback failed (rollback rename failed)",
    );

    expect(fs.readFileSync(targetPath, "utf8")).toBe("candidate");
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
  });
});
