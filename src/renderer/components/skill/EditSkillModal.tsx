import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, SaveIcon, LoaderIcon, AlertCircleIcon, TagIcon, PlusIcon, XCircleIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useSkillStore } from '../../stores/skill.store';
import type { Skill } from '../../../shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';

interface EditSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: Skill | null;
}

// Skill name validation regex: lowercase alphanumeric with single hyphen separators
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function EditSkillModal({ isOpen, onClose, skill }: EditSkillModalProps) {
  const { t } = useTranslation();
  const updateSkill = useSkillStore((state) => state.updateSkill);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [version, setVersion] = useState('');
  const [author, setAuthor] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // Name validation state
  const [nameError, setNameError] = useState<string | null>(null);
  
  // Editor view state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [instrTab, setInstrTab] = useState<'edit' | 'preview'>('edit');
  
  // Ref to hold save handler (defined after conditional return but needed in useEffect)
  const saveRef = useRef<() => void>(() => {});

  // Initialize form when skill changes
  useEffect(() => {
    if (skill) {
      setName(skill.name || '');
      setDescription(skill.description || '');
      setInstructions(skill.instructions || skill.content || '');
      setVersion(skill.version || '1.0.0');
      setAuthor(skill.author || '');
      setTags(skill.tags || []);
      setError(null);
      setNameError(null);
    }
  }, [skill]);

  // All hooks MUST be declared before any conditional return
  const handleEnterNativeFullscreen = useCallback(() => {
    setIsNativeFullscreen(true);
    window.electron?.enterFullscreen?.();
  }, []);

  const handleExitNativeFullscreen = useCallback(() => {
    setIsNativeFullscreen(false);
    window.electron?.exitFullscreen?.();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveRef.current();
      }
      if (e.key === 'Escape' && isNativeFullscreen) {
        handleExitNativeFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isNativeFullscreen, handleExitNativeFullscreen]);

  if (!isOpen || !skill) return null;

  const validateName = (value: string): boolean => {
    if (!value.trim()) {
      setNameError(t('skill.nameRequired', '技能名称不能为空'));
      return false;
    }
    if (value.length > 64) {
      setNameError(t('skill.nameTooLong', '名称不能超过64个字符'));
      return false;
    }
    if (!SKILL_NAME_REGEX.test(value)) {
      setNameError(t('skill.nameInvalid', '名称格式无效（仅限小写字母、数字和连字符）'));
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    // Validate
    if (!validateName(name)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await updateSkill(skill.id, {
        name,
        description: description || undefined,
        instructions,
        content: instructions,
        version: version || '1.0.0',
        author: author || undefined,
        tags,
      });
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.updateFailed', '更新失败'));
    } finally {
      setIsLoading(false);
    }
  };
  saveRef.current = handleSave;

  const handleClose = () => {
    setError(null);
    setNameError(null);
    setIsFullscreen(false);
    setIsNativeFullscreen(false);
    setInstrTab('edit');
    onClose();
  };

  // Native fullscreen: split-screen editor + preview
  if (isNativeFullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{t('skill.instructions', '指令 (SKILL.md)')}</h2>
            <span className="text-sm text-muted-foreground">{t('common.markdownSupported', 'Supports Markdown')}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" />
              {t('common.exitFullscreen', 'Exit Fullscreen')}
            </button>
            <button
              onClick={() => { handleSave(); handleExitNativeFullscreen(); }}
              disabled={isLoading || !!nameError}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <SaveIcon className="w-4 h-4" />
              {t('common.save', '保存')}
            </button>
          </div>
        </div>
        {/* Split-screen: left editor + right preview */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t('prompt.edit', '编辑')}
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 w-full p-6 resize-none bg-background border-none outline-none text-base font-mono leading-relaxed"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              autoFocus
              placeholder={t('skill.instructionsPlaceholder', '输入技能的系统提示词或 SKILL.md 内容...')}
            />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t('prompt.preview', '预览')}
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {instructions ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                    {instructions}
                  </ReactMarkdown>
                ) : (
                  <div className="text-muted-foreground text-sm italic">{t('skill.noContent', '暂无内容')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className={`relative bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col transition-all ${
        isFullscreen ? 'w-[95vw] h-[95vh]' : 'w-full max-w-2xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">{t('skill.edit', '编辑技能')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title={isFullscreen ? t('common.exitFullscreen', 'Exit Fullscreen') : t('common.fullscreen', 'Fullscreen')}
            >
              {isFullscreen ? <Minimize2Icon className="w-4 h-4" /> : <Maximize2Icon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('skill.skillName', '技能名称')} <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                setName(value);
                if (value) validateName(value);
              }}
              placeholder="my-skill-name"
              className={`w-full px-4 py-2.5 bg-muted/50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                nameError ? 'border-destructive' : 'border-border'
              }`}
            />
            {nameError && (
              <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                <AlertCircleIcon className="w-3 h-3" />
                {nameError}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('skill.nameHint', '仅限小写字母、数字和连字符，如 my-skill-name')}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('skill.skillDescription', '技能描述')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('skill.descriptionPlaceholder', '简短描述技能的功能')}
              className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Version & Author (side by side) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('skill.version', '版本')}</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('skill.author', '作者')}</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t('skill.authorPlaceholder', '作者名称')}
                className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('skill.tags', '标签')}</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
                >
                  <TagIcon className="w-3 h-3" />
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-0.5 hover:text-destructive transition-colors"
                  >
                    <XCircleIcon className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={t('skill.addTag', '添加标签')}
                className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="px-3 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Instructions (SKILL.md) with edit/preview tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">
                {t('skill.instructions', '指令 (SKILL.md)')}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                  <button
                    onClick={() => setInstrTab('edit')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      instrTab === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('prompt.edit', '编辑')}
                  </button>
                  <button
                    onClick={() => setInstrTab('preview')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      instrTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('prompt.preview', '预览')}
                  </button>
                </div>
                <button
                  onClick={handleEnterNativeFullscreen}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                  title={t('common.fullscreen', 'Fullscreen Edit')}
                >
                  <Maximize2Icon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {instrTab === 'edit' ? (
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t('skill.instructionsPlaceholder', '输入技能的系统提示词或 SKILL.md 内容...')}
                rows={isFullscreen ? 20 : 10}
                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            ) : (
              <div className={`p-4 rounded-lg bg-card border border-border text-sm break-words overflow-auto ${
                isFullscreen ? 'min-h-[400px]' : 'min-h-[200px]'
              }`}>
                {instructions ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                      {instructions}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm italic">{t('skill.noContent', '暂无内容')}</div>
                )}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('skill.instructionsHint', '支持 Markdown 格式，用于指导 AI 如何使用此技能')}
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-card">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !!nameError}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
            {t('common.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  );
}
