import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRefreshController } from "../../../src/renderer/services/local-data-refresh";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("workspace refresh publication", () => {
  it("publishes one complete candidate for concurrent callers", async () => {
    let visible = "old";
    const read = deferred<() => "updated">();
    const prepare = vi.fn(() => read.promise);
    const controller = createWorkspaceRefreshController({
      prepare,
      isProtected: () => false,
    });
    const first = controller.refresh();
    const second = controller.refresh();
    expect(visible).toBe("old");
    read.resolve(() => {
      visible = "external";
      return "updated";
    });
    expect(await first).toBe("updated");
    expect(await second).toBe("updated");
    expect(visible).toBe("external");
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("keeps a draft and the old projection when editing starts during a read", async () => {
    let dirty = false;
    let visible = "draft baseline";
    const read = deferred<() => "updated">();
    const controller = createWorkspaceRefreshController({
      prepare: () => read.promise,
      isProtected: () => dirty,
    });
    const result = controller.refresh();
    dirty = true;
    read.resolve(() => {
      visible = "external";
      return "updated";
    });
    expect(await result).toBe("protected");
    expect(visible).toBe("draft baseline");
  });
  it("does not read over an existing draft and recovers after a read failure", async () => {
    let dirty = true;
    let visible = "old";
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValue(() => {
        visible = "new";
        return "updated";
      });
    const controller = createWorkspaceRefreshController({
      prepare,
      isProtected: () => dirty,
    });
    expect(await controller.refresh()).toBe("protected");
    expect(prepare).not.toHaveBeenCalled();
    dirty = false;
    await expect(controller.refresh()).rejects.toThrow("read failed");
    expect(visible).toBe("old");
    expect(await controller.refresh()).toBe("updated");
    expect(visible).toBe("new");
  });
});
