import type {
  AutoSyncHistoryEntry,
  AutoSyncProviderKind,
  AutoSyncReason,
  AutoSyncStatus,
  Settings,
} from "@prompthub/shared/types";
import { useSettingsStore } from "../stores/settings.store";

export type {
  AutoSyncHistoryEntry,
  AutoSyncProviderKind,
  AutoSyncReason,
  AutoSyncStatus,
};

export const AUTO_SYNC_HISTORY_LIMIT = 20;
export const AUTO_SYNC_HISTORY_UPDATED_EVENT =
  "prompthub:auto-sync-history-updated";

export interface AutoSyncHistoryInput {
  provider: AutoSyncProviderKind;
  reason: AutoSyncReason;
  status: AutoSyncStatus;
  startedAt?: string;
  finishedAt?: string;
  message: string;
  localChanged?: boolean;
}

function isProvider(value: unknown): value is AutoSyncProviderKind {
  return value === "webdav" || value === "s3" || value === "self-hosted";
}

function isReason(value: unknown): value is AutoSyncReason {
  return (
    value === "manual" ||
    value === "startup" ||
    value === "startup-resume" ||
    value === "interval"
  );
}

function isStatus(value: unknown): value is AutoSyncStatus {
  return value === "success" || value === "failed" || value === "skipped";
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function createEntry(input: AutoSyncHistoryInput): AutoSyncHistoryEntry {
  const now = new Date().toISOString();
  return {
    id: `auto-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: input.provider,
    reason: input.reason,
    status: input.status,
    startedAt: input.startedAt ?? now,
    finishedAt: input.finishedAt ?? now,
    message: sanitizeMessage(input.message),
    localChanged: input.localChanged,
  };
}

export function normalizeAutoSyncHistory(
  value: unknown,
): AutoSyncHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => {
      return (
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      );
    })
    .map<AutoSyncHistoryEntry | null>((entry) => {
      const provider = entry.provider;
      const reason = entry.reason;
      const status = entry.status;
      const startedAt = entry.startedAt;
      const finishedAt = entry.finishedAt;
      const message = entry.message;

      if (
        !isProvider(provider) ||
        !isReason(reason) ||
        !isStatus(status) ||
        typeof startedAt !== "string" ||
        typeof finishedAt !== "string" ||
        typeof message !== "string"
      ) {
        return null;
      }

      return {
        id:
          typeof entry.id === "string" ? entry.id : `${provider}-${finishedAt}`,
        provider,
        reason,
        status,
        startedAt,
        finishedAt,
        message: sanitizeMessage(message),
        localChanged:
          typeof entry.localChanged === "boolean"
            ? entry.localChanged
            : undefined,
      };
    })
    .filter((entry): entry is AutoSyncHistoryEntry => entry !== null)
    .slice(0, AUTO_SYNC_HISTORY_LIMIT);
}

export async function readAutoSyncHistory(): Promise<AutoSyncHistoryEntry[]> {
  const settings = (await window.api?.settings?.get?.()) as
    | Settings
    | undefined;
  return normalizeAutoSyncHistory(settings?.autoSyncHistory);
}

async function appendAutoSyncLogFile(
  entry: AutoSyncHistoryEntry,
): Promise<void> {
  try {
    await window.electron?.appendAutoSyncLog?.(entry);
  } catch (error) {
    console.warn("Failed to append automatic sync log file:", error);
  }
}

export async function recordAutoSyncHistory(
  input: AutoSyncHistoryInput,
): Promise<AutoSyncHistoryEntry | null> {
  try {
    const entry = createEntry(input);
    const current = await readAutoSyncHistory();
    const next = [entry, ...current].slice(0, AUTO_SYNC_HISTORY_LIMIT);
    useSettingsStore.setState({ autoSyncHistory: next });
    await window.api?.settings?.set?.({ autoSyncHistory: next });
    await appendAutoSyncLogFile(entry);
    window.dispatchEvent(new CustomEvent(AUTO_SYNC_HISTORY_UPDATED_EVENT));
    return entry;
  } catch (error) {
    console.warn("Failed to record automatic sync history:", error);
    return null;
  }
}
