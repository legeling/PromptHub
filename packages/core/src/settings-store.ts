import path from "node:path";
import { SettingsDB, type DatabaseAdapter } from "@prompthub/db";
import {
  AGENT_SETTING_KEYS,
  RETIRED_AGENT_SETTING_KEYS,
} from "./agent-management/agent-settings-contract";
import { AgentSettingsRepository } from "./agent-management/agent-settings-repository";
import type { CanonicalEntryMutation } from "./canonical-entry-publication";
import type { DeviceMasterKeyStore } from "./device-keyring";
import {
  planSettingsSqliteUpgrade,
  type LegacySettingsEncryption,
} from "./migrations/settings-sqlite-v1";
import {
  planSettingsCredentialsUpgrade,
  mergeSettingsCredentialUpgradeSecrets,
  commitSettingsCredentialsUpgrade,
} from "./migrations/settings-credentials-v1";
import {
  decodeRendererSettings,
  encodeRendererSettings,
  RENDERER_SETTING_KEYS,
} from "./renderer-settings-codec";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "./sqlite-entry-publication";
import {
  SETTINGS_PRIVATE_KEYS,
  SETTINGS_SQLITE_MIGRATION,
  SETTINGS_VAULT_PATH,
  readSettingsBytes,
  settingsJsonEntry,
} from "./settings-storage";
import {
  createSettingsMasterKeyStore,
  decryptSettingsVault,
  encryptSettingsVault,
  parseSettingsVault,
  type SettingsVaultDocument,
} from "./settings-vault";

const OPERATION_KEY = "settings-store";
const rendererKeys = new Set(RENDERER_SETTING_KEYS);

export interface SettingsPublication {
  entries?: CanonicalEntryMutation[];
  commit?: () => void;
}
export interface CoreSettingsStoreOptions {
  database: DatabaseAdapter.Database;
  rootPath: string;
  masterKeyStore?: DeviceMasterKeyStore;
  legacyEncryption?: LegacySettingsEncryption;
  recoveredAIConfig?: { providers: unknown[]; models: unknown[] };
  failPublicationAt?: string;
}

/** SQLite owns values and references; the vault owns device-encrypted credential bytes. */
export class CoreSettingsStore {
  private readonly database: DatabaseAdapter.Database;
  private readonly root: string;
  private readonly settings: SettingsDB;
  private readonly keyStore: DeviceMasterKeyStore;

  constructor(private readonly options: CoreSettingsStoreOptions) {
    this.database = options.database;
    this.root = path.resolve(options.rootPath);
    this.settings = new SettingsDB(this.database);
    this.keyStore = options.masterKeyStore ?? createSettingsMasterKeyStore();
    recoverSqliteEntryPublication(this.database, this.root, OPERATION_KEY);
    const upgrade = planSettingsSqliteUpgrade(
      this.database,
      this.root,
      options.legacyEncryption,
      options.recoveredAIConfig,
    );
    if (upgrade) {
      this.publish(upgrade.settings, null, {
        entries: upgrade.entries,
        commit: () =>
          this.database
            .prepare(
              "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
            )
            .run(SETTINGS_SQLITE_MIGRATION, Date.now()),
      });
    }
    this.migrateCredentials();
  }

  private migrateCredentials(): void {
    const plan = planSettingsCredentialsUpgrade(this.database);
    if (plan === null) return;
    const entries: CanonicalEntryMutation[] = [];
    if (Object.keys(plan.secrets).length || plan.protectedSecrets.length) {
      const previous = this.readVault();
      const current = previous === null ? {} : decryptSettingsVault(previous, this.keyStore);
      const secrets = mergeSettingsCredentialUpgradeSecrets(plan, current);
      if (Object.keys(plan.secrets).some((ref) => !Object.prototype.hasOwnProperty.call(current, ref))) {
        entries.push(settingsJsonEntry(this.root, SETTINGS_VAULT_PATH,
          encryptSettingsVault(secrets, previous, this.root, this.keyStore)));
      }
    }
    this.publishPrepared({
      entries,
      commit: () => commitSettingsCredentialsUpgrade(this.database, plan),
    }, {});
  }

  private readVault(): SettingsVaultDocument | null {
    const bytes = readSettingsBytes(this.root, SETTINGS_VAULT_PATH);
    return bytes === null
      ? null
      : parseSettingsVault(JSON.parse(bytes.toString("utf8")));
  }

