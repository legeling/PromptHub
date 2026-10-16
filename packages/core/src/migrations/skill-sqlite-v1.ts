import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  SkillDB,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { Skill, SkillVersion } from "@prompthub/shared/types";
import {
  createPortableSkillResource,
  readSkillResourceBundle,
  type ReadSkillResourceResult,
} from "../skill-resource-schema";
import { readHistoricalSkillBinding } from "./skill-source-bindings-v1";
import {
  collectSkillPackageFiles,
  getManagedSkillPackagePath,
  readSkillEntrypoint,
} from "../skill-storage-files";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";

const MIGRATION_NAME = "skill-sqlite-v1";

interface HistoricalSkill {
  source: string;
  resource: ReadSkillResourceResult;
}

function historicalSkills(
  root: string,
  skills: readonly Skill[],
): HistoricalSkill[] {
  const directory = path.join(root, "data", "skills");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  const known = new Set(
    skills.flatMap((skill) => {
      const relative = skill.local_repo_path
        ? path.relative(directory, skill.local_repo_path)
        : "";
      return [
        encodeCanonicalResourceDirectory(skill.id),
        ...(relative && !relative.startsWith("..")
          ? [relative.split(path.sep)[0]]
          : []),
      ];
    }),
  );
  const result: HistoricalSkill[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error("Skill migration package is unsafe");
    if (!entry.isDirectory()) continue;
    const source = path.join(directory, entry.name);
    if (!fs.existsSync(path.join(source, "manifest.json"))) {
      if (
        known.has(entry.name) ||
        entry.name.startsWith(".") ||
        ["SKILL.md", "files/SKILL.md", "repo/SKILL.md"].some((file) =>
          fs.existsSync(path.join(source, file)),
        )
      )
        continue;
      throw new Error("Unrecognized Skill directory requires recovery");
    }
    const resource = readSkillResourceBundle(source);
    if (entry.name !== encodeCanonicalResourceDirectory(resource.skill.id))
      throw new Error("Skill migration identity mismatch");
    result.push({ source, resource });
  }
  return result;
}

function comparable(skill: Skill): unknown {
  return JSON.parse(JSON.stringify(createPortableSkillResource(skill)));
}

