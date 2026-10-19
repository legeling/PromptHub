import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { DatabaseAdapter, inspectDatabaseClientLeases } from "@prompthub/db";
import { acquireStorageMaintenanceIntent } from "@prompthub/core/storage-maintenance-intent";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import {
  inspectPromptWorkspaceUpgrade,
  migratePromptWorkspaceV2,
} from "@prompthub/core/migrations/prompt-workspace-v2";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  PromptWorkspaceResolution,
  PromptWorkspaceResolutionResult,
  PromptWorkspaceReviewResult,
} from "@prompthub/shared/types/prompt-workspace-recovery";

interface RecoveryOptions {
  rootPath: string;
  databasePath: string;
  isActive: () => boolean;
  windowId: () => number | undefined;
  restart: () => void;
  quit: () => void;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Prompt workspace recovery failed";
}

function parseResolution(value: unknown): PromptWorkspaceResolution {
  if (
    !value ||
    typeof value !== "object" ||
    !("fingerprint" in value) ||
    typeof value.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.fingerprint) ||
    !("choices" in value) ||
    !Array.isArray(value.choices)
  )
    throw new Error(
      "Prompt workspace recovery requires a valid review and choices",
    );
  const choices = value.choices.map(
    (choice: unknown): PromptWorkspaceResolution["choices"][number] => {
      if (
        !choice ||
        typeof choice !== "object" ||
        !("key" in choice) ||
        typeof choice.key !== "string" ||
        !("source" in choice) ||
        (choice.source !== "database" &&
          choice.source !== "workspace" &&
          choice.source !== "data")
      )
        throw new Error(
          "Prompt workspace recovery has an invalid source choice",
        );
      return { key: choice.key, source: choice.source };
    },
  );
  return { fingerprint: value.fingerprint, choices };
}

function withDatabase<T>(
  options: RecoveryOptions,
  readOnly: boolean,
  action: (database: DatabaseAdapter.Database) => T,
): T {
  assertStoragePathComponentsSafe(options.rootPath, options.databasePath);
  if (!fs.lstatSync(options.databasePath).isFile())
    throw new Error("Recovery database is not a regular file");
  const database = new DatabaseAdapter(options.databasePath, { readOnly });
  try {
    database.pragma("foreign_keys = ON");
    return action(database);
  } finally {
    database.close();
  }
}

function resolveReview(
  options: RecoveryOptions,
  request: unknown,
): PromptWorkspaceResolutionResult {
  const resolution = parseResolution(request);
  const maintenance = acquireStorageMaintenanceIntent(options.rootPath, {
    operationId: crypto.randomUUID(),
    operationKind: "prompt-workspace-recovery",
  });
  try {
    const clients = inspectDatabaseClientLeases(options.databasePath);
    if (clients.livePids.length > 0 || clients.unknownEntries.length > 0)
      throw new Error(
        "Close other PromptHub database clients before resolving this workspace",
      );
    const result = withDatabase(options, false, (database) =>
      migratePromptWorkspaceV2(database, { ...options, resolution }),
    );
    return { success: true, recoveryPath: result.recoveryPath ?? null };
  } finally {
    maintenance.release();
  }
}

/** Registered only for the isolated startup surface; no normal business IPC is opened. */
export function registerPromptWorkspaceRecoveryIPC(
  options: RecoveryOptions,
): void {
  const authorize = (event: IpcMainInvokeEvent): void => {
    if (
      !options.isActive() ||
      event.sender.id !== options.windowId() ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error(
        "Prompt workspace recovery is not available to this window",
      );
  };
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_REVIEW,
    (event): PromptWorkspaceReviewResult => {
      try {
        authorize(event);
        return {
          success: true,
          review: withDatabase(options, true, (database) =>
            inspectPromptWorkspaceUpgrade(database, options),
          ),
        };
      } catch (error) {
        return { success: false, error: errorText(error) };
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_RESOLVE,
    (event, request: unknown): PromptWorkspaceResolutionResult => {
      try {
        authorize(event);
        return resolveReview(options, request);
      } catch (error) {
        return { success: false, error: errorText(error) };
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_OPEN_DIRECTORY,
    async (event) => {
      try {
        authorize(event);
        const error = await shell.openPath(path.resolve(options.rootPath));
        return error ? { success: false, error } : { success: true };
      } catch (error) {
        return { success: false, error: errorText(error) };
      }
    },
  );
  ipcMain.handle(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_RESTART, (event) => {
    authorize(event);
    options.restart();
  });
  ipcMain.handle(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_QUIT, (event) => {
    authorize(event);
    options.quit();
  });
}
