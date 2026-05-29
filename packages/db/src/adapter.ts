/**
 * SQLite Adapter
 *
 * Wraps node-sqlite3-wasm (pure WASM, no native compilation) with a
 * better-sqlite3-compatible API so all existing database code works unchanged.
 *
 * Why: better-sqlite3 is a native .node module that must be compiled per
 * platform/arch. Cross-compiling for Windows ARM64 is unreliable, causing
 * "not a valid Win32 application" errors. WASM runs on all platforms with zero
 * compilation.
 */

import sqlite3Wasm from "node-sqlite3-wasm";

type WasmDatabaseConstructor = new (
  path: string,
  options?: { readOnly?: boolean },
) => {
  exec(sql: string): void;
  prepare(sql: string): {
    run(params?: unknown): { changes: number; lastInsertRowid: number | bigint };
    get(params?: unknown): unknown;
    all(params?: unknown): unknown[];
    finalize?: () => void;
  };
  close(): void;
  inTransaction?: boolean;
};

const WasmDatabase = sqlite3Wasm.Database as WasmDatabaseConstructor;

class Statement {
  constructor(
    private stmt: {
      run(params?: unknown): { changes: number; lastInsertRowid: number | bigint };
      get(params?: unknown): unknown;
      all(params?: unknown): unknown[];
      finalize?: () => void;
    },
  ) {}

  private normalizeParams(params: unknown[]): unknown[] | unknown {
    if (params.length === 0) {
      return [];
    }

    if (params.length === 1) {
      return params[0];
    }

    return params;
  }

  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const normalized = this.normalizeParams(params);
    return Array.isArray(normalized) && normalized.length === 0
      ? this.stmt.run()
      : this.stmt.run(normalized);
  }

  get(...params: unknown[]): unknown {
    const normalized = this.normalizeParams(params);
    return Array.isArray(normalized) && normalized.length === 0
      ? this.stmt.get()
      : this.stmt.get(normalized);
  }

  all(...params: unknown[]): unknown[] {
    const normalized = this.normalizeParams(params);
    return Array.isArray(normalized) && normalized.length === 0
      ? this.stmt.all()
      : this.stmt.all(normalized);
  }

  finalize(): void {
    this.stmt.finalize?.();
  }
}

class DatabaseAdapter {
  private _db: InstanceType<WasmDatabaseConstructor>;

  constructor(path: string, options?: { readOnly?: boolean }) {
    this._db = new WasmDatabase(path, options);
  }

  /**
   * Run a PRAGMA statement.
   * - SET form  (e.g. 'foreign_keys = ON')  → executes, returns void
   * - GET form  (e.g. 'table_info(prompts)') → returns row array
   */
  pragma(source: string): unknown {
    if (source.includes("=")) {
      this._db.exec(`PRAGMA ${source}`);
      return undefined;
    }
    const stmt = this._db.prepare(`PRAGMA ${source}`);
    try {
      return stmt.all();
    } finally {
      stmt.finalize?.();
    }
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  private normalizeParams(params: unknown[]): unknown[] | unknown {
    if (params.length === 0) {
      return [];
    }

    if (params.length === 1) {
      return params[0];
    }

    return params;
  }

  run(
    sql: string,
    ...params: unknown[]
  ): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this._db.prepare(sql);
    const normalized = this.normalizeParams(params);

    try {
      return Array.isArray(normalized) && normalized.length === 0
        ? stmt.run()
        : stmt.run(normalized);
    } finally {
      stmt.finalize?.();
    }
  }

  get(sql: string, ...params: unknown[]): unknown {
    const stmt = this._db.prepare(sql);
    const normalized = this.normalizeParams(params);

    try {
      return Array.isArray(normalized) && normalized.length === 0
        ? stmt.get()
        : stmt.get(normalized);
    } finally {
      stmt.finalize?.();
    }
  }

  all(sql: string, ...params: unknown[]): unknown[] {
    const stmt = this._db.prepare(sql);
    const normalized = this.normalizeParams(params);

    try {
      return Array.isArray(normalized) && normalized.length === 0
        ? stmt.all()
        : stmt.all(normalized);
    } finally {
      stmt.finalize?.();
    }
  }

  prepare(sql: string): Statement {
    return new Statement(this._db.prepare(sql));
  }

  /**
   * Wrap a function in a BEGIN/COMMIT/ROLLBACK transaction.
   * Returns a new function that, when called, executes the original inside a transaction.
   */
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return ((...args: unknown[]) => {
      const wasInTransaction = this._db.inTransaction ?? false;
      if (!wasInTransaction) {
        this._db.exec("BEGIN");
      }
      try {
        const result = fn(...args);
        if (!wasInTransaction) {
          this._db.exec("COMMIT");
        }
        return result;
      } catch (e) {
        try {
          if (!wasInTransaction) {
            this._db.exec("ROLLBACK");
          }
        } catch {
          // ignore rollback error
        }
        throw e;
      }
    }) as T;
  }

  close(): void {
    this._db.close();
  }
}

// Export a namespace so existing code can use `Database.Database` as the instance type,
// matching the better-sqlite3 pattern: `let db: Database.Database`
namespace DatabaseAdapter {
  export type Database = DatabaseAdapter;
}

export default DatabaseAdapter;
