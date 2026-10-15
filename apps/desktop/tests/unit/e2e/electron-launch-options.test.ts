import { describe, expect, it } from "vitest";

import path from "node:path";
import {
  getElectronLaunchArgs,
  getElectronLaunchEnvironment,
  isElectronHeaded,
} from "../../e2e/helpers/electron-launch-options";

describe("Electron E2E launch options", () => {
  it("isolates home and data roots without inheriting native account configuration", () => {
    const profile = path.resolve("isolated-profile");
    const env = getElectronLaunchEnvironment(
      profile,
      {},
      {
        PATH: "/toolchain/bin",
        HOME: "/daily-home",
        CODEX_HOME: "/daily-codex",
        CLAUDE_CONFIG_DIR: "/daily-claude",
        ANTHROPIC_API_KEY: "daily-secret",
        VITE_DEV_SERVER_URL: "http://daily-dev-server",
        PROMPTHUB_E2E_SEED_PATH: "/stale-seed",
        DISPLAY: ":1",
      },
    );
    expect(env.HOME).toBe(path.join(profile, "home"));
    expect(env.USERPROFILE).toBe(env.HOME);
    expect(env.XDG_CONFIG_HOME).toBe(path.join(env.HOME, ".config"));
    expect(env.XDG_DATA_HOME).toBe(path.join(env.HOME, ".local/share"));
    expect(env.APPDATA).toBe(path.join(env.HOME, "AppData/Roaming"));
    expect(env.PATH).toBe("/toolchain/bin");
    expect(env.DISPLAY).toBe(":1");
    for (const key of [
      "CODEX_HOME",
      "CLAUDE_CONFIG_DIR",
      "ANTHROPIC_API_KEY",
      "VITE_DEV_SERVER_URL",
      "PROMPTHUB_E2E_SEED_PATH",
    ]) {
      expect(env).not.toHaveProperty(key);
    }
  });

  it("retains explicit fixture paths and binds the test runtime to its profile", () => {
    const profile = path.resolve("custom-profile");
    const home = path.join(profile, "fixture-home");
    const env = getElectronLaunchEnvironment(
      profile,
      {
        HOME: home,
        CODEX_HOME: path.join(home, "codex-fixture"),
        PATH: path.join(home, "empty-bin"),
      },
      {},
    );
    expect(env.HOME).toBe(home);
    expect(env.USERPROFILE).toBe(home);
    expect(env.CODEX_HOME).toBe(path.join(home, "codex-fixture"));
    expect(env.PROMPTHUB_E2E_USER_DATA_DIR).toBe(profile);
    expect(env.PROMPTHUB_E2E).toBe("1");
    expect(env.NODE_ENV).toBe("test");
  });

  it("uses headless-safe Chromium services only on hosted Linux CI", () => {
    expect(getElectronLaunchArgs("/app/main.js", "linux", true, false)).toEqual(
      ["--no-sandbox", "--password-store=basic", "/app/main.js", "--hidden"],
    );
    expect(
      getElectronLaunchArgs("/app/main.js", "linux", false, false),
    ).toEqual(["/app/main.js", "--hidden"]);
    expect(
      getElectronLaunchArgs("/app/main.js", "darwin", true, false),
    ).toEqual(["/app/main.js", "--hidden"]);
    expect(
      getElectronLaunchArgs("C:\\app\\main.js", "win32", true, false),
    ).toEqual(["C:\\app\\main.js", "--hidden"]);
  });

  it("requires explicit opt-in for native visible windows", () => {
    expect(isElectronHeaded({})).toBe(false);
    expect(isElectronHeaded({ PROMPTHUB_E2E_HEADED: "0" })).toBe(false);
    expect(isElectronHeaded({ PROMPTHUB_E2E_HEADED: "1" })).toBe(true);
    expect(
      getElectronLaunchArgs("/app/main.js", "darwin", false, true),
    ).toEqual(["/app/main.js"]);
  });
});
