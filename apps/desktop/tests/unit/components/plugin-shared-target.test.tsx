import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { emptyPluginInventory, getPluginTargetMatrix } from "@prompthub/core";
import { PluginPlatformPanel } from "../../../src/renderer/components/plugin/PluginPlatformPanel";
import { filterVisiblePluginTargets } from "../../../src/renderer/components/plugin/plugin-detail-utils";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

it("allows shared distribution independently and excludes it from Agent select-all", async () => {
  const user = userEvent.setup();
  const onDistribute = vi.fn().mockResolvedValue(undefined);
  const targetMatrix = getPluginTargetMatrix().filter((target) =>
    ["codex", "shared-agents"].includes(target.id),
  );
  expect(
    filterVisiblePluginTargets(targetMatrix, [], ["codex"]).map(
      (target) => target.id,
    ),
  ).toEqual(["shared-agents"]);
  await renderWithI18n(
    <PluginPlatformPanel
      plugin={{
        id: "fixture",
        name: "fixture",
        displayName: "Fixture",
        trustLevel: "custom",
        inventory: emptyPluginInventory(),
        classification: "bundle",
        source: { kind: "local" },
        installedAt: 1,
        updatedAt: 1,
      }}
      localPackagePath="/fixture"
      onDistribute={onDistribute}
      targetMatrix={targetMatrix}
    />,
  );
  const shared = screen.getByRole("button", {
    name: "Shared Plugin directory",
  });
  await user.click(screen.getByRole("button", { name: /^Select all$/i }));
  expect(shared).toHaveAttribute("aria-pressed", "false");
  await user.click(shared);
  await user.click(screen.getByRole("button", { name: /^Deselect all$/i }));
  expect(shared).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Apply changes" }));
  expect(onDistribute).toHaveBeenCalledWith(["shared-agents"], "copy");
});
