/** @vitest-environment node */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { mergeConfig } from "vite";
import baseConfig from "../../../vitest.config";
import { describe, expect, it } from "vitest";

import projects from "../../../vitest.workspace";

const desktopRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("desktop test boundaries", () => {
  it("runs the functional baseline before static and unit gates", () => {
    const { scripts } = JSON.parse(
      fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"),
    );
    expect(scripts["test:run"].split(" && ")).toEqual([
      "pnpm test:integration",
      "pnpm typecheck:tests",
      "pnpm test:unit",
    ]);
  });

  it("includes every test, fixture, helper and E2E file in test typechecking", () => {
    const configPath = path.join(desktopRoot, "tsconfig.test.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    expect(config.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      desktopRoot,
      undefined,
      configPath,
    );
    expect(parsed.errors).toEqual([]);
    const checked = new Set(parsed.fileNames.map((name) => path.resolve(name)));
    const testFiles = ts.sys.readDirectory(
      desktopRoot,
      [".ts", ".tsx"],
      ["node_modules", "out"],
      ["tests/**/*"],
    );
    expect(testFiles.length).toBeGreaterThan(0);
    expect(
      testFiles.filter((name) => !checked.has(path.resolve(name))),
    ).toEqual([]);
  });

  it("keeps renderer mocks out of the real-boundary integration project", () => {
    expect(projects).toEqual([
      expect.objectContaining({
        extends: "./vitest.config.ts",
        test: expect.objectContaining({
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
          setupFiles: ["./tests/setup-runtime.ts"],
        }),
      }),
      expect.objectContaining({
        extends: "./vitest.config.ts",
        test: expect.objectContaining({
          name: "unit",
          environment: "jsdom",
          include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
          setupFiles: ["./tests/setup.ts"],
        }),
      }),
    ]);
    for (const project of projects) {
      if (
        typeof project !== "object" ||
        project === null ||
        !("test" in project)
      ) {
        throw new Error("Expected a concrete desktop test project");
      }
      const resolved = mergeConfig(baseConfig, project);
      expect(resolved.test.include).toEqual(project.test?.include);
      expect(resolved.test.setupFiles).toEqual(project.test?.setupFiles);
    }
    expect(projects[0]).not.toHaveProperty("resolve.alias");
    expect(projects[1]).toHaveProperty("resolve.alias.@tanstack/react-virtual");
  });
});
