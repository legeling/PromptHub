import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showToastMock = vi.fn();

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

vi.mock("../../../src/renderer/components/skill/SkillCodeEditor", () => ({
  getSkillCodeEditorLanguageName: (path: string) => {
    if (path.endsWith(".ts")) return "typescript";
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".md")) return "markdown";
    return "plaintext";
  },
  getMockLanguageName: (path: string) => {
    if (path.endsWith(".ts")) return "typescript";
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".md")) return "markdown";
    return "plaintext";
  },
  SkillCodeEditor: ({
    path,
    value,
    editable,
    onChange,
  }: {
    path: string;
    value: string;
    editable: boolean;
    onChange: (value: string) => void;
  }) => {
    const language = path.endsWith(".ts")
      ? "typescript"
      : path.endsWith(".py")
        ? "python"
        : path.endsWith(".md")
          ? "markdown"
          : "plaintext";
    return editable ? (
      <textarea
        aria-label="Code editor"
        data-language={language}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    ) : (
      <pre data-testid="skill-code-editor" data-language={language}>
        {value}
      </pre>
    );
  },
}));

import { SkillFileEditor } from "../../../src/renderer/components/skill/SkillFileEditor";
import { scheduleAllSaveSync } from "../../../src/renderer/services/webdav-save-sync";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("SkillFileEditor", () => {
  beforeEach(() => {
    showToastMock.mockReset();
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            { path: "SKILL.md", isDirectory: false, size: 128 },
            { path: ".git", isDirectory: true },
            { path: ".prompthub", isDirectory: true },
            {
              path: ".prompthub/translations/zh-CN/full/SKILL.md",
              isDirectory: false,
              size: 256,
            },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "SKILL.md",
            isDirectory: false,
            content: "# Skill\n\nBody",
          }),
        },
      },
    });
  });

  it("keeps the modal backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();

    await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="modal"
        onClose={onClose}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getAllByText("SKILL.md").length).toBeGreaterThan(0);
    });

    const backdrop = screen.getByTestId("skill-file-editor-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides internal repo directories from the visible file tree", async () => {
    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const treeList = container.querySelector(".skill-file-editor__tree-list");
    expect(treeList).not.toBeNull();

    await waitFor(() => {
      expect(
        within(treeList as HTMLElement).getByText("SKILL.md"),
      ).toBeInTheDocument();
    });

    expect(
      within(treeList as HTMLElement).queryByText(".git"),
    ).not.toBeInTheDocument();
    expect(
      within(treeList as HTMLElement).queryByText(".prompthub"),
    ).not.toBeInTheDocument();
    expect(
      within(treeList as HTMLElement).queryByText("translations"),
    ).not.toBeInTheDocument();
  });

  it("allows package-specific empty file labels for plugin reuse", async () => {
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([]),
        },
      },
    });

    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="plugin-1"
        skillName="plugin"
        isOpen={true}
        mode="inline"
        surfaceLabels={{ noFiles: "No local files for this Plugin" }}
      />,
      { language: "en" },
    );

    const treeList = container.querySelector(".skill-file-editor__tree-list");
    expect(treeList).not.toBeNull();

    await waitFor(() => {
      expect(
        within(treeList as HTMLElement).getByText(
          "No local files for this Plugin",
        ),
      ).toBeInTheDocument();
    });
    expect(
      within(treeList as HTMLElement).queryByText(
        "No local files for this skill",
      ),
    ).not.toBeInTheDocument();
  });

  it("expands nested synthetic folders to reveal files inside them", async () => {
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            { path: "SKILL.md", isDirectory: false, size: 128 },
            { path: "docs/reference/guide.md", isDirectory: false, size: 256 },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "SKILL.md",
            isDirectory: false,
            content: "# Skill\n\nBody",
          }),
        },
      },
    });

    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const treeList = container.querySelector(".skill-file-editor__tree-list");
    expect(treeList).not.toBeNull();

    await waitFor(() => {
      expect(
        within(treeList as HTMLElement).getByRole("button", { name: /docs/i }),
      ).toBeInTheDocument();
    });

    expect(
      within(treeList as HTMLElement).queryByText("guide.md"),
    ).not.toBeInTheDocument();

    const docsButton = within(treeList as HTMLElement).getByRole("button", {
      name: /docs/i,
    });
    expect(docsButton).toHaveAttribute("aria-expanded", "false");
    expect(docsButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    fireEvent.click(docsButton);

    const referenceButton = within(treeList as HTMLElement).getByRole(
      "button",
      {
        name: /reference/i,
      },
    );
    expect(referenceButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(referenceButton);

    expect(
      within(treeList as HTMLElement).getByText("guide.md"),
    ).toBeInTheDocument();
    expect(referenceButton).toHaveAttribute("aria-expanded", "true");
    expect(referenceButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps file selection and file deletion as separate buttons", async () => {
    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const treeList = container.querySelector(".skill-file-editor__tree-list");
    expect(treeList).not.toBeNull();

    const fileButton = await waitFor(() =>
      within(treeList as HTMLElement).getByRole("button", {
        name: /SKILL\.md/,
      }),
    );
    const deleteButton = within(treeList as HTMLElement).getByRole("button", {
      name: "Delete File",
    });

    expect(fileButton).not.toHaveAccessibleName(/Delete File/);
    expect(deleteButton.tagName).toBe("BUTTON");
    expect(deleteButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps file editor toolbar actions from submitting parent forms", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillFileEditor
          skillId="skill-1"
          skillName="writer"
          isOpen={true}
          mode="inline"
        />
      </form>,
      { language: "en" },
    );

    const newFileButton = await screen.findByRole("button", {
      name: "New File",
    });
    const newFolderButton = screen.getByRole("button", {
      name: "New Folder",
    });

    expect(newFileButton).toHaveAttribute("type", "button");
    expect(newFolderButton).toHaveAttribute("type", "button");
    expect(newFileButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(newFolderButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(newFileButton);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(newFolderButton);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const editButton = await screen.findByRole("button", { name: "Edit" });
    expect(editButton).toHaveAttribute("type", "button");
    expect(editButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(editButton);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("gives file dialog textboxes explicit accessible names", async () => {
    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const newFileButton = await screen.findByRole("button", {
      name: "New File",
    });
    fireEvent.click(newFileButton);
    expect(
      screen.getByRole("textbox", { name: "Enter file name" }),
    ).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));
    expect(
      screen.getByRole("textbox", { name: "Enter folder name" }),
    ).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const treeList = container.querySelector(".skill-file-editor__tree-list");
    expect(treeList).not.toBeNull();

    const fileButton = await waitFor(() =>
      within(treeList as HTMLElement).getByRole("button", {
        name: /SKILL\.md/,
      }),
    );
    fireEvent.contextMenu(fileButton);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(screen.getByRole("textbox", { name: "Rename" })).toHaveValue(
      "SKILL.md",
    );
  });

  it("keeps the modal close action named and non-submit", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onClose = vi.fn();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillFileEditor
          skillId="skill-1"
          skillName="writer"
          isOpen={true}
          onClose={onClose}
        />
      </form>,
      { language: "en" },
    );

    await screen.findByRole("button", { name: /SKILL\.md/ });

    const closeButton = screen.getByRole("button", { name: "Close" });

    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("normalizes Windows relative paths before building the file tree", async () => {
    const readLocalFile = vi
      .fn()
      .mockImplementation(async (_skillId: string, relativePath: string) => ({
        path: relativePath,
        isDirectory: false,
        content: "def run():\n    return 'ok'",
      }));
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            { path: "SKILL.md", isDirectory: false, size: 128 },
            { path: "scripts\\cd2cli", isDirectory: true },
            {
              path: "scripts\\cd2cli\\main.py",
              isDirectory: false,
              size: 64,
            },
          ]),
          readLocalFile,
        },
      },
    });

    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const treeList = container.querySelector(".skill-file-editor__tree-list");
    expect(treeList).not.toBeNull();

    const scriptsButton = await waitFor(() =>
      within(treeList as HTMLElement).getByRole("button", {
        name: /scripts/i,
      }),
    );

    expect(
      within(treeList as HTMLElement).queryByText("scripts\\cd2cli\\main.py"),
    ).not.toBeInTheDocument();
    if (scriptsButton.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(scriptsButton);
    }

    const cd2cliButton = await waitFor(() =>
      within(treeList as HTMLElement).getByRole("button", {
        name: /cd2cli/i,
      }),
    );
    if (cd2cliButton.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(cd2cliButton);
    }

    const mainFile = await waitFor(() =>
      within(treeList as HTMLElement).getByText("main.py"),
    );
    fireEvent.click(mainFile);

    await waitFor(() => {
      expect(readLocalFile).toHaveBeenCalledWith(
        "skill-1",
        "scripts/cd2cli/main.py",
      );
    });
  });

  it("schedules WebDAV save-sync after saving a skill file", async () => {
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi
            .fn()
            .mockResolvedValue([
              { path: "SKILL.md", isDirectory: false, size: 128 },
            ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "SKILL.md",
            isDirectory: false,
            content: "# Skill\n\nBody",
          }),
          writeLocalFile,
        },
      },
    });

    await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const editButton = await waitFor(() =>
      screen.getByRole("button", { name: "Edit" }),
    );
    fireEvent.click(editButton);

    await waitFor(
      () => {
        expect(screen.getByRole("textbox")).toHaveValue("# Skill\n\nBody");
      },
      { timeout: 5000 },
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "# Skill\n\nUpdated" },
    });

    await waitFor(
      () => {
        expect(screen.getByRole("textbox")).toHaveValue("# Skill\n\nUpdated");
      },
      { timeout: 5000 },
    );

    const getSaveButton = () => {
      const saveButtons = screen.getAllByRole("button");
      return saveButtons.find(
        (button) => button.getAttribute("title") === "Cmd/Ctrl+S",
      );
    };

    await waitFor(
      () => {
        expect(getSaveButton()).toBeDefined();
        expect(getSaveButton()).not.toBeDisabled();
      },
      { timeout: 5000 },
    );

    fireEvent.click(getSaveButton()!);

    await waitFor(
      () => {
        expect(writeLocalFile).toHaveBeenCalledWith(
          "skill-1",
          "SKILL.md",
          "# Skill\n\nUpdated",
        );
      },
      { timeout: 5000 },
    );
    expect(scheduleAllSaveSync).toHaveBeenCalledWith("skill:file-save");
  });

  it("renders a code editor by default and enables editing on request", async () => {
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "scripts/animation_contract.py",
              isDirectory: false,
              size: 64,
            },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "scripts/animation_contract.py",
            isDirectory: false,
            content: 'def run():\n    return "ok"',
          }),
        },
      },
    });

    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const codeEditor = await waitFor(() => {
      const editor = screen.getByTestId("skill-code-editor");
      expect(editor).toHaveTextContent('return "ok"');
      return editor;
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(codeEditor).toHaveAttribute("data-language", "python");
    const pythonIcon = container.querySelector(
      'img.skill-file-editor__tree-item-icon[src*="python.svg"]',
    );
    expect(pythonIcon).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue(
        'def run():\n    return "ok"',
      );
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: 'def run():\n    return "updated"' },
    });

    expect(screen.getByRole("textbox")).toHaveValue(
      'def run():\n    return "updated"',
    );
  });

  it("keeps local package file browsing read-only when requested", async () => {
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "README.md",
              isDirectory: false,
              size: 64,
            },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "README.md",
            isDirectory: false,
            content: "# Package",
          }),
          writeLocalFile,
        },
      },
    });

    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
        readOnly
      />,
      { language: "en" },
    );

    await screen.findByTestId("skill-code-editor");

    expect(screen.getByText("Read only")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[title="New File"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete File" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(writeLocalFile).not.toHaveBeenCalled();
  });

  it("can discard current file edits and cancel editing without saving", async () => {
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "scripts/tool.ts",
              isDirectory: false,
              size: 64,
            },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "scripts/tool.ts",
            isDirectory: false,
            content: "export const value = 'original';",
          }),
          writeLocalFile,
        },
      },
    });

    await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "export const value = 'changed';" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("textbox")).toHaveValue(
      "export const value = 'original';",
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "export const value = 'cancelled';" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-code-editor")).toHaveTextContent(
      "export const value = 'original';",
    );
    expect(writeLocalFile).not.toHaveBeenCalled();
  });

  it("renders supported resource files as previews instead of binary text", async () => {
    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "assets/github-small.svg",
              isDirectory: false,
              size: 13,
            },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "assets/github-small.svg",
            isDirectory: false,
            content:
              "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmciLz4=",
            encoding: "data-url",
            mimeType: "image/svg+xml",
            previewKind: "image",
          }),
        },
      },
    });

    await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const preview = await screen.findByAltText("assets/github-small.svg");
    const previewRoot = preview.closest(
      ".skill-file-editor__resource-preview--image",
    );
    const previewViewport = preview.closest(
      ".skill-file-editor__resource-image-viewport",
    );
    const previewStage = preview.closest(
      ".skill-file-editor__resource-image-stage",
    );
    const zoomControls = document.body.querySelector(
      ".skill-file-editor__zoom-controls",
    );

    expect(preview).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml;base64,/),
    );
    expect(previewRoot).not.toBeNull();
    expect(previewViewport).not.toBeNull();
    expect(previewStage).not.toBeNull();
    expect(zoomControls).not.toBeNull();
    expect(zoomControls?.parentElement).toBe(previewRoot);
    expect(zoomControls?.parentElement).not.toBe(previewViewport);
    expect(previewStage).toHaveStyle({ width: "100%", height: "100%" });

    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(previewStage).toHaveStyle({ width: "125%", height: "125%" });

    const wheelZoomIn = createEvent.wheel(previewViewport as HTMLElement, {
      deltaY: -120,
      cancelable: true,
    });
    const preventWheelDefault = vi.spyOn(wheelZoomIn, "preventDefault");
    fireEvent(previewViewport as HTMLElement, wheelZoomIn);
    expect(preventWheelDefault).toHaveBeenCalledTimes(1);
    expect(previewStage).toHaveStyle({ width: "150%", height: "150%" });

    const previewViewportElement = previewViewport as HTMLElement;
    previewViewportElement.scrollLeft = 20;
    previewViewportElement.scrollTop = 10;

    const panStart = createEvent.pointerDown(previewViewportElement, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    const preventPanDefault = vi.spyOn(panStart, "preventDefault");
    fireEvent(previewViewportElement, panStart);
    expect(preventPanDefault).toHaveBeenCalledTimes(1);
    expect(previewViewportElement).toHaveClass(
      "skill-file-editor__resource-image-viewport--panning",
    );

    fireEvent.pointerMove(previewViewportElement, {
      pointerId: 1,
      clientX: 60,
      clientY: 80,
    });
    expect(previewViewportElement.scrollLeft).toBe(60);
    expect(previewViewportElement.scrollTop).toBe(30);
    expect(zoomControls?.parentElement).toBe(previewRoot);
    expect(zoomControls?.parentElement).not.toBe(previewViewport);

    fireEvent.pointerUp(previewViewportElement, { pointerId: 1 });
    expect(previewViewportElement).not.toHaveClass(
      "skill-file-editor__resource-image-viewport--panning",
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(previewStage).toHaveStyle({ width: "125%", height: "125%" });

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen preview" }));
    const fullscreenDialog = screen.getByRole("dialog", {
      name: "Fullscreen preview",
    });
    const fullscreenImage = within(fullscreenDialog).getByAltText(
      "assets/github-small.svg",
    );
    const fullscreenStage = fullscreenImage.closest(
      ".skill-file-editor__resource-image-stage",
    );
    expect(fullscreenStage).toHaveStyle({ width: "125%", height: "125%" });

    fireEvent.click(
      within(fullscreenDialog).getByRole("button", { name: "Reset zoom" }),
    );
    expect(fullscreenStage).toHaveStyle({ width: "100%", height: "100%" });
    expect(previewStage).toHaveStyle({ width: "100%", height: "100%" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Fullscreen preview" }),
    ).not.toBeInTheDocument();

    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.queryByText("[binary file]")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("image/svg+xml")).toBeInTheDocument();
  });

  it("keeps code visible without a transparent textarea overlay", async () => {
    const typescriptContent =
      "export function run() {\n  const label = 'visible text';\n  return label;\n}\n";

    installWindowMocks({
      api: {
        skill: {
          listLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "scripts/merge-to-pdf.ts",
              isDirectory: false,
              size: 64,
            },
          ]),
          readLocalFile: vi.fn().mockResolvedValue({
            path: "scripts/merge-to-pdf.ts",
            isDirectory: false,
            content: typescriptContent,
          }),
        },
      },
    });

    const { container } = await renderWithI18n(
      <SkillFileEditor
        skillId="skill-1"
        skillName="writer"
        isOpen={true}
        mode="inline"
      />,
      { language: "en" },
    );

    const codeEditor = await waitFor(() => {
      const editor = screen.getByTestId("skill-code-editor");
      expect(editor).toHaveTextContent("export function run()");
      return editor;
    });

    expect(codeEditor.textContent).toBe(typescriptContent);
    expect(
      container.querySelector(".skill-file-editor__textarea--highlighted"),
    ).toBeNull();
  });
});
