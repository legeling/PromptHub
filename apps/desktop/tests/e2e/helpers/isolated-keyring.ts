import type { ElectronApplication } from "@playwright/test";

/** Replace only the OS credential transport; product encryption and SQLite remain real. */
export async function isolateMcpKeyring(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(({ app }) => {
    // The evaluated function has no ESM loader or module-local require binding.
    const fs = process.getBuiltinModule("fs");
    const path = process.getBuiltinModule("path");
    const { createRequire } = process.getBuiltinModule("module");
    const load = createRequire(path.join(app.getAppPath(), "e2e-keyring.cjs"));
    const keyring: typeof import("@napi-rs/keyring") = load("@napi-rs/keyring");
    const file = path.join(app.getPath("userData"), "e2e-keyring.json");
    function read(): Record<string, string> {
      if (!fs.existsSync(file)) return {};
      const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid isolated test credential store");
      }
      const result: Record<string, string> = {};
      for (const [key, secret] of Object.entries(value)) {
        if (typeof secret !== "string")
          throw new Error("Invalid test credential");
        result[key] = secret;
      }
      return result;
    }
    Reflect.set(
      keyring,
      "Entry",
      class {
        private readonly id: string;
        constructor(service: string, account: string) {
          this.id = JSON.stringify([service, account]);
        }
        getPassword(): string | null {
          return read()[this.id] ?? null;
        }
        setPassword(value: string): void {
          fs.writeFileSync(
            file,
            JSON.stringify({ ...read(), [this.id]: value }),
            { mode: 0o600 },
          );
        }
        deletePassword(): boolean {
          const values = read();
          const existed = this.id in values;
          delete values[this.id];
          fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
          return existed;
        }
      },
    );
  });
}
