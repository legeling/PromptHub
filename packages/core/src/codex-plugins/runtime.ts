import { constants } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  createNativeCommandRunner,
  type NativeCommandRunner,
} from "../native-command";

interface CodexRuntimeOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  standalone?: NativeCommandRunner;
  accessExecutable?: (candidate: string) => Promise<void>;
}

/** Plugin operations use the desktop's protocol version when a desktop is installed. */
export function createCodexPluginRunner(
  options: CodexRuntimeOptions = {},
): NativeCommandRunner {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const standalone =
    options.standalone ??
    createNativeCommandRunner({ env: environment, platform });
  const accessExecutable =
    options.accessExecutable ??
    ((candidate: string) => access(candidate, constants.X_OK));
  return {
    run: standalone.run,
    async resolve(command) {
      if (
        command === "codex" &&
        (platform === "darwin" || platform === "win32" || platform === "linux")
      ) {
        const candidates =
          getPlatformById("codex")?.cli?.bundledExecutablePaths?.[platform] ??
          [];
        for (const template of candidates) {
          const candidate = template.replace(
            /^~/,
            environment.HOME || environment.USERPROFILE || os.homedir(),
          );
          try {
            await accessExecutable(candidate);
            return candidate;
          } catch {
            // Desktop runtime discovery precedes standalone CLI discovery.
          }
        }
      }
      return standalone.resolve(command);
    },
  };
}
