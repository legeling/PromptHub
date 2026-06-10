import { fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { WebWorkspaceSettings } from "../../../src/renderer/components/settings/WebWorkspaceSettings";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/runtime", () => ({
  getWebContext: () => ({ username: "web-admin" }),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function isHiddenFromAccessibility(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

describe("WebWorkspaceSettings", () => {
  it("explains that self-hosted Web is a backup and browsing workspace, not local distribution", async () => {
    await renderWithI18n(<WebWorkspaceSettings onNavigate={vi.fn()} />, {
      language: "zh",
    });

    expect(screen.getByText("自部署网页版")).toBeInTheDocument();
    expect(
      screen.getByText(
        /当前网页工作区主要用于临时浏览 Prompt，并作为自部署备份 \/ 恢复源/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/本机平台分发替换仍需在桌面端完成/)).toBeInTheDocument();
    expect(screen.getByText("web-admin")).toBeInTheDocument();
  });

  it("keeps workspace navigation cards non-submit with decorative icons hidden", async () => {
    const onNavigate = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <WebWorkspaceSettings onNavigate={onNavigate} />
      </form>,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: /Device Management/ }));
    fireEvent.click(screen.getByRole("button", { name: /Data & Sync/ }));
    fireEvent.click(screen.getByRole("button", { name: /Model Services/ }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "devices");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "data");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "ai");

    for (const button of screen.getAllByRole("button")) {
      if (button.tagName === "BUTTON") {
        expect(button).toHaveAttribute("type", "button");
      }
    }

    for (const icon of document.querySelectorAll("button svg")) {
      expect(isHiddenFromAccessibility(icon)).toBe(true);
    }

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
