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

import { Database as WasmDatabase } from "node-sqlite3-wasm";

class Statement {
  constructor(private stmt: any) {}

  private normalizeParams(params: any[]): any[] | any {
    if (params.length === 0) {
      return [];
    }

    if (params.length === 1) {
      return params[0];
    }

    return params;
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const normalized = this.normalizeParams(params);
    return Array.isArray(normalized) && normalized.length === 0
      ? this.stmt.run()
      : this.stmt.run(normalized);
  }

  get(...params: any[]): any {
    const normalized = this.normalizeParams(params);
    return Array.isArray(normalized) && normalized.length === 0
      ? this.stmt.get()
      : this.stmt.get(normalized);
  }

  all(...params: any[]): any[] {
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
  private _db: WasmDatabase;

  constructor(path: string, options?: { readOnly?: boolean }) {
    this._db = new WasmDatabase(path, options);
  }

  /**
   * Run a PRAGMA statement.
   * - SET form  (e.g. 'foreign_keys = ON')  → executes, returns void
   * - GET form  (e.g. 'table_info(prompts)') → returns row array
   */
  pragma(source: string): any {
    if (source.includes("=")) {
      this._db.exec(`PRAGMA ${source}`);
      return undefined;
    }
    return this._db.prepare(`PRAGMA ${source}`).all();
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  prepare(sql: string): Statement {
    return new Statement(this._db.prepare(sql));
  }

  /**
   * Wrap a function in a BEGIN/COMMIT/ROLLBACK transaction.
   * Returns a new function that, when called, executes the original inside a transaction.
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      const wasInTransaction = (this._db as any).inTransaction ?? false;
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
