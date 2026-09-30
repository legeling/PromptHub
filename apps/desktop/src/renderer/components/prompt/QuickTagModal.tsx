import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, HashIcon, PlusIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { usePromptStore } from '../../stores/prompt.store';
import { useToast } from '../ui/Toast';
import type { Prompt } from '@prompthub/shared/types';

interface QuickTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Prompts being tagged. One entry keeps the original single-prompt
   * behavior; more entries switch the dialog into batch mode where the
   * visible tag list is the intersection of the selection and writes are
   * applied to every selected prompt.
   */
  prompts: Prompt[];
}

function intersectTags(prompts: Prompt[]): string[] {
  if (prompts.length === 0) {
    return [];
  }
  return prompts[0].tags.filter((tag) =>
    prompts.every((prompt) => prompt.tags.includes(tag)),
  );
}

export function QuickTagModal({ isOpen, onClose, prompts }: QuickTagModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);

  const [workingPrompts, setWorkingPrompts] = useState<Prompt[]>(prompts);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const currentTags = useMemo(
    () => intersectTags(workingPrompts),
    [workingPrompts],
  );

  // Load the shared tag catalog and reset the working copy per opening.
  useEffect(() => {
    if (isOpen && prompts.length > 0) {
      setWorkingPrompts(prompts);
      setTagInput('');
      const loadAllTags = async () => {
        try {
          const tags = await window.api.prompt.getAllTags();
          setAllTags(tags);
        } catch (error) {
          console.error('Failed to load tags:', error);
        }
      };
      loadAllTags();
    }
  }, [isOpen, prompts]);

  const availableTags = useMemo(() => {
    return allTags.filter((tag) => !currentTags.includes(tag));
  }, [allTags, currentTags]);

  const filteredTags = useMemo(() => {
    if (!tagInput.trim()) return availableTags.slice(0, 10);
    return availableTags.filter((tag) =>
      tag.toLowerCase().includes(tagInput.toLowerCase()),
    );
  }, [availableTags, tagInput]);

  const applyTagsToSelection = async (
    mode: "add" | "remove",
    nextTagsFor: (tags: string[]) => string[],
  ) => {
    if (workingPrompts.length === 0 || isLoading) return;

    setIsLoading(true);
    const targets = workingPrompts.map((prompt) => ({
      id: prompt.id,
      tags: nextTagsFor(prompt.tags),
    }));

    const outcomes = await Promise.all(
      targets.map(async (target) => {
        try {
          await updatePrompt(target.id, { tags: target.tags });
          return true;
        } catch (error) {
          return false;
        }
      }),
    );

    // Merge per-prompt so a partial failure never rewinds the prompts that
    // were actually persisted.
    setWorkingPrompts((previous) =>
      previous.map((prompt, index) =>
        outcomes[index]
          ? { ...prompt, tags: targets[index].tags }
          : prompt,
      ),
    );

    const failed = outcomes.filter((ok) => !ok).length;
    const succeeded = outcomes.length - failed;
    const removed = mode === "remove";

    if (failed > 0) {
      showToast(
        targets.length === 1
          ? t('common.error', '操作失败')
          : t('prompt.batchTagPartial', {
              failed,
              total: targets.length,
              defaultValue: '{{failed}} of {{total}} prompts failed to update',
            }),
        'error',
      );
    }
    if (succeeded > 0) {
      showToast(
        succeeded === 1
          ? removed
            ? t('prompt.tagRemoved', 'Tag removed')
            : t('prompt.tagAdded', 'Tag added')
          : removed
            ? t('prompt.batchTagRemoved', {
                count: succeeded,
                defaultValue: 'Tag removed from {{count}} prompts',
              })
            : t('prompt.batchTagAdded', {
                count: succeeded,
                defaultValue: 'Tag added to {{count}} prompts',
              }),
        failed > 0 ? 'warning' : 'success',
      );
    }
    setIsLoading(false);
  };

  const handleAddTag = async (tag: string) => {
    if (!tag.trim()) return;
    const trimmedTag = tag.trim();
    if (currentTags.includes(trimmedTag)) {
      showToast(t('prompt.tagAlreadyExists', 'Tag already exists'), 'warning');
      return;
    }
    setTagInput('');
    await applyTagsToSelection("add", (tags) =>
      tags.includes(trimmedTag) ? tags : [...tags, trimmedTag],
    );
  };

  const handleRemoveTag = async (tag: string) => {
    await applyTagsToSelection(
      "remove",
      (tags) => tags.filter((item) => item !== tag),
    );
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      if (tagInput.trim()) {
        void handleAddTag(tagInput);
      }
    }
  };

  if (prompts.length === 0) return null;

  const isBatch = prompts.length > 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isBatch
          ? t('prompt.batchTagTitle', {
              count: prompts.length,
              defaultValue: 'Tag {{count}} prompts',
            })
          : t('prompt.quickAddTag', 'Add Tags')
      }
    >
      <div className="space-y-4 w-[400px]">
        {/* Prompt info */}
        <div className="text-sm text-muted-foreground truncate">
          {isBatch
            ? t('prompt.selected', { count: prompts.length })
            : prompts[0].title}
        </div>

        {/* Current tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('prompt.currentTags', 'Current Tags')}</label>
          <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-muted/30 rounded-lg">
            {currentTags.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                {isBatch
                  ? t('prompt.noSharedTags', 'No shared tags')
                  : t('prompt.noTags', 'No tags yet')}
              </span>
            ) : (
              currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  <HashIcon className="w-3 h-3" aria-hidden="true" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => void handleRemoveTag(tag)}
                    disabled={isLoading}
                    aria-label={`${tag} remove`}
                    className="ml-1 hover:text-destructive disabled:opacity-50"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Add new tag input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('prompt.addNewTag', 'Add New Tag')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <HashIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t('prompt.tagInputPlaceholder', 'Enter a tag name, press Enter to add')}
                className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button
              onClick={() => tagInput.trim() && void handleAddTag(tagInput)}
              disabled={!tagInput.trim() || isLoading}
              size="sm"
            >
              <PlusIcon className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Existing tags suggestions */}
        {filteredTags.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('prompt.existingTags', 'Existing Tags')}</label>
            <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-2 bg-muted/30 rounded-lg">
              {filteredTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => void handleAddTag(tag)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/50 text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <PlusIcon className="w-3 h-3" aria-hidden="true" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="ghost">
            {t('common.close', 'Close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
