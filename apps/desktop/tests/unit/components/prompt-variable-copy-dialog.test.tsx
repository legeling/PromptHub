import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { PromptWorkspaceVariableDialogs } from "../../../src/renderer/components/layout/PromptWorkspaceVariableDialogs";
import type { PromptWorkspaceDialogsProps } from "../../../src/renderer/components/layout/prompt-workspace-dialog-types";
import { copyTextToClipboard } from "../../../src/renderer/components/prompt/prompt-copy-utils";

const incrementUsageCount = vi.fn();

vi.mock("../../../src/renderer/stores/prompt.store", () => ({
  usePromptStore: (selector: (state: unknown) => unknown) =>
    selector({ incrementUsageCount }),
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ showCopyNotification: false }),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock(
  "../../../src/renderer/components/prompt/prompt-copy-utils",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../src/renderer/components/prompt/prompt-copy-utils")
      >();
    return {
      ...actual,
      copyTextToClipboard: vi.fn(),
    };
  },
);

vi.mock("../../../src/renderer/components/prompt/VariableInputModal", () => ({
  VariableInputModal: (props: {
    onClose: () => void;
    onCopy?: (text: string) => Promise<void>;
  }) => (
    <>
      <button type="button" onClick={props.onClose}>
        cancel-variable-copy
      </button>
      <button
        type="button"
        onClick={() => void props.onCopy?.("resolved").catch(() => undefined)}
      >
        complete-variable-copy
      </button>
    </>
  ),
}));

function createPrompt(): Prompt {
  return {
    id: "target",
    title: "Target",
    description: "",
    systemPrompt: "",
    userPrompt: "{{topic}}",
    variables: [],
    tags: [],
    folderId: null,
    parentId: null,
    order: 0,
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}

function createProps(): PromptWorkspaceDialogsProps {
  const noop = vi.fn();
  return {
    aiTestInitialMode: "single",
    aiTestPrompt: null,
    confirmDelete: vi.fn(),
    contextMenu: null,
    copyPrompt: createPrompt(),
    copyPromptQueue: [],
    copyPromptQueueIndex: -1,
    copyPromptSourceId: "source",
    deleteConfirm: { isOpen: false, prompt: null },
    detailPrompt: null,
    editingPrompt: null,
    quickTagPrompts: null,
    setQuickTagPrompts: noop,
    onDetachPrompt: vi.fn().mockResolvedValue(undefined),
    onRevealPrompt: vi.fn().mockReturnValue(true),
    handleCopyPrompt: vi.fn(),
    handleRestoreVersion: vi.fn(),
    handleSaveAiResponse: vi.fn(),
    handleUsageIncrement: vi.fn(),
    isAiTestModalOpen: false,
    isAiTestVariableModalOpen: false,
    isComparingModels: false,
    isCompareVariableModalOpen: false,
    isCopyVariableModalOpen: true,
    isDetailModalOpen: false,
    isTestingAI: false,
    isVariableModalOpen: false,
    isVersionModalOpen: false,
    menuItems: [],
    onCreateRelation: noop,
    onDeleteRelation: noop,
    previewImage: null,
    quickRewritePrompt: null,
    runAiTest: vi.fn(),
    runModelCompare: vi.fn(),
    selectedPrompt: undefined,
    setAiTestPrompt: noop,
    setContextMenu: noop,
    setCopyPrompt: vi.fn(),
    setCopyPromptQueue: vi.fn(),
    setCopyPromptQueueIndex: vi.fn(),
    setCopyPromptResults: vi.fn(),
    setCopyPromptSourceId: vi.fn(),
    setDeleteConfirm: noop,
    setDetailPrompt: noop,
    setEditingPrompt: noop,
    setIsAiTestModalOpen: noop,
    setIsAiTestVariableModalOpen: noop,
    setIsCompareVariableModalOpen: noop,
    setIsCopyVariableModalOpen: vi.fn(),
    setIsDetailModalOpen: noop,
    setIsVariableModalOpen: noop,
    setIsVersionModalOpen: noop,
    setPreviewImage: noop,
    setQuickRewritePrompt: noop,
    setVersionHistoryPrompt: noop,
    showEnglish: false,
    triggerCopied: vi.fn(),
    versionHistoryPrompt: null,
  };
}

describe("Prompt workspace variable copy dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyTextToClipboard).mockResolvedValue(undefined);
  });

  it("clears the full copy queue when variable entry is cancelled", async () => {
    const props = createProps();
    render(<PromptWorkspaceVariableDialogs {...props} />);

    fireEvent.click(await screen.findByText("cancel-variable-copy"));

    expect(props.setCopyPrompt).toHaveBeenCalledWith(null);
    expect(props.setCopyPromptQueue).toHaveBeenCalledWith([]);
    expect(props.setCopyPromptResults).toHaveBeenCalledWith([]);
    expect(props.setCopyPromptQueueIndex).toHaveBeenCalledWith(-1);
    expect(props.setCopyPromptSourceId).toHaveBeenCalledWith(null);
  });

  it("does not count usage and clears copy state after clipboard failure", async () => {
    vi.mocked(copyTextToClipboard).mockRejectedValue(
      new Error("clipboard unavailable"),
    );
    const props = createProps();
    render(<PromptWorkspaceVariableDialogs {...props} />);

    fireEvent.click(await screen.findByText("complete-variable-copy"));

    await waitFor(() =>
      expect(props.setCopyPromptSourceId).toHaveBeenCalledWith(null),
    );
    expect(incrementUsageCount).not.toHaveBeenCalled();
    expect(props.setCopyPrompt).toHaveBeenCalledWith(null);
    expect(props.setCopyPromptQueue).toHaveBeenCalledWith([]);
    expect(props.setCopyPromptResults).toHaveBeenCalledWith([]);
    expect(props.setCopyPromptQueueIndex).toHaveBeenCalledWith(-1);
  });
});
