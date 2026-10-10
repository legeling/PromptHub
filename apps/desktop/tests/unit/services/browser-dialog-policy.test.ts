import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function findBrowserDialogs(directory: string): string[] {
  const violations: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      violations.push(...findBrowserDialogs(file));
      continue;
    }
    if (!/\.[jt]sx?$/.test(file) || /\.(test|spec)\./.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(source);
        if (
          /^(?:(?:window|globalThis)\.)?(alert|confirm|prompt)$/.test(callee)
        ) {
          violations.push(
            `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${callee}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}

describe("renderer business dialog policy", () => {
  it("has no browser alert, confirm, or prompt calls in desktop or web business UI", () => {
    expect([
      ...findBrowserDialogs(path.resolve(__dirname, "../../../src/renderer")),
      ...findBrowserDialogs(
        path.resolve(__dirname, "../../../../web/src/client"),
      ),
    ]).toEqual([]);
  });
});
