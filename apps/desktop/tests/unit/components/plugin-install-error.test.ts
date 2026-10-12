import { beforeAll, describe, expect, it } from "vitest";

import {
  getPluginBatchInstallResultMessage,
  getPluginInstallErrorMessage,
} from "../../../src/renderer/components/plugin/plugin-manager-utils";

import { createTestI18n } from "../../helpers/i18n";

describe("Plugin install error presentation", () => {
  let t: Awaited<ReturnType<typeof createTestI18n>>["t"];
  beforeAll(async () => {
    t = (await createTestI18n("en")).t;
  });

  it("replaces proxy and download internals with one actionable message", () => {
    const message = getPluginInstallErrorMessage(
      new Error(
        "Error invoking remote method 'plugin:market:install': CorePluginError: Git command failed (128): CONNECT tunnel failed, response 503",
      ),
      t,
    );

    expect(message).toBe(
      "Could not download the Plugin. Check the proxy mode in Settings > Network Settings, then try again.",
    );
    expect(message).not.toContain("plugin:market:install");
    expect(message).not.toContain("Git");
  });

  it("explains source access failures", () => {
    expect(
      getPluginInstallErrorMessage(
        new Error("fatal: repository 'https://example.test/private' not found"),
        t,
      ),
    ).toBe(
      "Plugin source is unavailable or access was denied. Check the repository address and permissions, then try again.",
    );
  });

  it("explains package validation failures", () => {
    expect(
      getPluginInstallErrorMessage(new Error("Plugin manifest is invalid"), t),
    ).toBe(
      "The Plugin package failed validation. Its manifest, size, or file paths are invalid; choose another source or report the store item.",
    );
  });

  it("explains duplicate and local storage failures", () => {
    expect(
      getPluginInstallErrorMessage(
        new Error("CorePluginError: Plugin 已安装: Linear"),
        t,
      ),
    ).toBe("This Plugin is already installed. Open My Plugins to manage it.");
    expect(
      getPluginInstallErrorMessage(
        new Error("ENOSPC: no space left on device"),
        t,
      ),
    ).toBe(
      "PromptHub could not save the Plugin locally. Check disk space and folder permissions, then try again.",
    );
  });

  it("explains Git failures without exposing command internals", () => {
    const message = getPluginInstallErrorMessage(
      new Error("CorePluginError: GIT_FAILED: spawn git ENOENT"),
      t,
    );

    expect(message).toBe(
      "PromptHub could not run Git to download the Plugin. Check that Git is available and the source can be reached.",
    );
    expect(message).not.toContain("ENOENT");
  });

  it("keeps an actionable sanitized reason for unexpected failures", () => {
    expect(
      getPluginInstallErrorMessage(
        new Error(
          "Error invoking remote method 'plugin:market:install': CorePluginError: Plugin activation step failed",
        ),
        t,
      ),
    ).toBe(
      "Could not complete this Plugin operation. Reason: Plugin activation step failed. Review the reason and try again.",
    );
  });

  it("removes source URLs and local paths from unexpected failure details", () => {
    const message = getPluginInstallErrorMessage(
      new Error(
        "Activation failed for https://example.test/plugin at /Users/example/Library/Application Support/PromptHub/data/plugins/item",
      ),
      t,
    );

    expect(message).toContain("Reason: Activation failed for [Plugin source]");
    expect(message).toContain("[local path]");
    expect(message).not.toContain("example.test");
    expect(message).not.toContain("/Users/example");
  });

  it("includes the first explained failure in a batch result", () => {
    expect(
      getPluginBatchInstallResultMessage({
        failed: 2,
        firstFailure:
          "Plugin source is unavailable or access was denied. Check the repository address and permissions, then try again.",
        succeeded: 1,
        t,
      }),
    ).toBe(
      "Batch install finished: 1 succeeded, 2 failed. First failure: Plugin source is unavailable or access was denied. Check the repository address and permissions, then try again.",
    );
  });
});
