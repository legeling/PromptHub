import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { acquireStorageMaintenanceIntent } from "../storage-maintenance-intent";
import {
  recoverCanonicalEntryPublications,
  publishCanonicalEntries,
} from "../canonical-entry-publication";
import {
  calculateResourceBundleContentHash,
  DEFAULT_RESOURCE_BUNDLE_LIMITS,
  parseResourceBundleManifest,
  readResourceBundle,
  RESOURCE_BUNDLE_MANIFEST_FILE,
  type ResourceBundleManifest,
} from "../resource-bundle";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import { readSkillResourceBundle } from "../skill-resource-schema";

const MIGRATION_ID = "skill-package-internals-v1";
const INTERNAL_PREFIX = "files/.prompthub/";

function readManifest(root: string, bundle: string): ResourceBundleManifest {
  const file = path.join(bundle, RESOURCE_BUNDLE_MANIFEST_FILE);
  assertStoragePathComponentsSafe(root, file);
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.size > DEFAULT_RESOURCE_BUNDLE_LIMITS.maxManifestBytes
  )
    throw new Error("Skill package migration manifest is invalid");
  return parseResourceBundleManifest(fs.readFileSync(file, "utf8"));
}

function prepareCurrentBundle(
  source: string,
  stage: string,
  manifest: ResourceBundleManifest,
): void {
  fs.cpSync(source, stage, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  fs.rmSync(path.join(stage, "files", ".prompthub"), { recursive: true });
  const filesRoot = path.join(stage, "files");
  if (fs.readdirSync(filesRoot).length === 0) fs.rmdirSync(filesRoot);
  const current = {
    ...manifest,
    revision: manifest.revision + 1,
    payloadFiles: manifest.payloadFiles.filter(
      (file) => !file.path.startsWith(INTERNAL_PREFIX),
    ),
    provenance: {
      ...manifest.provenance,
      packageInternalsMigration: {
        version: 1,
        sourceHash: manifest.contentHash,
      },
    },
  };
  fs.writeFileSync(
    path.join(stage, RESOURCE_BUNDLE_MANIFEST_FILE),
    `${JSON.stringify(
      {
        ...current,
        contentHash: calculateResourceBundleContentHash(current),
      },
      null,
      2,
    )}\n`,
  );
  // The current reader must accept the staged data before any live replacement.
  readSkillResourceBundle(stage);
}

function copyVerifiedBundle(
  source: string,
  destination: string,
  expectedHash: string,
): void {
  fs.cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  if (readResourceBundle(destination).manifest.contentHash !== expectedHash)
    throw new Error("Skill package migration backup verification failed");
}

function migrateBundle(
  root: string,
  bundle: string,
  manifest: ResourceBundleManifest,
  injectFailure?: (targetPath: string) => void,
): void {
  readResourceBundle(bundle, { expectedResourceType: "skill" });
  const backup = path.join(
    root,
    "recovery",
    MIGRATION_ID,
    path.basename(bundle),
    manifest.contentHash,
  );
  assertStoragePathComponentsSafe(root, backup);
  const backupExists = fs.existsSync(backup);
  if (
    backupExists &&
    readResourceBundle(backup).manifest.contentHash !== manifest.contentHash
  )
    throw new Error("Skill package migration backup does not match its source");
  publishCanonicalEntries({
    rootPath: root,
    operationKey: MIGRATION_ID,
    entries: [
      ...(!backupExists
        ? [
            {
              targetPath: backup,
              prepare: (stage: string) =>
                copyVerifiedBundle(bundle, stage, manifest.contentHash),
            },
          ]
        : []),
      {
        targetPath: bundle,
        prepare: (stage) => prepareCurrentBundle(bundle, stage, manifest),
      },
    ],
    injectFailure,
    verify() {
      readSkillResourceBundle(bundle);
      if (
        readResourceBundle(backup).manifest.contentHash !== manifest.contentHash
      )
        throw new Error("Skill package migration lost its recovery source");
    },
  });
}

/** Startup/restore upgrade step; callers hold the existing storage maintenance lock. */
export function migrateSkillPackageInternalsV1(
  root: string,
  injectFailure?: (targetPath: string) => void,
): number {
  const directory = path.join(root, "data", "skills");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return 0;
  let migrated = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error("Skill package migration directory is unsafe");
    if (!entry.isDirectory()) continue;
    const bundle = path.join(directory, entry.name);
    // Loose historical workspaces are not resource bundles; recovery owns them.
    if (!fs.existsSync(path.join(bundle, RESOURCE_BUNDLE_MANIFEST_FILE)))
      continue;
    const manifest = readManifest(root, bundle);
    const internal = manifest.payloadFiles.filter((file) =>
      file.path.startsWith(INTERNAL_PREFIX),
    );
    if (internal.length === 0) continue;
    if (internal.some((file) => file.role !== "package"))
      throw new Error(
        "Skill package migration internal payload role is invalid",
      );
    migrateBundle(root, bundle, manifest, injectFailure);
    migrated += 1;
  }
  return migrated;
}

/** Upgrade before Desktop chooses normal catalog reconciliation or recovery. */
export function upgradeSkillPackageInternals(root: string): number {
  const maintenance = acquireStorageMaintenanceIntent(root, {
    operationId: crypto.randomUUID(),
    operationKind: "skill-package-migration",
  });
  try {
    recoverCanonicalEntryPublications(root);
    return migrateSkillPackageInternalsV1(root);
  } finally {
    maintenance.release();
  }
}
