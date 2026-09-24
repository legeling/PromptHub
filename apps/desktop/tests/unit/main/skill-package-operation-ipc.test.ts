import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const runMock = vi.fn();
const createDependenciesMock = vi.fn().mockReturnValue({ db: "dependencies" });
const cleanupMock = vi.fn().mockResolvedValue(undefined);
const lifecycleConstructorMock = vi.fn(function LifecycleConstructor() {
  return { run: runMock };
});

vi.mock("electron", () => ({
  ipcMain: { handle: handleMock },
}));

vi.mock("../../../src/main/services/skill-package-lifecycle", () => ({
  SkillPackageLifecycleService: lifecycleConstructorMock,
}));

vi.mock("../../../src/main/services/skill-package-lifecycle-desktop", () => ({
  createDesktopSkillPackageLifecycleDependencies: createDependenciesMock,
  cleanupAbandonedSkillPackageOperations: cleanupMock,
}));

async function setup() {
  const [{ registerSkillPackageOperationHandlers }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/skill/package-operation-handlers"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const db = { getById: vi.fn() };
  registerSkillPackageOperationHandlers({ db } as never);
  const handler = handleMock.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.SKILL_RUN_PACKAGE_OPERATION,
  )?.[1] as
    | ((event: unknown, request: unknown) => Promise<unknown>)
    | undefined;
  return { db, handler, IPC_CHANNELS };
}

describe("Skill package operation IPC", () => {
  beforeEach(() => {
    handleMock.mockClear();
    runMock.mockReset();
    createDependenciesMock.mockClear();
    cleanupMock.mockReset().mockResolvedValue(undefined);
    lifecycleConstructorMock.mockClear();
  });

  it("registers one lifecycle owner and returns its structured result", async () => {
    const completed = {
      status: "completed",
      operation: "install",
      skill: { id: "skill-1" },
    };
    runMock.mockResolvedValue(completed);
    const { db, handler } = await setup();
    const request = { operation: "install" };

    expect(handler).toBeTypeOf("function");
    await expect(handler!(null, request)).resolves.toBe(completed);
    expect(createDependenciesMock).toHaveBeenCalledWith(db);
    expect(lifecycleConstructorMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(request);
    expect(cleanupMock).toHaveBeenCalledWith(db, { recoverAll: true });
  });

  it("rejects package writes when startup recovery cannot finish", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    cleanupMock.mockRejectedValueOnce(new Error("recovery unavailable"));
    runMock.mockResolvedValue({ status: "cancelled", operation: "install" });

    const { handler } = await setup();
    await Promise.resolve();

    expect(handler).toBeTypeOf("function");
    await expect(handler!(null, { operation: "install" })).rejects.toThrow(
      "Skill package recovery failed",
    );
    expect(runMock).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "Failed to recover abandoned Skill package operations:",
      expect.any(Error),
    );
    warning.mockRestore();
  });

  it("does not start a package operation while startup recovery is pending", async () => {
    let completeRecovery: () => void = () => {
      throw new Error("Recovery not initialized");
    };
    cleanupMock.mockReturnValue(
      new Promise<void>((resolve) => {
        completeRecovery = resolve;
      }),
    );
    runMock.mockResolvedValue({
      status: "completed",
      operation: "install",
      skill: { id: "new-skill" },
    });
    const { handler } = await setup();
    const operation = handler!(null, { operation: "install" });
    await Promise.resolve();
    expect(runMock).not.toHaveBeenCalled();
    completeRecovery();
    await expect(operation).resolves.toMatchObject({ status: "completed" });
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
