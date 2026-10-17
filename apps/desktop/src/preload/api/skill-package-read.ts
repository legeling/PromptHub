import { ipcRenderer } from "electron";
import type { SkillPackageReadResponse } from "@prompthub/shared/types/skill-package-read";

export async function invokeSkillPackageRead<T>(
  channel: string,
  options: unknown,
): Promise<T> {
  const result: SkillPackageReadResponse<T> = await ipcRenderer.invoke(
    channel,
    options,
  );
  if (result.ok === false)
    throw new Error(`SKILL_PACKAGE_READ:${result.errorCode}`);
  return result.value;
}
