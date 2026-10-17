import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";

import {
  createAgentCodexAccountService,
  type AgentCodexAccountServiceEncryption,
} from "../../../src/main/services/agent-codex-account-service";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-codex-account-"),
  );
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function encryption(): AgentCodexAccountServiceEncryption {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) =>
      Buffer.from(`encrypted:${Buffer.from(value).toString("base64")}`),
    decryptString: (value) =>
      Buffer.from(
        value.toString().replace(/^encrypted:/, ""),
        "base64",
      ).toString(),
  };
}

function auth(accountId: string, token = `token-${accountId}`): string {
  return JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { access_token: token, account_id: accountId },
  });
}

async function harness(
  afterNativeWrite?: () => Promise<void>,
  accountEncryption = encryption(),
) {
  const root = await temporaryRoot();
  const codexRoot = path.join(root, "codex");
  const authPath = path.join(codexRoot, "auth.json");
  await fs.mkdir(codexRoot, { recursive: true });
  let now = 100;
  let id = 0;
  const service = createAgentCodexAccountService({
    authPath,
    vaultPath: path.join(root, "private", "codex-accounts.json"),
    encryption: accountEncryption,
    now: () => now++,
    randomId: () => `account-${++id}`,
    afterNativeWrite,
  });
  return { root, codexRoot, authPath, service };
}