  read(): Record<string, unknown> {
    const values = Object.fromEntries(
      this.settings
        .rawEntries()
        .filter(({ key }) => !SETTINGS_PRIVATE_KEYS.has(key))
        .map(({ key, value }) => {
          try {
            return [key, JSON.parse(value)];
          } catch {
            throw new Error(`Invalid stored setting JSON: ${key}`);
          }
        }),
    );
    const vault = this.readVault();
    return decodeRendererSettings(
      values,
      vault === null ? {} : decryptSettingsVault(vault, this.keyStore),
    );
  }

  patchSettings(patch: Record<string, unknown>): void {
    this.assertPublicPatch(patch);
    this.publish({ ...this.read(), ...patch }, this.readVault());
  }

  replaceRendererSettings(
    input: Record<string, unknown>,
    publication: SettingsPublication = {},
  ): void {
    const prepared = this.prepareRendererSettingsReplacement(input);
    this.publishPrepared(prepared, publication);
  }

  prepareRendererSettingsReplacement(input: Record<string, unknown>): {
    entries: CanonicalEntryMutation[];
    commit: () => void;
  } {
    this.assertPublicPatch(input);
    const current = Object.fromEntries(
      Object.entries(this.read()).filter(([key]) => !rendererKeys.has(key)),
    );
    const renderer = Object.fromEntries(
      Object.entries(input).filter(([key]) => rendererKeys.has(key)),
    );
    return this.preparePublication({ ...current, ...renderer }, this.readVault());
  }

  private assertPublicPatch(patch: Record<string, unknown>): void {
    if (typeof patch !== "object" || patch === null || Array.isArray(patch))
      throw new Error("Invalid settings patch");
    for (const [key, value] of Object.entries(patch)) {
      if (
        SETTINGS_PRIVATE_KEYS.has(key) ||
        RETIRED_AGENT_SETTING_KEYS.some((retired) => retired === key)
      )
        throw new Error(`Setting requires its domain owner: ${key}`);
      if (!key || key.includes("\0") || value === undefined)
        throw new Error("Invalid setting entry");
    }
  }

  private publish(
    input: Record<string, unknown>,
    previousVault: SettingsVaultDocument | null,
    publication: SettingsPublication = {},
  ): void {
    const prepared = this.preparePublication(input, previousVault);
    this.publishPrepared(prepared, publication);
  }

  private publishPrepared(
    prepared: { entries: CanonicalEntryMutation[]; commit: () => void },
    publication: SettingsPublication,
  ): void {
    publishSqliteEntries(this.database, {
      rootPath: this.root,
      operationKey: OPERATION_KEY,
      entries: [...(publication.entries ?? []), ...prepared.entries],
      injectFailure: (target) => {
        if (this.options.failPublicationAt && target === path.resolve(this.root, this.options.failPublicationAt))
          throw new Error("Injected settings publication failure");
      },
      commit: () => { prepared.commit(); publication.commit?.(); },
    });
  }

  private preparePublication(
    input: Record<string, unknown>, previousVault: SettingsVaultDocument | null,
  ): { entries: CanonicalEntryMutation[]; commit: () => void } {
    const encoded = encodeRendererSettings(input);
    const others = Object.fromEntries(
      Object.entries(input).filter(
        ([key]) =>
          !rendererKeys.has(key) &&
          !SETTINGS_PRIVATE_KEYS.has(key) &&
          !AGENT_SETTING_KEYS.some((agent) => agent === key),
      ),
    );
    const agents = Object.fromEntries(
      AGENT_SETTING_KEYS.filter((key) => key in input).map((key) => [
        key,
        input[key],
      ]),
    );
    const vault = encryptSettingsVault(
      encoded.secrets,
      previousVault,
      this.root,
      this.keyStore,
    );
    return {
      entries: [settingsJsonEntry(this.root, SETTINGS_VAULT_PATH, vault)],
      commit: () => {
        this.settings.deleteKeys(RENDERER_SETTING_KEYS);
        this.settings.set({ ...others, ...encoded.settings });
        if (Object.keys(agents).length)
          new AgentSettingsRepository(this.database).patch(agents);
      },
    };
  }
}
