import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/Toast";
import { usePromptAiWorkbench } from "./usePromptAiWorkbench";
import { usePromptDetailInlineEditor } from "./usePromptDetailInlineEditor";
import { usePromptWorkspaceDerived } from "./usePromptWorkspaceDerived";
import { usePromptWorkspaceInteractionBindings } from "./usePromptWorkspaceInteractionBindings";
import { usePromptWorkspaceState } from "./usePromptWorkspaceState";
import { usePromptWorkspaceStoreBindings } from "./usePromptWorkspaceStoreBindings";

function usePromptWorkspaceBase() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const stores = usePromptWorkspaceStoreBindings();
  const state = usePromptWorkspaceState(stores.preferences.renderMarkdown);
  const ai = usePromptAiWorkbench(state.ai.inlineAiTestImages);
  return { ai, i18n, showToast, state, stores, t };
}

function usePromptWorkspacePresentation(
  base: ReturnType<typeof usePromptWorkspaceBase>,
) {
  const { promptData } = base.stores;
  useFolderSelectionReset(
    base.stores.folderData.selectedFolderId,
    base.stores.promptActions.selectPrompt,
  );
  const derived = usePromptWorkspaceDerived({
    ...promptData,
    ...base.stores.folderData,
    language: base.i18n.language,
    setCollapsedPromptIds: base.state.detail.setCollapsedPromptIds,
    setShowEnglish: base.state.detail.setShowEnglish,
    selectPrompt: base.stores.promptActions.selectPrompt,
    t: base.t,
  });
  const inlineEditor = usePromptDetailInlineEditor(
    derived.selectedPrompt,
    base.state.detail.showEnglish,
  );
  useTagDropReset(promptData.selectedId, base.state.detail.setIsTagDropActive);
  return { derived, inlineEditor };
}

function useFolderSelectionReset(
  folderId: string | null,
  selectPrompt: (id: string | null) => void,
) {
  useEffect(() => selectPrompt(null), [folderId, selectPrompt]);
}

function useTagDropReset(
  selectedId: string | null,
  setIsTagDropActive: (active: boolean) => void,
) {
  useEffect(() => setIsTagDropActive(false), [selectedId, setIsTagDropActive]);
}

function usePromptWorkspaceActions(
  base: ReturnType<typeof usePromptWorkspaceBase>,
  presentation: ReturnType<typeof usePromptWorkspacePresentation>,
) {
  return usePromptWorkspaceInteractionBindings({
    ai: base.ai,
    derived: presentation.derived,
    showToast: base.showToast,
    state: base.state,
    stores: base.stores,
    t: base.t,
  });
}

export function usePromptWorkspaceController() {
  const base = usePromptWorkspaceBase();
  const presentation = usePromptWorkspacePresentation(base);
  const actions = usePromptWorkspaceActions(base, presentation);
  return { ...base, ...presentation, actions };
}
