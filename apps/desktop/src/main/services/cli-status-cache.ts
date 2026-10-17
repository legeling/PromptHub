import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CliStatus } from "@prompthub/shared/types";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStatus(value: unknown): value is CliStatus {
  if (
    !record(value) ||
    value.command !== "prompthub" ||
    typeof value.installed !== "boolean"
  )
    return false;
  if (
    value.packageManager !== null &&
    value.packageManager !== "npm" &&
    value.packageManager !== "pnpm"
  )
    return false;
  for (const key of ["version", "packageManagerVersion", "installCommand"]) {
    if (value[key] !== null && typeof value[key] !== "string") return false;
  }
  for (const key of [
    "packageManagerPath",
    "globalBinDirectory",
    "legacyCommandPath",
  ]) {
    if (value[key] != null && typeof value[key] !== "string") return false;
  }
  return (
    typeof value.releaseTag === "string" &&
    typeof value.installSource === "string" &&
    record(value.manualInstallCommands) &&
    typeof value.manualInstallCommands.npm === "string" &&
    typeof value.manualInstallCommands.pnpm === "string" &&
    value.error === undefined
  );
}

function environmentKey(): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        process.platform,
        process.arch,
        os.homedir(),
        process.env.PATH,
        process.env.PNPM_HOME,
      ]),
    )
    .digest("hex");
}

// Disposable observations only. Installations always run a fresh probe and
// resolve their source independently of this cache.
export class CliStatusCache {
  private request: Promise<CliStatus> | null = null;
  private generation = 0;

  constructor(
    private readonly file: string,
    private readonly probe: () => Promise<CliStatus>,
    private readonly now: () => number = Date.now,
  ) {}

  get(force = false): Promise<CliStatus> {
    if (this.request) return this.request;
    const cached = force ? null : this.read();
    if (cached) return Promise.resolve(cached);
    const generation = this.generation;
    this.request = Promise.resolve()
      .then(this.probe)
      .then((status) => {
        const result = { ...status, checkedAt: this.now(), fromCache: false };
        if (!status.error && generation === this.generation) this.write(result);
        return result;
      })
      .finally(() => {
        this.request = null;
      });
    return this.request;
  }

  invalidate(): void {
    this.generation += 1;
    try {
      fs.rmSync(this.file, { force: true });
    } catch (error) {
      console.warn("Failed to invalidate CLI observation cache", error);
    }
  }

  private read(): CliStatus | null {
    try {
      if (!fs.existsSync(this.file)) return null;
      if (fs.statSync(this.file).size > MAX_BYTES)
        throw new Error("CLI cache exceeds size limit");
      const data: unknown = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (
        !record(data) ||
        data.schemaVersion !== 1 ||
        data.environment !== environmentKey() ||
        typeof data.checkedAt !== "number" ||
        !Number.isFinite(data.checkedAt) ||
        data.checkedAt > this.now() ||
        this.now() - data.checkedAt >= TTL_MS ||
        !isStatus(data.status)
      )
        return null;
      return { ...data.status, checkedAt: data.checkedAt, fromCache: true };
    } catch (error) {
      console.warn(
        "Failed to read CLI observation cache; probing the machine",
        error,
      );
      return null;
    }
  }

  private write(status: CliStatus): void {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const bytes = JSON.stringify({
        schemaVersion: 1,
        environment: environmentKey(),
        checkedAt: status.checkedAt,
        status,
      });
      if (Buffer.byteLength(bytes) > MAX_BYTES)
        throw new Error("CLI cache exceeds size limit");
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, this.file);
    } catch (error) {
      console.warn("Failed to persist CLI observation cache", error);
    } finally {
      try {
        fs.rmSync(temporary, { force: true });
      } catch (error) {
        console.warn("Failed to clean temporary CLI observation cache", error);
      }
    }
  }
}
