import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CanonicalCommitOutcomeUnknownError,
  CanonicalPostCommitError,
  isCanonicalCommitOutcomeError,
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  recoverCanonicalEntryPublications,
} from "../src/canonical-entry-publication";

const JOURNAL_KIND = "prompthub-canonical-entry-publication";
const OPERATION_ID = "11111111-1111-1111-1111-111111111111";
const DIGEST = "a".repeat(64);

let roots: string[] = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-entry-validation-"),
  );
  roots.push(root);
  return root;
}

function journalFile(root: string, operationKey: string): string {
  return path.join(
    root,
    "data",
    "operations",
    "journals",
    `${operationKey}-publication.json`,
  );
}

function writeJournal(
  root: string,
  operationKey: string,
  journal: unknown,
): string {
  const filePath = journalFile(root, operationKey);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(journal));
  return filePath;
}

function baseJournal(root: string, operationKey: string, version: 1 | 2 = 2) {
  const targetPath = path.join(root, "asset");
  return {
    kind: JOURNAL_KIND,
    version,
    operationKey,
    operationId: OPERATION_ID,
    rootPath: path.resolve(root),
    state: "prepared",
    ...(version === 2 ? { ownerPid: process.pid } : {}),
    entries: [
      {
        targetPath,
        stagePath: path.join(root, `.asset.stage-${OPERATION_ID}`),
        priorPath: path.join(root, `.asset.prior-${OPERATION_ID}`),
        delete: false,
        hadPrior: true,
        ...(version === 2 ? { afterHash: DIGEST } : {}),
      },
    ],
    createdAt: "2026-09-05T00:00:00.000Z",
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fakeStats(kind: "directory" | "file", size = 0): fs.Stats {
  return {
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
    isSymbolicLink: () => false,
    size,
  } as fs.Stats;
}

function stageStatsPath(candidate: fs.PathLike): boolean {
  return path.basename(String(candidate)).startsWith(".asset.stage-");
}

describe("canonical entry validation and recovery boundaries", () => {
  it("rejects invalid journal fields, actions, suffixes, digests, and duplicates", () => {
    const root = createRoot();
    const invalidJournals: Array<{
      name: string;
      value: unknown;
      message: RegExp;
    }> = [
      {
        name: "kind",
        value: { ...baseJournal(root, "bad"), kind: "other" },
        message: /invalid/u,
      },
      {
        name: "version",
        value: { ...baseJournal(root, "bad"), version: 3 },
        message: /invalid/u,
      },
      {
        name: "operation id",
        value: { ...baseJournal(root, "bad"), operationId: "bad" },
        message: /invalid/u,
      },
      {
        name: "root",
        value: {
          ...baseJournal(root, "bad"),
          rootPath: path.join(root, "other"),
        },
        message: /invalid/u,
      },
      {
        name: "owner pid",
        value: { ...baseJournal(root, "bad"), ownerPid: 0 },
        message: /invalid/u,
      },
      {
        name: "entries",
        value: { ...baseJournal(root, "bad"), entries: [] },
        message: /invalid/u,
      },
      {
        name: "created at",
        value: { ...baseJournal(root, "bad"), createdAt: 1 },
        message: /invalid/u,
      },
    ];

    for (const invalid of invalidJournals) {
      const filePath = writeJournal(root, "bad", invalid.value);
      expect(
        () => recoverCanonicalEntryPublication(root, "bad"),
        invalid.name,
      ).toThrow(invalid.message);
      expect(fs.existsSync(filePath)).toBe(true);
    }

    const entryCases: Array<{
      name: string;
      mutate: (journal: any) => void;
      message: RegExp;
    }> = [
      {
        name: "stage field type",
        mutate: (journal) => {
          journal.entries[0].stagePath = 1;
        },
        message: /entry is invalid/u,
      },
      {
        name: "prior field type",
        mutate: (journal) => {
          journal.entries[0].priorPath = null;
        },
        message: /entry is invalid/u,
      },
      {
        name: "delete field type",
        mutate: (journal) => {
          journal.entries[0].delete = "false";
        },
        message: /entry is invalid/u,
      },
      {
        name: "had prior field type",
        mutate: (journal) => {
          journal.entries[0].hadPrior = "true";
        },
        message: /entry is invalid/u,
      },
      {
        name: "prior suffix",
        mutate: (journal) => {
          journal.entries[0].priorPath = path.join(root, "wrong-prior");
        },
        message: /operation path is invalid/u,
      },
      {
        name: "stage suffix",
        mutate: (journal) => {
          journal.entries[0].stagePath = path.join(root, "wrong-stage");
        },
        message: /operation path is invalid/u,
      },
      {
        name: "action",
        mutate: (journal) => {
          journal.entries[0].delete = true;
        },
        message: /action is invalid/u,
      },
      {
        name: "replacement digest",
        mutate: (journal) => {
          journal.entries[0].afterHash = "bad";
        },
        message: /digest is invalid/u,
      },
      {
        name: "duplicate target",
        mutate: (journal) => {
          journal.entries.push(clone(journal.entries[0]));
        },
        message: /duplicate targets/u,
      },
    ];

    for (const entryCase of entryCases) {
      const journal = baseJournal(root, "entry-bad");
      entryCase.mutate(journal);
      writeJournal(root, "entry-bad", journal);
      expect(
        () => recoverCanonicalEntryPublication(root, "entry-bad"),
        entryCase.name,
      ).toThrow(entryCase.message);
    }

    const invalidDeleteDigest = baseJournal(root, "delete-bad");
    invalidDeleteDigest.entries[0].stagePath = null;
    invalidDeleteDigest.entries[0].delete = true;
    invalidDeleteDigest.entries[0].afterHash = "bad";
    writeJournal(root, "delete-bad", invalidDeleteDigest);
    expect(() => recoverCanonicalEntryPublication(root, "delete-bad")).toThrow(
      /digest is invalid/u,
    );

    const invalidV1State = baseJournal(root, "v1-state", 1);
    invalidV1State.state = "committed";
    writeJournal(root, "v1-state", invalidV1State);
    expect(() => recoverCanonicalEntryPublication(root, "v1-state")).toThrow(
      /invalid/u,
    );
  });

  it("rolls back a valid v1 prepared replacement, deletion, and new target", () => {
    const root = createRoot();
    const replacement = baseJournal(root, "v1-replacement", 1);
    fs.writeFileSync(replacement.entries[0].targetPath, "new");
    fs.writeFileSync(replacement.entries[0].priorPath, "old");
    writeJournal(root, "v1-replacement", replacement);
    expect(recoverCanonicalEntryPublication(root, "v1-replacement")).toBe(
      "rolled-back",
    );
    expect(fs.readFileSync(replacement.entries[0].targetPath, "utf8")).toBe(
      "old",
    );

    const deletion = baseJournal(root, "v1-delete", 1);
    deletion.entries[0].stagePath = null;
    deletion.entries[0].delete = true;
    deletion.entries[0].hadPrior = true;
    fs.writeFileSync(deletion.entries[0].priorPath, "deleted-old");
    writeJournal(root, "v1-delete", deletion);
    expect(recoverCanonicalEntryPublication(root, "v1-delete")).toBe(
      "rolled-back",
    );
    expect(fs.readFileSync(deletion.entries[0].targetPath, "utf8")).toBe(
      "deleted-old",
    );

    const created = baseJournal(root, "v1-created", 1);
    created.entries[0].hadPrior = false;
    fs.writeFileSync(created.entries[0].targetPath, "new-created");
    writeJournal(root, "v1-created", created);
    expect(recoverCanonicalEntryPublication(root, "v1-created")).toBe(
      "rolled-back",
    );
    expect(fs.existsSync(created.entries[0].targetPath)).toBe(false);
  });

  it("handles missing roots and empty journal inventories", () => {
    const missingRoot = path.join(
      os.tmpdir(),
      `prompthub-missing-${process.pid}-${Date.now()}`,
    );
    expect(recoverCanonicalEntryPublications(missingRoot)).toEqual([]);

    const root = createRoot();
    expect(recoverCanonicalEntryPublications(root)).toEqual([]);
    expect(recoverCanonicalEntryPublication(root, "missing")).toBe("none");
  });

  it("enforces journal, entry, and inventory count limits without large entities", () => {
    const root = createRoot();
    const tooManyEntries = { length: 20_001 } as readonly {
      targetPath: string;
      delete: true;
    }[];
    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "too-many",
        entries: tooManyEntries,
      }),
    ).toThrow(/entry limit/u);

    const oversizedJournal = baseJournal(root, "oversized-journal");
    oversizedJournal.entries = new Array(20_001);
    writeJournal(root, "oversized-journal", oversizedJournal);
    expect(() =>
      recoverCanonicalEntryPublication(root, "oversized-journal"),
    ).toThrow(/invalid/u);

    const directory = path.dirname(journalFile(root, "inventory"));
    fs.mkdirSync(directory, { recursive: true });
    for (let index = 0; index < 129; index += 1) {
      fs.writeFileSync(
        path.join(directory, `j${index}-publication.json`),
        "{}",
      );
    }
    expect(() => recoverCanonicalEntryPublications(root)).toThrow(
      /count limit/u,
    );

    const largeFile = journalFile(root, "size");
    fs.writeFileSync(largeFile, "{}");
    const originalLstat = fs.lstatSync.bind(fs);
    vi.spyOn(fs, "lstatSync").mockImplementation((candidate) => {
      if (String(candidate) === largeFile) {
        return fakeStats("file", 16 * 1024 * 1024 + 1);
      }
      return originalLstat(candidate);
    });
    expect(() => recoverCanonicalEntryPublication(root, "size")).toThrow(
      /limit/u,
    );
  });

  it("enforces directory, inventory, and byte limits before changing the live target", () => {
    const root = createRoot();
    const targetPath = path.join(root, "asset");
    fs.writeFileSync(targetPath, "old");
    const originalLstat = fs.lstatSync.bind(fs);
    const originalReaddir = fs.readdirSync.bind(fs);

    const runFault = (operationKey: string, message: RegExp) => {
      vi.restoreAllMocks();
      const lstat = vi
        .spyOn(fs, "lstatSync")
        .mockImplementation((candidate) => {
          if (stageStatsPath(candidate)) {
            return fakeStats("directory");
          }
          return originalLstat(candidate);
        });
      const readdir = vi
        .spyOn(fs, "readdirSync")
        .mockImplementation((directory) => {
          if (stageStatsPath(directory)) throw new Error("readdir failed");
          return originalReaddir(directory);
        });
      expect(() =>
        publishCanonicalEntries({
          rootPath: root,
          operationKey,
          entries: [
            {
              targetPath,
              prepare(stagePath) {
                fs.mkdirSync(stagePath);
              },
            },
          ],
        }),
      ).toThrow(message);
      expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
      expect(lstat).toHaveBeenCalled();
      expect(readdir).toHaveBeenCalled();
      vi.restoreAllMocks();
    };

    runFault("readdir-fault", /readdir failed/u);
  });

  it("rejects inventory and byte limits using bounded filesystem faults", () => {
    const root = createRoot();
    const targetPath = path.join(root, "asset");
    fs.writeFileSync(targetPath, "old");
    const originalLstat = fs.lstatSync.bind(fs);
    const originalReaddir = fs.readdirSync.bind(fs);
    const runBound = (
      operationKey: string,
      names: string[],
      size: number,
      expected: RegExp,
    ) => {
      const originalOpen = fs.openSync.bind(fs);
      const originalFstat = fs.fstatSync.bind(fs);
      const originalRead = fs.readSync.bind(fs);
      const originalClose = fs.closeSync.bind(fs);
      const originalFsync = fs.fsyncSync.bind(fs);
      const fakeDescriptors = new Set<number>();
      const readCounts = new Map<number, number>();
      let nextDescriptor = 100_000;
      const lstat = vi
        .spyOn(fs, "lstatSync")
        .mockImplementation((candidate) => {
          const candidateString = String(candidate);
          if (candidateString.includes(".asset.stage-")) {
            return stageStatsPath(candidate)
              ? fakeStats("directory")
              : fakeStats("file", size);
          }
          return originalLstat(candidate);
        });
      const readdir = vi
        .spyOn(fs, "readdirSync")
        .mockImplementation((directory) => {
          if (stageStatsPath(directory)) return names as never;
          return originalReaddir(directory);
        });
      vi.spyOn(fs, "openSync").mockImplementation((candidate, flags, mode) => {
        if (String(candidate).includes(".asset.stage-")) {
          const descriptor = nextDescriptor++;
          fakeDescriptors.add(descriptor);
          return descriptor;
        }
        return originalOpen(candidate, flags, mode);
      });
      vi.spyOn(fs, "fstatSync").mockImplementation((descriptor) => {
        if (fakeDescriptors.has(descriptor)) return fakeStats("file", size);
        return originalFstat(descriptor);
      });
      vi.spyOn(fs, "readSync").mockImplementation(((
        descriptor: number,
        buffer: NodeJS.ArrayBufferView,
        offset: number,
        length: number,
        position: number | null,
      ) => {
        if (fakeDescriptors.has(descriptor)) {
          const count = readCounts.get(descriptor) ?? 0;
          if (count === 0) {
            readCounts.set(descriptor, 1);
            return Math.min(size, length);
          }
          return 0;
        }
        return originalRead(descriptor, buffer, offset, length, position);
      }) as typeof fs.readSync);
      vi.spyOn(fs, "closeSync").mockImplementation((descriptor) => {
        if (fakeDescriptors.has(descriptor)) {
          fakeDescriptors.delete(descriptor);
          return;
        }
        originalClose(descriptor);
      });
      vi.spyOn(fs, "fsyncSync").mockImplementation((descriptor) => {
        if (fakeDescriptors.has(descriptor)) return;
        originalFsync(descriptor);
      });
      expect(() =>
        publishCanonicalEntries({
          rootPath: root,
          operationKey,
          entries: [
            { targetPath, prepare: (stagePath) => fs.mkdirSync(stagePath) },
          ],
        }),
      ).toThrow(expected);
      expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
      expect(lstat).toHaveBeenCalled();
      expect(readdir).toHaveBeenCalled();
      vi.restoreAllMocks();
    };

    runBound(
      "inventory-bound",
      Array.from({ length: 100_001 }, (_, index) => `entry-${index}`),
      1,
      /inventory limit/u,
    );
    runBound("byte-bound", ["huge.bin"], 4 * 1024 ** 3 + 1, /byte limit/u);
  });

  it("cleans staged files after an initial fsync failure", () => {
    const root = createRoot();
    const targetPath = path.join(root, "asset");
    fs.writeFileSync(targetPath, "old");
    vi.spyOn(fs, "fsyncSync").mockImplementation(() => {
      throw new Error("initial fsync failed");
    });

    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "initial-fsync",
        entries: [
          {
            targetPath,
            prepare: (stagePath) => fs.writeFileSync(stagePath, "new"),
          },
        ],
      }),
    ).toThrow("initial fsync failed");
    expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
    expect(
      fs
        .readdirSync(root)
        .some((name) => name.includes("stage-") || name.includes("prior-")),
    ).toBe(false);
  });

  it("surfaces directory fsync failures before publishing the target", () => {
    const root = createRoot();
    const targetPath = path.join(root, "asset");
    const journalDirectory = path.join(root, "data", "operations", "journals");
    fs.writeFileSync(targetPath, "old");
    const originalOpen = fs.openSync.bind(fs);
    const originalFsync = fs.fsyncSync.bind(fs);
    const openPaths = new Map<number, string>();
    vi.spyOn(fs, "openSync").mockImplementation((candidate, flags, mode) => {
      const descriptor = originalOpen(candidate, flags, mode);
      openPaths.set(descriptor, String(candidate));
      return descriptor;
    });
    vi.spyOn(fs, "fsyncSync").mockImplementation((descriptor) => {
      if (openPaths.get(descriptor) === journalDirectory) {
        const error = new Error(
          "directory fsync failed",
        ) as NodeJS.ErrnoException;
        error.code = "EIO";
        throw error;
      }
      originalFsync(descriptor);
    });

    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "directory-fsync",
        entries: [
          {
            targetPath,
            prepare: (stagePath) => fs.writeFileSync(stagePath, "new"),
          },
        ],
      }),
    ).toThrow("directory fsync failed");
    expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
    expect(fs.existsSync(journalFile(root, "directory-fsync"))).toBe(true);
    vi.restoreAllMocks();
    expect(recoverCanonicalEntryPublication(root, "directory-fsync")).toBe(
      "rolled-back",
    );
    expect(fs.existsSync(journalFile(root, "directory-fsync"))).toBe(false);
  });

  it("leaves a prepared journal after commit fsync failure and recovers it", () => {
    const root = createRoot();
    const targetPath = path.join(root, "asset");
    fs.writeFileSync(targetPath, "old");
    const originalFsync = fs.fsyncSync.bind(fs);
    let commitStarted = false;
    vi.spyOn(fs, "fsyncSync").mockImplementation((descriptor) => {
      if (commitStarted) throw new Error("commit fsync failed");
      return originalFsync(descriptor);
    });

    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "commit-fsync",
        entries: [
          {
            targetPath,
            prepare: (stagePath) => fs.writeFileSync(stagePath, "new"),
          },
        ],
        commit() {
          commitStarted = true;
        },
      }),
    ).toThrow(CanonicalCommitOutcomeUnknownError);
    expect(fs.readFileSync(targetPath, "utf8")).toBe("new");
    vi.restoreAllMocks();
    expect(recoverCanonicalEntryPublication(root, "commit-fsync")).toBe(
      "rolled-back",
    );
    expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
  });

  it("rejects unsafe roots and targets and refuses reentrant publication", () => {
    const root = createRoot();
    const rootFile = path.join(root, "root-file");
    fs.writeFileSync(rootFile, "file");
    expect(() =>
      publishCanonicalEntries({
        rootPath: rootFile,
        operationKey: "unsafe-root",
        entries: [{ targetPath: path.join(rootFile, "asset"), delete: true }],
      }),
    ).toThrow(/root path is unsafe/u);

    const target = path.join(root, "target");
    const outside = path.join(root, "outside");
    fs.writeFileSync(outside, "outside");
    fs.symlinkSync(outside, target);
    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "unsafe-target",
        entries: [{ targetPath: target, delete: true }],
      }),
    ).toThrow(/target is unsafe/u);

    const operationKey = "reentrant";
    let recovery: "none" | "rolled-back" | "committed" = "committed";
    let reentrantError: unknown;
    const activeTarget = path.join(root, "active");
    publishCanonicalEntries({
      rootPath: root,
      operationKey,
      entries: [
        {
          targetPath: activeTarget,
          prepare(stagePath) {
            recovery = recoverCanonicalEntryPublication(root, operationKey);
            try {
              publishCanonicalEntries({
                rootPath: root,
                operationKey,
                entries: [
                  { targetPath: path.join(root, "nested"), delete: true },
                ],
              });
            } catch (error) {
              reentrantError = error;
            }
            fs.writeFileSync(stagePath, "active");
          },
        },
      ],
    });
    expect(recovery).toBe("none");
    expect(reentrantError).toBeInstanceOf(Error);
    expect(String((reentrantError as Error).message)).toMatch(
      /already active/u,
    );
  });

  it("recovers committed deletions and exercises the outcome type guard", () => {
    const root = createRoot();
    const targetPath = path.join(root, "deleted");
    fs.writeFileSync(targetPath, "old");
    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "delete-commit",
        entries: [{ targetPath, delete: true }],
        afterCommit() {
          throw new Error("projection pending");
        },
      }),
    ).toThrow(CanonicalPostCommitError);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(recoverCanonicalEntryPublication(root, "delete-commit")).toBe(
      "committed",
    );
    expect(fs.existsSync(targetPath)).toBe(false);

    const postCommit = new CanonicalPostCommitError(
      OPERATION_ID,
      new Error("x"),
    );
    const unknown = new CanonicalCommitOutcomeUnknownError(
      OPERATION_ID,
      new Error("x"),
    );
    expect(isCanonicalCommitOutcomeError(postCommit)).toBe(true);
    expect(isCanonicalCommitOutcomeError(unknown)).toBe(true);
    expect(isCanonicalCommitOutcomeError(new Error("x"))).toBe(false);
    expect(isCanonicalCommitOutcomeError(null)).toBe(false);
  });
});
