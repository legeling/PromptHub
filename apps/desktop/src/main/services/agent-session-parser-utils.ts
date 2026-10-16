import type { AgentSessionEntry } from "@prompthub/shared/types";

const MAX_ENTRY_TEXT = 64 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  const direct = [
    value.text,
    value.content,
    value.message,
    value.result,
  ].flatMap((item) => collectText(item, depth + 1));
  return direct.length > 0 ? direct : [];
}

export function boundedText(value: unknown): string {
  return collectText(value).join("\n").slice(0, MAX_ENTRY_TEXT);
}

export function normalizeTimestamp(value: unknown): number | null {
  const numeric = numberValue(value);
  if (numeric !== null) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const text = stringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRole(value: unknown): AgentSessionEntry["role"] {
  const role = stringValue(value)?.toLowerCase();
  if (
    role === "user" ||
    role === "assistant" ||
    role === "tool" ||
    role === "system"
  ) {
    return role;
  }
  return "unknown";
}

export function getNestedValue(value: unknown, keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}
