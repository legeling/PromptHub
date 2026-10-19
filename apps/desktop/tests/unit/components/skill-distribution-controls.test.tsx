import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { SkillDistributionControls } from "../../../src/renderer/components/skill/SkillDistributionControls";
import { SHARED_AGENT_SKILLS_DISTRIBUTION_TARGET } from "../../../src/renderer/services/shared-skill-distribution-target";
import { renderWithI18n } from "../../helpers/i18n";

const platforms = [
  ...SKILL_PLATFORMS.filter((p) =>
    ["claude", "cursor", "windsurf"].includes(p.id),
  ),
  SHARED_AGENT_SKILLS_DISTRIBUTION_TARGET,
];

function Fixture({
  installed = {},
  busy = false,
}: {
  installed?: Record<string, boolean>;
  busy?: boolean;
}) {
  const [changes, setChanges] = useState(new Set<string>());
  return (
    <SkillDistributionControls
      availablePlatforms={platforms}
      skillName="writer"
      installMode="copy"
      setInstallMode={vi.fn()}
      installStatus={installed}
      selectedPlatforms={changes}
      isBusy={busy}
      installProgress={null}
      onApply={vi.fn()}
      onRedistribute={vi.fn()}
      onSelectAll={() => setChanges(new Set(["claude", "cursor", "windsurf"]))}
      onToggle={(id) =>
        setChanges((previous) => {
          const next = new Set(previous);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
    />
  );
}

describe("Skill distribution controls", () => {
  it("separates shared storage and counts intended selection and changes independently", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<Fixture installed={{ claude: true }} />);
    const advanced = screen.getByRole("region", { name: "Advanced targets" });
    const shared = within(advanced).getByRole("button", {
      name: "Shared Skill directory",
    });
    expect(shared).toHaveAttribute("aria-pressed", "false");
    expect(
      within(advanced).getByText("~/.agents/skills/writer/"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Redistribute" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Claude Code" }));
    await user.click(screen.getByRole("button", { name: "Cursor" }));
    expect(
      screen.getByText("Pending install 1 · Pending uninstall 1"),
    ).toBeVisible();
    expect(screen.getByText("Pending uninstall")).toBeVisible();
    expect(shared).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("button", { name: "Uninstall" }),
    ).not.toBeInTheDocument();
  });

  it("warns about duplicate discovery using installed as well as pending targets", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<Fixture installed={{ windsurf: true }} />);
    await user.click(
      screen.getByRole("button", { name: "Shared Skill directory" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("may discover both");
    await user.click(screen.getByRole("button", { name: "Windsurf" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("locks platform, mode, shared and bulk controls during an operation", async () => {
    await renderWithI18n(<Fixture busy />);
    for (const name of [
      "Claude Code",
      "Shared Skill directory",
      "Select all platforms",
      "Copy",
      "Symlink",
    ]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("offers redistribution when every checked target is already installed", async () => {
    await renderWithI18n(
      <Fixture
        installed={{
          claude: true,
          cursor: true,
          windsurf: true,
          "agent-skills-global": true,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Redistribute" })).toBeEnabled();
    expect(
      screen.getByText(
        "No pending changes. Redistribute to update installed copies.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Apply changes" }),
    ).toBeDisabled();
  });
});
