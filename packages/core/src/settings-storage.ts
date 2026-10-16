import fs from "node:fs";
import path from "node:path";
import type { CanonicalEntryMutation } from "./canonical-entry-publication";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { RENDERER_AUXILIARY_SETTING_KEYS } from "./renderer-auxiliary-state";

export const SETTINGS_VAULT_PATH = "secrets/vault.enc";
export const SETTINGS_SQLITE_MIGRATION = "settings-sqlite-v1";
export const SETTINGS_PRIVATE_KEYS = new Set<string>([
  "master_password",
  ...RENDERER_AUXILIARY_SETTING_KEYS,
]);

export function readSettingsBytes(
  root: string,
  relative: string,
): Buffer | null {
  const file = path.resolve(root, relative);
  assertStoragePathComponentsSafe(root, file);
  if (!fs.existsSync(file)) return null;
  if (!fs.lstatSync(file).isFile())
    throw new Error(`Invalid settings file: ${relative}`);
  return fs.readFileSync(file);
}

export function settingsFileEntry(
  root: string,
  relative: string,
  bytes: Buffer,
): CanonicalEntryMutation {
  const targetPath = path.resolve(root, relative);
  assertStoragePathComponentsSafe(root, targetPath);
  return {
    targetPath,
    prepare(stage) {
      const descriptor = fs.openSync(stage, "wx", 0o600);
      try {
        fs.writeFileSync(descriptor, bytes);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (!fs.readFileSync(stage).equals(bytes))
        throw new Error("Settings publication verification failed");
    },
  };
}

export function settingsJsonEntry(
  root: string,
  relative: string,
  value: unknown,
): CanonicalEntryMutation {
  return settingsFileEntry(
    root,
    relative,
    Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
  );
}
