import fs from "fs";
import path from "path";

import {
  createUpgradeDataSnapshot,
  getUpgradeBackupRoot,
  type MigrateLegacyResult,
  migrateLegacyUpgradeBackups,
  type UpgradeBackupSnapshot,
} from "./upgrade-backup";

const LAST_RUN_VERSION_FILE = ".last-run-version.json";

interface LastRunVersionRecord {
  version: string;
  updatedAt: string;
}

export interface UpgradeBackupStartupResult {
  migration: MigrateLegacyResult;
  previousVersion: string | null;
  currentVersion: string;
  snapshot: UpgradeBackupSnapshot | null;
  snapshotError: string | null;
  status:
    | "first-run"
    | "not-an-upgrade"
    | "snapshot-created"
    | "user-data-empty"
    | "user-data-missing"
    | "snapshot-failed";
}

export function compareAppVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

export function getLastRunVersionMarkerPath(userDataPath: string): string {
  return path.join(getUpgradeBackupRoot(userDataPath), LAST_RUN_VERSION_FILE);
}

async function readLastRunVersion(
  userDataPath: string,
): Promise<string | null> {
  const markerPath = getLastRunVersionMarkerPath(userDataPath);
  try {
    if (!fs.existsSync(markerPath)) {
      return null;
    }

    const parsed = JSON.parse(
      await fs.promises.readFile(markerPath, "utf8"),
    ) as Partial<LastRunVersionRecord>;
    if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
      return null;
    }

    return parsed.version;
  } catch {
    return null;
  }
}

async function writeLastRunVersion(
  userDataPath: string,
  version: string,
): Promise<void> {
  const markerPath = getLastRunVersionMarkerPath(userDataPath);
  const payload: LastRunVersionRecord = {
    version,
    updatedAt: new Date().toISOString(),
  };

  await fs.promises.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.promises.writeFile(markerPath, JSON.stringify(payload, null, 2), "utf8");
}

export async function runUpgradeBackupStartupTasks(
  userDataPath: string,
  currentVersion: string,
): Promise<UpgradeBackupStartupResult> {
  const migration = await migrateLegacyUpgradeBackups(userDataPath);
  const previousVersion = await readLastRunVersion(userDataPath);

  if (!previousVersion) {
    await writeLastRunVersion(userDataPath, currentVersion);
    return {
      migration,
      previousVersion: null,
      currentVersion,
      snapshot: null,
      snapshotError: null,
      status: "first-run",
    };
  }

  if (compareAppVersions(previousVersion, currentVersion) >= 0) {
    await writeLastRunVersion(userDataPath, currentVersion);
    return {
      migration,
      previousVersion,
      currentVersion,
      snapshot: null,
      snapshotError: null,
      status: "not-an-upgrade",
    };
  }

  try {
    const snapshot = await createUpgradeDataSnapshot(userDataPath, {
      fromVersion: previousVersion,
      toVersion: currentVersion,
    });
    await writeLastRunVersion(userDataPath, currentVersion);
    return {
      migration,
      previousVersion,
      currentVersion,
      snapshot,
      snapshotError: null,
      status: "snapshot-created",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/user data path is empty/i.test(message)) {
      await writeLastRunVersion(userDataPath, currentVersion);
      return {
        migration,
        previousVersion,
        currentVersion,
        snapshot: null,
        snapshotError: null,
        status: "user-data-empty",
      };
    }

    if (/user data path does not exist/i.test(message)) {
      await writeLastRunVersion(userDataPath, currentVersion);
      return {
        migration,
        previousVersion,
        currentVersion,
        snapshot: null,
        snapshotError: null,
        status: "user-data-missing",
      };
    }

    return {
      migration,
      previousVersion,
      currentVersion,
      snapshot: null,
      snapshotError: message,
      status: "snapshot-failed",
    };
  }
}
