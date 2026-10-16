import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CURRENT_LAYOUT_EPOCH,
  CURRENT_LAYOUT_STATE_FORMAT_VERSION,
  LAYOUT_STATE_FILE_NAME,
  LEGACY_LAYOUT_EPOCH,
  deriveStorageRootIdentity,
  deriveLocalResourceDeviceId,
  localResourceDeviceIdFromRootIdentity,
  readRuntimeLayoutState,
  resolveRuntimeStorageContext,
  writeRuntimeLayoutState,
} from "../src/runtime-storage-context";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";

describe("runtime storage context", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(prefix = "prompthub-runtime-context-"): string {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(value);
    return value;
  }

  function statePath(activeRoot: string): string {
    return path.join(activeRoot, "data", LAYOUT_STATE_FILE_NAME);
  }

  it("resolves a restore stage against its intended root without accepting an unrelated identity", () => {
    const activeRoot = root();
    const stageRoot = root();
    writeCanonicalStorageAuthority(stageRoot, {
      identityRoot: activeRoot,
      consistencyId: "a".repeat(64),
      operationId: "restore-stage",
    });
    expect(() => resolveRuntimeStorageContext(stageRoot)).toThrow(
      "root identity mismatch",
    );
    const context = resolveRuntimeStorageContext(stageRoot, {
      identityRoot: activeRoot,
    });
    expect(context.databasePath).toBe(
      path.join(stageRoot, "data", "prompthub.db"),
    );
    expect(context.rootIdentity).toBe(deriveStorageRootIdentity(activeRoot));
    expect(() =>
      resolveRuntimeStorageContext(stageRoot, { identityRoot: root() }),
    ).toThrow("root identity mismatch");
  });

  function writeRawState(activeRoot: string, value: unknown): void {
    fs.mkdirSync(path.join(activeRoot, "data"), { recursive: true });
    fs.writeFileSync(
      statePath(activeRoot),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }

  function validState(activeRoot: string): Record<string, unknown> {
    return {
      formatVersion: CURRENT_LAYOUT_STATE_FORMAT_VERSION,
      layoutEpoch: CURRENT_LAYOUT_EPOCH,
      state: "complete",
      rootIdentity: deriveStorageRootIdentity(activeRoot),
      verifiedAt: "2026-08-12T00:00:00.000Z",
    };
  }

  it("resolves an immutable empty canonical root with database authority", () => {
    const activeRoot = root();

    expect(readRuntimeLayoutState(activeRoot)).toBeNull();
    const context = resolveRuntimeStorageContext(activeRoot);

    expect(context).toMatchObject({
      activeRoot,
      rootIdentity: deriveStorageRootIdentity(activeRoot),
      layoutEpoch: CURRENT_LAYOUT_EPOCH,
      databasePath: path.join(activeRoot, "data", "prompthub.db"),
      promptsPath: path.join(activeRoot, "data", "prompts"),
      localAuthority: "database-catalog",
      resolutionReason: "empty-root",
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("publishes, reloads, and resolves a bound layout state", () => {
    const activeRoot = root();
    const state = writeRuntimeLayoutState(activeRoot, {
      lastVerifiedOperation: "layout-1",
      now: new Date("2026-08-12T00:00:00.000Z"),
    });

    expect(readRuntimeLayoutState(activeRoot)).toEqual(state);
    expect(resolveRuntimeStorageContext(activeRoot)).toMatchObject({
      layoutEpoch: CURRENT_LAYOUT_EPOCH,
      resolutionReason: "layout-state",
    });
    expect(state).toMatchObject({
      verifiedAt: "2026-08-12T00:00:00.000Z",
      lastVerifiedOperation: "layout-1",
    });
  });

  it("resolves canonical file authority only after its root-bound marker exists", () => {
    const activeRoot = root();
    writeRuntimeLayoutState(activeRoot);
    writeCanonicalStorageAuthority(activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "authority-1",
    });

    expect(resolveRuntimeStorageContext(activeRoot).localAuthority).toBe(
      "canonical-files",
    );
  });

  it.each([
    ["canonical-database", "data/prompthub.db", CURRENT_LAYOUT_EPOCH],
    ["canonical-files", "data/prompts/prompt.json", CURRENT_LAYOUT_EPOCH],
    ["legacy-database", "prompthub.db", LEGACY_LAYOUT_EPOCH],
    ["legacy-files", "workspace/prompt.json", LEGACY_LAYOUT_EPOCH],
  ] as const)(
    "infers %s from durable evidence",
    (reason, relativePath, epoch) => {
      const activeRoot = root();
      const targetPath = path.join(activeRoot, ...relativePath.split("/"));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, "durable");

      const context = resolveRuntimeStorageContext(activeRoot);

      expect(context.resolutionReason).toBe(reason);
      expect(context.layoutEpoch).toBe(epoch);
      expect(context.databasePath).toBe(
        epoch === CURRENT_LAYOUT_EPOCH
          ? path.join(activeRoot, "data", "prompthub.db")
          : path.join(activeRoot, "prompthub.db"),
      );
    },
  );

  it("ignores generated-only image cache but recognizes user image data", () => {
    const activeRoot = root();
    const imagesPath = path.join(activeRoot, "data", "assets", "images");
    fs.mkdirSync(path.join(imagesPath, "generated"), { recursive: true });
    fs.writeFileSync(path.join(imagesPath, ".DS_Store"), "metadata");
    expect(resolveRuntimeStorageContext(activeRoot).resolutionReason).toBe(
      "empty-root",
    );

    fs.writeFileSync(path.join(imagesPath, "cover.png"), "image");
    expect(resolveRuntimeStorageContext(activeRoot).resolutionReason).toBe(
      "canonical-files",
    );
  });

  it("allows only the completed legacy database residual beside canonical data", () => {
    const activeRoot = root();
    fs.mkdirSync(path.join(activeRoot, "data"));
    fs.writeFileSync(
      path.join(activeRoot, "data", "prompthub.db"),
      "canonical",
    );
    fs.writeFileSync(path.join(activeRoot, "prompthub.db"), "legacy");
    fs.writeFileSync(
      path.join(activeRoot, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        dbLayoutVersion: "0.5.7",
        movedEntries: ["prompthub.db"],
      }),
    );
    expect(resolveRuntimeStorageContext(activeRoot).resolutionReason).toBe(
      "canonical-database",
    );

    fs.writeFileSync(
      path.join(activeRoot, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        dbLayoutVersion: "0.5.7",
        movedEntries: ["prompthub.db"],
        failedEntries: ["other"],
      }),
    );
    expect(resolveRuntimeStorageContext(activeRoot).resolutionReason).toBe(
      "canonical-database",
    );
  });

  it("fails closed for mixed canonical and legacy data or an incomplete legacy marker", () => {
    for (const marker of [
      undefined,
      "{",
      [],
      { version: "0.5.5" },
      {
        version: "0.5.5",
        dbLayoutVersion: "0.5.7",
        movedEntries: ["prompthub.db"],
        failedEntries: ["prompthub.db"],
      },
    ]) {
      const activeRoot = root();
      fs.mkdirSync(path.join(activeRoot, "data"));
      fs.writeFileSync(
        path.join(activeRoot, "data", "prompthub.db"),
        "canonical",
      );
      fs.writeFileSync(path.join(activeRoot, "prompthub.db"), "legacy");
      if (marker !== undefined) writeRawStateMarker(activeRoot, marker);
      expect(() => resolveRuntimeStorageContext(activeRoot)).toThrow(
        /mixed PromptHub storage layout/,
      );
    }
  });

  function writeRawStateMarker(activeRoot: string, value: unknown): void {
    fs.writeFileSync(
      path.join(activeRoot, ".data-layout-v0.5.5.json"),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }

  it.each([
    ["invalid JSON", "{"],
    ["non-record", []],
    ["invalid numeric fields", { formatVersion: "1", layoutEpoch: 1 }],
    ["future format", { formatVersion: 2, layoutEpoch: 1 }],
    ["unsupported format", { formatVersion: 0, layoutEpoch: 1 }],
    ["future epoch", { formatVersion: 1, layoutEpoch: 2 }],
    [
      "invalid details",
      {
        formatVersion: 1,
        layoutEpoch: -1,
        state: "partial",
        rootIdentity: "",
        verifiedAt: "",
      },
    ],
  ])("rejects an %s layout state", (_label, invalid) => {
    const activeRoot = root();
    writeRawState(activeRoot, invalid);
    expect(() => readRuntimeLayoutState(activeRoot)).toThrow(
      /PromptHub storage layout state|newer storage layout/,
    );
  });

  it("rejects a copied layout state bound to another root", () => {
    const source = root();
    const target = root();
    writeRawState(target, validState(source));

    expect(() => resolveRuntimeStorageContext(target)).toThrow(
      /root identity mismatch/,
    );
  });

  it("rejects symbolic links, non-directory components, and non-file markers", () => {
    const componentRoot = root();
    fs.writeFileSync(path.join(componentRoot, "data"), "not-a-directory");
    expect(() => resolveRuntimeStorageContext(componentRoot)).toThrow(
      /Invalid PromptHub storage path component/,
    );

    const markerRoot = root();
    fs.mkdirSync(statePath(markerRoot), { recursive: true });
    expect(() => resolveRuntimeStorageContext(markerRoot)).toThrow(
      /not a regular file/,
    );

    if (process.platform !== "win32") {
      const target = root();
      const link = path.join(
        path.dirname(target),
        `${path.basename(target)}-link`,
      );
      fs.symlinkSync(target, link);
      roots.push(link);
      expect(() => resolveRuntimeStorageContext(link)).toThrow(/symbolic link/);
    }
  });

  it("rejects canonical directories represented by files", () => {
    const directoryRoot = root();
    fs.mkdirSync(path.join(directoryRoot, "data"));
    fs.writeFileSync(
      path.join(directoryRoot, "data", "prompts"),
      "not-a-directory",
    );
    expect(() => resolveRuntimeStorageContext(directoryRoot)).toThrow(
      /storage directory is not a directory/,
    );

    const imagesRoot = root();
    fs.mkdirSync(path.join(imagesRoot, "data", "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(imagesRoot, "data", "assets", "images"),
      "not-a-directory",
    );
    expect(() => resolveRuntimeStorageContext(imagesRoot)).toThrow(
      /storage directory is not a directory/,
    );
  });

  it("propagates non-missing filesystem inspection failures", () => {
    const activeRoot = root();
    const originalLstat = fs.lstatSync.bind(fs);
    vi.spyOn(fs, "lstatSync").mockImplementation((target, options) => {
      if (path.resolve(String(target)) === activeRoot) {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }
      return originalLstat(target, options as never);
    });
    expect(() => resolveRuntimeStorageContext(activeRoot)).toThrow("denied");
  });

  it("rejects any storage target that escapes the active root", () => {
    const activeRoot = root();
    const outside = root("prompthub-runtime-outside-");
    const originalJoin = path.join.bind(path);
    vi.spyOn(path, "join").mockImplementation((...parts) => {
      if (
        parts.length === 3 &&
        path.resolve(parts[0]) === activeRoot &&
        parts[1] === "data" &&
        parts[2] === LAYOUT_STATE_FILE_NAME
      ) {
        return path.resolve(outside, LAYOUT_STATE_FILE_NAME);
      }
      return originalJoin(...parts);
    });

    expect(() => readRuntimeLayoutState(activeRoot)).toThrow(
      /storage path escapes its active root/,
    );
  });

  it("handles an explicitly root-relative storage target without traversal", () => {
    const activeRoot = root();
    const originalJoin = path.join.bind(path);
    vi.spyOn(path, "join").mockImplementation((...parts) => {
      if (
        parts.length === 3 &&
        path.resolve(parts[0]) === activeRoot &&
        parts[1] === "data" &&
        parts[2] === LAYOUT_STATE_FILE_NAME
      ) {
        return activeRoot;
      }
      return originalJoin(...parts);
    });

    expect(() => readRuntimeLayoutState(activeRoot)).toThrow(
      /not a regular file/,
    );
  });

  it("writes legacy state for an explicit identity root and validates epoch and identity", () => {
    const stagingRoot = root();
    const identityRoot = root();
    const state = writeRuntimeLayoutState(stagingRoot, {
      layoutEpoch: LEGACY_LAYOUT_EPOCH,
      identityRoot,
      rootIdentity: deriveStorageRootIdentity(identityRoot),
    });
    expect(state.layoutEpoch).toBe(LEGACY_LAYOUT_EPOCH);
    expect(readRuntimeLayoutState(stagingRoot)).toEqual(state);

    expect(() =>
      writeRuntimeLayoutState(stagingRoot, { layoutEpoch: 2 as 1 }),
    ).toThrow(/Unsupported PromptHub storage layout epoch/);
    expect(() =>
      writeRuntimeLayoutState(stagingRoot, { rootIdentity: "wrong" }),
    ).toThrow(/root identity mismatch/);
  });

  it("cleans temporary state after open, write, and rename failures", () => {
    for (const failure of ["open", "write", "rename"] as const) {
      const activeRoot = root();
      const originalOpen = fs.openSync.bind(fs);
      const originalWrite = fs.writeFileSync.bind(fs);
      const originalRename = fs.renameSync.bind(fs);
      if (failure === "open") {
        vi.spyOn(fs, "openSync").mockImplementation((target, flags, mode) => {
          if (String(target).includes(`${LAYOUT_STATE_FILE_NAME}.tmp-`)) {
            throw new Error("open failed");
          }
          return originalOpen(target, flags, mode);
        });
      } else if (failure === "write") {
        vi.spyOn(fs, "writeFileSync").mockImplementation(
          (target, data, options) => {
            if (typeof target === "number") throw new Error("write failed");
            return originalWrite(target, data, options as never);
          },
        );
      } else {
        vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
          if (String(from).includes(`${LAYOUT_STATE_FILE_NAME}.tmp-`)) {
            throw new Error("rename failed");
          }
          return originalRename(from, to);
        });
      }

      expect(() => writeRuntimeLayoutState(activeRoot)).toThrow(
        `${failure} failed`,
      );
      expect(
        fs
          .readdirSync(path.join(activeRoot, "data"))
          .some((entry) => entry.includes(`${LAYOUT_STATE_FILE_NAME}.tmp-`)),
      ).toBe(false);
      vi.restoreAllMocks();
    }
  });

  it("tolerates unavailable directory fsync after publishing the state", () => {
    const activeRoot = root();
    const dataPath = path.join(activeRoot, "data");
    const originalOpen = fs.openSync.bind(fs);
    vi.spyOn(fs, "openSync").mockImplementation((target, flags, mode) => {
      if (path.resolve(String(target)) === dataPath && flags === "r") {
        throw Object.assign(new Error("directory fsync unavailable"), {
          code: "EINVAL",
        });
      }
      return originalOpen(target, flags, mode);
    });

    expect(writeRuntimeLayoutState(activeRoot).state).toBe("complete");
  });

  it("derives a bounded local resource identity from the storage root", () => {
    const activeRoot = root();
    const rootIdentity = deriveStorageRootIdentity(activeRoot);
    const expected = `device-${rootIdentity.slice(0, 32)}`;

    expect(deriveLocalResourceDeviceId(activeRoot)).toBe(expected);
    expect(localResourceDeviceIdFromRootIdentity(rootIdentity)).toBe(expected);
    expect(() => localResourceDeviceIdFromRootIdentity("invalid")).toThrow(
      "Storage root identity is invalid",
    );
  });
});
