import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RendererErrorBoundary } from "../../../src/renderer/components/app/RendererErrorBoundary";
import { renderWithI18n } from "../../helpers/i18n";

function BrokenRenderer(): never {
  throw new Error("renderer failed");
}

describe("RendererErrorBoundary", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("replaces a crashed renderer with a reload action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();

    await renderWithI18n(
      <RendererErrorBoundary autoReload={false} reload={reload}>
        <BrokenRenderer />
      </RendererErrorBoundary>,
      { language: "en" },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "PromptHub could not render this page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload PromptHub" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("attempts only one automatic development recovery per cooldown", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    const first = await renderWithI18n(
      <RendererErrorBoundary reload={reload}>
        <BrokenRenderer />
      </RendererErrorBoundary>,
    );

    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
    first.unmount();

    await renderWithI18n(
      <RendererErrorBoundary reload={reload}>
        <BrokenRenderer />
      </RendererErrorBoundary>,
    );
    vi.runAllTimers();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("falls back without looping when session storage is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const reload = vi.fn();

    await renderWithI18n(
      <RendererErrorBoundary reload={reload}>
        <BrokenRenderer />
      </RendererErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("uses the browser reload action when no override is injected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await renderWithI18n(
      <RendererErrorBoundary autoReload={false}>
        <BrokenRenderer />
      </RendererErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload PromptHub" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
