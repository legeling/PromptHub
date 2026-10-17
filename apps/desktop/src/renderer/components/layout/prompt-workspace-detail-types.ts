import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";
import type {
  CreatePromptRelationDTO,
  Prompt,
  PromptRelation,
  PromptSummary,
} from "@prompthub/shared/types";
import type { SelectOption } from "../ui/Select";
import type {
  DetailInlineEditDraft,
  DetailInlineEditField,
} from "./usePromptDetailInlineEditor";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export interface PromptWorkspaceDetailPaneProps {
  aiResponse: string | null;
  aiResponseModelLabel: string;
  aiThinking: string | null;
  cancelDetailInlineEdit: () => void;
  canSaveDetailInlineEdit: boolean;
  hasDetailInlineContent: boolean;
  childPrompts: PromptSummary[];
  copied: boolean;
  detailDescriptionInputRef: RefObject<HTMLInputElement>;
  detailInlineDraft: DetailInlineEditDraft;
  detailSystemPromptTextareaRef: RefObject<HTMLTextAreaElement>;
  detailTitleInputRef: RefObject<HTMLInputElement>;
  detailUserPromptTextareaRef: RefObject<HTMLTextAreaElement>;
  filterTags: string[];
  folderOptions: SelectOption[];
  handleAiTest: (
    prompt: Prompt,
    initialMode?: "single" | "compare" | "image",
  ) => void;
  handleCopyPrompt: (prompt: Prompt) => Promise<void>;
  handleDeletePrompt: (prompt: Prompt) => void;
  handleDetailInlineEditKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleDetailRemoveTag: (tag: string) => Promise<void>;
  handleDetailTagDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleDetailTagDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleDetailTagDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleMovePrompt: (
    prompt: Prompt,
    folderId: string | null | undefined,
  ) => Promise<void>;
  handleSharePrompt: (prompt: Prompt) => Promise<void>;
  handleTagFilterClick: (tag: string) => void;
  handleVersionHistory: (prompt: Prompt) => void;
  highlightTerms: string[];
  isAiResponseImage: boolean;
  isDetailInlineEditing: boolean;
  isDetailInlineSaving: boolean;
  isDetailOutputFormatOpen: boolean;
  isDetailRelationshipsOpen: boolean;
  isTagDropActive: boolean;
  isTestingAI: boolean;
  onCreateRelation: (data: CreatePromptRelationDTO) => Promise<void> | void;
  onDeleteRelation: (relationId: string) => Promise<void> | void;
  onDetachPrompt: (promptId: string) => Promise<void>;
  onRevealPrompt: (promptId: string) => boolean;
  openDetailInlineEdit: (field?: DetailInlineEditField) => void;
  outputFormatCount: number;
  parentPrompt: PromptSummary | null;
  relations: PromptRelation[];
  relationshipCount: number;
  renderMarkdownEnabled: boolean;
  toggleRenderMarkdown: () => void;
  saveDetailInlineEdit: () => Promise<void>;
  selectedPrompt: Prompt | undefined;
  setDetailInlineDraft: StateSetter<DetailInlineEditDraft>;
  setEditingPrompt: StateSetter<Prompt | null>;
  setIsDetailOutputFormatOpen: StateSetter<boolean>;
  setIsDetailRelationshipsOpen: StateSetter<boolean>;
  setIsVariableModalOpen: StateSetter<boolean>;
  setPreviewImage: StateSetter<string | null>;
  setQuickRewritePrompt: StateSetter<Prompt | null>;
  setShowEnglish: StateSetter<boolean>;
  shared: boolean;
  showEnglish: boolean;
  triggerCopied: () => void;
  uiLangTag: string;
}
