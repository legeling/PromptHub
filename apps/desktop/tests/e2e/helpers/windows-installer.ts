import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const INSTALLER_TIMEOUT_MS = 60_000;
const INSTALLER_OUTPUT_BYTES = 1024 * 1024;

/** Reinstall only the explicitly selected candidate on a disposable CI runner. */
export function reinstallPackagedWindowsForAcceptance(): void {
  const installer = process.env.PROMPTHUB_E2E_INSTALLER_PATH;
  if (!installer) return;
  assert.equal(process.platform, "win32");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
  const executable = process.env.PROMPTHUB_E2E_EXECUTABLE_PATH;
  const runnerTemp = process.env.RUNNER_TEMP;
  assert.ok(executable && runnerTemp);
  const directory = path.dirname(fs.realpathSync(executable));
  const relative = path.relative(fs.realpathSync(runnerTemp), directory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const uninstall = path.join(directory, "Uninstall PromptHub.exe");
  assert.ok(fs.existsSync(uninstall));
  const run = (file: string, args: string[]): void => {
    const result = spawnSync(file, args, {
      timeout: INSTALLER_TIMEOUT_MS,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: INSTALLER_OUTPUT_BYTES,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${path.basename(file)}: ${result.stderr}`);
  };
  // NSIS's final _?= argument runs the uninstaller in place so completion is
  // observable; a copied background uninstaller would race the next install.
  run(uninstall, ["/S", `_?=${directory}`]);
  assert.equal(fs.existsSync(executable), false);
  run(installer, ["/S", `/D=${directory}`]);
  assert.equal(fs.existsSync(executable), true);
  console.info("Verified candidate uninstall/reinstall:", directory);
}
