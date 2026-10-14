import path from "node:path";

export function getElectronLaunchEnvironment(
  userDataDir: string,
  overrides: Record<string, string> = {},
  parent: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const environment: Record<string, string> = {};
  // Only inherit process-launch plumbing, never native Agent roots or credentials.
  for (const key of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TMPDIR",
    "TMP",
    "TEMP",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
  ]) {
    const value = parent[key];
    if (value !== undefined) environment[key] = value;
  }
  const home = overrides.HOME ?? path.join(userDataDir, "home");
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData/Roaming"),
    LOCALAPPDATA: path.join(home, "AppData/Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    ...overrides,
    NODE_ENV: "test",
    PROMPTHUB_E2E: "1",
    PROMPTHUB_E2E_USER_DATA_DIR: userDataDir,
  };
}

export function getElectronLaunchArgs(
  mainEntry: string,
  platform = process.platform,
  isCi = Boolean(process.env.CI),
): string[] {
  return platform === "linux" && isCi
    ? ["--no-sandbox", "--password-store=basic", mainEntry]
    : [mainEntry];
}
