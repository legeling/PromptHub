import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { isWebRuntime } from "../../../src/renderer/runtime";
import { installDesktopBridge } from "../../../../web/src/client/desktop/install-bridge";
import { DangerPanel } from "../../../src/renderer/components/settings/data-settings/DangerPanel";

const context = vi.hoisted(() => ({ handleClearData: vi.fn() }));
// Only translation, context and the presentation wrapper are substituted.
// The real Web bridge, runtime selector and capability branch run.
vi.mock("../../../../web/src/client/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../../src/renderer/components/settings/data-settings/useDataSettingsController", () => ({
  useDataSettingsControllerContext: () => ({
    webRuntime: isWebRuntime(), activeSubsection: "backup", settings: {},
    t: (key: string) => key, handleClearData: context.handleClearData,
  }),
}));
vi.mock("../../../src/renderer/components/settings/shared", () => ({
  SettingItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

const previousProperties = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  for (const name of ["api", "electron", "__PROMPTHUB_WEB__"]) {
    previousProperties.set(name, Object.getOwnPropertyDescriptor(window, name));
  }
  context.handleClearData.mockClear();
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of previousProperties) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else Reflect.deleteProperty(window, name);
  }
  previousProperties.clear();
});

it("hides clear-data in the real Web runtime and exposes its callback only in the desktop backup panel", () => {
  installDesktopBridge();
  expect(isWebRuntime()).toBe(true);
  const view = render(<DangerPanel />);
  expect(screen.queryByRole("button", { name: "settings.clear" })).toBeNull();
  expect(context.handleClearData).not.toHaveBeenCalled();
  Reflect.deleteProperty(window, "__PROMPTHUB_WEB__");
  expect(isWebRuntime()).toBe(false);
  view.rerender(<DangerPanel />);
  fireEvent.click(screen.getByRole("button", { name: "settings.clear" }));
  expect(context.handleClearData).toHaveBeenCalledTimes(1);
});
