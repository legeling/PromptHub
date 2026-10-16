// Install before the application entrypoint so cold startup reads the same
// isolated credentials as writes. Product encryption and SQLite remain real.
const fs = require("node:fs");
const path = require("node:path");
const keyring = require("@napi-rs/keyring");

const profile = process.env.PROMPTHUB_E2E_USER_DATA_DIR;
if (
  process.env.PROMPTHUB_E2E !== "1" ||
  !profile ||
  !path.isAbsolute(profile)
) {
  throw new Error("Isolated keyring preload requires an absolute E2E profile");
}
const file = path.join(profile, "e2e-keyring.json");

function read() {
  if (!fs.existsSync(file)) return {};
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid isolated test credential store");
  }
  const result = {};
  for (const [key, secret] of Object.entries(value)) {
    if (typeof secret !== "string") throw new Error("Invalid test credential");
    result[key] = secret;
  }
  return result;
}

Reflect.set(
  keyring,
  "Entry",
  class {
    constructor(service, account) {
      this.id = JSON.stringify([service, account]);
    }
    getPassword() {
      return read()[this.id] ?? null;
    }
    setPassword(value) {
      fs.writeFileSync(file, JSON.stringify({ ...read(), [this.id]: value }), {
        mode: 0o600,
      });
    }
    deletePassword() {
      const values = read();
      const existed = this.id in values;
      delete values[this.id];
      fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
      return existed;
    }
  },
);
