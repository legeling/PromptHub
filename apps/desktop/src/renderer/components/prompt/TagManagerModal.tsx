import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EditIcon, Trash2Icon, SearchIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { usePromptStore } from '../../stores/prompt.store';
import { useSkillStore } from '../../stores/skill.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import { scheduleAllSaveSync } from '../../services/webdav-save-sync';
import { getExistingSkillTags, getUserSkillTags } from '../skill/skill-modal-utils';
import { mergePromptTagCatalog } from './prompt-modal-utils';

interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType?: 'prompt' | 'skill';
}

export function TagManagerModal({
  isOpen,
  onClose,
  resourceType = 'prompt',
}: TagManagerModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const prompts = usePromptStore((state) => state.prompts);
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const skills = useSkillStore((state) => state.skills);
  const updateSkill = useSkillStore((state) => state.updateSkill);
  const promptTagCatalog = useSettingsStore((state) => state.promptTagCatalog);
  const addPromptTagCatalogEntry = useSettingsStore((state) => state.addPromptTagCatalogEntry);
  const renamePromptTagCatalogEntry = useSettingsStore((state) => state.renamePromptTagCatalogEntry);
  const deletePromptTagCatalogEntry = useSettingsStore((state) => state.deletePromptTagCatalogEntry);
  const tagFilterMode = useSettingsStore((state) => state.tagFilterMode);
  const setTagFilterMode = useSettingsStore((state) => state.setTagFilterMode);

  const [promptTags, setPromptTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [processingTag, setProcessingTag] = useState<string | null>(null);

  const isSkillManager = resourceType === 'skill';
  const skillTags = useMemo(() => getExistingSkillTags(skills), [skills]);
  const tags = isSkillManager ? skillTags : promptTags;

  const loadPromptTags = useCallback(async () => {
    try {
      setLoading(true);
      const allTags = await window.api.prompt.getAllTags();
      setPromptTags(mergePromptTagCatalog(prompts, [...promptTagCatalog, ...allTags]));
    } catch (error) {
      console.error('Failed to load tags:', error);
      showToast(t('common.error', 'Error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [promptTagCatalog, prompts, showToast, t]);

  useEffect(() => {
    if (isOpen) {
      if (!isSkillManager) {
        void loadPromptTags();
      }
    } else {
      setSearch('');
      setEditingTag(null);
      setProcessingTag(null);
    }
  }, [isOpen, isSkillManager, loadPromptTags]);

  const handleRename = async (oldTag: string) => {
    const newTag = editValue.trim();
    if (!newTag || newTag === oldTag) {
      setEditingTag(null);
      return;
    }
    if (tags.includes(newTag)) {
      // If target exists, just confirm as it will merge
    }

    try {
      setProcessingTag(oldTag);

      if (isSkillManager) {
        const matchedSkills = skills.filter((skill) =>
          getUserSkillTags(skill).includes(oldTag),
        );

        const results = await Promise.allSettled(
          matchedSkills.map(async (skill) => {
            const nextTags = Array.from(
              new Set((skill.tags || []).map((tag) => (tag === oldTag ? newTag : tag))),
            );
            await updateSkill(skill.id, { tags: nextTags });
          }),
        );

        if (results.some((result) => result.status === 'rejected')) {
          throw new Error(`Failed to rename skill tag: ${oldTag}`);
        }
      } else {
        await window.api.prompt.renameTag(oldTag, newTag);
        renamePromptTagCatalogEntry(oldTag, newTag);
        await fetchPrompts();
        await loadPromptTags();
        scheduleAllSaveSync('tag renamed');
      }

      showToast(t('common.success', 'Success'), 'success');
    } catch (error) {
      console.error('Failed to rename tag:', error);
      showToast(t('common.error', 'Error'), 'error');
    } finally {
      setProcessingTag(null);
      setEditingTag(null);
    }
  };

  const handleDelete = async (tag: string) => {
    if (!window.confirm(t('common.confirmDelete', 'Are you sure you want to delete this?'))) {
      return;
    }

    try {
      setProcessingTag(tag);

      if (isSkillManager) {
        const matchedSkills = skills.filter((skill) =>
          getUserSkillTags(skill).includes(tag),
        );

        const results = await Promise.allSettled(
          matchedSkills.map(async (skill) => {
            const nextTags = (skill.tags || []).filter((item) => item !== tag);
            await updateSkill(skill.id, { tags: nextTags });
          }),
        );

        if (results.some((result) => result.status === 'rejected')) {
          throw new Error(`Failed to delete skill tag: ${tag}`);
        }
      } else {
        await window.api.prompt.deleteTag(tag);
        deletePromptTagCatalogEntry(tag);
        await fetchPrompts();
        await loadPromptTags();
        scheduleAllSaveSync('tag deleted');
      }

      showToast(t('common.success', 'Success'), 'success');
    } catch (error) {
      console.error('Failed to delete tag:', error);
      showToast(t('common.error', 'Error'), 'error');
    } finally {
      setProcessingTag(null);
    }
  };

  const filteredTags = useMemo(() => {
    if (!search.trim()) return tags;
    const lowerSearch = search.toLowerCase();
    return tags.filter((tag) => tag.toLowerCase().includes(lowerSearch));
  }, [tags, search]);

  const handleCreateTag = async () => {
    const nextTag = newTagValue.trim();
    if (!nextTag || tags.includes(nextTag)) {
      return;
    }

    try {
      setProcessingTag(nextTag);
      if (isSkillManager) {
        throw new Error('Skill tag creation is not supported here');
      }

      addPromptTagCatalogEntry(nextTag);
      await loadPromptTags();
      setNewTagValue('');
      showToast(t('common.success', 'Success'), 'success');
    } catch (error) {
      console.error('Failed to create tag:', error);
      showToast(t('common.error', 'Error'), 'error');
    } finally {
      setProcessingTag(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('nav.tags', 'Tags')}
      size="lg"
    >
      <div className="flex h-[56vh] max-h-[620px] flex-col">
        <div className="relative mb-4 shrink-0">
          <SearchIcon
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
          />
          <Input
            aria-label={t('prompt.filterByTag', 'Filter by tag')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search', 'Search...')}
            className="pl-9 w-full"
          />
        </div>

        {!isSkillManager ? (
          <div className="mb-4 shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {t('settings.tagFilterMode', 'Tag click mode')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(
                    'settings.tagFilterModeDesc',
                    'Choose whether clicking a tag replaces the current filter or adds to a multi-select filter',
                  )}
                </div>
              </div>
              <Select
                ariaLabel={t('settings.tagFilterMode', 'Tag click mode')}
                value={tagFilterMode}
                onChange={(value) => setTagFilterMode(value as 'single' | 'multi')}
                options={[
                  { value: 'single', label: t('settings.tagFilterModeSingle', 'Single select') },
                  { value: 'multi', label: t('settings.tagFilterModeMulti', 'Multi select') },
                ]}
                className="w-36 shrink-0"
              />
            </div>

            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={t('prompt.enterTagHint')}
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateTag();
                    }
                  }}
                  placeholder={t('prompt.enterTagHint')}
                  className="w-full"
                />
              </div>
              <Button
                type="button"
                onClick={() => void handleCreateTag()}
                disabled={!newTagValue.trim() || tags.includes(newTagValue.trim()) || processingTag !== null}
                className="shrink-0"
              >
                {t('prompt.addTag')}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-1">
          {loading ? (
            <div className="flex justify-center items-center h-full text-muted-foreground">
              <Loader2Icon className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="flex justify-center items-center h-full text-sm text-muted-foreground">
              {t('common.noData', 'No data')}
            </div>
          ) : (
            filteredTags.map((tag) => (
              <div
                key={tag}
                className="flex items-center justify-between group p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                {editingTag === tag ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <div className="flex-1 min-w-0">
                      <Input
                        autoFocus
                        aria-label={`${t('common.edit', 'Edit')} ${tag}`}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(tag);
                          if (e.key === 'Escape') setEditingTag(null);
                      }}
                      className="h-8"
                      disabled={processingTag === tag}
                    />
                    </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 shrink-0 rounded-lg px-0 text-green-600 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30"
                        onClick={() => handleRename(tag)}
                        disabled={processingTag === tag}
                        aria-label={`${t('common.save', 'Save')} ${tag}`}
                      >
                        {processingTag === tag ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 shrink-0 rounded-lg px-0"
                        onClick={() => setEditingTag(null)}
                        disabled={processingTag === tag}
                        aria-label={`${t('common.cancel', 'Cancel')} ${tag}`}
                      >
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </div>
                ) : (
                  <>
                    <span className="text-sm font-medium truncate flex-1" title={tag}>
                      {tag}
                    </span>
                    <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 rounded-lg px-0 text-muted-foreground hover:bg-background/80 hover:text-foreground"
                        onClick={() => {
                          setEditingTag(tag);
                          setEditValue(tag);
                        }}
                        disabled={processingTag !== null}
                        aria-label={`${t('common.edit', 'Edit')} ${tag}`}
                      >
                        <EditIcon className="h-[18px] w-[18px]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 rounded-lg px-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(tag)}
                        disabled={processingTag !== null}
                        aria-label={`${t('common.delete', 'Delete')} ${tag}`}
                      >
                        {processingTag === tag ? <Loader2Icon className="h-[18px] w-[18px] animate-spin" /> : <Trash2Icon className="h-[18px] w-[18px]" />}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
