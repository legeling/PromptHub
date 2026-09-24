import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const JOURNAL_KIND = "prompthub-canonical-entry-publication";
const JOURNAL_VERSION = 2;
const OPERATION_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const activePublications = new Set<string>();

interface JournalEntry {
  targetPath: string;
  stagePath: string | null;
  priorPath: string;
  delete: boolean;
  hadPrior: boolean;
  afterHash?: string;
}

interface CanonicalEntryPublicationJournal {
  kind: typeof JOURNAL_KIND;
  version: 1 | typeof JOURNAL_VERSION;
  operationKey: string;
  operationId: string;
  rootPath: string;
  state: "preparing" | "prepared" | "committed";
  ownerPid?: number;
  entries: JournalEntry[];
  createdAt: string;
}

export interface CanonicalEntryMutation {
  targetPath: string;
  delete?: boolean;
  prepare?: (stagePath: string) => void;
}

export interface PublishCanonicalEntriesOptions {
  rootPath: string;
  operationKey: string;
  entries: readonly CanonicalEntryMutation[];
  verify?: () => void;
  commit?: () => void;
  /** Projection work: failure here must never roll back committed files. */
  afterCommit?: () => void;
  injectFailure?: (targetPath: string) => void;
}

export interface CanonicalEntryPublicationResult {
  status: "unchanged" | "committed";
  operationId?: string;
  cleanupPending: boolean;
}

export class CanonicalPostCommitError extends Error {
  readonly committed = true;
  readonly code = "CANONICAL_PROJECTION_PENDING";
  readonly operationId: string;
  constructor(operationId: string, cause: unknown) {
    super("Canonical data was committed; projection requires recovery", {
      cause,
    });
    this.name = "CanonicalPostCommitError";
    this.operationId = operationId;
  }
}

export class CanonicalCommitOutcomeUnknownError extends Error {
  readonly code = "CANONICAL_COMMIT_OUTCOME_UNKNOWN";
  readonly operationId: string;
  constructor(operationId: string, cause: unknown) {
    super(
      "Canonical commit outcome is unknown; recover the operation before retrying",
      { cause },
    );
    this.name = "CanonicalCommitOutcomeUnknownError";
    this.operationId = operationId;
  }
}

export function isCanonicalCommitOutcomeError(
  error: unknown,
): error is CanonicalPostCommitError | CanonicalCommitOutcomeUnknownError {
  return (
    error instanceof CanonicalPostCommitError ||
    error instanceof CanonicalCommitOutcomeUnknownError
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOperationKey(value: string): void {
  if (!OPERATION_KEY_PATTERN.test(value)) {
    throw new Error("Canonical entry publication operation key is invalid");
  }
}

function assertOwnedPath(rootPath: string, candidatePath: string): string {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Canonical entry publication path escapes its root");
  }
  let cursor = root;
  const rootStats = fs.lstatSync(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("Canonical entry publication root path is unsafe");
  }
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    const stats = fs.lstatSync(cursor);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Canonical entry publication parent path is unsafe");
    }
  }
  return candidate;
}

