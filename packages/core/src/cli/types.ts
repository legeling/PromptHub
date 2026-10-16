import type { Readable } from "stream";

import type {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../runtime-paths";
import type { closeDatabase, initDatabase } from "../database";
import type { CliSkillService } from "./skill";
import type { Skill } from "@prompthub/shared/types";

type CliWriter = (message: string) => void;
export type OutputFormat = "json" | "table";
export type OutputDetail = "summary" | "full" | "quiet";

export const EXIT_CODES = {
  OK: 0,
  USAGE: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  IO: 5,
  INTERNAL: 10,
} as const;

export const CLI_VERSION = "0.6.0";

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export interface CliIO {
  stdout: CliWriter;
  stderr: CliWriter;
  stdin?: Readable;
  isInteractive?: boolean;
}

export interface CliRuntimeHooks {
  configureRuntimePaths: typeof configureRuntimePaths;
  resetRuntimePaths: typeof resetRuntimePaths;
}

export interface CliDatabaseHooks {
  closeDatabase: typeof closeDatabase;
  initDatabase: typeof initDatabase;
}

export interface CliContext {
  io: CliIO;
  output: OutputFormat;
  detail: OutputDetail;
  skills: CliSkillService;
}

export interface CliRemoteSyncOptions {
  endpoint: string;
  token: string;
  forceClear?: boolean;
}

export interface SkillIdentifierResolution {
  identifier: string;
  skill: Skill;
}

export interface SelectionChoice<T> {
  value: T;
  id: string;
  label: string;
  description?: string;
}

export class CliError extends Error {
  code: string;
  exitCode: ExitCode;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    exitCode: ExitCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function defaultIO(): CliIO {
  return {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
    stdin: process.stdin,
    isInteractive: Boolean(process.stdin.isTTY),
  };
}