function ownedPath(root: string, candidate: string): boolean {
  return [
    path.join(root, "data", "skills"),
    path.join(root, "cache", "skill-workspaces"),
    path.join(root, "skills"),
  ].some((directory) => {
    const relative = path.relative(directory, path.resolve(candidate));
    return (
      relative === "" ||
      (!relative.startsWith(".." + path.sep) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  });
}

function backupEntry(
  root: string,
  item: HistoricalSkill,
  bindingFile: string,
  cache: string,
): CanonicalEntryMutation {
  const targetPath = path.join(
    root,
    "recovery",
    MIGRATION_NAME,
    encodeCanonicalResourceDirectory(item.resource.skill.id),
    crypto.randomUUID(),
  );
  return {
    targetPath,
    prepare(stage) {
      fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
      fs.cpSync(item.source, path.join(stage, "bundle"), {
        recursive: true,
        dereference: false,
      });
      if (fs.existsSync(bindingFile))
        fs.copyFileSync(bindingFile, path.join(stage, "binding.json"));
      if (fs.existsSync(cache)) {
        assertStoragePathComponentsSafe(root, cache);
        fs.cpSync(cache, path.join(stage, "workspace"), {
          recursive: true,
          dereference: false,
        });
      }
      if (
        readSkillResourceBundle(path.join(stage, "bundle")).bundleManifest
          .contentHash !== item.resource.bundleManifest.contentHash
      )
        throw new Error("Skill migration recovery copy mismatch");
    },
  };
}

function prepareHistorical(
  root: string,
  item: HistoricalSkill,
  prior: Skill | undefined,
): {
  skill: Skill;
  versions: SkillVersion[];
  entries: CanonicalEntryMutation[];
} {
  if (
    prior &&
    !isDeepStrictEqual(comparable(prior), comparable(item.resource.skill))
  )
    throw new Error(
      `Skill metadata migration conflict: ${item.resource.skill.id}`,
    );
  const id = item.resource.skill.id;
  const identity = encodeCanonicalResourceDirectory(id);
  const bindingFile = path.join(
    root,
    "config",
    "devices",
    "skill-sources",
    `${identity}.json`,
  );
  const binding = readHistoricalSkillBinding(root, id);
  const cache = path.join(root, "cache", "skill-workspaces", identity);
  const selected = binding?.localRepoPath ?? prior?.local_repo_path;
  const external =
    selected && !ownedPath(root, selected) ? selected : undefined;
  const packagePath =
    external ??
    getManagedSkillPackagePath(id, path.join(root, "data", "skills"));
  const entry = item.resource.packageFiles.find(
    (file) => file.path === "SKILL.md",
  );
  const content = external
    ? readSkillEntrypoint(path.join(external, "SKILL.md"))
    : entry
      ? readSkillEntrypoint(entry.absolutePath)
      : (prior?.content ?? item.resource.skill.content);
  const skill = {
    ...(prior ?? item.resource.skill),
    source_url:
      binding?.sourceUrl ?? prior?.source_url ?? item.resource.skill.source_url,
    local_repo_path: entry || external ? packagePath : undefined,
    content,
    instructions: content,
  };
  const entries: CanonicalEntryMutation[] = [
    backupEntry(root, item, bindingFile, cache),
  ];
  entries.push({
    targetPath: item.source,
    prepare(stage) {
      fs.mkdirSync(stage, { mode: 0o700 });
      if (!external)
        for (const file of item.resource.packageFiles) {
          const target = path.join(stage, "files", ...file.path.split("/"));
          fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
          fs.copyFileSync(
            file.absolutePath,
            target,
            fs.constants.COPYFILE_EXCL,
          );
        }
    },
  });
  if (fs.existsSync(bindingFile))
    entries.push({ targetPath: bindingFile, delete: true });
  if (fs.existsSync(cache)) entries.push({ targetPath: cache, delete: true });
  return { skill, versions: item.resource.versions, entries };
}

function prepareSqlPackage(
  root: string,
  skill: Skill,
): { skill: Skill; entries: CanonicalEntryMutation[] } {
  const current = skill.local_repo_path;
  if (current && !ownedPath(root, current)) {
    readSkillEntrypoint(path.join(current, "SKILL.md"));
    return { skill, entries: [] };
  }
  const targetPath = getManagedSkillPackagePath(
    skill.id,
    path.join(root, "data", "skills"),
  );
  if (current === targetPath) return { skill, entries: [] };
  const files = current ? collectSkillPackageFiles(current) : [];
  const content = current
    ? readSkillEntrypoint(path.join(current, "SKILL.md"))
    : (skill.instructions ?? skill.content);
  if (content === undefined) return { skill, entries: [] };
  const entries: CanonicalEntryMutation[] = [
    {
      targetPath,
      prepare(stage) {
        fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
        for (const file of files) {
          const target = path.join(stage, ...file.path.split("/"));
          fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
          fs.copyFileSync(file.sourcePath, target);
        }
        if (!current)
          fs.writeFileSync(path.join(stage, "SKILL.md"), content, {
            mode: 0o600,
          });
      },
    },
  ];
  return {
    skill: {
      ...skill,
      content,
      instructions: content,
      local_repo_path: targetPath,
    },
    entries,
  };
}

function detachConflictingSources(
  incoming: Skill[],
  existing: readonly Skill[],
): void {
  const owners = new Map(
    existing
      .filter((skill) => skill.source_id)
      .map((skill) => [skill.source_id, skill.id]),
  );
  const counts = new Map<string, number>();
  for (const skill of incoming) {
    if (skill.source_id)
      counts.set(skill.source_id, (counts.get(skill.source_id) ?? 0) + 1);
  }
  for (const skill of incoming) {
    const source = skill.source_id;
    if (!source) continue;
    const owner = owners.get(source);
    if ((owner && owner !== skill.id) || (!owner && counts.get(source)! > 1)) {
      // Preserve every resource and its original binding in recovery; ambiguous
      // historical bindings must not replace an established SQL source owner.
      skill.source_id = undefined;
      skill.source_binding_state = "detached";
    }
  }
}

/** Bootstrap conversion only; normal Skill commands never read metadata bundles. */
export function migrateSkillSqliteV1(
  database: DatabaseAdapter.Database,
  options: {
    rootPath: string;
    databasePath: string;
    injectFailure?: (targetPath: string) => void;
  },
): void {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const repository = new SkillDB(database);
  const skills = repository.getAll();
  const historical = historicalSkills(root, skills);
  const completed = Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    ),
  );
  if (completed && historical.length === 0) return;
  const current = new Map(skills.map((skill) => [skill.id, skill]));
  for (const item of historical) {
    const owner = item.resource.skill.ownerUserId;
    if (owner && !database.get("SELECT id FROM users WHERE id = ?", owner))
      item.resource.skill = { ...item.resource.skill, ownerUserId: undefined };
  }
  const graphs = historical.map((item) => {
    const prior = current.get(item.resource.skill.id);
    if (!prior && completed)
      throw new Error(
        `Retired Skill is absent from SQLite: ${item.resource.skill.id}`,
      );
    const graph = prepareHistorical(root, item, prior);
    current.delete(graph.skill.id);
    return graph;
  });
  const remaining = completed
    ? []
    : [...current.values()].map((skill) => prepareSqlPackage(root, skill));
  detachConflictingSources(
    [...graphs, ...remaining].map((graph) => graph.skill),
    skills,
  );
  const entries = [
    ...graphs.flatMap((graph) => graph.entries),
    ...remaining.flatMap((graph) => graph.entries),
  ];
  const targets = new Set(entries.map((entry) => entry.targetPath));
  const ancestors = new Set<string>();
  for (const target of targets) {
    let parent = path.dirname(target);
    while (parent !== root && parent !== path.dirname(parent)) {
      ancestors.add(parent);
      parent = path.dirname(parent);
    }
  }
  const retired = new Set<string>();
  for (const skill of completed ? [] : current.values()) {
    const source = skill.local_repo_path;
    if (
      !source ||
      !ownedPath(root, source) ||
      source ===
        getManagedSkillPackagePath(
          skill.id,
          path.join(root, "data", "skills"),
        ) ||
      retired.has(source)
    )
      continue;
    if (targets.has(source)) continue;
    if (ancestors.has(source))
      throw new Error("Historical Skill source overlaps its destination");
    assertStoragePathComponentsSafe(root, source);
    const targetPath = path.join(
      root,
      "recovery",
      MIGRATION_NAME,
      encodeCanonicalResourceDirectory(skill.id),
      crypto.randomUUID(),
    );
    entries.push(
      {
        targetPath,
        prepare(stage) {
          fs.cpSync(source, stage, {
            recursive: true,
            dereference: false,
            errorOnExist: true,
            force: false,
          });
        },
      },
      { targetPath: source, delete: true },
    );
    retired.add(source);
  }
  if (entries.length > 0)
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    injectFailure: options.injectFailure,
    commit() {
      for (const graph of [...graphs, ...remaining])
        repository.insertSkillDirect(graph.skill);
      for (const graph of graphs)
        for (const version of graph.versions)
          repository.insertVersionDirect(version);
      database.run(
        "DELETE FROM canonical_resources WHERE resource_type = ?",
        "skill",
      );
      database.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        Date.now(),
      );
    },
  });
}