function flushDirectory(directoryPath: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(directoryPath, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Windows does not expose directory handles through Node's fs.openSync.
    if (
      process.platform !== "win32" ||
      !["EPERM", "EACCES", "EINVAL", "EISDIR", "ENOTSUP"].includes(code ?? "")
    )
      throw error;
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function journalPath(rootPath: string, operationKey: string): string {
  assertOperationKey(operationKey);
  return assertOwnedPath(
    rootPath,
    path.join(
      path.resolve(rootPath),
      "data",
      "operations",
      "journals",
      `${operationKey}-publication.json`,
    ),
  );
}

function writeJournal(
  filePath: string,
  journal: CanonicalEntryPublicationJournal,
  replace = false,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${journal.operationId}.tmp`;
  try {
    const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    try {
      fs.writeFileSync(
        descriptor,
        `${JSON.stringify(journal, null, 2)}\n`,
        "utf8",
      );
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (replace) fs.renameSync(temporaryPath, filePath);
    else fs.linkSync(temporaryPath, filePath);
    flushDirectory(path.dirname(filePath));
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function assertSiblingOperationPath(
  targetPath: string,
  candidatePath: string,
  marker: "stage" | "prior",
  operationId: string,
): void {
  if (
    path.dirname(targetPath) !== path.dirname(candidatePath) ||
    path.basename(candidatePath) !==
      `.${path.basename(targetPath)}.${marker}-${operationId}`
  ) {
    throw new Error("Canonical entry publication operation path is invalid");
  }
}

function parseJournal(
  value: unknown,
  rootPath: string,
  operationKey: string,
): CanonicalEntryPublicationJournal {
  const root = path.resolve(rootPath);
  if (
    !isRecord(value) ||
    value.kind !== JOURNAL_KIND ||
    (value.version !== 1 && value.version !== JOURNAL_VERSION) ||
    value.operationKey !== operationKey ||
    typeof value.operationId !== "string" ||
    !/^[a-f0-9-]{36}$/u.test(value.operationId) ||
    value.rootPath !== root ||
    (value.state !== "prepared" &&
      !(
        value.version === JOURNAL_VERSION &&
        (value.state === "committed" || value.state === "preparing")
      )) ||
    (value.version === JOURNAL_VERSION &&
      (!Number.isSafeInteger(value.ownerPid) || Number(value.ownerPid) <= 0)) ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > 20_000 ||
    typeof value.createdAt !== "string"
  ) {
    throw new Error("Canonical entry publication journal is invalid");
  }
  const entries = value.entries.map((raw): JournalEntry => {
    if (
      !isRecord(raw) ||
      typeof raw.targetPath !== "string" ||
      (raw.stagePath !== null && typeof raw.stagePath !== "string") ||
      typeof raw.priorPath !== "string" ||
      typeof raw.delete !== "boolean" ||
      typeof raw.hadPrior !== "boolean"
    ) {
      throw new Error("Canonical entry publication journal entry is invalid");
    }
    const targetPath = assertOwnedPath(root, raw.targetPath);
    const priorPath = assertOwnedPath(root, raw.priorPath);
    assertSiblingOperationPath(
      targetPath,
      priorPath,
      "prior",
      value.operationId as string,
    );
    const stagePath =
      raw.stagePath === null
        ? null
        : assertOwnedPath(root, raw.stagePath as string);
    if (stagePath)
      assertSiblingOperationPath(
        targetPath,
        stagePath,
        "stage",
        value.operationId as string,
      );
    if (raw.delete !== (stagePath === null)) {
      throw new Error("Canonical entry publication journal action is invalid");
    }
    if (
      value.version === JOURNAL_VERSION &&
      value.state !== "preparing" &&
      (typeof raw.afterHash !== "string" ||
        (raw.delete
          ? raw.afterHash !== "deleted"
          : !/^[a-f0-9]{64}$/.test(raw.afterHash)))
    )
      throw new Error("Canonical publication digest is invalid");
    return {
      targetPath,
      stagePath,
      priorPath,
      delete: raw.delete,
      hadPrior: raw.hadPrior,
      afterHash: typeof raw.afterHash === "string" ? raw.afterHash : undefined,
    };
  });
  if (
    new Set(entries.map((entry) => entry.targetPath)).size !== entries.length
  ) {
    throw new Error(
      "Canonical entry publication journal has duplicate targets",
    );
  }
  return { ...(value as unknown as CanonicalEntryPublicationJournal), entries };
}

function readJournal(
  rootPath: string,
  operationKey: string,
): CanonicalEntryPublicationJournal | null {
  const filePath = journalPath(rootPath, operationKey);
  try {
    const stats = fs.lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("Canonical entry publication journal path is unsafe");
    }
    if (stats.size > 16 * 1024 * 1024)
      throw new Error("Canonical publication journal limit exceeded");
    return parseJournal(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
      rootPath,
      operationKey,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw new Error("Canonical entry publication journal is invalid", {
        cause: error,
      });
    }
    throw error;
  }
}

function removePath(candidatePath: string): void {
  fs.rmSync(candidatePath, { recursive: true, force: true });
}

function entryHash(target: string, durable = false): string {
  const hash = crypto.createHash("sha256");
  const pending = [{ absolute: target, relative: "" }];
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let count = 0;
  let totalBytes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 100_000)
      throw new Error("Canonical publication inventory limit exceeded");
    const stat = fs.lstatSync(entry.absolute);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      throw new Error("Canonical publication entry is unsafe");
    hash.update(
      JSON.stringify([
        entry.relative,
        stat.isDirectory() ? "directory" : "file",
        stat.isFile() ? stat.size : 0,
      ]),
    );
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(entry.absolute).sort().reverse())
        pending.push({
          absolute: path.join(entry.absolute, name),
          relative: path.join(entry.relative, name),
        });
      if (durable) flushDirectory(entry.absolute);
      continue;
    }
    totalBytes += stat.size;
    if (totalBytes > 4 * 1024 ** 3)
      throw new Error("Canonical publication byte limit exceeded");
    const descriptor = fs.openSync(
      entry.absolute,
      (durable && process.platform === "win32"
        ? fs.constants.O_RDWR
        : fs.constants.O_RDONLY) | (fs.constants.O_NOFOLLOW ?? 0),
    );
    try {
      const opened = fs.fstatSync(descriptor);
      if (
        !opened.isFile() ||
        opened.ino !== stat.ino ||
        opened.dev !== stat.dev ||
        opened.size !== stat.size
      )
        throw new Error("Canonical publication file changed or is unsafe");
      let bytes: number;
      let readBytes = 0;
      while (
        (bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0
      ) {
        readBytes += bytes;
        if (readBytes > stat.size)
          throw new Error("Canonical publication file changed while reading");
        hash.update(buffer.subarray(0, bytes));
      }
      if (readBytes !== stat.size)
        throw new Error("Canonical publication file changed while reading");
      if (durable) fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }
  return hash.digest("hex");
}

function verifyPublishedEntries(
  journal: CanonicalEntryPublicationJournal,
): void {
  for (const entry of journal.entries) {
    if (
      entry.delete
        ? fs.existsSync(entry.targetPath)
        : entryHash(entry.targetPath) !== entry.afterHash
    )
      throw new Error("Committed canonical publication integrity check failed");
  }
}

function cleanupCommitted(
  filePath: string,
  journal: CanonicalEntryPublicationJournal,
): void {
  verifyPublishedEntries(journal);
  for (const entry of journal.entries) {
    removePath(entry.priorPath);
    if (entry.stagePath) removePath(entry.stagePath);
    flushDirectory(path.dirname(entry.targetPath));
  }
  fs.rmSync(filePath, { force: true });
  flushDirectory(path.dirname(filePath));
}

function rollback(
  filePath: string,
  journal: CanonicalEntryPublicationJournal,
): void {
  if (journal.state === "preparing") {
    if (journal.entries.some((entry) => fs.existsSync(entry.priorPath)))
      throw new Error("Preparing publication has unexpected prior data");
    for (const entry of journal.entries)
      if (entry.stagePath) removePath(entry.stagePath);
    fs.rmSync(filePath, { force: true });
    flushDirectory(path.dirname(filePath));
    return;
  }
  for (const entry of [...journal.entries].reverse()) {
    if (fs.existsSync(entry.priorPath)) {
      removePath(entry.targetPath);
      fs.mkdirSync(path.dirname(entry.targetPath), {
        recursive: true,
        mode: 0o700,
      });
      fs.renameSync(entry.priorPath, entry.targetPath);
    } else if (
      !entry.delete &&
      entry.stagePath &&
      !fs.existsSync(entry.stagePath) &&
      !entry.hadPrior
    ) {
      removePath(entry.targetPath);
    }
    if (entry.stagePath) removePath(entry.stagePath);
    removePath(entry.priorPath);
    flushDirectory(path.dirname(entry.targetPath));
  }
  fs.rmSync(filePath, { force: true });
  flushDirectory(path.dirname(filePath));
}

export function recoverCanonicalEntryPublication(
  rootPath: string,
  operationKey: string,
): "none" | "rolled-back" | "committed" {
  const activeKey = `${path.resolve(rootPath)}\u0000${operationKey}`;
  if (activePublications.has(activeKey)) return "none";
  const filePath = journalPath(rootPath, operationKey);
  const journal = readJournal(rootPath, operationKey);
  if (!journal) return "none";
  if (journal.ownerPid && journal.ownerPid !== process.pid) {
    try {
      process.kill(journal.ownerPid, 0);
      throw new Error("Canonical publication has a live owner");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  if (journal.state === "committed") {
    cleanupCommitted(filePath, journal);
    return "committed";
  }
  rollback(filePath, journal);
  return "rolled-back";
}

export function recoverCanonicalEntryPublications(rootPath: string): Array<{
  operationKey: string;
  status: "none" | "rolled-back" | "committed";
}> {
  if (!fs.existsSync(rootPath)) return [];
  const directory = path.dirname(journalPath(rootPath, "inventory"));
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Canonical publication journal directory is unsafe");
  const keys: string[] = [];
  for (const entry of fs.readdirSync(directory)) {
    const match = /^([a-z0-9][a-z0-9-]{0,63})-publication\.json$/u.exec(entry);
    if (match) keys.push(match[1]);
    if (keys.length > 128)
      throw new Error("Canonical publication journal count limit exceeded");
  }
  return keys.sort().map((operationKey) => ({
    operationKey,
    status: recoverCanonicalEntryPublication(rootPath, operationKey),
  }));
}

export function publishCanonicalEntries(
  options: PublishCanonicalEntriesOptions,
): CanonicalEntryPublicationResult {
  const rootPath = path.resolve(options.rootPath);
  assertOperationKey(options.operationKey);
  if (options.entries.length === 0)
    return { status: "unchanged", cleanupPending: false };
  if (options.entries.length > 20_000)
    throw new Error("Canonical publication entry limit exceeded");
  const activeKey = `${rootPath}\u0000${options.operationKey}`;
  if (activePublications.has(activeKey)) {
    throw new Error("Canonical entry publication is already active");
  }
  recoverCanonicalEntryPublication(rootPath, options.operationKey);
  const operationId = crypto.randomUUID();
  const entries = options.entries.map((entry): JournalEntry => {
    const targetPath = assertOwnedPath(rootPath, entry.targetPath);
    if (fs.existsSync(targetPath)) {
      const stat = fs.lstatSync(targetPath);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
        throw new Error("Canonical publication target is unsafe");
    }
    if (entry.delete === true && entry.prepare) {
      throw new Error(
        "Canonical entry deletion cannot have a prepare callback",
      );
    }
    if (entry.delete !== true && !entry.prepare) {
      throw new Error(
        "Canonical entry replacement requires a prepare callback",
      );
    }
    return {
      targetPath,
      stagePath:
        entry.delete === true
          ? null
          : path.join(
              path.dirname(targetPath),
              `.${path.basename(targetPath)}.stage-${operationId}`,
            ),
      priorPath: path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.prior-${operationId}`,
      ),
      delete: entry.delete === true,
      hadPrior: fs.existsSync(targetPath),
    };
  });
  if (
    new Set(entries.map((entry) => entry.targetPath)).size !== entries.length
  ) {
    throw new Error("Canonical entry publication has duplicate targets");
  }
  const sortedTargets = entries.map((entry) => entry.targetPath).sort();
  if (
    sortedTargets.some(
      (target, index) =>
        index > 0 &&
        target.startsWith(`${sortedTargets[index - 1]}${path.sep}`),
    )
  )
    throw new Error("Canonical publication targets overlap");
  const filePath = journalPath(rootPath, options.operationKey);
  activePublications.add(activeKey);
  let journalWritten = false;
  let committed = false;
  let commitDecisionStarted = false;
  try {
    const preparingJournal: CanonicalEntryPublicationJournal = {
      kind: JOURNAL_KIND,
      version: JOURNAL_VERSION,
      operationKey: options.operationKey,
      operationId,
      rootPath,
      state: "preparing",
      ownerPid: process.pid,
      entries,
      createdAt: new Date().toISOString(),
    };
    writeJournal(filePath, preparingJournal);
    journalWritten = true;
    for (const [index, entry] of entries.entries()) {
      if (!entry.stagePath) continue;
      fs.mkdirSync(path.dirname(entry.stagePath), {
        recursive: true,
        mode: 0o700,
      });
      options.entries[index].prepare!(entry.stagePath);
      const stats = fs.lstatSync(entry.stagePath);
      if (stats.isSymbolicLink()) {
        throw new Error("Canonical entry publication stage is unsafe");
      }
      entry.afterHash = entryHash(entry.stagePath, true);
    }
    const journal: CanonicalEntryPublicationJournal = {
      kind: JOURNAL_KIND,
      version: JOURNAL_VERSION,
      operationKey: options.operationKey,
      operationId,
      rootPath,
      state: "prepared",
      ownerPid: process.pid,
      entries: entries.map((entry) => ({
        ...entry,
        afterHash: entry.afterHash ?? "deleted",
      })),
      createdAt: new Date().toISOString(),
    };
    writeJournal(filePath, journal, true);
    for (const entry of entries) {
      options.injectFailure?.(entry.targetPath);
      if (entry.hadPrior) fs.renameSync(entry.targetPath, entry.priorPath);
      if (entry.stagePath) fs.renameSync(entry.stagePath, entry.targetPath);
      flushDirectory(path.dirname(entry.targetPath));
    }
    options.verify?.();
    verifyPublishedEntries(journal);
    options.commit?.();
    const committedJournal = { ...journal, state: "committed" as const };
    commitDecisionStarted = true;
    writeJournal(filePath, committedJournal, true);
    committed = true;
    options.afterCommit?.();
    let cleanupPending = false;
    try {
      cleanupCommitted(filePath, committedJournal);
    } catch {
      cleanupPending = true;
    }
    return { status: "committed", operationId, cleanupPending };
  } catch (error) {
    if (committed) throw new CanonicalPostCommitError(operationId, error);
    if (commitDecisionStarted)
      throw new CanonicalCommitOutcomeUnknownError(operationId, error);
    if (journalWritten) {
      const journal = readJournal(rootPath, options.operationKey);
      if (journal?.state === "committed")
        throw new CanonicalPostCommitError(operationId, error);
      if (journal) rollback(filePath, journal);
    } else {
      for (const entry of entries) {
        if (entry.stagePath) removePath(entry.stagePath);
        removePath(entry.priorPath);
      }
    }
    throw error;
  } finally {
    activePublications.delete(activeKey);
  }
}
