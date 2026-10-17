import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Windows resolves the attribution header from this registration, not from
// Notification.title or the shortcut description. Only product assets are set;
// notification permissions and activation handlers remain owned by Windows.
export async function registerWindowsNotificationBranding(
  appId: string,
  iconPath: string,
): Promise<void> {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot)
    throw new Error(
      "Cannot register notification identity: SystemRoot is missing",
    );
  const registry = path.join(systemRoot, "System32", "reg.exe");
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${appId}`;
  for (const [name, value] of [
    ["DisplayName", "PromptHub"],
    ["IconUri", iconPath],
  ]) {
    try {
      await execFileAsync(
        registry,
        ["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"],
        { windowsHide: true, timeout: 5000 },
      );
    } catch (cause) {
      throw new Error(
        `Failed to register PromptHub notification ${name} for ${appId}`,
        { cause },
      );
    }
  }
}
