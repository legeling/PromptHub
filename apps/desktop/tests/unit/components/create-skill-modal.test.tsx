import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateSkillModal } from "../../../src/renderer/components/skill/CreateSkillModal";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

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

describe("CreateSkillModal GitHub import", () => {
  beforeEach(() => {
    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      isLoading: false,
      error: null,
      viewMode: "gallery",
      searchQuery: "",
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      storeView: "store",
      registrySkills: [],
      isLoadingRegistry: false,
      storeCategory: "all",
      storeSearchQuery: "",
      selectedRegistrySlug: null,
      customStoreSources: [],
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {},
      translationCache: {},
    });
    useSettingsStore.setState({ aiModels: [] } as never);
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    installWindowMocks();
    const onClose = vi.fn();

    await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={onClose} />,
      { language: "en" },
    );

    const backdrop = screen.getByTestId("create-skill-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps chooser and manual actions non-submit with decorative icons hidden", async () => {
    installWindowMocks();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <CreateSkillModal isOpen={true} onClose={vi.fn()} />
      </form>,
      { language: "en" },
    );

    const chooserButtons = [
      screen.getByRole("button", { name: /AI Draft/ }),
      screen.getByRole("button", { name: /Install from Git Repository/ }),
      screen.getByRole("button", { name: /Create Manually/ }),
      screen.getByRole("button", { name: /Scan Local/ }),
      screen.getByRole("button", { name: "Close" }),
    ];

    for (const button of chooserButtons) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Create Manually/ }));
    });

    const fullscreenButtons = screen.getAllByRole("button", {
      name: "Fullscreen",
    });
    expect(fullscreenButtons).toHaveLength(2);
    const aiPolishButton = screen.getByRole("button", { name: "AI Polish" });
    expect(aiPolishButton).toHaveAttribute("aria-label", "AI Polish");
    expect(screen.getByLabelText("Upload .md")).toHaveAttribute(
      "type",
      "file",
    );

    const manualButtons = [
      screen.getByRole("button", { name: "Upload .md" }),
      aiPolishButton,
      screen.getByRole("button", { name: "Edit" }),
      screen.getByRole("button", { name: "Preview" }),
      screen.getByRole("button", { name: "Back" }),
      screen.getByRole("button", { name: "Create Skill" }),
      ...fullscreenButtons,
    ];

    for (const button of manualButtons) {
      expect(button).toHaveAttribute("type", "button");
      const icon = button.querySelector("svg");
      if (icon) {
        expect(icon).toHaveAttribute("aria-hidden", "true");
      }
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("creates a starter package SKILL.md when manual instructions are blank", async () => {
    const createSkill = vi.fn().mockResolvedValue({
      id: "skill-starter",
      name: "starter-skill",
    });
    useSkillStore.setState({ createSkill } as never);
    installWindowMocks();

    const onClose = vi.fn();
    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={onClose} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Create Manually"));
    });

    fireEvent.change(view.getByPlaceholderText("my-skill-name"), {
      target: { value: "starter skill" },
    });
    fireEvent.change(view.getAllByRole("textbox")[1], {
      target: { value: "Use when drafting starter skills." },
    });

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Create Skill" }));
    });

    await waitFor(() => {
      expect(createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "starterskill",
          instructions: expect.stringContaining("## Package notes"),
          content: expect.stringContaining("references/"),
        }),
      );
    });
    expect(createSkill.mock.calls[0][0].instructions).toContain(
      "name: starterskill",
    );
  });

  it("renders unsafe manual preview links as text", async () => {
    installWindowMocks();

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Create Manually"));
    });

    const instructionsTextarea = view.container.querySelector("textarea");
    expect(instructionsTextarea).toBeTruthy();
    fireEvent.change(instructionsTextarea!, {
      target: {
        value:
          "[bad](javascript:alert(1)) [file](file:///etc/passwd) [ok](https://example.com/docs)",
      },
    });

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Preview" }));
    });

    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("file").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
  });

  it("splits local scan into Agent import and explicit folder import choices", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([]);
    installWindowMocks({
      api: {
        skill: {
          scanLocalPreview,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Local"));
    });

    expect(view.getByText("Choose local import source")).toBeTruthy();
    expect(view.getByText("Import from Agent Skills")).toBeTruthy();
    expect(view.getByText("Choose Folder and Import")).toBeTruthy();
    expect(scanLocalPreview).not.toHaveBeenCalled();
  });

  it("opens Agent Skill management instead of scanning when importing from agents", async () => {
    const setStoreView = vi.fn((view: string) => {
      useSkillStore.setState({ storeView: view as never });
    });
    const selectSkill = vi.fn();
    useSkillStore.setState({ selectSkill, setStoreView } as never);
    installWindowMocks();

    const onClose = vi.fn();
    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={onClose} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Local"));
    });
    fireEvent.click(view.getByText("Import from Agent Skills"));

    expect(setStoreView).toHaveBeenCalledWith("agents");
    expect(selectSkill).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("scans only the user-selected local skill folder", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([
      {
        name: "local-one",
        description: "Local one",
        author: "Tester",
        tags: [],
        instructions: "# Local One",
        filePath: "/Users/demo/skills/local-one/SKILL.md",
        localPath: "/Users/demo/skills/local-one",
        platforms: ["Local"],
      },
    ]);
    const selectFolder = vi.fn().mockResolvedValue("/Users/demo/skills");
    installWindowMocks({
      api: {
        skill: {
          scanLocalPreview,
        },
      },
      electron: {
        selectFolder,
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Local"));
    });
    await act(async () => {
      fireEvent.click(view.getByText("Choose Folder and Import"));
    });

    await waitFor(() => {
      expect(scanLocalPreview).toHaveBeenCalledWith(["/Users/demo/skills"]);
      expect(view.getByText("local-one")).toBeTruthy();
    });

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);
  });

  it("treats deployed project copies as imported when directory fingerprint matches My Skills", async () => {
    const importScannedSkills = vi.fn();
    const scanLocalPreview = vi.fn().mockResolvedValue([
      {
        name: "writer",
        description: "Writer project copy",
        author: "PromptHub",
        tags: ["writing"],
        instructions: "# Writer",
        filePath: "/repo/.agents/skills/writer/SKILL.md",
        localPath: "/repo/.agents/skills/writer",
        platforms: ["Project"],
        installMode: "copy",
        directory_fingerprint: "fingerprint-writer",
      },
    ]);
    useSkillStore.setState({
      skills: [
        {
          id: "skill-writer",
          name: "writer",
          local_repo_path: "/prompthub/skills/writer--1234/repo",
          directory_fingerprint: "fingerprint-writer",
        },
      ],
      importScannedSkills,
    } as never);
    installWindowMocks({
      api: {
        skill: {
          scanLocalPreview,
        },
      },
      electron: {
        selectFolder: vi.fn().mockResolvedValue("/repo/.agents/skills"),
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Local"));
    });
    await act(async () => {
      fireEvent.click(view.getByText("Choose Folder and Import"));
    });

    await waitFor(() => {
      expect(view.getByText("Already Imported")).toBeTruthy();
    });

    expect(view.getByRole("button", { name: /Import Selected/ })).toBeDisabled();

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: /Import Selected/ }));
    });

    expect(importScannedSkills).not.toHaveBeenCalled();
  });

  it("scans a GitHub repo and lets users import multiple discovered skills", async () => {
    const installRegistrySkill = vi
      .fn()
      .mockResolvedValueOnce({ id: "skill-1", name: "pdf" })
      .mockResolvedValueOnce({ id: "skill-2", name: "docx" });

    useSkillStore.setState({ installRegistrySkill } as never);

    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "anthropics" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [
            { path: "skills/pdf/SKILL.md", type: "blob" },
            { path: "skills/docx/SKILL.md", type: "blob" },
          ],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md"
      ) {
        return [
          "---",
          "name: pdf",
          "description: PDF helper",
          "tags: [pdf]",
          "---",
          "",
          "# PDF",
        ].join("\n");
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md"
      ) {
        return [
          "---",
          "name: docx",
          "description: DOCX helper",
          "tags: [docx]",
          "---",
          "",
          "# DOCX",
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const onClose = vi.fn();
    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={onClose} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://github.com/anthropics/skills" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(view.getByText("Found 2 import option(s)")).toBeTruthy();
      expect(
        view.getByText(
          "https://github.com/anthropics/skills/tree/main/skills/pdf",
        ),
      ).toBeTruthy();
      expect(
        view.getByText(
          "https://github.com/anthropics/skills/tree/main/skills/docx",
        ),
      ).toBeTruthy();
    });

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    await act(async () => {
      fireEvent.click(view.getByText("Import Selected"));
    });

    await waitFor(() => {
      expect(installRegistrySkill).toHaveBeenCalledTimes(2);
    });

    expect(installRegistrySkill).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slug: "pdf",
        source_url: "https://github.com/anthropics/skills/tree/main/skills/pdf",
      }),
    );
    expect(installRegistrySkill).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        slug: "docx",
        source_url:
          "https://github.com/anthropics/skills/tree/main/skills/docx",
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("treats direct Git scan results as imported when only legacy content URL matches", async () => {
    useSkillStore.setState({
      skills: [
        {
          id: "skill-pdf",
          name: "pdf",
          content_url:
            "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md",
        },
      ],
      installRegistrySkill: vi.fn(),
    } as never);

    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "anthropics" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "skills/pdf/SKILL.md", type: "blob" }],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md"
      ) {
        return [
          "---",
          "name: pdf",
          "description: PDF helper",
          "tags: [pdf]",
          "---",
          "",
          "# PDF",
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://github.com/anthropics/skills" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(view.getByText("Already Imported")).toBeTruthy();
    });

    expect(view.getByRole("button", { name: /Import Selected/ })).toBeDisabled();

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: /Import Selected/ }));
    });

    expect(useSkillStore.getState().installRegistrySkill).not.toHaveBeenCalled();
  });

  it("keeps a fixed footer and scrollable results area after GitHub scan", async () => {
    useSkillStore.setState({
      installRegistrySkill: vi
        .fn()
        .mockResolvedValue({ id: "skill-1", name: "alpha" }),
    } as never);

    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "anthropics" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: Array.from({ length: 18 }, (_, index) => ({
            path: `skills/skill-${index + 1}/SKILL.md`,
            type: "blob",
          })),
        });
      }

      const rawMatch = url.match(
        /^https:\/\/raw\.githubusercontent\.com\/anthropics\/skills\/main\/skills\/(skill-\d+)\/SKILL\.md$/,
      );

      if (rawMatch) {
        const slug = rawMatch[1];
        return [
          "---",
          `name: ${slug}`,
          `description: ${slug} helper`,
          "tags: [test]",
          "---",
          "",
          `# ${slug}`,
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://github.com/anthropics/skills" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(view.getByText("Found 18 import option(s)")).toBeTruthy();
    });

    const modalContainer = view.getByTestId("create-skill-modal-container");
    expect(modalContainer.className).toContain("w-[min(92vw,1100px)]");
    expect(modalContainer.className).toContain("max-h-[92vh]");

    const intro = view.getByTestId("github-mode-intro");
    expect(intro.textContent).not.toContain(
      "Only repository root URLs are supported",
    );
    expect(intro.textContent).toContain(
      "If no SKILL.md files are found, PromptHub will fall back to the root README.md as a single import option.",
    );

    const scrollArea = view.getByTestId("github-results-scroll-area");
    expect(scrollArea.className).toContain("min-h-[24rem]");
    expect(scrollArea.className).toContain("flex-1");
    expect(scrollArea.className).toContain("overflow-y-auto");

    const footer = view.getByTestId("github-mode-footer");
    expect(footer.className).toContain("border-t");
    expect(footer.className).toContain("shrink-0");
    expect(view.getAllByText("Import Selected").length).toBeGreaterThan(0);
  });

  it("shows invalid repository guidance when the GitHub repo does not exist", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("HTTP 404 fetching remote content"));

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "zh" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("从 Git 仓库安装"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://github.com/demo/missing-repo" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("扫描仓库"));
    });

    await waitFor(() => {
      expect(
        view.getByText(
          "仓库不存在，或仓库地址无效，请检查 GitHub 仓库地址后重试。",
        ),
      ).toBeTruthy();
    });
  });

  it("uses SSH remote scan for git@github.com repository URLs", async () => {
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "superpowers",
        name: "superpowers",
        install_name: "superpowers",
        description: "SSH scanned skill",
        category: "dev",
        author: "obra",
        source_url: "/tmp/ssh-scan/superpowers",
        content_url: "/tmp/ssh-scan/superpowers",
        tags: ["dev"],
        version: "1.0.0",
        content: "# superpowers",
        compatibility: ["claude", "cursor"],
      },
    ]);

    const fetchRemoteContent = vi.fn();

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "git@github.com:obra/superpowers.git" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(scanRemoteGithub).toHaveBeenCalledWith(
        "git@github.com:obra/superpowers.git",
        expect.any(Array),
      );
      expect(fetchRemoteContent).not.toHaveBeenCalled();
      expect(view.getByText("Found 1 import option(s)")).toBeTruthy();
    });
  });

  it("clears previous Git scan results after the repository URL changes and offers rescan", async () => {
    const scanRemoteGithub = vi
      .fn()
      .mockResolvedValueOnce([
        {
          slug: "spec-init",
          name: "spec-init",
          install_name: "spec-init",
          description: "Spec skill",
          category: "dev",
          author: "legeling",
          source_url: "https://github.com/legeling/spec-init/tree/main/spec-init",
          content_url:
            "https://raw.githubusercontent.com/legeling/spec-init/main/spec-init/SKILL.md",
          tags: ["spec"],
          version: "1.0.0",
          content: "# spec-init",
          compatibility: ["claude"],
        },
      ])
      .mockResolvedValueOnce([
        {
          slug: "writer",
          name: "writer",
          install_name: "writer",
          description: "Writer skill",
          category: "writing",
          author: "demo",
          source_url: "https://github.com/demo/writer/tree/main/writer",
          content_url:
            "https://raw.githubusercontent.com/demo/writer/main/writer/SKILL.md",
          tags: ["writer"],
          version: "1.0.0",
          content: "# writer",
          compatibility: ["claude"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanRemoteGithub,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    const urlInput = view.getByPlaceholderText(
      "https://github.com/owner/skill-repo",
    );

    fireEvent.change(urlInput, {
      target: { value: "https://gitea.example.com/demo/spec-init" },
    });

    await act(async () => {
      fireEvent.click(view.getAllByText("Scan Repository")[0]);
    });

    await waitFor(() => {
      expect(view.getByText("Found 1 import option(s)")).toBeTruthy();
      expect(view.getByText("spec-init")).toBeTruthy();
    });

    fireEvent.change(urlInput, {
      target: { value: "https://gitea.example.com/demo/writer" },
    });

    expect(
      view.getByText(
        "The repository URL changed. Scan again to refresh the import options.",
      ),
    ).toBeTruthy();
    expect(view.getByText("Rescan Repository")).toBeTruthy();
    expect(view.queryByText("Found 1 import option(s)")).toBeNull();
    expect(view.queryByText("spec-init")).toBeNull();

    await act(async () => {
      fireEvent.click(view.getByText("Rescan Repository"));
    });

    await waitFor(() => {
      expect(scanRemoteGithub).toHaveBeenNthCalledWith(
        2,
        "https://gitea.example.com/demo/writer",
        expect.any(Array),
      );
      expect(view.getByText("writer")).toBeTruthy();
    });
  });

  it("resets the Git import screen when leaving and reopening the mode", async () => {
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "spec-init",
        name: "spec-init",
        install_name: "spec-init",
        description: "Spec skill",
        category: "dev",
        author: "legeling",
        source_url: "https://github.com/legeling/spec-init/tree/main/spec-init",
        content_url:
          "https://raw.githubusercontent.com/legeling/spec-init/main/spec-init/SKILL.md",
        tags: ["spec"],
        version: "1.0.0",
        content: "# spec-init",
        compatibility: ["claude"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanRemoteGithub,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://gitea.example.com/demo/spec-init" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getAllByText("Scan Repository")[0]);
    });

    await waitFor(() => {
      expect(view.getByText("spec-init")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Back" }));
    });

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    expect(view.queryByText("Found 1 import option(s)")).toBeNull();
    expect(view.queryByText("spec-init")).toBeNull();
    expect(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
    ).toHaveValue("");
  });

  it("shows SSH guidance when GitHub HTTPS scan hits API rate limit", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("GitHub API rate limit reached"));

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub: vi.fn(),
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://github.com/legeling/spec-init" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getAllByText("Scan Repository")[0]);
    });

    await waitFor(() => {
      expect(
        view.getByText(
          "GitHub API rate limit reached. Try again in a few minutes, or switch this repository URL to SSH to avoid the anonymous API limit.",
        ),
      ).toBeTruthy();
    });
  });

  it("keeps direct Git selections independent for same-slug source variants", async () => {
    const installRegistrySkill = vi
      .fn()
      .mockResolvedValue({ id: "installed-writer", name: "writer" });
    useSkillStore.setState({ installRegistrySkill } as never);

    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "writer",
        name: "writer",
        install_name: "writer",
        source_id: "source-writer-main",
        source_branch: "main",
        source_directory: "skills/stable/writer",
        canonical_skill_path: "skills/stable/writer/SKILL.md",
        description: "Stable writer",
        category: "dev",
        author: "demo",
        source_url:
          "https://gitea.example.com/demo/skills/tree/main/skills/stable/writer",
        tags: ["writer"],
        version: "1.0.0",
        content: "# writer stable",
        compatibility: ["claude"],
      },
      {
        slug: "writer",
        name: "writer",
        install_name: "writer",
        source_id: "source-writer-dev",
        source_branch: "main",
        source_directory: "skills/dev/writer",
        canonical_skill_path: "skills/dev/writer/SKILL.md",
        description: "Dev writer",
        category: "dev",
        author: "demo",
        source_url:
          "https://gitea.example.com/demo/skills/tree/main/skills/dev/writer",
        tags: ["writer"],
        version: "1.0.0",
        content: "# writer dev",
        compatibility: ["claude"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanRemoteGithub,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://gitea.example.com/demo/skills" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(view.getByText("Found 2 import option(s)")).toBeTruthy();
    });

    const writerButtons = view
      .getAllByText("writer")
      .map((node) => node.closest("button"))
      .filter((node): node is HTMLButtonElement => node !== null);
    expect(writerButtons).toHaveLength(2);

    await act(async () => {
      fireEvent.click(writerButtons[0]);
    });

    await act(async () => {
      fireEvent.click(view.getByText("Import Selected"));
    });

    await waitFor(() => {
      expect(installRegistrySkill).toHaveBeenCalledTimes(1);
    });

    expect(installRegistrySkill).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: "source-writer-dev",
      }),
    );
  });

  it("uses clone-based remote scan for self-hosted HTTPS git repositories", async () => {
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "icelemon-skill",
        name: "icelemon-skill",
        install_name: "icelemon-skill",
        description: "Self-hosted scanned skill",
        category: "dev",
        author: "icelemon",
        source_url: "/tmp/gitea/icelemon-skill",
        content_url: "/tmp/gitea/icelemon-skill",
        tags: ["dev"],
        version: "1.0.0",
        content: "# icelemon",
        compatibility: ["claude"],
      },
    ]);

    const fetchRemoteContent = vi.fn();

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from Git Repository"));
    });

    fireEvent.change(
      view.getByPlaceholderText("https://github.com/owner/skill-repo"),
      {
        target: { value: "https://gitea.example.com/icelemon/skills" },
      },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(scanRemoteGithub).toHaveBeenCalledWith(
        "https://gitea.example.com/icelemon/skills",
        expect.any(Array),
      );
      expect(fetchRemoteContent).not.toHaveBeenCalled();
      expect(view.getByText("Found 1 import option(s)")).toBeTruthy();
    });
  });
});
