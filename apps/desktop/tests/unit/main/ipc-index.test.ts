/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const removeHandlerMock = vi.fn();

const registerPromptIPCMock = vi.fn();
const registerFolderIPCMock = vi.fn();
const registerSettingsIPCMock = vi.fn();
const registerImageIPCMock = vi.fn();
const registerRulesIPCMock = vi.fn();
const registerSkillIPCMock = vi.fn();
const registerAIIPCMock = vi.fn();
const registerSecurityIPCMock = vi.fn();
const registerBackupIPCMock = vi.fn();
const registerMcpIPCMock = vi.fn();
const registerPluginIPCMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: vi.fn(),
  },
}));

vi.mock("../../../src/main/ipc/prompt.ipc", () => ({ registerPromptIPC: registerPromptIPCMock }));
vi.mock("../../../src/main/ipc/folder.ipc", () => ({ registerFolderIPC: registerFolderIPCMock }));
vi.mock("../../../src/main/ipc/settings.ipc", () => ({ registerSettingsIPC: registerSettingsIPCMock }));
vi.mock("../../../src/main/ipc/image.ipc", () => ({ registerImageIPC: registerImageIPCMock }));
vi.mock("../../../src/main/ipc/rules.ipc", () => ({ registerRulesIPC: registerRulesIPCMock }));
vi.mock("../../../src/main/ipc/skill.ipc", () => ({ registerSkillIPC: registerSkillIPCMock }));
vi.mock("../../../src/main/ipc/ai.ipc", () => ({ registerAIIPC: registerAIIPCMock }));
vi.mock("../../../src/main/ipc/security.ipc", () => ({ registerSecurityIPC: registerSecurityIPCMock }));
vi.mock("../../../src/main/ipc/backup.ipc", () => ({ registerBackupIPC: registerBackupIPCMock }));
vi.mock("../../../src/main/ipc/mcp.ipc", () => ({ registerMcpIPC: registerMcpIPCMock }));
vi.mock("../../../src/main/ipc/plugin.ipc", () => ({ registerPluginIPC: registerPluginIPCMock }));

describe("ipc index registration order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers rules handlers before skill handlers", async () => {
    const { registerAllIPC } = await import("../../../src/main/ipc/index");

    registerAllIPC({} as never, vi.fn());

    const rulesOrder = registerRulesIPCMock.mock.invocationCallOrder[0];
    const skillOrder = registerSkillIPCMock.mock.invocationCallOrder[0];

    expect(rulesOrder).toBeLessThan(skillOrder);
  });
});
