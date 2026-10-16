import crypto from 'crypto';
import type Database from './database/sqlite';

interface StoredMasterPassword {
  salt: string; // base64
  hash: string; // base64 derived key
}

let inMemoryKey: Buffer | null = null;
let isUnlocked = false;

const SETTINGS_KEY = 'master_password';
const ALGO = 'aes-256-gcm';

function deriveKey(password: string, salt: Buffer): Buffer {
  // Use scrypt to derive 32-byte key
  // 使用 scrypt 派生 32 字节密钥
  return crypto.scryptSync(password, salt, 32);
}

function deriveContentKey(password: string, salt: Buffer): Buffer {
  // The persisted password verifier must never be usable as a content key.
  return crypto.scryptSync(password, Buffer.concat([salt, Buffer.from('PromptHub content key')]), 32);
}

function isStoredMasterPassword(value: unknown): value is StoredMasterPassword {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredMasterPassword>;
  return typeof candidate.salt === 'string' && typeof candidate.hash === 'string';
}

function decodeStored(stored: StoredMasterPassword): { salt: Buffer; hash: Buffer } | null {
  try {
    const salt = Buffer.from(stored.salt, 'base64');
    const hash = Buffer.from(stored.hash, 'base64');

    if (salt.length !== 16 || hash.length !== 32) {
      return null;
    }

    return { salt, hash };
  } catch {
    return null;
  }
}

function getStored(db: Database.Database): StoredMasterPassword | null {
  try {
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SETTINGS_KEY) as { value: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.value) as unknown;
    if (!isStoredMasterPassword(parsed) || !decodeStored(parsed)) {
      console.error('Invalid stored master password payload');
      return null;
    }
    return parsed;
  } catch (e) {
    console.error('Failed to read master password from settings:', e);
    return null;
  }
}

function saveStored(db: Database.Database, stored: StoredMasterPassword) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    SETTINGS_KEY,
    JSON.stringify(stored),
  );
}

function clearUnlockedState() {
  inMemoryKey = null;
  isUnlocked = false;
}

export function hasMasterPasswordConfigured(db: Database.Database): boolean {
  return !!getStored(db);
}

export function setMasterPassword(db: Database.Database, password: string) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  saveStored(db, { salt: salt.toString('base64'), hash: key.toString('base64') });
  inMemoryKey = deriveContentKey(password, salt);
  isUnlocked = true;
}

export function changeMasterPassword(
  db: Database.Database,
  oldPassword: string,
  newPassword: string,
): boolean {
  const stored = getStored(db);
  if (!stored) {
    clearUnlockedState();
    return false;
  }

  const decoded = decodeStored(stored);
  if (!decoded) {
    clearUnlockedState();
    return false;
  }

  const derived = deriveKey(oldPassword, decoded.salt);
  const ok = crypto.timingSafeEqual(derived, decoded.hash);

  if (!ok) {
    clearUnlockedState();
    return false;
  }

  setMasterPassword(db, newPassword);
  return true;
}

export function unlock(db: Database.Database, password: string): boolean {
  const stored = getStored(db);
  if (!stored) {
    clearUnlockedState();
    return false;
  }

  const decoded = decodeStored(stored);
  if (!decoded) {
    clearUnlockedState();
    return false;
  }

  const derived = deriveKey(password, decoded.salt);
  const ok = crypto.timingSafeEqual(derived, decoded.hash);
  if (ok) {
    inMemoryKey = deriveContentKey(password, decoded.salt);
    isUnlocked = true;
  } else {
    clearUnlockedState();
  }
  return ok;
}

export function lock() {
  clearUnlockedState();
}

export function getKey(): Buffer | null {
  return inMemoryKey;
}

export function securityStatus(db: Database.Database) {
  return {
    configured: hasMasterPasswordConfigured(db),
    unlocked: isUnlocked,
  };
}

export function getUnlockedKey(): Buffer | null {
  return inMemoryKey;
}

export function encryptText(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]).toString('base64');
  return `ENC::${payload}`;
}

export function decryptText(data: string, key: Buffer): string | null {
  if (!data || !data.startsWith('ENC::')) return data;
  try {
    const buf = Buffer.from(data.slice(5), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    console.error('Decrypt failed', e);
    return null;
  }
}
