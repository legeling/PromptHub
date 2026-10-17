import { ipcRenderer } from "electron";
import type { SkillPlatformOperationResponse } from "@prompthub/shared/types/skill-platform-operation";

export async function invokeSkillPlatformOperation<T>(
  channel: string,
  ...args: string[]
): Promise<T> {
  const result: SkillPlatformOperationResponse<T> = await ipcRenderer.invoke(
    channel,
    ...args,
  );
  if (result.ok === false) {
    // Error.message survives contextBridge; custom Error properties do not.
    throw new Error(`SKILL_PLATFORM:${result.errorCode}`);
  }
  return result.value;
}
