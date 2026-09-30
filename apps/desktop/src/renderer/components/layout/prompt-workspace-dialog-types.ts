import type { Dispatch, SetStateAction } from "react";
import type {
  CreatePromptRelationDTO,
  Prompt,
  PromptVersion,
} from "@prompthub/shared/types";
import type { ContextMenuItem } from "../ui/ContextMenu";
import type { usePromptAiWorkbench } from "./usePromptAiWorkbench";

type Setter<T> = Dispatch<SetStateAction<T>>;
type AiWorkbench = ReturnType<typeof usePromptAiWorkbench>;

export interface PromptWorkspaceDialogsProps {
  aiTestInitialMode: "single" | "compare" | "image";
  aiTestPrompt: Prompt | null;
  confirmDelete: () => Promise<void>;
  contextMenu: { x: number; y: number; prompt: Prompt } | null;
  copyPrompt: Prompt | null;
  copyPromptQueue: Prompt[];
  copyPromptQueueIndex: number;
  deleteConfirm: { isOpen: boolean; prompt: Prompt | null };
  detailPrompt: Prompt | null;
  editingPrompt: Prompt | null;
  handleCopyPrompt: (prompt: Prompt) => Promise<void>;
  handleRestoreVersion: (version: PromptVersion) => Promise<void>;
  handleSaveAiResponse: (promptId: string, response: string) => Promise<void>;
  handleUsageIncrement: (id: string, model?: string) => Promise<void>;
  isAiTestModalOpen: boolean;
  isAiTestVariableModalOpen: boolean;
  isComparingModels: boolean;
  isCompareVariableModalOpen: boolean;
  isCopyVariableModalOpen: boolean;
  isDetailModalOpen: boolean;
  isTestingAI: boolean;
  isVariableModalOpen: boolean;
  isVersionModalOpen: boolean;
  menuItems: ContextMenuItem[];
  onCreateRelation: (data: CreatePromptRelationDTO) => Promise<void> | void;
  onDeleteRelation: (relationId: string) => Promise<void> | void;
  previewImage: string | null;
  quickRewritePrompt: Prompt | null;
  quickTagPrompts: Prompt[];
  runAiTest: AiWorkbench["runAiTest"];
  runModelCompare: AiWorkbench["runModelCompare"];
  selectedPrompt: Prompt | undefined;
  setAiTestPrompt: Setter<Prompt | null>;
  setContextMenu: Setter<{ x: number; y: number; prompt: Prompt } | null>;
  setCopyPrompt: Setter<Prompt | null>;
  setCopyPromptQueue: Setter<Prompt[]>;
  setCopyPromptQueueIndex: Setter<number>;
  setCopyPromptResults: Setter<string[]>;
  setCopyPromptSourceId: Setter<string | null>;
  setDeleteConfirm: Setter<{ isOpen: boolean; prompt: Prompt | null }>;
  setDetailPrompt: Setter<Prompt | null>;
  setEditingPrompt: Setter<Prompt | null>;
  setIsAiTestModalOpen: Setter<boolean>;
  setIsAiTestVariableModalOpen: Setter<boolean>;
  setIsCompareVariableModalOpen: Setter<boolean>;
  setIsCopyVariableModalOpen: Setter<boolean>;
  setIsDetailModalOpen: Setter<boolean>;
  setIsVariableModalOpen: Setter<boolean>;
  setIsVersionModalOpen: Setter<boolean>;
  setPreviewImage: Setter<string | null>;
  setQuickRewritePrompt: Setter<Prompt | null>;
  setQuickTagPrompts: Setter<Prompt[]>;
  setVersionHistoryPrompt: Setter<Prompt | null>;
  showEnglish: boolean;
  triggerCopied: () => void;
  versionHistoryPrompt: Prompt | null;
}
