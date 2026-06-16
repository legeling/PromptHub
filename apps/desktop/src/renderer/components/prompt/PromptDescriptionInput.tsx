import { useRef, useState, type RefObject } from "react";
import type { useTranslation } from "react-i18next";
import type { Prompt } from "@prompthub/shared/types";
import {
  getActiveMentionQuery,
  insertPromptReference,
} from "./prompt-description-refs";
import { searchRelationCandidates } from "./prompt-relation-suggestions";

interface PromptDescriptionInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Input ref owned by the parent (focus management). */
  inputRef: RefObject<HTMLInputElement>;
  /** Shared save/cancel key handler. */
  onEditKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** All prompts, for @-mention search. */
  prompts: Prompt[];
  /** The prompt being edited, excluded from mention candidates. */
  currentPromptId: string;
  placeholder: string;
  ariaLabel: string;
  t: ReturnType<typeof useTranslation>["t"];
}

const MAX_MENTION_RESULTS = 6;

export function PromptDescriptionInput({
  value,
  onChange,
  inputRef,
  onEditKeyDown,
  prompts,
  currentPromptId,
  placeholder,
  ariaLabel,
  t,
}: PromptDescriptionInputProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const caretRef = useRef(0);

  const candidates =
    mentionQuery === null
      ? []
      : searchRelationCandidates(
          mentionQuery,
          prompts.filter((prompt) => prompt.id !== currentPromptId),
          MAX_MENTION_RESULTS,
        );
  const isOpen = mentionQuery !== null && candidates.length > 0;

  const refreshMentionState = (text: string, caret: number) => {
    caretRef.current = caret;
    const query = getActiveMentionQuery(text, caret);
    setMentionQuery(query);
    setActiveIndex(0);
  };

  const applyMention = (promptId: string) => {
    const { text, caret } = insertPromptReference(
      value,
      caretRef.current,
      promptId,
    );
    onChange(text);
    setMentionQuery(null);
    setActiveIndex(0);
    // Restore caret after the inserted marker on the next frame.
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(caret, caret);
      }
    });
  };

  return (
    <div className="relative mt-2">
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          refreshMentionState(next, event.target.selectionStart ?? next.length);
        }}
        onKeyUp={(event) => {
          const target = event.currentTarget;
          refreshMentionState(target.value, target.selectionStart ?? 0);
        }}
        onClick={(event) => {
          const target = event.currentTarget;
          refreshMentionState(target.value, target.selectionStart ?? 0);
        }}
        onKeyDown={(event) => {
          if (isOpen) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((prev) => (prev + 1) % candidates.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(
                (prev) => (prev - 1 + candidates.length) % candidates.length,
              );
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              applyMention(candidates[activeIndex].id);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMentionQuery(null);
              return;
            }
          }
          onEditKeyDown(event);
        }}
        onBlur={() => {
          // Delay so a click on a candidate registers before the popover closes.
          window.setTimeout(() => setMentionQuery(null), 120);
        }}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-border/70 bg-card px-3 text-sm text-foreground shadow-sm outline-none appearance-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
      />
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          <div className="px-2 py-1 text-[11px] text-muted-foreground">
            {t("prompt.relationships.mentionHint", "Link a prompt")}
          </div>
          {candidates.map((prompt, index) => (
            <button
              key={prompt.id}
              type="button"
              // onMouseDown (not onClick) so it fires before the input blur.
              onMouseDown={(event) => {
                event.preventDefault();
                applyMention(prompt.id);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                index === activeIndex
                  ? "bg-accent text-foreground"
                  : "text-foreground hover:bg-accent/60"
              }`}
            >
              <span className="truncate">{prompt.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
