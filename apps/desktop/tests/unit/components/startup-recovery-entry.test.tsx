import { act, screen } from "@testing-library/react";
import type { Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { installWindowMocks } from "../../helpers/window";

const observed = vi.hoisted(() => {
  const roots: Root[] = [];
  return { roots, normalApp: vi.fn(), backup: vi.fn() };
});
vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return {
    ...actual,
    default: {
      ...actual,
      createRoot: (...args: Parameters<typeof actual.createRoot>) => {
        const root = actual.createRoot(...args);
        observed.roots.push(root);
        return root;
      },
    },
  };
});
vi.mock("../../../src/renderer/App", () => {
  observed.normalApp();
  return { default: () => null };
});
vi.mock("../../../src/renderer/services/database-backup", () => {
  observed.backup();
  return {};
});

afterEach(async () => {
  await act(async () => {
    for (const root of observed.roots.splice(0)) root.unmount();
  });
  document.getElementById("root")?.remove();
  window.history.replaceState({}, "", "/");
});

it("boots the isolated recovery renderer without normal App or E2E backup initialization", async () => {
  const element = document.createElement("div");
  element.id = "root";
  document.body.appendChild(element);
  window.history.replaceState({}, "", "/?startupRecovery=prompt-workspace");
  installWindowMocks({
    api: {
      promptWorkspaceRecovery: {
        review: vi
          .fn()
          .mockResolvedValue({
            success: true,
            review: {
              fingerprint: "a".repeat(64),
              reappeared: false,
              sourceFileCount: 0,
              conflicts: [],
            },
          }),
      },
    },
    electron: { e2e: { getStats: vi.fn(), resetStats: vi.fn() } },
  });
  await act(async () => {
    await import("../../../src/renderer/main");
  });
  expect(
    await screen.findByRole("heading", {
      name: "Review historical Prompt data",
    }),
  ).toBeVisible();
  expect(observed.normalApp).not.toHaveBeenCalled();
  expect(observed.backup).not.toHaveBeenCalled();
});
