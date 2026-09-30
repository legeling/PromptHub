import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, HashIcon, PlusIcon, CheckIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { usePromptStore } from '../../stores/prompt.store';
import { useToast } from '../ui/Toast';
import type { Prompt } from '@prompthub/shared/types';

interface QuickTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt | null;
}

export function QuickTagModal({ isOpen, onClose, prompt }: QuickTagModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load all existing tags and current prompt tags
  useEffect(() => {
    if (isOpen && prompt) {
      setCurrentTags(prompt.tags || []);
      setTagInput('');
      // Load all existing tags from all prompts
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
  }, [isOpen, prompt]);

  // Filter available tags (not already added)
  const availableTags = useMemo(() => {
    return allTags.filter((tag) => !currentTags.includes(tag));
  }, [allTags, currentTags]);

  // Filter tags based on input
  const filteredTags = useMemo(() => {
    if (!tagInput.trim()) return availableTags.slice(0, 10);
    return availableTags.filter((tag) =>
      tag.toLowerCase().includes(tagInput.toLowerCase())
    );
  }, [availableTags, tagInput]);

  const handleAddTag = async (tag: string) => {
    if (!prompt || !tag.trim()) return;

    const trimmedTag = tag.trim();
    if (currentTags.includes(trimmedTag)) {
      showToast(t('prompt.tagAlreadyExists', '标签已存在'), 'warning');
      return;
    }

    const newTags = [...currentTags, trimmedTag];
    setCurrentTags(newTags);
    setTagInput('');

    // Auto save
    try {
      setIsLoading(true);
      await updatePrompt(prompt.id, { tags: newTags });
      showToast(t('prompt.tagAdded', '标签已添加'), 'success');
    } catch (error) {
      showToast(t('common.error', '操作失败'), 'error');
      // Revert on error
      setCurrentTags(currentTags);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!prompt) return;

    const newTags = currentTags.filter((t) => t !== tag);
    setCurrentTags(newTags);

    try {
      setIsLoading(true);
      await updatePrompt(prompt.id, { tags: newTags });
      showToast(t('prompt.tagRemoved', '标签已移除'), 'success');
    } catch (error) {
      showToast(t('common.error', '操作失败'), 'error');
      setCurrentTags(currentTags);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.trim()) {
        handleAddTag(tagInput);
      }
    }
  };

  if (!prompt) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('prompt.quickAddTag', '快速添加标签')}>
      <div className="space-y-4 w-[400px]">
        {/* Prompt info */}
        <div className="text-sm text-muted-foreground truncate">
          {prompt.title}
        </div>

        {/* Current tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('prompt.currentTags', '当前标签')}</label>
          <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-muted/30 rounded-lg">
            {currentTags.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                {t('prompt.noTags', '暂无标签')}
              </span>
            ) : (
              currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  <HashIcon className="w-3 h-3" />
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isLoading}
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
          <label className="text-sm font-medium">{t('prompt.addNewTag', '添加新标签')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <HashIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t('prompt.tagInputPlaceholder', '输入标签名，按回车添加')}
                className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button
              onClick={() => tagInput.trim() && handleAddTag(tagInput)}
              disabled={!tagInput.trim() || isLoading}
              size="sm"
            >
              <PlusIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Existing tags suggestions */}
        {filteredTags.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('prompt.existingTags', '现有标签')}</label>
            <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-2 bg-muted/30 rounded-lg">
              {filteredTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleAddTag(tag)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/50 text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <PlusIcon className="w-3 h-3" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="ghost">
            {t('common.close', '关闭')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
