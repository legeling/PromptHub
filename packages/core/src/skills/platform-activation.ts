import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface PlatformActivationRecord {
  skillId: string;
  skillName: string;
  installedFingerprint?: string;
  sourcePath?: string;
}
export type PlatformActivationMap = Record<string, PlatformActivationRecord>;
export const PLATFORM_ACTIVATION_STATE_FILE =
  ".prompthub-platform-activations.json";
export const MAX_PLATFORM_ACTIVATION_RECORDS = 512;

function parseState(raw: string): PlatformActivationMap {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid Skill activation state");
  const entries = Object.entries(parsed);
  if (entries.length > MAX_PLATFORM_ACTIVATION_RECORDS)
    throw new Error("Skill activation state limit exceeded");
  return Object.fromEntries(
    entries.map(([name, value]) => {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.skillId !== "string" ||
        typeof value.skillName !== "string"
      )
        throw new Error("Invalid Skill activation record");
      return [
        name,
        {
          skillId: value.skillId,
          skillName: value.skillName,
          ...(typeof value.installedFingerprint === "string"
            ? { installedFingerprint: value.installedFingerprint }
            : {}),
          ...(typeof value.sourcePath === "string"
            ? { sourcePath: value.sourcePath }
            : {}),
        },
      ];
    }),
  );
}

/** Tolerant parser for legacy startup reconciliation; mutation reads use the strict boundary. */
export function parsePlatformActivationState(
  raw: string,
): PlatformActivationMap {
  try {
    return parseState(raw);
  } catch (error) {
    console.warn(
      "Skipping invalid Skill activation state",
      error instanceof Error ? error.message : "invalid state",
    );
    return {};
  }
}

export async function readActivationState(
  file: string,
): Promise<PlatformActivationMap> {
  try {
    const raw = await fs.readFile(file, "utf8");
    if (Buffer.byteLength(raw) > 1024 * 1024)
      throw new Error("Skill activation state is too large");
    return parseState(raw);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return {};
    throw error;
  }
}

export async function writeActivationState(
  file: string,
  state: PlatformActivationMap,
): Promise<void> {
  const temporary = `${file}.tmp-${randomUUID()}`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(
      temporary,
      `${JSON.stringify(state, null, 2)}\n`,
      "utf-8",
    );
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export { withDirectoryOperationLock as withPlatformOperationLock } from "../directory-transaction";
