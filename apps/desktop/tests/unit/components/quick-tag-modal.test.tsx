import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { QuickTagModal } from "../../../src/renderer/components/prompt/QuickTagModal";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToastMock = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

function makePrompt(id: string, title: string, tags: string[]): Prompt {
  return {
    id,
    title,
    description: "",
    promptType: "text",
    systemPrompt: "",
    userPrompt: "content",
    variables: [],
    tags,
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
  };
}

const basePrompt = makePrompt("prompt-1", "Tagging target", ["demo"]);
const otherPrompt = makePrompt("prompt-2", "Second target", ["demo", "x"]);
const thirdPrompt = makePrompt("prompt-3", "Third target", ["demo", "y"]);

function renderModal(prompts: Prompt[] = [basePrompt]) {
  return renderWithI18n(
    <QuickTagModal isOpen onClose={vi.fn()} prompts={prompts} />,
    { language: "en" },
  );
}

function tagInput(): HTMLElement {
  return screen.getByPlaceholderText("Enter a tag name, press Enter to add");
}

async function typeTag(value: string) {
  await act(async () => {
    fireEvent.change(tagInput(), { target: { value } });
  });
  await act(async () => {
    fireEvent.keyDown(tagInput(), { key: "Enter", code: "Enter" });
  });
}

describe("QuickTagModal", () => {
  beforeEach(() => {
    installWindowMocks({
      api: {
        prompt: {
          getAllTags: vi.fn().mockResolvedValue(["alpha", "gamma"]),
        },
      },
    });
    showToastMock.mockReset();
  });

  describe("single prompt", () => {
    it("persists and shows the new tag when the update resolves", async () => {
      const updatePrompt = vi.fn().mockResolvedValue(undefined);
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal();
      });

      await typeTag("beta");

      await waitFor(() => {
        expect(updatePrompt).toHaveBeenCalledWith(basePrompt.id, {
          tags: ["demo", "beta"],
        });
      });
      expect(screen.getAllByText("beta")).toHaveLength(1);
      expect(showToastMock).toHaveBeenCalledWith("Tag added", "success");
    });

    it("reverts the visible tag list when the update fails", async () => {
      const updatePrompt = vi
        .fn()
        .mockRejectedValue(new Error("database is locked"));
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal();
      });

      await typeTag("beta");

      await waitFor(() => {
        expect(updatePrompt).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(screen.queryByText("beta")).toBeNull();
      });
      expect(screen.getByText("demo")).toBeInTheDocument();
      expect(showToastMock).toHaveBeenCalledWith("Error", "error");
      expect(showToastMock).not.toHaveBeenCalledWith("Tag added", "success");
    });

    it("blocks the Enter path while a previous save request is pending", async () => {
      let firstResolve: () => void = () => {};
      const updatePrompt = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              firstResolve = resolve;
            }),
        )
        .mockResolvedValue(undefined);
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal();
      });

      await typeTag("beta");
      await waitFor(() => {
        expect(updatePrompt).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        fireEvent.change(tagInput(), { target: { value: "epsilon" } });
        fireEvent.keyDown(tagInput(), { key: "Enter", code: "Enter" });
      });

      expect(updatePrompt).toHaveBeenCalledTimes(1);

      await act(async () => {
        firstResolve();
      });
      await waitFor(() => {
        expect(showToastMock).toHaveBeenCalledWith("Tag added", "success");
      });
      expect(updatePrompt).toHaveBeenCalledTimes(1);
    });

    it("warns without persisting when the tag already exists", async () => {
      const updatePrompt = vi.fn();
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal();
      });

      await typeTag("demo");

      expect(showToastMock).toHaveBeenCalledWith(
        "Tag already exists",
        "warning",
      );
      expect(updatePrompt).not.toHaveBeenCalled();
    });

    it("reverts the removed tag chip when the update fails", async () => {
      const updatePrompt = vi
        .fn()
        .mockRejectedValue(new Error("write conflict"));
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("demo remove"));
      });

      await waitFor(() => {
        expect(updatePrompt).toHaveBeenCalledWith(basePrompt.id, {
          tags: [],
        });
      });
      await waitFor(() => {
        expect(screen.getByText("demo")).toBeInTheDocument();
      });
    });

    it("renders existing-tag suggestions excluding current tags", async () => {
      usePromptStore.setState({
        updatePrompt: vi.fn(),
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal();
      });

      await waitFor(() => {
        expect(screen.getByText("alpha")).toBeInTheDocument();
        expect(screen.getByText("gamma")).toBeInTheDocument();
      });
    });

    it("renders nothing without prompts", async () => {
      await act(async () => {
        renderModal([]);
      });
      expect(
        screen.queryByPlaceholderText("Enter a tag name, press Enter to add"),
      ).toBeNull();
    });
  });

  describe("batch mode", () => {
    it("shows only the shared tags of the selection", async () => {
      usePromptStore.setState({
        updatePrompt: vi.fn(),
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal([otherPrompt, thirdPrompt]);
      });

      expect(screen.getByText(/Tag 2 prompts/i)).toBeInTheDocument();
      expect(screen.getByText("demo")).toBeInTheDocument();
      expect(screen.queryByText("x")).toBeNull();
      expect(screen.queryByText("y")).toBeNull();
    });

    it("applies the tag to every selected prompt", async () => {
      const updatePrompt = vi.fn().mockResolvedValue(undefined);
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal([otherPrompt, thirdPrompt]);
      });

      await typeTag("beta");

      await waitFor(() => {
        expect(updatePrompt).toHaveBeenCalledWith(otherPrompt.id, {
          tags: ["demo", "x", "beta"],
        });
        expect(updatePrompt).toHaveBeenCalledWith(thirdPrompt.id, {
          tags: ["demo", "y", "beta"],
        });
      });
      expect(showToastMock).toHaveBeenCalledWith(
        "Tag added to 2 prompts",
        "success",
      );
      expect(screen.getByText("beta")).toBeInTheDocument();
    });

    it("reports a partial failure and keeps persisted prompts tagged", async () => {
      const updatePrompt = vi
        .fn()
        .mockImplementation((id: string) =>
          id === otherPrompt.id
            ? Promise.resolve(undefined)
            : Promise.reject(new Error("locked")),
        );
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal([otherPrompt, thirdPrompt]);
      });

      await typeTag("beta");

      await waitFor(() => {
        expect(showToastMock).toHaveBeenCalledWith(
          "1 of 2 prompts failed to update",
          "error",
        );
      });
      // The intersection view must drop the tag because one prompt failed.
      expect(screen.queryByText("beta")).toBeNull();
    });

    it("removes the shared tag from every prompt with per-prompt lists", async () => {
      const updatePrompt = vi.fn().mockResolvedValue(undefined);
      usePromptStore.setState({
        updatePrompt,
      } as Partial<ReturnType<typeof usePromptStore.getState>>);

      await act(async () => {
        renderModal([otherPrompt, thirdPrompt]);
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("demo remove"));
      });

      await waitFor(() => {
        expect(updatePrompt).toHaveBeenCalledWith(otherPrompt.id, {
          tags: ["x"],
        });
        expect(updatePrompt).toHaveBeenCalledWith(thirdPrompt.id, {
          tags: ["y"],
        });
      });
      expect(showToastMock).toHaveBeenCalledWith(
        "Tag removed from 2 prompts",
        "success",
      );
    });
  });
});
