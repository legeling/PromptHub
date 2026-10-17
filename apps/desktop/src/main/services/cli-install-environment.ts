import path from "node:path";

type Probe = (
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<{ stdout: string }>;

function absoluteDirectory(
  value: string | undefined,
  platform: NodeJS.Platform,
): string | null {
  const directory = value?.trim();
  const paths = platform === "win32" ? path.win32 : path.posix;
  return directory &&
    !/[\r\n\0]/.test(directory) &&
    !directory.includes(paths.delimiter) &&
    paths.isAbsolute(directory)
    ? directory
    : null;
}

export function withCliDirectories(
  env: NodeJS.ProcessEnv,
  directories: string[],
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  const next = { ...env };
  const pathKeys = Object.keys(next).filter((key) =>
    platform === "win32" ? key.toLowerCase() === "path" : key === "PATH",
  );
  const delimiter = platform === "win32" ? ";" : ":";
  const entries = [
    ...directories,
    ...pathKeys.flatMap((key) => (next[key] ?? "").split(delimiter)),
  ];
  for (const key of pathKeys) delete next[key];
  next.PATH = [...new Set(entries.filter(Boolean))].join(delimiter);
  return next;
}

async function probeDirectory(
  probe: Probe,
  args: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<string | null> {
  try {
    return absoluteDirectory((await probe(args, env)).stdout, platform);
  } catch {
    // These are optional discovery probes. The actual install reports failures.
    return null;
  }
}

export async function preparePnpmEnvironment(
  probe: Probe,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<{ env: NodeJS.ProcessEnv; globalBinDirectory: string | null }> {
  const configured = await probeDirectory(
    probe,
    ["config", "get", "global-bin-dir"],
    env,
    platform,
  );
  const home = absoluteDirectory(env.PNPM_HOME, platform);
  const paths = platform === "win32" ? path.win32 : path.posix;
  // Newer pnpm releases keep shims in PNPM_HOME/bin; ask pnpm for the final path.
  const candidates = [
    configured,
    home,
    home ? paths.join(home, "bin") : null,
  ].filter((item): item is string => item !== null);
  const provisional = withCliDirectories(env, candidates, platform);
  const directory = await probeDirectory(
    probe,
    ["bin", "-g"],
    provisional,
    platform,
  );
  return {
    env: withCliDirectories(
      provisional,
      directory ? [directory] : [],
      platform,
    ),
    globalBinDirectory: directory ?? configured ?? home,
  };
}
