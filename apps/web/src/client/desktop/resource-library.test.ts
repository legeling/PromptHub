import { expect, it } from "vitest";
import { createResourceLibraryBridge } from "./resource-library";

it("carries the read revision, exposes errors and does not silently retry a stale edit", async () => {
  const calls: RequestInit[] = [];
  const request = async <T>(_path: string, init?: RequestInit): Promise<T> => {
    if (init) {
      calls.push(init);
      throw new Error("Resource library changed; reload before saving");
    }
    return {
      revision: "previous",
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        servers: [],
        bindings: [],
      },
    } as T; // Fixture for the typed HTTP transport.
  };
  const bridge = createResourceLibraryBridge(request);
  await bridge.mcp.getLibrary();
  await expect(
    bridge.mcp.createServer({ name: "writer", command: "node" }),
  ).rejects.toThrow("Resource library changed");
  expect(calls).toHaveLength(1);
  expect(JSON.parse(String(calls[0].body))).toEqual({
    revision: "previous",
    mutation: { action: "create", value: { name: "writer", command: "node" } },
  });
});
