import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { DatabaseAdapter, McpDB } from "@prompthub/db";
import { initDatabase, closeDatabase } from "../src/database";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  getDatabasePath,
} from "../src/runtime-paths";
import { CoreMcpLibraryService } from "../src/mcp-library";

for (const version of ["v0.5.9", "v0.6.0-beta.2"]) {
  it(`upgrades released ${version} data without dropping other domains, and reopens MCP history`, () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "mcp-released-upgrade-"),
    );
    const keys = new Map<string, Buffer>();
    const masterKeyStore = {
      read: (id: string) => keys.get(id) ?? null,
      write: (id: string, value: Buffer) => {
        keys.set(id, Buffer.from(value));
      },
    };
    try {
      configureRuntimePaths({ userDataPath: root });
      fs.mkdirSync(path.dirname(getDatabasePath()), { recursive: true });
      const old = new DatabaseAdapter(getDatabasePath());
      try {
        old.exec(
          fs.readFileSync(
            fileURLToPath(
              new URL(
                `./fixtures/historical-mcp/${version}.sql`,
                import.meta.url,
              ),
            ),
            "utf8",
          ),
        );
        old.run(
          "INSERT INTO prompts (id,title,user_prompt,created_at,updated_at) VALUES (?,?,?,?,?)",
          "retained",
          "Retained prompt",
          "Retained text",
          17,
          19,
        );
        old.run(
          "INSERT INTO settings (key,value) VALUES (?,?)",
          "theme",
          "dark",
        );
      } finally {
        old.close();
      }
      const mcp = path.join(root, "data", "mcp");
      fs.mkdirSync(mcp, { recursive: true });
      fs.writeFileSync(
        path.join(mcp, "library.json"),
        JSON.stringify({
          kind: "prompthub-mcp-library",
          version: 1,
          updatedAt: new Date(0).toISOString(),
          bindings: [],
          servers: [
            {
              id: "retained-mcp",
              name: "Docs.API",
              displayName: "Docs API",
              transport: "stdio",
              command: "node",
              enabled: true,
              isFavorite: true,
              env: { TOKEN: "upgrade-test-value", EMPTY: "" },
              tags: ["retained"],
              notes: "Retained note",
              source: { type: "manual" },
              createdAt: 17,
              updatedAt: 19,
            },
          ],
        }),
      );
      const database = initDatabase(undefined, { masterKeyStore });
      expect(
        database.get(
          "SELECT title,user_prompt,created_at,updated_at FROM prompts WHERE id = ?",
          "retained",
        ),
      ).toEqual({
        title: "Retained prompt",
        user_prompt: "Retained text",
        created_at: 17,
        updated_at: 19,
      });
      expect(
        database.get("SELECT value FROM settings WHERE key = ?", "theme"),
      ).toEqual({ value: "dark" });
      expect(database.pragma("foreign_key_check")).toEqual([]);
      expect(new McpDB(database).server("retained-mcp")?.server).toMatchObject({
        name: "Docs.API",
        createdAt: 17,
        updatedAt: 19,
        notes: "Retained note",
        tags: ["retained"],
        isFavorite: true,
      });
      new CoreMcpLibraryService({ database, masterKeyStore }).createVersion(
        "retained-mcp",
        "Retained baseline",
      );
      closeDatabase();
      const reopened = initDatabase(undefined, { masterKeyStore });
      const service = new CoreMcpLibraryService({
        database: reopened,
        masterKeyStore,
      });
      expect(service.read().servers[0].env).toEqual({
        TOKEN: "upgrade-test-value",
        EMPTY: "",
      });
      expect(
        service.listVersions("retained-mcp").items.map((item) => item.version),
      ).toEqual([2, 1]);
      expect(service.getVersion("retained-mcp", 2).note).toBe(
        "Retained baseline",
      );
    } finally {
      closeDatabase();
      resetRuntimePaths();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
