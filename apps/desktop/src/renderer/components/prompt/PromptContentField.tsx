import type { ReactNode, RefObject } from "react";
import { handleMarkdownListKeyDown } from "../ui/Textarea";

interface PromptContentFieldProps {
  /** Field label, e.g. "System Prompt". */
  label: string;
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
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          {label}
          {showEnglishBadge && (
            <span className="px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              EN
            </span>
          )}
        </span>
        {headerAction}
      </div>
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
          className="cursor-text rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {renderedContent}
        </div>
      )}
    </div>
  );
}
