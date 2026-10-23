import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { DESKTOP_TEST_TIMEOUT_MS } from "../../helpers/test-config";

const runtime = vi.hoisted(() => ({
  userData: "",
  handlers: new Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown>
  >(),
}));
vi.mock("electron", () => ({
  app: { getPath: () => runtime.userData },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => Promise<unknown>,
    ) => runtime.handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = runtime.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC channel: ${channel}`);
      return handler(null, ...args);
    },
  },
}));
vi.mock("../../../src/main/runtime-paths", () => ({
  getCacheDir: () => path.join(runtime.userData, "cache"),
}));
vi.mock("../../../src/main/startup-log", () => ({ logStartupEvent: vi.fn() }));
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../../src/main/services/cli-install-source", () => ({
  resolveCliInstallSource: async () => ({
    releaseTag: "v0.6.1",
    location:
      "https://github.com/legeling/PromptHub/releases/download/v0.6.1/prompthub-cli-0.6.1.tgz",
  }),
}));

import {
  getCliStatus,
  installCli,
} from "../../../src/main/services/cli-installer";
import { registerCliIPC } from "../../../src/main/ipc/cli.ipc";
import { cliApi } from "../../../src/preload/api/cli";
import { CLISettings } from "../../../src/renderer/components/settings/CLISettings";
import { useCLIStatusStore } from "../../../src/renderer/stores/cli-status.store";

// Real shell, env-based Node shebangs, filesystem and installer. Electron
// transport and remote packages are fixtures; UI uses jsdom, not native GUI.
describe.skipIf(process.platform === "win32")(
  "CLI from a GUI environment",
  () => {
    let root: string;
    let tools: string;
    let globalBin: string;
    let wrapper: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-shell-"));
      tools = path.join(root, "node tools");
      globalBin = path.join(root, "global bin");
      runtime.userData = path.join(root, "profile");
      wrapper = path.join(runtime.userData, "bin", "prompthub");
      for (const directory of [tools, globalBin, path.dirname(wrapper)])
        fs.mkdirSync(directory, { recursive: true });
      fs.symlinkSync(process.execPath, path.join(tools, "node"));
      fs.writeFileSync(
        wrapper,
        '#!/bin/sh\nexec "/Applications/PromptHub.app/Contents/MacOS/PromptHub" --cli "$@"\n',
      );
      vi.stubEnv("HOME", root);
      vi.stubEnv("USERPROFILE", root);
      vi.stubEnv("ZDOTDIR", root);
      vi.stubEnv("PATH", "/usr/bin:/bin");
      vi.stubEnv("PNPM_HOME", "");
      expect(os.homedir()).toBe(root);
      runtime.handlers.clear();
      useCLIStatusStore.setState({
        status: null,
        error: null,
        hasChecked: false,
        isChecking: false,
        request: null,
      });
    });

    afterEach(() => {
      cleanup();
      runtime.handlers.clear();
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    });

    function configureShell(shell: string): void {
      vi.stubEnv("SHELL", shell);
      const rc = `echo startup-banner\nexport PATH="${tools}:${globalBin}:/usr/bin:/bin"\nexport PNPM_HOME="${globalBin}"\n`;
      fs.writeFileSync(path.join(root, ".zshrc"), rc);
      fs.writeFileSync(path.join(root, ".bashrc"), rc);
      fs.writeFileSync(
        path.join(root, ".bash_profile"),
        'case $- in *i*) . "$HOME/.bashrc";; esac\n',
      );
    }

    function writePackageManager(method: string, fail = false): void {
      fs.writeFileSync(
        path.join(tools, method),
        `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') console.log('9.15.0');
else if (args[0] === 'config') console.log('undefined');
else if (args[0] === 'bin') console.log(process.env.PNPM_HOME);
else if (args[0] === 'add' || args[0] === 'install') {
  if (${fail}) { console.error('fixture install failed'); process.exit(1); }
  fs.writeFileSync(path.join(process.env.PNPM_HOME, 'prompthub'),
    '#!/usr/bin/env node\\nconsole.log("0.6.1");\\n', { mode: 0o755 });
} else process.exit(1);
`,
        { mode: 0o755 },
      );
    }

    for (const shell of ["/bin/zsh", "/bin/bash"]) {
      it.skipIf(!fs.existsSync(shell)).each(["pnpm", "npm"] as const)(
        `detects, installs and rechecks %s with ${shell} and a restricted inherited PATH`,
        async (method) => {
          configureShell(shell);
          writePackageManager(method);
          expect(await getCliStatus()).toMatchObject({
            installed: false,
            packageManager: method,
            packageManagerVersion: "9.15.0",
          });
          expect(await installCli(method)).toMatchObject({
            success: true,
            removedLegacyCommand: true,
          });
          expect(fs.existsSync(wrapper)).toBe(false);
          expect(
            fs.readFileSync(path.join(globalBin, "prompthub"), "utf8"),
          ).toContain('console.log("0.6.1")');
          expect(await getCliStatus()).toMatchObject({
            installed: true,
            version: "0.6.1",
          });
          expect(process.env.PATH).toBe("/usr/bin:/bin");
          expect(process.env.PNPM_HOME).toBe("");
        },
      );
    }

    it("preserves the wrapper and reports failure when the resolved installer fails", async () => {
      configureShell("/bin/bash");
      writePackageManager("pnpm", true);
      expect(await installCli("pnpm")).toMatchObject({ success: false });
      expect(fs.existsSync(wrapper)).toBe(true);
      expect(fs.existsSync(path.join(globalBin, "prompthub"))).toBe(false);
    });

    it("enables replacement in the settings page and installs through preload and registered IPC", async () => {
      configureShell("/bin/bash");
      writePackageManager("pnpm");
      registerCliIPC();
      installWindowMocks({ electron: { cli: cliApi } });
      await renderWithI18n(createElement(CLISettings), { language: "en" });
      const replace = await screen.findByRole(
        "button",
        { name: /Replace with pnpm/i },
        { timeout: DESKTOP_TEST_TIMEOUT_MS },
      );
      await waitFor(() => expect(replace).toBeEnabled());
      fireEvent.click(replace);
      await screen.findByText(
        "Installed",
        {},
        { timeout: DESKTOP_TEST_TIMEOUT_MS },
      );
      expect(fs.existsSync(wrapper)).toBe(false);
      expect(
        fs.readFileSync(path.join(globalBin, "prompthub"), "utf8"),
      ).toContain('console.log("0.6.1")');
      cleanup();
      runtime.handlers.clear();
      registerCliIPC();
      expect(await cliApi.getStatus()).toMatchObject({
        installed: true,
        version: "0.6.1",
        fromCache: true,
      });
    });
  },
);
