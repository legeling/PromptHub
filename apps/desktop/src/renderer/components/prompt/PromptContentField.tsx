import type { ReactNode, RefObject } from "react";
import { PromptDetailRow } from "./PromptDetailRow";
import { handleMarkdownListKeyDown } from "../ui/Textarea";

interface PromptContentFieldProps {
  /** Field label, e.g. "System Prompt". */
  label: string;
  labelIcon?: ReactNode;
  /** Show the EN badge beside the label. */
  showEnglishBadge: boolean;
  /** Whether the detail view is in inline-edit mode. */
  isEditing: boolean;
  /** Draft value bound to the textarea while editing. */
  value: string;
  onChange: (next: string) => void;
  /** Textarea ref owned by the parent (for focus management). */
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** Shared key handler for save/cancel shortcuts. */
  onEditKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Enter inline edit for this field (double-click / keyboard). */
  onStartEdit: () => void;
  /** Rendered (markdown/plain) content for the view state. */
  renderedContent: ReactNode;
  /** ARIA label for the editable view container. */
  editAriaLabel: string;
  textareaClassName: string;
  rows: number;
  /** Optional control rendered at the right of the label row (e.g. markdown toggle). */
  headerAction?: ReactNode;
}

export function PromptContentField({
  label,
  labelIcon,
  showEnglishBadge,
  isEditing,
  value,
  onChange,
  textareaRef,
  onEditKeyDown,
  onStartEdit,
  renderedContent,
  editAriaLabel,
  textareaClassName,
  rows,
  headerAction,
}: PromptContentFieldProps) {
  return (
    <PromptDetailRow
      icon={labelIcon}
      label={
        <>
          {label}
          {showEnglishBadge && (
            <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] text-primary">
              EN
            </span>
          )}
        </>
      }
      action={headerAction}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            const handled = handleMarkdownListKeyDown(
              event,
              value,
              (newValue, cursorPos) => {
                onChange(newValue);
                requestAnimationFrame(() => {
                  textareaRef.current?.setSelectionRange(cursorPos, cursorPos);
                });
              },
            );
            if (handled) {
              return;
            }
            onEditKeyDown(event);
          }}
          className={textareaClassName}
          rows={rows}
          spellCheck={false}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={editAriaLabel}
          onDoubleClick={onStartEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onStartEdit();
            }
          }}
          className="min-w-0 cursor-text rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {renderedContent}
        </div>
      )}
    </PromptDetailRow>
  );
}
