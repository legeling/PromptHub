/** @vitest-environment jsdom */
import {
  createSkillTestRuntime,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SkillFileEditor } from "../../src/renderer/components/skill/SkillFileEditor";
import { renderWithI18n } from "../helpers/i18n";
import { DESKTOP_TEST_TIMEOUT_MS } from "../helpers/test-config";

// Editor input mechanics and unrelated notification/sync are outside this test.
// Save handling, preload, IPC, SQLite and package publication remain real.
const showToast = vi.hoisted(() => vi.fn());
vi.mock("../../src/renderer/components/skill/SkillCodeEditor", () => ({
  getSkillCodeEditorLanguageName: () => "plaintext",
  SkillCodeEditor: ({
    value,
    editable,
    onChange,
  }: {
    value: string;
    editable: boolean;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={editable ? "Code editor" : "Code viewer"}
      value={value}
      readOnly={!editable}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));
vi.mock("../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

let runtime: SkillTestRuntime | undefined;
afterEach(() => {
  cleanup();
  runtime?.dispose();
  runtime = undefined;
});

it("retains the saved file text in the editor after real canonical publication", async () => {
  runtime = await createSkillTestRuntime();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { skill: skillApi },
  });
  const skill = await skillApi.create({
    name: "file-save-display",
    instructions: "# File save display\n",
    protocol_type: "skill",
    is_favorite: false,
  });
  const relativePath = "docs/nested/note.txt";
  await skillApi.writeLocalFile(skill.id, relativePath, "Original text\n");
  await renderWithI18n(
    <SkillFileEditor
      skillId={skill.id}
      isOpen
      mode="inline"
      initialFilePath={relativePath}
    />,
  );
  const waitOptions = { timeout: DESKTOP_TEST_TIMEOUT_MS };
  await waitFor(
    () =>
      expect(
        screen.getByRole("textbox", {
          name: "Code viewer",
        }),
      ).toHaveValue("Original text\n"),
    waitOptions,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
  const savedText = "Saved nested text\n";
  fireEvent.change(screen.getByRole("textbox", { name: "Code editor" }), {
    target: { value: savedText },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(
    async () =>
      expect(
        await skillApi.readLocalFile(skill.id, relativePath),
      ).toMatchObject({ content: savedText }),
    waitOptions,
  );
  await waitFor(
    () => expect(showToast).toHaveBeenCalledWith("File saved", "success"),
    waitOptions,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
  expect
    .soft(
      screen.getByRole("textbox", {
        name: "Code viewer",
      }),
    )
    .toHaveValue(savedText);
  expect.soft(screen.queryByText("18 B")).not.toBeNull();
  cleanup();
  await runtime.reopen();
  expect(await skillApi.readLocalFile(skill.id, relativePath)).toMatchObject({
    content: savedText,
  });
});
