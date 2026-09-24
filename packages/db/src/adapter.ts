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
    run(params?: unknown): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
    get(params?: unknown): unknown;
    all(params?: unknown): unknown[];
    finalize?: () => void;
  };
  close(): void;
  inTransaction?: boolean;
};

const WasmDatabase = sqlite3Wasm.Database as WasmDatabaseConstructor;

type WasmStatement = ReturnType<
  InstanceType<WasmDatabaseConstructor>["prepare"]
>;

class Statement {
  private isFinalized = false;

  constructor(
    private readonly prepareStatement: () => WasmStatement,
    private stmt: WasmStatement | null,
    private readonly onRelease: () => void,
    private readonly assertAvailable: () => void,
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

  run(...params: unknown[]): {
    changes: number;
    lastInsertRowid: number | bigint;
  } {
    return this.execute((stmt) => {
      const normalized = this.normalizeParams(params);
      return Array.isArray(normalized) && normalized.length === 0
        ? stmt.run()
        : stmt.run(normalized);
    });
  }

  get(...params: unknown[]): unknown {
    return this.execute((stmt) => {
      const normalized = this.normalizeParams(params);
      return Array.isArray(normalized) && normalized.length === 0
        ? stmt.get()
        : stmt.get(normalized);
    });
  }

  all(...params: unknown[]): unknown[] {
    return this.execute((stmt) => {
      const normalized = this.normalizeParams(params);
      return Array.isArray(normalized) && normalized.length === 0
        ? stmt.all()
        : stmt.all(normalized);
    });
  }

  private execute<T>(operation: (stmt: WasmStatement) => T): T {
    this.assertAvailable();
    if (this.isFinalized) {
      throw new Error("Statement already finalized");
    }
    const stmt = this.stmt ?? this.prepareStatement();
    try {
      return operation(stmt);
    } finally {
      // The WASM VFS retains its directory lock until the raw statement ends.
      try {
        stmt.finalize?.();
      } finally {
        this.stmt = null;
        this.onRelease();
      }
    }
  }

  finalize(): void {
    if (this.isFinalized) {
      return;
    }
    this.isFinalized = true;
    try {
      this.stmt?.finalize?.();
    } finally {
      this.stmt = null;
      this.onRelease();
    }
  }
}

class DatabaseAdapter {
  private _db: InstanceType<WasmDatabaseConstructor>;
  private statements = new Set<Statement>();
  private invalidation: Error | null = null;

  invalidate(reason: Error): void {
    this.invalidation ??= reason;
  }

  assertAvailable(): void {
    if (this.invalidation) throw this.invalidation;
  }

  get inTransaction(): boolean {
    return this._db.inTransaction ?? false;
  }

  constructor(path: string, options?: { readOnly?: boolean }) {
    this._db = new WasmDatabase(path, options);
  }

  /**
   * Run a PRAGMA statement.
   * - SET form  (e.g. 'foreign_keys = ON')  → executes, returns void
   * - GET form  (e.g. 'table_info(prompts)') → returns row array
   */
  pragma(source: string): unknown {
    this.assertAvailable();
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
    this.assertAvailable();
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
    this.assertAvailable();
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
    this.assertAvailable();
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
    this.assertAvailable();
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
    this.assertAvailable();
    let statement: Statement;
    statement = new Statement(
      () => {
        this.assertAvailable();
        return this._db.prepare(sql);
      },
      this._db.prepare(sql),
      () => this.statements.delete(statement),
      () => this.assertAvailable(),
    );
    this.statements.add(statement);
    return statement;
  }

  /**
   * Wrap a function in a BEGIN/COMMIT/ROLLBACK transaction.
   * Returns a new function that, when called, executes the original inside a transaction.
   */
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return ((...args: unknown[]) => {
      this.assertAvailable();
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
    let closeError: unknown;
    for (const statement of [...this.statements]) {
      try {
        statement.finalize();
      } catch (error) {
        closeError ??= error;
      }
    }
    try {
      this._db.close();
    } catch (error) {
      closeError ??= error;
    }
    if (closeError) {
      throw closeError;
    }
  }
}

// Export a namespace so existing code can use `Database.Database` as the instance type,
// matching the better-sqlite3 pattern: `let db: Database.Database`
namespace DatabaseAdapter {
  export type Database = DatabaseAdapter;
}

export default DatabaseAdapter;