describe("Agent Codex account service", () => {
  it("refuses disabled account mutations but preserves historical listing and cleanup", async () => {
    const { root, authPath, service } = await harness();
    await fs.writeFile(authPath, auth("current"));
    const historical = await service.importAccount({
      label: "Historical",
      authJson: auth("historical"),
    });
    const vaultPath = path.join(root, "private", "codex-accounts.json");
    const originalVault = await fs.readFile(vaultPath, "utf8");
    const originalAuth = await fs.readFile(authPath, "utf8");
    const definition = getAgentDefinitionById("codex");
    if (!definition) throw new Error("Missing Codex fixture");
    const enabled = definition.capabilities.providerModel.enabled;
    definition.capabilities.providerModel.enabled = false;
    try {
      await expect(service.saveCurrent("Disabled")).rejects.toThrow(
        "AGENT_PROVIDER_ADAPTER_UNSUPPORTED",
      );
      await expect(
        service.importAccount({
          label: "Disabled",
          authJson: auth("disabled"),
        }),
      ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
      await expect(service.activate(historical.id)).rejects.toThrow(
        "AGENT_PROVIDER_ADAPTER_UNSUPPORTED",
      );
      expect(await fs.readFile(vaultPath, "utf8")).toBe(originalVault);
      expect(await fs.readFile(authPath, "utf8")).toBe(originalAuth);
      expect((await service.list()).map(({ id }) => id)).toEqual([
        historical.id,
      ]);
      await service.delete(historical.id);
      expect(await service.list()).toEqual([]);
      expect(await fs.readFile(authPath, "utf8")).toBe(originalAuth);
    } finally {
      definition.capabilities.providerModel.enabled = enabled;
    }
  });

  it("saves and imports encrypted snapshots without exposing authentication JSON", async () => {
    const { root, authPath, service } = await harness();
    await fs.writeFile(authPath, auth("acct-current"), { mode: 0o600 });

    const current = await service.saveCurrent("Personal");
    const second = await service.importAccount({
      label: "Work",
      authJson: auth("acct-work"),
    });

    expect(current).toMatchObject({
      id: "account-1",
      label: "Personal",
      maskedAccountId: "••••urrent",
      isActive: true,
    });
    expect(second).toMatchObject({
      id: "account-2",
      label: "Work",
      maskedAccountId: "••••t-work",
      isActive: false,
    });
    const listed = await service.list();
    expect(listed.map(({ label, isActive }) => ({ label, isActive }))).toEqual([
      { label: "Personal", isActive: true },
      { label: "Work", isActive: false },
    ]);

    const vaultPath = path.join(root, "private", "codex-accounts.json");
    const persisted = await fs.readFile(vaultPath, "utf8");
    expect(persisted).not.toContain("token-acct-current");
    expect(persisted).not.toContain("token-acct-work");
    expect(persisted).not.toContain('"access_token"');
    // Windows permissions are ACL-based; POSIX mode bits are not supported.
    if (process.platform !== "win32")
      expect((await fs.stat(vaultPath)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(listed)).not.toContain("token-");
  });

  it("atomically replaces auth.json, preserves a changed current login, and touches no sibling", async () => {
    const { codexRoot, authPath, service } = await harness();
    const configPath = path.join(codexRoot, "config.toml");
    await fs.writeFile(configPath, 'model = "gpt-5.6"\n');
    await fs.writeFile(authPath, auth("acct-a", "token-a"), { mode: 0o600 });
    const a = await service.saveCurrent("A");
    const b = await service.importAccount({
      label: "B",
      authJson: auth("acct-b"),
    });

    await fs.writeFile(authPath, auth("acct-a", "refreshed-token-a"), {
      mode: 0o600,
    });
    const result = await service.activate(b.id);

    expect(result.preservedCurrent).toBe(true);
    expect(await fs.readFile(authPath, "utf8")).toBe(auth("acct-b"));
    if (process.platform !== "win32")
      expect((await fs.stat(authPath)).mode & 0o777).toBe(0o600);
    expect(await fs.readFile(configPath, "utf8")).toBe('model = "gpt-5.6"\n');
    expect((await fs.readdir(codexRoot)).sort()).toEqual([
      "auth.json",
      "config.toml",
    ]);

    await service.activate(a.id);
    expect(await fs.readFile(authPath, "utf8")).toBe(
      auth("acct-a", "refreshed-token-a"),
    );
  });

  it("keeps a refreshed current login instead of replacing it with its stale snapshot", async () => {
    const { authPath, service } = await harness();
    await fs.writeFile(authPath, auth("acct-a", "token-a"), { mode: 0o600 });
    const account = await service.saveCurrent("A");
    const refreshed = auth("acct-a", "refreshed-token-a");
    await fs.writeFile(authPath, refreshed, { mode: 0o600 });

    expect(await service.list()).toMatchObject([
      { id: account.id, isActive: true },
    ]);
    const result = await service.activate(account.id);

    expect(result).toMatchObject({ preservedCurrent: true });
    expect(await fs.readFile(authPath, "utf8")).toBe(refreshed);
    expect(await service.list()).toMatchObject([
      { id: account.id, isActive: true },
    ]);
  });

  it("rolls back the exact previous authentication file when verification fails", async () => {
    let authPath = "";
    const setup = await harness(async () => {
      await fs.writeFile(authPath, auth("tampered"), { mode: 0o600 });
    });
    authPath = setup.authPath;
    const original = `${auth("acct-a")}\n`;
    await fs.writeFile(authPath, original, { mode: 0o600 });
    const target = await setup.service.importAccount({
      label: "B",
      authJson: auth("acct-b"),
    });

    await expect(setup.service.activate(target.id)).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_SWITCH_FAILED",
    );
    expect(await fs.readFile(authPath, "utf8")).toBe(original);
  });

  it("rejects invalid input and removes an active snapshot without logging out", async () => {
    const { root, authPath, service } = await harness();
    await expect(
      service.importAccount({ label: "", authJson: auth("a") }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_LABEL_INVALID");
    await expect(
      service.importAccount({ label: "Broken", authJson: "{broken" }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
    await expect(
      service.importAccount({
        label: "Missing",
        authJson: JSON.stringify({ tokens: {} }),
      }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
    await expect(
      service.importAccount({
        label: "Large",
        authJson: "x".repeat(256 * 1024 + 1),
      }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_AUTH_TOO_LARGE");
    await expect(service.saveCurrent("None")).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_CURRENT_MISSING",
    );

    await fs.writeFile(authPath, auth("acct-active"), { mode: 0o600 });
    const active = await service.saveCurrent("Active");
    await service.delete(active.id);
    expect(await service.list()).toEqual([]);
    expect(await fs.readFile(authPath, "utf8")).toBe(auth("acct-active"));
    expect(await fs.readdir(path.join(root, "private"))).toEqual([
      "codex-accounts.json",
    ]);
  });

  it("serializes concurrent imports without dropping accounts", async () => {
    const { service } = await harness();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        service.importAccount({
          label: `Account ${index}`,
          authJson: auth(`acct-${index}`),
        }),
      ),
    );
    expect(await service.list()).toHaveLength(12);
  });

  it("updates duplicate snapshots at capacity and rejects only new accounts", async () => {
    const { service } = await harness();
    for (let index = 0; index < 32; index += 1) {
      await service.importAccount({
        label: `Account ${index}`,
        authJson: auth(`acct-${index}`),
      });
    }

    const updated = await service.importAccount({
      label: "Renamed",
      authJson: auth("acct-0"),
    });
    expect(updated.label).toBe("Renamed");
    expect(await service.list()).toHaveLength(32);
    await expect(
      service.importAccount({ label: "Overflow", authJson: auth("overflow") }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_LIMIT_REACHED");
  });

  it("rejects unavailable encryption, damaged vaults, and invalid account ids", async () => {
    const unavailable = await harness(undefined, {
      ...encryption(),
      isEncryptionAvailable: () => false,
    });
    await expect(
      unavailable.service.importAccount({ label: "A", authJson: auth("a") }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_ENCRYPTION_UNAVAILABLE");

    const damaged = await harness();
    const vaultPath = path.join(damaged.root, "private", "codex-accounts.json");
    await fs.mkdir(path.dirname(vaultPath), { recursive: true });
    await fs.writeFile(vaultPath, "{broken");
    await expect(damaged.service.list()).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_VAULT_INVALID",
    );
    await expect(damaged.service.activate("../unsafe")).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_REQUEST_INVALID",
    );
  });

  it("rejects corrupted encrypted snapshots and malformed current authentication", async () => {
    const setup = await harness();
    const account = await setup.service.importAccount({
      label: "A",
      authJson: auth("a"),
    });
    const vaultPath = path.join(setup.root, "private", "codex-accounts.json");
    const vault = JSON.parse(await fs.readFile(vaultPath, "utf8"));
    vault.accounts[0].ciphertext =
      Buffer.from("not-encrypted").toString("base64");
    await fs.writeFile(vaultPath, JSON.stringify(vault));
    await expect(setup.service.activate(account.id)).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_VAULT_INVALID",
    );

    await fs.writeFile(setup.authPath, "{broken");
    await expect(setup.service.list()).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_AUTH_INVALID",
    );
  });

  it("removes a newly created auth.json when a first switch fails", async () => {
    let authPath = "";
    const setup = await harness(async () => {
      await fs.writeFile(authPath, auth("tampered"));
    });
    authPath = setup.authPath;
    const target = await setup.service.importAccount({
      label: "Target",
      authJson: auth("target"),
    });

    await expect(setup.service.activate(target.id)).rejects.toThrow(
      "AGENT_CODEX_ACCOUNT_SWITCH_FAILED",
    );
    await expect(fs.stat(authPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("supports accounts without an account id and no-op activation of the exact current login", async () => {
    const { authPath, service } = await harness();
    const raw = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: "token-without-account-id" },
    });
    await fs.writeFile(authPath, raw);
    const account = await service.saveCurrent("No ID");

    expect(account).toMatchObject({ maskedAccountId: null, isActive: true });
    await expect(service.activate(account.id)).resolves.toMatchObject({
      preservedCurrent: false,
      account: { isActive: true },
    });
  });
});
