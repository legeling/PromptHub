import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { registerWindowsNotificationBranding } from "../../src/main/windows-notification-registration";

const execFileAsync = promisify(execFile);

it.skipIf(process.platform !== "win32")(
  "registers and repairs the real Windows notification display name and icon",
  async () => {
    const appId = `com.prompthub.app.test.${randomUUID()}`;
    const key = `HKCU\\Software\\Classes\\AppUserModelId\\${appId}`;
    const root = process.env.SystemRoot;
    if (!root) throw new Error("Windows SystemRoot is missing");
    const reg = path.join(root, "System32", "reg.exe");
    const icon = path.resolve(
      __dirname,
      "../../resources/icon.iconset/icon_256x256.png",
    );
    const run = (...args: string[]) =>
      execFileAsync(reg, args, { windowsHide: true, timeout: 5000 });
    try {
      await registerWindowsNotificationBranding(appId, icon);
      expect((await run("query", key, "/v", "DisplayName")).stdout).toMatch(
        /DisplayName\s+REG_SZ\s+PromptHub\s/,
      );
      expect((await run("query", key, "/v", "IconUri")).stdout).toContain(icon);
      await run(
        "add",
        key,
        "/v",
        "DisplayName",
        "/t",
        "REG_SZ",
        "/d",
        appId,
        "/f",
      );
      await registerWindowsNotificationBranding(appId, icon);
      expect((await run("query", key, "/v", "DisplayName")).stdout).toMatch(
        /DisplayName\s+REG_SZ\s+PromptHub\s/,
      );
    } finally {
      await run("delete", key, "/f");
    }
  },
);
