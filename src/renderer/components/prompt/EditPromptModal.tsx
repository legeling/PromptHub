import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, Input, Textarea, UnsavedChangesDialog } from '../ui';
import { Select } from '../ui/Select';
import { HashIcon, XIcon, ImageIcon, Maximize2Icon, Minimize2Icon, PlusIcon, GlobeIcon, SparklesIcon, Loader2Icon } from 'lucide-react';
import { usePromptStore } from '../../stores/prompt.store';
import { useFolderStore } from '../../stores/folder.store';
import { useSettingsStore } from '../../stores/settings.store';
import { testAIConnection } from '../../services/ai';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/Toast';
import type { Prompt } from '../../../shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { defaultSchema } from 'hast-util-sanitize';
import { renderFolderIcon } from '../layout/folderIconHelper';

interface EditPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
}

export function EditPromptModal({ isOpen, onClose, prompt }: EditPromptModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const prompts = usePromptStore((state) => state.prompts);
  const folders = useFolderStore((state) => state.folders);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptEn, setSystemPromptEn] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [userPromptEn, setUserPromptEn] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>(undefined);

  const [images, setImages] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userTab, setUserTab] = useState<'edit' | 'preview'>('edit');
  const [systemTab, setSystemTab] = useState<'edit' | 'preview'>('edit');
  const [showEnglishVersion, setShowEnglishVersion] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [source, setSource] = useState('');
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);

  const settings = useSettingsStore();
  const sourceHistory = settings.sourceHistory;
  const addSourceHistory = settings.addSourceHistory;
  const defaultModel = settings.aiModels.find(m => m.isDefault);
  const canTranslate = !!defaultModel;

// Check for unsaved changes
  // 检查是否有未保存的更改
  const hasUnsavedChanges = useCallback(() => {
    if (!prompt) return false;
    return (
      title !== prompt.title ||
      description !== (prompt.description || '') ||
      systemPrompt !== (prompt.systemPrompt || '') ||
      systemPromptEn !== (prompt.systemPromptEn || '') ||
      userPrompt !== prompt.userPrompt ||
      userPromptEn !== (prompt.userPromptEn || '') ||
      JSON.stringify(tags) !== JSON.stringify(prompt.tags || []) ||
      JSON.stringify(images) !== JSON.stringify(prompt.images || []) ||
      folderId !== prompt.folderId ||
      source !== (prompt.source || '')
    );
  }, [prompt, title, description, systemPrompt, systemPromptEn, userPrompt, userPromptEn, tags, images, folderId, source]);

// Handle close request
  // 处理关闭请求
  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

// Handle save and close
  // 处理保存并关闭
  const handleSaveAndClose = async () => {
    await handleSubmit();
    setShowUnsavedDialog(false);
  };

