import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../../src/renderer/components/skill/SkillCodeEditor", () => ({
  getSkillCodeEditorLanguageName: () => "markdown",
  SkillCodeEditor: ({
    value,
    editable,
    onChange,
  }: {
    value: string;
    editable: boolean;
    onChange: (value: string) => void;
  }) =>
    editable ? (
      <textarea
        aria-label="Code editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ) : (
      <pre data-testid="file-content">{value}</pre>
    ),
}));

const initialStore = useSkillStore.getState();
const skill: Skill = {
  id: "package-refresh",
  name: "package-refresh",
  description: "Package refresh",
  content: "# Initial",
  instructions: "# Initial",
  protocol_type: "skill",
  tags: [],
  is_favorite: false,
  currentVersion: 1,
  created_at: 1,
  updated_at: 1,
};
let revision = 1;
beforeEach(() => {
  revision = 1;
  useSkillStore.setState({
    ...initialStore,
    skills: [skill],
    selectedSkillId: skill.id,
  });
  const mocks = installWindowMocks();
  mocks.api.skill.listLocalFiles.mockImplementation(async () => [
    { path: "SKILL.md", isDirectory: false, size: 10 },
    ...(revision > 1
      ? [{ path: "added.md", isDirectory: false, size: 10 }]
      : []),
  ]);
  mocks.api.skill.readLocalFile.mockImplementation(async (_, path) => ({
    path,
    isDirectory: false,
    content: `Package revision ${revision}`,
  }));
});
afterEach(() => {
  cleanup();
  useSkillStore.setState(initialStore, true);
  vi.restoreAllMocks();
});

async function openFiles() {
  await renderWithI18n(<SkillFullDetailPage />, { settleAsyncEffects: true });
  fireEvent.click(
    await screen.findByRole("button", { name: "Files" }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("file-content")).toHaveTextContent(
      "Package revision 1",
    ),
  );
}

function publishRevision() {
  revision += 1;
  act(() =>
    useSkillStore.setState({
      skills: [{ ...skill, currentVersion: revision }],
    }),
  );
}

it("refreshes the open file tree and content when the same Skill publishes a package version", async () => {
  await openFiles();
  publishRevision();
  expect(
    await screen.findByRole("button", { name: "added.md" }),
  ).toBeVisible();
  await waitFor(() =>
    expect(screen.getByTestId("file-content")).toHaveTextContent(
      "Package revision 2",
    ),
  );
});

it("preserves unsaved file edits across package refresh and metadata-only changes", async () => {
  await openFiles();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Code editor" }), {
    target: { value: "Unsaved draft" },
  });
  act(() =>
    useSkillStore.setState({ skills: [{ ...skill, is_favorite: true }] }),
  );
  expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue(
    "Unsaved draft",
  );
  publishRevision();
  expect(
    await screen.findByRole("button", { name: "added.md" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue(
    "Unsaved draft",
  );
});
