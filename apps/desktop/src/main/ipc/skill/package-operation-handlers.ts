import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { SkillPackageLifecycleService } from "../../services/skill-package-lifecycle";
import {
  cleanupAbandonedSkillPackageOperations,
  createDesktopSkillPackageLifecycleDependencies,
} from "../../services/skill-package-lifecycle-desktop";
import type { SkillIPCContext } from "./shared";

/** Register the single main-process owner for Skill package installation and updates. */
export function registerSkillPackageOperationHandlers({
  db,
}: SkillIPCContext): Promise<void> {
  const lifecycle = new SkillPackageLifecycleService(
    createDesktopSkillPackageLifecycleDependencies(db),
  );

  let recoveryError: unknown;
  let recoveryFailed = false;
  const ready = cleanupAbandonedSkillPackageOperations(db, {
    recoverAll: true,
  }).catch((error) => {
    recoveryError = error;
    recoveryFailed = true;
    console.warn(
      "Failed to recover abandoned Skill package operations:",
      error,
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.SKILL_RUN_PACKAGE_OPERATION,
    async (_event, request: unknown) => {
      await ready;
      if (recoveryFailed)
        throw new Error("Skill package recovery failed", {
          cause: recoveryError,
        });
      return lifecycle.run(request);
    },
  );
  return ready;
}