// Handle discard changes
  // 处理放弃更改
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    onClose();
  };

  const sanitizeSchema: any = useMemo(() => {
    const schema = { ...defaultSchema, attributes: { ...defaultSchema.attributes } };
    schema.attributes.code = [...(schema.attributes.code || []), ['className']];
    schema.attributes.span = [...(schema.attributes.span || []), ['className']];
    schema.attributes.pre = [...(schema.attributes.pre || []), ['className']];
    return schema;
  }, []);

  const rehypePlugins = useMemo(
    () => [
      [rehypeHighlight, { ignoreMissing: true }] as any,
      [rehypeSanitize, sanitizeSchema] as any,
    ],
    [sanitizeSchema],
  );

  const markdownComponents = useMemo(() => ({
    h1: (props: any) => <h1 className="text-2xl font-bold mb-4 text-foreground" {...props} />,
    h2: (props: any) => <h2 className="text-xl font-semibold mb-3 mt-5 text-foreground" {...props} />,
    h3: (props: any) => <h3 className="text-lg font-semibold mb-3 mt-4 text-foreground" {...props} />,
    p: (props: any) => <p className="mb-3 leading-relaxed text-foreground/90" {...props} />,
    ul: (props: any) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    code: (props: any) => <code className="px-1 py-0.5 rounded bg-muted font-mono text-[13px]" {...props} />,
    pre: (props: any) => (
      <pre className="p-3 rounded-lg bg-muted overflow-x-auto text-[13px] leading-relaxed" {...props} />
    ),
    blockquote: (props: any) => (
      <blockquote className="border-l-4 border-border pl-3 text-muted-foreground italic mb-3" {...props} />
    ),
    hr: () => <hr className="my-4 border-border" />,
    a: (props: any) => <a className="text-primary hover:underline" {...props} target="_blank" rel="noreferrer" />,
  }), []);

  // 获取所有已存在的标签
  const existingTags = [...new Set(prompts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));

  // 当 prompt 变化时更新表单
  useEffect(() => {
    if (prompt) {
      setTitle(prompt.title);
      setDescription(prompt.description || '');
      setSystemPrompt(prompt.systemPrompt || '');
      setSystemPromptEn(prompt.systemPromptEn || '');
      setUserPrompt(prompt.userPrompt);
      setUserPromptEn(prompt.userPromptEn || '');
      setTags(prompt.tags || []);
      setImages(prompt.images || []);
      setFolderId(prompt.folderId);
      setSource(prompt.source || '');
      // 如果已有英文版本，自动展开
      setShowEnglishVersion(!!(prompt.systemPromptEn || prompt.userPromptEn));
    }
  }, [prompt]);

  const handleSubmit = async () => {
    if (!title.trim() || !userPrompt.trim()) return;

    try {
      await updatePrompt(prompt.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        systemPromptEn: systemPromptEn.trim() || undefined,
        userPrompt: userPrompt.trim(),
        userPromptEn: userPromptEn.trim() || undefined,
        tags,
        images,
        folderId,
        source: source.trim() || undefined,
      });
      // 保存来源到历史 / Save source to history
      if (source.trim()) {
        addSourceHistory(source.trim());
      }
      onClose();
    } catch (error) {
      console.error('Failed to update prompt:', error);
    }
  };

  const handleTranslateToEnglish = async () => {
    if (!canTranslate || !defaultModel) {
      showToast(t('toast.configAI') || '请先配置 AI', 'error');
      return;
    }
    if (!systemPrompt && !userPrompt) {
      showToast(t('prompt.noContentToTranslate', '没有内容可翻译'), 'error');
      return;
    }

    setIsTranslating(true);
    try {
      const instruction =
        'You are a professional prompt translator. Translate the provided System Prompt and User Prompt into natural, accurate English.\n' +
        '- Keep original meaning, tone, and intent.\n' +
        '- Preserve ALL formatting, Markdown, lists, and code blocks.\n' +
        '- Do NOT translate or alter placeholders like {{variable}}.\n' +
        '- Do NOT add explanations.\n' +
        'Return STRICT JSON ONLY: {"systemPromptEn":"...","userPromptEn":"..."}. If systemPrompt is empty, use empty string.';

      const contentToTranslate = JSON.stringify({
        systemPrompt: systemPrompt || '',
        userPrompt: userPrompt || '',
      });

      const result = await testAIConnection(
        {
          provider: defaultModel.provider,
          apiKey: defaultModel.apiKey,
          apiUrl: defaultModel.apiUrl,
          model: defaultModel.model,
        },
        `${instruction}\n\nContent to translate:\n${contentToTranslate}`
      );

      if (!result.success || !result.response) {
        throw new Error(result.error || t('common.error') || '翻译失败');
      }

      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(t('common.error') || '翻译结果解析失败');
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText) as { systemPromptEn?: string; userPromptEn?: string };

      if (typeof parsed.userPromptEn !== 'string') {
        throw new Error(t('common.error') || '翻译结果解析失败');
      }

      if (parsed.systemPromptEn) {
        setSystemPromptEn(parsed.systemPromptEn);
      }
      if (parsed.userPromptEn) {
        setUserPromptEn(parsed.userPromptEn);
      }

      setShowEnglishVersion(true);
      showToast(t('prompt.englishGenerated', '已生成英文版 Prompt'), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : (t('common.error') || '翻译失败'), 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSelectImage = async () => {
    try {
      const filePaths = await window.electron?.selectImage?.();
      if (filePaths && filePaths.length > 0) {
        const savedImages = await window.electron?.saveImage?.(filePaths);
        if (savedImages) {
          setImages([...images, ...savedImages]);
        }
      }
    } catch (error) {
      console.error('Failed to select images:', error);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleUrlUpload = async (url: string) => {
    if (!url.trim()) return;
    
    setIsDownloadingImage(true);
    showToast(t('prompt.downloadingImage', '正在下载图片...'), 'info');
    
    try {
      // 添加超时处理
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 30000);
      });
      
      const downloadPromise = window.electron?.downloadImage?.(url);
      const fileName = await Promise.race([downloadPromise, timeoutPromise]);
      
      if (fileName) {
        setImages(prev => [...prev, fileName]);
        showToast(t('prompt.uploadSuccess', '图片添加成功'), 'success');
      } else {
        showToast(t('prompt.uploadFailed', '图片下载失败，请检查链接是否有效'), 'error');
      }
    } catch (error) {
      console.error('Failed to upload image from URL:', error);
      if (error instanceof Error && error.message === 'timeout') {
        showToast(t('prompt.downloadTimeout', '图片下载超时，请检查网络或链接'), 'error');
      } else {
        showToast(t('prompt.uploadFailed', '图片下载失败，请检查链接是否有效'), 'error');
      }
    } finally {
      setIsDownloadingImage(false);
    }
  };

  // 监听粘贴事件
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const buffer = await blob.arrayBuffer();
            const fileName = await window.electron?.saveImageBuffer?.(buffer);
            if (fileName) {
              setImages(prev => [...prev, fileName]);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen]);

  // 监听快捷键 (Cmd+S / Cmd+Enter 保存，Cmd/Shift+S 全屏切换)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save: Cmd+S or Cmd+Enter
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
        e.preventDefault();
        handleSubmit();
      }
      // Fullscreen: Cmd+Shift+F or Cmd+Shift+S (flexible)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSubmit]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseRequest}
      title={t('prompt.editPrompt')}
      size={isFullscreen ? 'fullscreen' : 'xl'}
      headerActions={
        <>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={isFullscreen ? t('prompt.exitFullscreen', '退出全屏') : t('prompt.fullscreen', '全屏编辑')}
          >
            {isFullscreen ? <Minimize2Icon className="w-4 h-4" /> : <Maximize2Icon className="w-4 h-4" />}
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || !userPrompt.trim()}
          >
            {t('prompt.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 标题 */}
        <Input
          label={t('prompt.titleLabel')}
          placeholder={t('prompt.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* 描述 */}
        <Input
          label={t('prompt.descriptionOptional')}
          placeholder={t('prompt.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* 来源 / Source */}
        <div className="space-y-1.5 relative">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.sourceOptional') || '来源（可选）'}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={t('prompt.sourcePlaceholder') || '记录 Prompt 的来源，如网站链接、书籍等'}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onFocus={() => setShowSourceSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSourceSuggestions(false), 150)}
              className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
            />
            {showSourceSuggestions && sourceHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {sourceHistory
                  .filter(s => s.toLowerCase().includes(source.toLowerCase()))
                  .slice(0, 8)
                  .map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="w-full px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors truncate"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSource(item);
                        setShowSourceSuggestions(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* 图片管理 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">{t('prompt.referenceImages')}</label>
          <div className="flex flex-wrap gap-3">
            {images.map((img, index) => (
              <div key={index} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border">
                <img
                  src={`local-image://${img}`}
                  alt={`preview-${index}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={handleSelectImage}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
            >
              <ImageIcon className="w-6 h-6 mb-1" />
              <span className="text-[10px] leading-tight">{t('prompt.uploadImage', '上传/粘贴/链接')}</span>
            </button>
          </div>
          <div className="text-xs text-muted-foreground flex gap-2 mt-1">
            <button
              className="hover:text-primary underline"
              onClick={() => setShowUrlInput(true)}
            >
              {t('prompt.addImageByUrl', '通过链接添加')}
            </button>
            <span>|</span>
            <span>{t('prompt.pasteImageHint', '支持直接粘贴图片')}</span>
          </div>
          {showUrlInput && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('prompt.enterImageUrl', '请输入图片链接 / Enter image URL')}
                className="flex-1 h-8 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && imageUrl) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleUrlUpload(imageUrl);
                    setImageUrl('');
                    setShowUrlInput(false);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowUrlInput(false);
                    setImageUrl('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (imageUrl && !isDownloadingImage) {
                    handleUrlUpload(imageUrl);
                    setImageUrl('');
                    setShowUrlInput(false);
                  }
                }}
                disabled={isDownloadingImage || !imageUrl}
                className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {isDownloadingImage ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    {t('common.loading', '加载中...')}
                  </>
                ) : (
                  t('common.confirm', '确定')
                )}
              </button>
              <button
                onClick={() => {
                  if (!isDownloadingImage) {
                    setShowUrlInput(false);
                    setImageUrl('');
                  }
                }}
                disabled={isDownloadingImage}
                className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel', '取消')}
              </button>
            </div>
          )}
        </div>

        {/* 文件夹 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.folderOptional')}
          </label>
          <Select
            value={folderId || ''}
            onChange={(val) => setFolderId(val || undefined)}
            placeholder={t('prompt.noFolder')}
            options={[
              { value: '', label: t('prompt.noFolder') },
              ...folders.map((folder) => ({
                value: folder.id,
                label: (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground">
                      {renderFolderIcon(folder.icon)}
                    </span>
                    <span className="truncate">{folder.name}</span>
                  </div>
                ),
              })),
            ]}
          />
        </div>

        {/* 标签 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.tagsOptional')}
          </label>
          {/* 已选标签 */}
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white"
              >
                <HashIcon className="w-3 h-3" />
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-white/70"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          {/* 已有标签选择 */}
          {existingTags.length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-muted-foreground mb-1.5">{t('prompt.selectExistingTags')}</div>
              <div className="flex flex-wrap gap-1.5">
                {existingTags.filter(t => !tags.includes(t)).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTags([...tags, tag])}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors"
                  >
                    <HashIcon className="w-3 h-3" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 新建标签 */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('prompt.enterTagHint')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="flex-1 h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
            />
            <Button variant="secondary" size="md" onClick={handleAddTag}>
              {t('prompt.addTag')}
            </Button>
          </div>
        </div>

        {/* 英文版本切换 */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border">
          <div className="flex items-center gap-2">
            <GlobeIcon className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{t('prompt.bilingualHint')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTranslateToEnglish}
              disabled={isTranslating || !canTranslate}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isTranslating || !canTranslate
                  ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
              title={t('prompt.translateToEnglish', '一键翻译生成英文版')}
            >
              {isTranslating ? (
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="w-3.5 h-3.5" />
              )}
              {t('prompt.translate', 'Translate')}
            </button>
            <button
              onClick={() => setShowEnglishVersion(!showEnglishVersion)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showEnglishVersion
                  ? 'bg-primary text-white'
                  : 'bg-muted hover:bg-accent text-foreground'
              }`}
            >
              {showEnglishVersion ? (
                <>
                  <XIcon className="w-3.5 h-3.5" />
                  {t('prompt.removeEnglishVersion')}
                </>
              ) : (
                <>
                  <PlusIcon className="w-3.5 h-3.5" />
                  {t('prompt.addEnglishVersion')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* System Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">{t('prompt.systemPromptOptional')}</label>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              <button
                onClick={() => setSystemTab('edit')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  systemTab === 'edit'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('prompt.edit', '编辑')}
              </button>
              <button
                onClick={() => setSystemTab('preview')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  systemTab === 'preview'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('prompt.preview', '预览')}
              </button>
            </div>
          </div>
          {systemTab === 'edit' ? (
            <Textarea
              placeholder={t('prompt.systemPromptPlaceholder')}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[180px]"
            />
          ) : (
            <div className="p-4 rounded-xl bg-card border border-border text-[15px] leading-[1.7] markdown-content break-words space-y-3 min-h-[180px]">
              {systemPrompt ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={rehypePlugins}
                  components={markdownComponents}
                >
                  {systemPrompt}
                </ReactMarkdown>
              ) : (
                <div className="text-muted-foreground text-sm">{t('prompt.noContent', '暂无内容')}</div>
              )}
            </div>
          )}
        </div>

        {/* System Prompt English */}
        {showEnglishVersion && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">EN</span>
              {t('prompt.systemPromptEn')}
            </label>
            <Textarea
              placeholder="Enter English System Prompt..."
              value={systemPromptEn}
              onChange={(e) => setSystemPromptEn(e.target.value)}
              className="min-h-[150px]"
            />
          </div>
        )}

        {/* User Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">{t('prompt.userPromptLabel')}</label>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              <button
                onClick={() => setUserTab('edit')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  userTab === 'edit'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('prompt.edit', '编辑')}
              </button>
              <button
                onClick={() => setUserTab('preview')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  userTab === 'preview'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('prompt.preview', '预览')}
              </button>
            </div>
          </div>
          {userTab === 'edit' ? (
            <Textarea
              placeholder={t('prompt.userPromptPlaceholder')}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="min-h-[260px]"
            />
          ) : (
            <div className="p-4 rounded-xl bg-card border border-border text-[15px] leading-[1.7] markdown-content break-words space-y-3 min-h-[260px]">
              {userPrompt ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={rehypePlugins}
                  components={markdownComponents}
                >
                  {userPrompt}
                </ReactMarkdown>
              ) : (
                <div className="text-muted-foreground text-sm">{t('prompt.noContent', '暂无内容')}</div>
              )}
            </div>
          )}
        </div>

        {/* User Prompt English */}
        {showEnglishVersion && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">EN</span>
              {t('prompt.userPromptEn')}
            </label>
            <Textarea
              placeholder="Enter English User Prompt..."
              value={userPromptEn}
              onChange={(e) => setUserPromptEn(e.target.value)}
              className="min-h-[200px]"
            />
          </div>
        )}
      </div>

      {/* 未保存更改提示弹窗 */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={handleSaveAndClose}
        onDiscard={handleDiscardChanges}
      />
    </Modal>
  );
}
