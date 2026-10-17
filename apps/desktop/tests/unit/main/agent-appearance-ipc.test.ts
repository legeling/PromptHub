import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const showOpenDialogMock = vi.fn();
const getOverviewMock = vi.fn();
const importThemeMock = vi.fn();
const deleteThemeMock = vi.fn();
const getThemePreviewMock = vi.fn();
const exportThemeMock = vi.fn();
const applyThemeMock = vi.fn();
const restoreThemeMock = vi.fn();
const importPetMock = vi.fn();
const exportPetMock = vi.fn();
const deletePetMock = vi.fn();
const getPetPreviewMock = vi.fn();
const updatePetMetadataMock = vi.fn();
const listPetStoreMock = vi.fn();
const installPetStoreMock = vi.fn();
const getPetStorePreviewMock = vi.fn();
const sessionFetchMock = vi.fn();

vi.mock("electron", () => ({
  app: { once: vi.fn() },
  dialog: { showOpenDialog: showOpenDialogMock },
  ipcMain: { handle: handleMock },
  session: { defaultSession: { fetch: sessionFetchMock } },
}));

type Handler = (...args: unknown[]) => Promise<unknown>;

async function setup(realPetStore = false) {
  vi.resetModules();
  handleMock.mockReset();
  const service = {
    getOverview: getOverviewMock,
    importTheme: importThemeMock,
    deleteTheme: deleteThemeMock,
    getThemePreview: getThemePreviewMock,
    exportTheme: exportThemeMock,
    applyTheme: applyThemeMock,
    restoreTheme: restoreThemeMock,
    importPet: importPetMock,
    exportPet: exportPetMock,
    deletePet: deletePetMock,
    getPetPreview: getPetPreviewMock,
    updatePetMetadata: updatePetMetadataMock,
  };
  const petStoreService = {
    list: listPetStoreMock,
    install: installPetStoreMock,
    getPreview: getPetStorePreviewMock,
  };
  const [{ registerAgentAppearanceIPC }, { IPC_CHANNELS }] = await Promise.all([
    import("../../../src/main/ipc/agent-appearance.ipc"),
    import("@prompthub/shared/constants/ipc-channels"),
  ]);
  registerAgentAppearanceIPC({
    createService: () => service as never,
    ...(realPetStore
      ? {}
      : { createPetStoreService: () => petStoreService as never }),
  });
  return {
    IPC_CHANNELS,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent appearance IPC", () => {
  it("loads the official Pet catalog through the system proxy session and can refresh after a failure", async () => {
    getOverviewMock.mockResolvedValue({ pets: [] });
    sessionFetchMock
      .mockReset()
      .mockRejectedValueOnce(new Error("Network unavailable"));
    const { handlers, IPC_CHANNELS } = await setup(true);
    const list = handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_LIST];
    await expect(list(null, { agentId: "codex" })).rejects.toThrow(
      "Network unavailable",
    );
    sessionFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ slug: "nova--alice", name: "Nova" }])),
    );
    await expect(
      list(null, { agentId: "codex", refresh: true }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: "nova--alice", name: "Nova" }],
    });
    expect(sessionFetchMock).toHaveBeenCalledWith(
      "https://codexpet.top/pets.json",
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("blocks disabled appearance before opening dialogs or using the pet store", async () => {
    const { handlers, IPC_CHANNELS } = await setup();
    const { getAgentDefinitionById } =
      await import("@prompthub/shared/constants/agent-definitions");
    const definition = getAgentDefinitionById("codex");
    if (!definition) throw new Error("Missing Codex fixture");
    const capability = definition.capabilities.appearance;
    const enabled = capability.enabled;
    capability.enabled = false;
    try {
      for (const channel of [
        IPC_CHANNELS.AGENT_APPEARANCE_GET,
        IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_THEME,
        IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_PET,
      ]) {
        await expect(handlers[channel](null, "codex")).rejects.toThrow(
          "AGENT_APPEARANCE_UNSUPPORTED",
        );
      }
      await expect(
        handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_LIST](null, {}),
      ).rejects.toThrow("AGENT_APPEARANCE_UNSUPPORTED");
      expect(showOpenDialogMock).not.toHaveBeenCalled();
      expect(getOverviewMock).not.toHaveBeenCalled();
      expect(importThemeMock).not.toHaveBeenCalled();
      expect(importPetMock).not.toHaveBeenCalled();
      expect(listPetStoreMock).not.toHaveBeenCalled();
    } finally {
      capability.enabled = enabled;
    }
  });

  beforeEach(() => {
    showOpenDialogMock.mockReset();
    getOverviewMock.mockReset();
    importThemeMock.mockReset();
    deleteThemeMock.mockReset();
    getThemePreviewMock.mockReset();
    exportThemeMock.mockReset();
    applyThemeMock.mockReset();
    restoreThemeMock.mockReset();
    importPetMock.mockReset();
    exportPetMock.mockReset();
    deletePetMock.mockReset();
    getPetPreviewMock.mockReset();
    updatePetMetadataMock.mockReset();
    listPetStoreMock.mockReset();
    installPetStoreMock.mockReset();
    getPetStorePreviewMock.mockReset();
  });

  it("exposes Codex overview and validates theme actions", async () => {
    getOverviewMock.mockResolvedValue({ agentId: "codex" });
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_GET](null, "codex"),
    ).resolves.toEqual({ agentId: "codex" });
    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_APPLY_THEME](null, {
        agentId: "codex",
        themeId: "midnight@1.0.0",
        restartExisting: true,
      }),
    ).resolves.toBeUndefined();
    expect(applyThemeMock).toHaveBeenCalledWith("midnight@1.0.0", true);

    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_APPLY_THEME](null, {
        agentId: "claude-code",
        themeId: "midnight@1.0.0",
      }),
    ).rejects.toThrow("only supported for Codex");
    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_APPLY_THEME](null, {
        agentId: "codex",
        themeId: "",
      }),
    ).rejects.toThrow("themeId");
    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_APPLY_THEME](null, {
        agentId: "codex",
        themeId: "midnight@1.0.0",
        restartExisting: "yes",
      }),
    ).rejects.toThrow("restartExisting");
  });

  it("imports themes and Pets through bounded native pickers", async () => {
    showOpenDialogMock
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: ["/tmp/dream-skin"],
      })
      .mockResolvedValueOnce({ canceled: false, filePaths: ["/tmp/pet"] });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_THEME](null, "codex");
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_PET](null, "codex");

    expect(importThemeMock).toHaveBeenCalledWith("/tmp/dream-skin");
    expect(importPetMock).toHaveBeenCalledWith("/tmp/pet");
    expect(showOpenDialogMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ properties: ["openDirectory"] }),
    );
    expect(showOpenDialogMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ properties: ["openDirectory"] }),
    );
  });

  it("returns null when import or export pickers are cancelled", async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_THEME](null, "codex"),
    ).resolves.toBeNull();
    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_PET](
        null,
        "codex",
        "orbit",
      ),
    ).resolves.toBeNull();
    expect(importThemeMock).not.toHaveBeenCalled();
    expect(exportPetMock).not.toHaveBeenCalled();
  });

  it("routes restore, delete, preview and Pet export with string validation", async () => {
    showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/export"],
    });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_RESTORE_THEME](null, "codex");
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_DELETE_THEME](
      null,
      "codex",
      "midnight@1.0.0",
    );
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_PREVIEW](
      null,
      "codex",
      "orbit",
    );
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_THEME_PREVIEW](
      null,
      "codex",
      "midnight@1.0.0",
    );
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_PET](
      null,
      "codex",
      "orbit",
    );
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_THEME](
      null,
      "codex",
      "midnight@1.0.0",
    );
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_DELETE_PET](
      null,
      "codex",
      "orbit",
    );

    expect(restoreThemeMock).toHaveBeenCalledOnce();
    expect(deleteThemeMock).toHaveBeenCalledWith("midnight@1.0.0");
    expect(getPetPreviewMock).toHaveBeenCalledWith("orbit");
    expect(getThemePreviewMock).toHaveBeenCalledWith("midnight@1.0.0");
    expect(exportPetMock).toHaveBeenCalledWith("orbit", "/tmp/export");
    expect(exportThemeMock).toHaveBeenCalledWith(
      "midnight@1.0.0",
      "/tmp/export",
    );
    expect(deletePetMock).toHaveBeenCalledWith("orbit");

    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_DELETE_PET](null, "codex", 42),
    ).rejects.toThrow("Pet id");
  });

  it("validates Pet metadata updates and official store operations", async () => {
    listPetStoreMock.mockResolvedValue({ items: [], total: 0 });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_UPDATE_PET](null, {
      agentId: "codex",
      petId: "orbit",
      name: "Orbit Prime",
      description: "Updated locally",
    });
    expect(updatePetMetadataMock).toHaveBeenCalledWith({
      agentId: "codex",
      petId: "orbit",
      name: "Orbit Prime",
      description: "Updated locally",
    });

    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_LIST](null, {
      agentId: "codex",
      locale: "zh",
      page: 2,
      pageSize: 12,
      refresh: true,
    });
    expect(listPetStoreMock).toHaveBeenCalledWith({
      agentId: "codex",
      locale: "zh",
      page: 2,
      pageSize: 12,
      refresh: true,
    });

    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_INSTALL](
      null,
      "codex",
      "orbit",
    );
    await handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_PREVIEW](
      null,
      "codex",
      "orbit",
    );
    expect(installPetStoreMock).toHaveBeenCalledWith("codex", "orbit");
    expect(getPetStorePreviewMock).toHaveBeenCalledWith("codex", "orbit");

    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_UPDATE_PET](null, {
        agentId: "codex",
        petId: "orbit",
        name: "",
      }),
    ).rejects.toThrow("Pet name");
    await expect(
      handlers[IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_LIST](null, {
        agentId: "codex",
        page: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow("finite number");
  });
});
