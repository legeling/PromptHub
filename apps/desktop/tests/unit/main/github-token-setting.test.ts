/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, type Database } from "@prompthub/db";
import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { initializeAgentSettingsFixture } from "../../helpers/agent-settings";
import { resetRuntimePaths } from "../../../src/main/runtime-paths";
import { readGithubTokenSetting } from "../../../src/main/settings/settings-readers";

vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable: () => false },
}));
let root: string;
let database: Database.Database;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-github-settings-"));
  database = initializeAgentSettingsFixture(root);
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
const store = () => new CoreSettingsStore({ database, rootPath: root });

describe("GitHub credential reader shared owner (issue #108)", () => {
  it("reads a protected token before browser migration and after database reopen", () => {
    expect(readGithubTokenSetting(database)).toBeNull();
    store().patchSettings({ githubToken: "  ghp_SyntheticToken  " });
    expect(readGithubTokenSetting(database)).toBe("ghp_SyntheticToken");
    expect(
      JSON.stringify(database.prepare("SELECT * FROM settings").all()),
    ).not.toContain("ghp_SyntheticToken");
    closeDatabase();
    database = initializeAgentSettingsFixture(root);
    expect(readGithubTokenSetting(database)).toBe("ghp_SyntheticToken");
    store().patchSettings({ githubToken: "" });
    expect(readGithubTokenSetting(database)).toBeNull();
    store().patchSettings({ githubToken: "   " });
    expect(readGithubTokenSetting(database)).toBeNull();
  });

  it.each(["ghp_LegacyRaw", JSON.stringify("ghp_LegacyJSON")])(
    "converts historical plaintext once and rejects plaintext reintroduced after migration",
    (value) => {
      database
        .prepare("INSERT INTO settings (key,value) VALUES (?,?)")
        .run("githubToken", value);
      expect(readGithubTokenSetting(database)).toMatch(/^ghp_Legacy/);
      database
        .prepare("UPDATE settings SET value = ? WHERE key = ?")
        .run(JSON.stringify("reintroduced"), "githubToken");
      expect(() => readGithubTokenSetting(database)).toThrow(/Unprotected/);
    },
  );

  it.each([
    123,
    true,
    { token: "hidden" },
    ["hidden"],
    "line\r\ninjection",
    "null\0byte",
  ])(
    "rejects invalid input without turning it into a request header: %j",
    (githubToken) => {
      expect(() => store().patchSettings({ githubToken })).toThrow();
      expect(readGithubTokenSetting(database)).toBeNull();
    },
  );

  it("rejects DEL in a header and reports damaged vault data", () => {
    store().patchSettings({ githubToken: "ghp_\x7fdel" });
    expect(readGithubTokenSetting(database)).toBeNull();
    fs.writeFileSync(path.join(root, "secrets/vault.enc"), "{bad");
    expect(() => readGithubTokenSetting(database)).toThrow();
  });
});
