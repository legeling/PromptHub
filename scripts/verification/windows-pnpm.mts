import { existsSync } from "node:fs";
import path from "node:path";

/** Run the installed CLI through Node; .cmd files cannot be spawned without a shell. */
export function resolveWindowsPnpm(environment: NodeJS.ProcessEnv): string {
  const inherited = environment.npm_execpath;
  if (
    inherited &&
    /[\\/]pnpm\.[cm]?js$/i.test(inherited) &&
    existsSync(inherited)
  ) {
    return inherited;
  }
  const searchPath =
    Object.entries(environment).find(
      ([key]) => key.toLowerCase() === "path",
    )?.[1] ?? "";
  for (const directory of searchPath.split(";").filter(Boolean)) {
    for (const relative of [
      "node_modules/pnpm/bin/pnpm.cjs",
      "node_modules/corepack/dist/pnpm.js",
    ]) {
      const candidate = path.join(directory.replace(/^"|"$/g, ""), relative);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(
    "Cannot locate the installed pnpm JavaScript CLI on PATH for Windows verification",
  );
}
