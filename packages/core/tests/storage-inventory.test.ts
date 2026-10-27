import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyStorageRoot,
  copyStorageInventory,
  createStorageInventory,
  verifyStorageInventory,
} from "../src/storage-inventory";
import { writeRuntimeLayoutState } from "../src/runtime-storage-context";

describe("storage inventory", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(prefix = "prompthub-storage-inventory-"): string {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(value);
    return value;
  }

  function write(
    rootPath: string,
    relativePath: string,
    content = relativePath,
  ): string {
    const targetPath = path.join(rootPath, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
    return targetPath;
  }

  function canonicalFixture(): string {
    const value = root();
    write(value, "data/prompts/prompt.json", "prompt");
    write(value, "data/prompts/.DS_Store", "metadata");
    write(value, "config/app.json", "config");
    write(value, "secrets/vault.enc", "secret");
    write(value, "data/operations/journals/pending.json", "excluded-journal");
    write(value, "data/prompthub.db-wal", "excluded-wal");
    writeRuntimeLayoutState(value);
    return value;
  }

  it("excludes whole directory trees without scanning their contents and preserves neighboring data", () => {
    const source = canonicalFixture();
    write(
      source,
      "data/recovery/nested/original.db",
      "private recovery source",
    );
    write(source, "data/recovery-notes/document.txt", "business data");
    const inventory = createStorageInventory(source, {
      includeSecrets: false,
      excludeRelativePaths: ["data/recovery", "config"],
    });
    expect(inventory.files.map((entry) => entry.relativePath)).toEqual([
      "data/prompts/prompt.json",
      "data/recovery-notes/document.txt",
    ]);
  });

  it("classifies missing, empty, invalid, unknown, canonical, legacy, and mixed roots", () => {
    const base = root();
    expect(classifyStorageRoot(path.join(base, "missing")).kind).toBe(
      "missing",
    );

    const empty = root();
    write(empty, ".DS_Store", "metadata");
    expect(classifyStorageRoot(empty).kind).toBe("empty");
    fs.mkdirSync(path.join(empty, "data"));
    fs.mkdirSync(path.join(empty, "config"));
    write(empty, "data/Thumbs.db", "metadata");
    expect(classifyStorageRoot(empty).kind).toBe("empty");

    const fileRoot = path.join(base, "file-root");
    fs.writeFileSync(fileRoot, "file");
    expect(classifyStorageRoot(fileRoot)).toMatchObject({
      kind: "invalid",
      reason: "root is not a directory",
    });

    const unknown = root();
    write(unknown, "unrelated.txt", "unknown");
    expect(classifyStorageRoot(unknown)).toMatchObject({
      kind: "unknown",
      unknownEntries: ["unrelated.txt"],
    });

    const canonical = canonicalFixture();
    expect(classifyStorageRoot(canonical).kind).toBe("canonical");
    const legacy = root();
    write(legacy, "prompthub.db", "legacy");
    expect(classifyStorageRoot(legacy).kind).toBe("legacy");
    const mixed = root();
    write(mixed, "data/prompthub.db", "canonical");
    write(mixed, "workspace/prompt.json", "legacy");
    expect(classifyStorageRoot(mixed).kind).toBe("mixed");

    if (process.platform !== "win32") {
      const link = path.join(base, "linked-root");
      fs.symlinkSync(canonical, link);
      expect(classifyStorageRoot(link)).toMatchObject({
        kind: "invalid",
        reason: "root is a symbolic link",
      });
    }
  });

  it("classifies unsafe marker components and non-Error failures as invalid", () => {
    const activeRoot = root();
    fs.mkdirSync(path.join(activeRoot, "data"));
    fs.writeFileSync(path.join(activeRoot, "data", ".layout-state.json"), "{");
    expect(classifyStorageRoot(activeRoot).kind).toBe("invalid");

    const thrownRoot = root();
    write(thrownRoot, "unrelated.txt", "unknown");
    const originalLstat = fs.lstatSync.bind(fs);
    let calls = 0;
    vi.spyOn(fs, "lstatSync").mockImplementation((target, options) => {
      if (path.resolve(String(target)) === thrownRoot) {
        calls += 1;
        if (calls > 1) throw "filesystem failed";
      }
      return originalLstat(target, options as never);
    });
    expect(classifyStorageRoot(thrownRoot)).toMatchObject({
      kind: "invalid",
      reason: "filesystem failed",
    });
  });

  it("propagates non-missing root stat failures", () => {
    const activeRoot = root();
    const originalLstat = fs.lstatSync.bind(fs);
    vi.spyOn(fs, "lstatSync").mockImplementation((target, options) => {
      if (path.resolve(String(target)) === activeRoot) {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }
      return originalLstat(target, options as never);
    });
    expect(() => classifyStorageRoot(activeRoot)).toThrow("denied");
  });

  it("handles marker directories that change type during classification", () => {
    const missingMarker = root();
    const linkedMarker = root();
    const fileMarker = root();
    for (const activeRoot of [missingMarker, linkedMarker, fileMarker]) {
      fs.mkdirSync(path.join(activeRoot, "data"));
    }

    const originalLstat = fs.lstatSync.bind(fs);
    vi.spyOn(fs, "lstatSync").mockImplementation((target, options) => {
      const targetPath = path.resolve(String(target));
      if (targetPath === path.join(missingMarker, "data")) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
      const stats = originalLstat(target, options as never);
      if (targetPath === path.join(linkedMarker, "data")) {
        return Object.assign(Object.create(stats), {
          isSymbolicLink: () => true,
        });
      }
      if (targetPath === path.join(fileMarker, "data")) {
        return Object.assign(Object.create(stats), {
          isSymbolicLink: () => false,
          isDirectory: () => false,
        });
      }
      return stats;
    });

    expect(classifyStorageRoot(missingMarker).kind).toBe("empty");
    expect(classifyStorageRoot(linkedMarker).kind).toBe("invalid");
    expect(classifyStorageRoot(fileMarker).kind).toBe("invalid");
  });

  it("inventories canonical files deterministically with exclusions and optional secrets", () => {
    const activeRoot = canonicalFixture();
    const withoutSecrets = createStorageInventory(activeRoot, {
      excludeRelativePaths: [path.join("config", "app.json")],
    });
    expect(withoutSecrets.layoutEpoch).toBe(1);
    expect(withoutSecrets.files.map((entry) => entry.relativePath)).toEqual([
      "data/prompts/prompt.json",
    ]);
    expect(withoutSecrets.digest).toMatch(/^[a-f0-9]{64}$/);

    const withSecrets = createStorageInventory(activeRoot, {
      includeSecrets: true,
    });
    expect(withSecrets.files.map((entry) => entry.relativePath)).toEqual([
      "config/app.json",
      "data/prompts/prompt.json",
      "secrets/vault.enc",
    ]);
  });

  it("inventories detached canonical and legacy snapshots without discovery", () => {
    const canonical = root();
    write(canonical, "data/prompts/prompt.json", "prompt");
    expect(
      createStorageInventory(canonical, { detachedLayoutEpoch: 1 }).layoutEpoch,
    ).toBe(1);

    const legacy = root();
    write(legacy, "workspace/prompt.json", "prompt");
    write(legacy, "shortcuts.json", "{}");
    expect(
      createStorageInventory(legacy, { detachedLayoutEpoch: 0 }).files.map(
        (entry) => entry.relativePath,
      ),
    ).toEqual(["shortcuts.json", "workspace/prompt.json"]);

    const unsafe = root();
    fs.rmSync(unsafe, { recursive: true });
    fs.writeFileSync(unsafe, "unsafe");
    expect(() =>
      createStorageInventory(unsafe, { detachedLayoutEpoch: 1 }),
    ).toThrow(/unsafe detached root/);
  });

  it("rejects non-storage roots and invalid numeric limits", () => {
    const unknown = root();
    write(unknown, "unrelated.txt", "unknown");
    expect(() => createStorageInventory(unknown)).toThrow(
      /Cannot inventory unknown PromptHub root/,
    );

    const canonical = canonicalFixture();
    for (const options of [
      { maxEntries: 0 },
      { maxTotalBytes: 0 },
      { maxFileBytes: 0 },
      { maxDepth: 0 },
    ]) {
      expect(() => createStorageInventory(canonical, options)).toThrow(
        /positive safe integer/,
      );
    }
  });

  it("enforces depth, file, total-byte, and entry limits", () => {
    const canonical = canonicalFixture();
    write(canonical, "data/prompts/second.json", "second");
    expect(() => createStorageInventory(canonical, { maxDepth: 1 })).toThrow(
      /maxDepth/,
    );
    expect(() =>
      createStorageInventory(canonical, { maxFileBytes: 1 }),
    ).toThrow(/maxFileBytes/);
    expect(() =>
      createStorageInventory(canonical, { maxTotalBytes: 1 }),
    ).toThrow(/maxTotalBytes/);
    expect(() => createStorageInventory(canonical, { maxEntries: 1 })).toThrow(
      /maxEntries/,
    );
  });

  it("counts empty directories against the inventory entry limit", () => {
    const canonical = canonicalFixture();
    for (let index = 0; index < 25; index += 1) {
      fs.mkdirSync(path.join(canonical, "data", "prompts", `empty-${index}`));
    }
    expect(() => createStorageInventory(canonical, { maxEntries: 20 })).toThrow(
      /maxEntries/,
    );
  });

  it.skipIf(process.platform === "win32")(
    "rejects symbolic links in inventory trees",
    () => {
      const canonical = canonicalFixture();
      const outside = write(canonical, "outside", "outside");
      fs.symlinkSync(
        outside,
        path.join(canonical, "data", "prompts", "linked"),
      );
      expect(() => createStorageInventory(canonical)).toThrow(/symbolic link/);
    },
  );

  it("rejects special files and root-escaping normalized paths", () => {
    const canonical = canonicalFixture();
    const targetPath = path.join(canonical, "data", "prompts", "prompt.json");
    const originalLstat = fs.lstatSync.bind(fs);
    vi.spyOn(fs, "lstatSync").mockImplementation((target, options) => {
      const stats = originalLstat(target, options as never);
      if (path.resolve(String(target)) !== targetPath) return stats;
      return Object.assign(Object.create(stats), {
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => false,
      });
    });
    expect(() => createStorageInventory(canonical)).toThrow(/special file/);

    vi.restoreAllMocks();
    const originalRelative = path.relative.bind(path);
    vi.spyOn(path, "relative").mockImplementation((from, to) => {
      if (path.resolve(String(to)) === targetPath) return "../escape";
      return originalRelative(from, to);
    });
    expect(() => createStorageInventory(canonical)).toThrow(
      /Unsafe storage inventory path/,
    );
  });

  it("copies and verifies a stable inventory", () => {
    const source = canonicalFixture();
    const destination = root("prompthub-storage-copy-");
    const inventory = createStorageInventory(source, { includeSecrets: true });

    copyStorageInventory(inventory, destination);
    expect(() => verifyStorageInventory(inventory, destination)).not.toThrow();
    expect(
      fs.readFileSync(
        path.join(destination, "data", "prompts", "prompt.json"),
        "utf8",
      ),
    ).toBe("prompt");
  });

  it("rejects a source that changes type or content after inventory", () => {
    const typedSource = canonicalFixture();
    const typedDestination = root("prompthub-storage-copy-type-");
    const typedInventory = createStorageInventory(typedSource);
    const typedPath = path.join(typedSource, "data", "prompts", "prompt.json");
    fs.rmSync(typedPath);
    fs.mkdirSync(typedPath);
    expect(() =>
      copyStorageInventory(typedInventory, typedDestination),
    ).toThrow(/source changed type/);

    const changedSource = canonicalFixture();
    const changedDestination = root("prompthub-storage-copy-changed-");
    const changedInventory = createStorageInventory(changedSource);
    fs.appendFileSync(
      path.join(changedSource, "data", "prompts", "prompt.json"),
      "changed",
    );
    expect(() =>
      copyStorageInventory(changedInventory, changedDestination),
    ).toThrow(/source changed during copy/);
  });

  it("detects source mutation during streaming copy", () => {
    const source = canonicalFixture();
    const destination = root("prompthub-storage-copy-race-");
    const inventory = createStorageInventory(source);
    const sourcePath = path.join(source, "data", "prompts", "prompt.json");
    const originalRead = fs.readSync.bind(fs);
    let mutated = false;
    vi.spyOn(fs, "readSync").mockImplementation(((
      descriptor,
      buffer,
      offset,
      length,
      position,
    ) => {
      const count = originalRead(descriptor, buffer, offset, length, position);
      if (!mutated && count > 0) {
        mutated = true;
        fs.appendFileSync(sourcePath, "changed");
      }
      return count;
    }) as never);

    expect(() => copyStorageInventory(inventory, destination)).toThrow(
      /source changed during copy/,
    );
  });

  it("rejects missing, tampered, and unsafe copied entries", () => {
    const source = canonicalFixture();
    const inventory = createStorageInventory(source);

    const missing = root("prompthub-storage-verify-missing-");
    expect(() => verifyStorageInventory(inventory, missing)).toThrow();

    const tampered = root("prompthub-storage-verify-tampered-");
    copyStorageInventory(inventory, tampered);
    fs.appendFileSync(
      path.join(tampered, "data", "prompts", "prompt.json"),
      "tampered",
    );
    expect(() => verifyStorageInventory(inventory, tampered)).toThrow(
      /verification failed/,
    );

    if (process.platform !== "win32") {
      const linked = root("prompthub-storage-verify-linked-");
      copyStorageInventory(inventory, linked);
      const targetPath = path.join(linked, "data", "prompts", "prompt.json");
      const outside = write(linked, "outside", "prompt");
      fs.rmSync(targetPath);
      fs.symlinkSync(outside, targetPath);
      expect(() => verifyStorageInventory(inventory, linked)).toThrow(
        /verification failed/,
      );
    }
  });

  it("uses a published layout state as canonical classification evidence", () => {
    const activeRoot = root();
    writeRuntimeLayoutState(activeRoot);
    expect(classifyStorageRoot(activeRoot)).toMatchObject({
      kind: "canonical",
      layoutEpoch: 1,
    });
  });
});
