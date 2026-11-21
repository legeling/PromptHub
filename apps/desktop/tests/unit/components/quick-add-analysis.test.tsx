import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { QuickAddModal } from "../../../src/renderer/components/prompt/QuickAddModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const completion = vi.hoisted(() => vi.fn());
vi.mock("../../../src/renderer/services/ai", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/renderer/services/ai")
  >()),
  chatCompletion: (...args: unknown[]) => completion(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Harness({
  onCreate,
}: Pick<ComponentProps<typeof QuickAddModal>, "onCreate">) {
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider>
      <button onClick={() => setOpen(true)}>Open quick add</button>
      <button onClick={() => setOpen(false)}>Close quick add</button>
      <QuickAddModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onCreate={onCreate}
      />
    </ToastProvider>
  );
}

function submit(content: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Paste your Prompt" }), {
    target: { value: content },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
}

describe("quick add background analysis", () => {
  beforeEach(() => {
    installWindowMocks();
    completion.mockReset();
    useFolderStore.setState({ folders: [] });
    usePromptStore.setState({ prompts: [] });
    useSettingsStore.setState({
      aiModels: [],
      scenarioModelDefaults: {},
      modelRouteDefaults: {},
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "fixture-key",
      aiApiUrl: "https://example.com/v1",
      aiModel: "fixture-model",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves usable titles immediately and routes out-of-order results to their own records after reopen", async () => {
    const first = deferred<{ content: string }>();
    const second = deferred<{ content: string }>();
    completion
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: "first" })
      .mockResolvedValueOnce({ id: "second" });
    const update = vi
      .spyOn(usePromptStore.getState(), "updatePrompt")
      .mockResolvedValue();
    await renderWithI18n(<Harness onCreate={create} />, {
      language: "en",
      reactStrictMode: true,
    });
    submit("[主题]\nFirst landscape prompt");
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Open quick add"));
    submit("Second portrait prompt");
    await waitFor(() => expect(completion).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ content: '{"title":"Portrait","tags":["portrait"]}' });
    });
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "second",
        expect.objectContaining({ title: "Portrait", tags: ["portrait"] }),
      ),
    );
    await act(async () => {
      first.resolve({ content: '{"title":"Landscape","tags":["landscape"]}' });
    });
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "first",
        expect.objectContaining({ title: "Landscape", tags: ["landscape"] }),
      ),
    );
    expect(create.mock.calls.map(([data]) => data.title)).toEqual([
      "First landscape prompt",
      "Second portrait prompt",
    ]);
    expect(create.mock.calls[0][0].userPrompt).toBe(
      "[主题]\nFirst landscape prompt",
    );
    expect(update).toHaveBeenCalledTimes(2);
  });

  it.each(["{}", '{"title":""}', "not JSON", "network-error"])(
    "preserves the saved prompt and reports analysis failure for %s",
    async (response) => {
      const pending = deferred<{ content: string }>();
      completion.mockReturnValue(pending.promise);
      const create = vi.fn().mockResolvedValue({ id: "saved" });
      const update = vi
        .spyOn(usePromptStore.getState(), "updatePrompt")
        .mockResolvedValue();
      await renderWithI18n(<Harness onCreate={create} />, { language: "en" });
      submit("Original content");
      await waitFor(() =>
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText("Open quick add"));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Next unsaved prompt" },
      });
      await act(async () => {
        if (response === "network-error")
          pending.reject(new Error("Provider unavailable"));
        else pending.resolve({ content: response });
      });
      expect(
        await screen.findByText(
          '"Original content" was saved, but AI analysis failed. You can edit its title and tags.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveValue("Next unsaved prompt");
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Original content",
          userPrompt: "Original content",
        }),
      );
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("reports a metadata write failure without attempting a second destructive title write", async () => {
    completion.mockResolvedValue({
      content: '{"title":"AI title","tags":["art"]}',
    });
    const update = vi
      .spyOn(usePromptStore.getState(), "updatePrompt")
      .mockRejectedValue(new Error("Disk unavailable"));
    await renderWithI18n(
      <Harness onCreate={vi.fn().mockResolvedValue({ id: "saved" })} />,
      { language: "en" },
    );
    submit("Preserved content");
    expect(
      await screen.findByText(
        '"Preserved content" was saved, but its AI analysis could not be saved.',
      ),
    ).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it.each(["null", "throw"])(
    "keeps input and allows retry when creation fails (%s)",
    async (failure) => {
      const create = vi.fn();
      if (failure === "null") create.mockResolvedValueOnce(null);
      else create.mockRejectedValueOnce(new Error("Create failed"));
      create.mockResolvedValueOnce({ id: "retried" });
      completion.mockResolvedValue({ content: '{"title":"Recovered"}' });
      vi.spyOn(usePromptStore.getState(), "updatePrompt").mockResolvedValue();
      await renderWithI18n(<Harness onCreate={create} />, { language: "en" });
      submit("Keep my input");
      expect(
        await screen.findByText(
          "Prompt creation failed. Your input has been kept; please try again.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveValue("Keep my input");
      expect(completion).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "Create" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
      );
      expect(create).toHaveBeenCalledTimes(2);
    },
  );

  it("does not duplicate a pending save or let that save close a reopened dialog", async () => {
    const pending = deferred<{ id: string }>();
    const create = vi.fn().mockReturnValue(pending.promise);
    completion.mockResolvedValue({ content: '{"title":"First result"}' });
    const update = vi
      .spyOn(usePromptStore.getState(), "updatePrompt")
      .mockResolvedValue();
    await renderWithI18n(<Harness onCreate={create} />, { language: "en" });
    submit("First input");
    fireEvent.click(
      screen.getByRole("button", { name: "Create" }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Close quick add"));
    fireEvent.click(screen.getByText("Open quick add"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Second draft" },
    });
    await act(async () => {
      pending.resolve({ id: "first" });
    });
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "first",
        expect.objectContaining({ title: "First result" }),
      ),
    );
    expect(screen.getByRole("textbox")).toHaveValue("Second draft");
    expect(
      screen.getByRole("button", { name: "Create" }),
    ).toBeEnabled();
  });
});
