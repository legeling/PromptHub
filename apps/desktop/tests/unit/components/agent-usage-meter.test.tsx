import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AgentUsageMetric } from "@prompthub/shared/types";
import { AgentUsageMeter } from "../../../src/renderer/components/agent/AgentUsageMeter";
import { renderWithI18n as renderWithI18nBase } from "../../helpers/i18n";

function renderWithI18n(ui: ReactElement) {
  return renderWithI18nBase(ui, { settleAsyncEffects: true });
}

function metric(overrides: Partial<AgentUsageMetric>): AgentUsageMetric {
  return {
    id: "custom",
    label: "Custom quota",
    scope: { kind: "account" },
    period: { kind: "lifetime" },
    value: { kind: "percentage", remainingPercent: 50 },
    resetsAt: null,
    ...overrides,
  };
}

describe("AgentUsageMeter", () => {
  it("renders amount quotas as remaining values with the shared progress meter", async () => {
    await renderWithI18n(
      <AgentUsageMeter
        metric={metric({
          period: { kind: "calendar", unit: "month" },
          value: {
            kind: "amount",
            remainingPercent: 75,
            remainingAmount: 750,
            limitAmount: 1_000,
            unit: "credits",
          },
        })}
      />,
    );

    expect(screen.getByText("Monthly quota")).toBeVisible();
    expect(screen.getByText("750 / 1,000 credits remaining")).toBeVisible();
    const progress = screen.getByRole("progressbar", {
      name: "Monthly quota: 75% remaining",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "75");
    expect(progress).toHaveAttribute("data-usage-visual", "bar");
  });

  it("preserves unlimited and unknown provider states without fake bars", async () => {
    await renderWithI18n(
      <>
        <AgentUsageMeter metric={metric({ value: { kind: "unlimited" } })} />
        <AgentUsageMeter
          metric={metric({
            id: "model:opaque",
            label: "Opaque model",
            scope: { kind: "model", id: "opaque", label: "Opaque model" },
            period: { kind: "provider-defined", label: "dynamic" },
            value: { kind: "unknown" },
          })}
        />
      </>,
    );

    expect(screen.getByText("Unlimited")).toBeVisible();
    expect(screen.getByText("Opaque model")).toBeVisible();
    expect(screen.getByText("Not reported")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("clamps malformed percentages at presentation time and reports pending resets", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000);
    try {
      await renderWithI18n(
        <AgentUsageMeter
          compact
          metric={metric({
            id: "fiveHour",
            period: { kind: "rolling", durationSeconds: 18_000 },
            value: { kind: "percentage", remainingPercent: 150 },
            resetsAt: 1_999,
          })}
        />,
      );

      expect(
        screen.getByRole("progressbar", {
          name: "5-hour window: 100% remaining",
        }),
      ).toHaveAttribute("data-usage-visual", "ring");
      expect(screen.getByText("Reset pending")).toBeVisible();
    } finally {
      now.mockRestore();
    }
  });

  it("uses compact rings for bounded rolling and weekly amount windows", async () => {
    await renderWithI18n(
      <>
        <AgentUsageMeter
          metric={metric({
            id: "fiveHour",
            period: { kind: "rolling", durationSeconds: 18_000 },
            value: {
              kind: "amount",
              remainingPercent: 80,
              remainingAmount: 80,
              limitAmount: 100,
              unit: "requests",
            },
          })}
        />
        <AgentUsageMeter
          metric={metric({
            id: "weekly",
            period: { kind: "calendar", unit: "week" },
            value: {
              kind: "amount",
              remainingPercent: 60,
              remainingAmount: 60,
              limitAmount: 100,
              unit: "requests",
            },
          })}
        />
      </>,
    );

    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("progressbar")
        .every((element) => element.dataset.usageVisual === "ring"),
    ).toBe(true);
  });

  it("labels opaque account periods as provider quotas", async () => {
    await renderWithI18n(
      <AgentUsageMeter
        metric={metric({
          period: { kind: "provider-defined", label: "opaque" },
        })}
      />,
    );

    expect(screen.getByText("Provider quota")).toBeVisible();
  });

  it("keeps total meters compact in constrained surfaces", async () => {
    await renderWithI18n(
      <AgentUsageMeter
        compact
        metric={metric({
          period: { kind: "provider-defined", label: "total" },
        })}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveClass("mt-1.5", "h-1");
  });
});
