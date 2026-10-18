import * as fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isInternalSkillRepoEntry } from "./platform-files";
import { parseSkillMd } from "./skill-frontmatter";

export interface CherrySkillFileChange {
  target: string;
  prepare?: (stage: string) => Promise<void>;
}

function exists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

/** Only direct children of verified native directories may be replaced. */
export function assertCherrySkillDirectory(
  root: string,
  directory: string,
): void {
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Unsafe Cherry Studio data root");
  }
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Cherry Studio Skill directory escapes its root");
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!exists(current)) continue;
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(
        `Unsafe Cherry Studio Skill parent directory: ${current}`,
      );
    }
  }
}

export async function copyCherrySkillPackage(
  source: string,
  target: string,
): Promise<void> {
  await fs.promises.cp(await fs.promises.realpath(source), target, {
    recursive: true,
    filter: (_source, destination) => {
      const relative = path.relative(target, destination);
      return !relative || !isInternalSkillRepoEntry(relative);
    },
  });
}

/** Matches Cherry 2.1.6's versioned directory hash, including directories and binary bytes. */
export async function hashCherrySkillPackage(
  directory: string,
): Promise<string> {
  const hash = createHash("sha256");
  async function visit(relativeDirectory: string): Promise<void> {
    const entries = await fs.promises.readdir(
      path.join(directory, relativeDirectory),
      { withFileTypes: true },
    );
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const filePath = path.join(directory, relative);
      const stat = await fs.promises.lstat(filePath);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        hash.update(`D:${Buffer.byteLength(relative)}:`).update(relative);
        await visit(relative);
      } else if (stat.isFile()) {
        const bytes = await fs.promises.readFile(filePath);
        hash
          .update(`F:${Buffer.byteLength(relative)}:`)
          .update(relative)
          .update(`:${bytes.length}:`)
          .update(bytes);
      }
    }
  }
  await visit("");
  return `directory-sha256:${hash.digest("hex")}`;
}

interface StagedLibrary {
  path: string;
  content: string;
  hash: string;
}

async function prepareLibrary(
  source: string,
  stage: string,
): Promise<StagedLibrary> {
  await copyCherrySkillPackage(source, stage);
  const content = await fs.promises.readFile(
    path.join(stage, "SKILL.md"),
    "utf8",
  );
  if (!parseSkillMd(content))
    throw new Error("Invalid Cherry Studio Skill entrypoint");
  return { path: stage, content, hash: await hashCherrySkillPackage(stage) };
}

async function prepareMirror(
  library: StagedLibrary,
  target: string,
  stage: string,
): Promise<void> {
  if (process.platform === "win32") {
    await fs.promises.cp(await fs.promises.realpath(library.path), stage, {
      recursive: true,
    });
    if ((await hashCherrySkillPackage(stage)) !== library.hash)
      throw new Error("Cherry Studio Skill mirror differs from library");
  } else await fs.promises.symlink(target, stage, "dir");
  if ((await hashCherrySkillPackage(library.path)) !== library.hash)
    throw new Error("Cherry Studio Skill source changed during publication");
}

export async function installCherrySkillFiles(
  target: string,
  mirror: string,
  source: string,
  commit: (content: string, hash: string) => void,
): Promise<void> {
  let library: StagedLibrary | undefined;
  await publishCherrySkillFiles(
    [
      {
        target,
        prepare: async (stage) => {
          library = await prepareLibrary(source, stage);
        },
      },
      {
        target: mirror,
        prepare: async (stage) => {
          if (!library) throw new Error("Cherry Studio library was not staged");
          await prepareMirror(library, target, stage);
        },
      },
    ],
    () => {
      if (!library) throw new Error("Cherry Studio library was not staged");
      commit(library.content, library.hash);
    },
  );
}

interface PreparedChange {
  target: string;
  stage: string;
  prior: string;
  prepare?: (stage: string) => Promise<void>;
  moved: boolean;
  published: boolean;
}

function restoreChanges(changes: PreparedChange[]): void {
  const failures: unknown[] = [];
  for (const change of [...changes].reverse()) {
    try {
      if (change.published)
        fs.rmSync(change.target, { recursive: true, force: true });
      if (change.moved) fs.renameSync(change.prior, change.target);
      fs.rmSync(change.stage, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "Cherry Studio Skill rollback failed; prior entries retained for recovery",
    );
}

function publishChanges(changes: PreparedChange[], commit: () => void): void {
  for (const change of changes) {
    if (exists(change.target)) {
      fs.renameSync(change.target, change.prior);
      change.moved = true;
    }
    if (change.prepare) {
      fs.renameSync(change.stage, change.target);
      change.published = true;
    }
  }
  commit();
}

function createPreparedChanges(
  changes: CherrySkillFileChange[],
): PreparedChange[] {
  return changes.map((change) => ({
    ...change,
    stage: path.join(
      path.dirname(change.target),
      `.${path.basename(change.target)}.prompthub-stage`,
    ),
    prior: path.join(
      path.dirname(change.target),
      `.${path.basename(change.target)}.prompthub-prior`,
    ),
    moved: false,
    published: false,
  }));
}

async function cleanupPriorEntries(changes: PreparedChange[]): Promise<void> {
  for (const change of changes) {
    if (!change.moved) continue;
    try {
      await fs.promises.rm(change.prior, { recursive: true, force: true });
    } catch (error) {
      // SQL and files are committed; cleanup cannot turn success into a destructive rollback.
      console.warn(
        "Cherry Studio Skill prior-entry cleanup failed:",
        change.prior,
        error,
      );
    }
  }
}

/** Stage first; keep both previous native entries until the SQL transaction succeeds. */
export async function publishCherrySkillFiles(
  changes: CherrySkillFileChange[],
  commit: () => void,
): Promise<void> {
  const prepared = createPreparedChanges(changes);
  for (const change of prepared) {
    if (exists(change.stage) || exists(change.prior))
      throw new Error(
        `Cherry Studio Skill publication needs recovery before retry: ${change.target}`,
      );
  }
  try {
    for (const change of prepared) {
      if (change.prepare) {
        await fs.promises.mkdir(path.dirname(change.target), {
          recursive: true,
        });
        await change.prepare(change.stage);
      }
    }
    publishChanges(prepared, commit);
  } catch (error) {
    try {
      restoreChanges(prepared);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Cherry Studio Skill publication and rollback failed",
      );
    }
    throw error;
  }
  await cleanupPriorEntries(prepared);
}
