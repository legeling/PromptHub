/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildFromTemplateMock,
  getFocusedWindowMock,
  openExternalMock,
  setApplicationMenuMock,
} = vi.hoisted(() => ({
  buildFromTemplateMock: vi.fn((template) => ({ template })),
  getFocusedWindowMock: vi.fn(),
  openExternalMock: vi.fn(),
  setApplicationMenuMock: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getFocusedWindow: getFocusedWindowMock,
  },
  Menu: {
    buildFromTemplate: buildFromTemplateMock,
    setApplicationMenu: setApplicationMenuMock,
  },
  app: {
    name: "PromptHub",
  },
  shell: {
    openExternal: openExternalMock,
  },
}));

type TestMenuItem = {
  label?: string;
  click?: () => void;
  submenu?: TestMenuItem[];
};

function getMenuTemplate(): TestMenuItem[] {
  const template = buildFromTemplateMock.mock.calls.at(-1)?.[0];

  if (!Array.isArray(template)) {
    throw new Error("Expected Menu.buildFromTemplate to receive a template");
  }

  return template as TestMenuItem[];
}

function getMenuItem(items: TestMenuItem[], label: string): TestMenuItem {
  const item = items.find((candidate) => candidate.label === label);

  if (!item) {
    throw new Error(`Expected menu item "${label}" to exist`);
  }

  return item;
}

describe("main menu", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
    buildFromTemplateMock.mockClear();
    getFocusedWindowMock.mockReset();
    openExternalMock.mockReset();
    setApplicationMenuMock.mockReset();
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("opens the official repository links from the help menu", async () => {
    const { createMenu } = await import("../../../src/main/menu");

    createMenu();

    const helpMenu = getMenuItem(getMenuTemplate(), "帮助");
    const helpItems = helpMenu.submenu ?? [];

    getMenuItem(helpItems, "文档").click?.();
    getMenuItem(helpItems, "报告问题").click?.();

    expect(openExternalMock).toHaveBeenNthCalledWith(
      1,
      "https://github.com/legeling/PromptHub",
    );
    expect(openExternalMock).toHaveBeenNthCalledWith(
      2,
      "https://github.com/legeling/PromptHub/issues",
    );
    expect(openExternalMock).not.toHaveBeenCalledWith(
      expect.stringContaining("github.com/xxx/PromptHub"),
    );
  });
});
