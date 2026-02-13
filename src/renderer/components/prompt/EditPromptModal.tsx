
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal, Button, Input, Textarea, UnsavedChangesDialog } from '../ui';
import { handleMarkdownListKeyDown } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { HashIcon, XIcon, ImageIcon, Maximize2Icon, Minimize2Icon, PlusIcon, GlobeIcon, SparklesIcon, Loader2Icon, PlayIcon, VideoIcon, ChevronDownIcon, ChevronRightIcon, SaveIcon, MessageSquareTextIcon } from 'lucide-react';

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

  /* Existing code */
  // Add initialData to props
  interface EditPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    prompt?: Prompt | null;
    initialData?: Partial<Prompt>;
  }

export function EditPromptModal({ isOpen, onClose, prompt, initialData }: EditPromptModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const prompts = usePromptStore((state) => state.prompts);
  const folders = useFolderStore((state) => state.folders);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [promptType, setPromptType] = useState<'text' | 'image' | 'video'>('text');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptEn, setSystemPromptEn] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [userPromptEn, setUserPromptEn] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>(undefined);

  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEnglishVersion, setShowEnglishVersion] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  // 属性面板折叠状态
  const [showAttributes, setShowAttributes] = useState(false);
  // 真正的全屏编辑状态
  const [activeFullscreenField, setActiveFullscreenField] = useState<'system' | 'systemEn' | 'user' | 'userEn' | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Only subscribe to the fields we need, not the entire store
  // 只订阅需要的字段，而不是整个 store
  const sourceHistory = useSettingsStore((state) => state.sourceHistory);
  const addSourceHistory = useSettingsStore((state) => state.addSourceHistory);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const defaultModel = aiModels.find(m => m.isDefault);
  const canTranslate = !!defaultModel;

  // 检查是否有未保存的更改
  const hasUnsavedChanges = useCallback(() => {
    if (prompt) {
      return (
        title !== prompt.title ||
        description !== (prompt.description || '') ||
        systemPrompt !== (prompt.systemPrompt || '') ||
        systemPromptEn !== (prompt.systemPromptEn || '') ||
        userPrompt !== prompt.userPrompt ||
        userPromptEn !== (prompt.userPromptEn || '') ||
        JSON.stringify(tags) !== JSON.stringify(prompt.tags || []) ||
        JSON.stringify(images) !== JSON.stringify(prompt.images || []) ||
        JSON.stringify(videos) !== JSON.stringify(prompt.videos || []) ||
        folderId !== prompt.folderId ||
        source !== (prompt.source || '') ||
        notes !== (prompt.notes || '')
      );
    } else {
      // Creation mode: check if fields match initialData or are non-empty if initialData is empty
      // Simplification: if title or userPrompt is non-empty, assume unsaved changes if closing without save
      // Or better: just strict comparison with initial values (which might be from initialData or empty)
      const initInfo = initialData || {};
      return (
        title !== (initInfo.title || '') ||
        userPrompt !== (initInfo.userPrompt || '') ||
        systemPrompt !== (initInfo.systemPrompt || '')
      );
    }
  }, [prompt, initialData, title, description, systemPrompt, systemPromptEn, userPrompt, userPromptEn, tags, images, videos, folderId, source, notes]);

  // 处理关闭请求
  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  // 处理保存并关闭
  const handleSaveAndClose = async () => {
    await handleSubmit();
    setShowUnsavedDialog(false);
  };

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
    if (isOpen) {
      if (prompt) {
        setTitle(prompt.title);
        setDescription(prompt.description || '');
        setPromptType(prompt.promptType || 'text');
        setSystemPrompt(prompt.systemPrompt || '');
        setSystemPromptEn(prompt.systemPromptEn || '');
        setUserPrompt(prompt.userPrompt);
        setUserPromptEn(prompt.userPromptEn || '');
        setTags(prompt.tags || []);
        setImages(prompt.images || []);
        setVideos(prompt.videos || []);
        setFolderId(prompt.folderId);
        setSource(prompt.source || '');
        setNotes(prompt.notes || '');
        // 如果已有英文版本，自动展开
        setShowEnglishVersion(!!(prompt.systemPromptEn || prompt.userPromptEn));
      } else if (initialData) {
        // Creation Mode with initial data (e.g. from Clipboard)
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
        setPromptType(initialData.promptType || 'text');
        setSystemPrompt(initialData.systemPrompt || '');
        setSystemPromptEn(initialData.systemPromptEn || '');
        setUserPrompt(initialData.userPrompt || '');
        setUserPromptEn(initialData.userPromptEn || '');
        setTags(initialData.tags || []);
        setImages(initialData.images || []);
        setVideos(initialData.videos || []);
        setFolderId(initialData.folderId);
        setSource(initialData.source || '');
        setNotes(initialData.notes || '');
        setShowEnglishVersion(!!(initialData.systemPromptEn || initialData.userPromptEn));
      } else {
        // Creation Mode (Clean)
        setTitle('');
        setDescription('');
        setPromptType('text');
        setSystemPrompt('');
        setSystemPromptEn('');
        setUserPrompt('');
        setUserPromptEn('');
        setTags([]);
        setImages([]);
        setVideos([]);
        setFolderId(undefined); // Or default folder?
        setSource('');
        setNotes('');
        setShowEnglishVersion(false);
      }
    }
  }, [prompt, initialData, isOpen]);

  const handleSubmit = async () => {
    if (!title.trim() || !userPrompt.trim()) return;

    try {
      const promptData = {
        title: title.trim(),
        description: description.trim() || undefined,
        promptType,
        systemPrompt: systemPrompt.trim() || undefined,
        systemPromptEn: systemPromptEn.trim() || undefined,
        userPrompt: userPrompt.trim(),
        userPromptEn: userPromptEn.trim() || undefined,
        tags,
        images,
        videos,
        folderId,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (prompt) {
        await updatePrompt(prompt.id, promptData);
      } else {
        await createPrompt(promptData);
      }

      // 保存来源到历史 / Save source to history
      if (source.trim()) {
        addSourceHistory(source.trim());
      }
      onClose();
    } catch (error) {
      console.error('Failed to save prompt:', error);
      showToast(t('common.error') || 'Failed to save', 'error');
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
      showToast(e instanceof Error ? e.message : (t('common.error') || 'Translation failed'), 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  // 获取目标语言名称
  const getLanguageName = (langCode: string): string => {
    const lang = langCode.toLowerCase();
    if (lang.startsWith('zh')) return 'Chinese';
    if (lang.startsWith('ja')) return 'Japanese';
    if (lang.startsWith('de')) return 'German';
    if (lang.startsWith('fr')) return 'French';
    if (lang.startsWith('es')) return 'Spanish';
    if (lang.startsWith('ko')) return 'Korean';
    if (lang.startsWith('pt')) return 'Portuguese';
    if (lang.startsWith('ru')) return 'Russian';
    if (lang.startsWith('it')) return 'Italian';
    return 'the target language';
  };

  // 从英文翻译到当前语言
  const handleTranslateFromEnglish = async () => {
    if (!canTranslate || !defaultModel) {
      showToast(t('toast.configAI') || '请先配置 AI', 'error');
      return;
    }
    if (!systemPromptEn && !userPromptEn) {
      showToast(t('prompt.noEnglishContentToTranslate', '没有英文内容可翻译'), 'error');
      return;
    }

    setIsTranslating(true);
    try {
      const targetLang = getLanguageName(i18n.language);
      const instruction =
        `You are a professional prompt translator. Translate the provided English System Prompt and User Prompt into natural, accurate ${targetLang}.\n` +
        '- Keep original meaning, tone, and intent.\n' +
        '- Preserve ALL formatting, Markdown, lists, and code blocks.\n' +
        '- Do NOT translate or alter placeholders like {{variable}}.\n' +
        '- Do NOT add explanations.\n' +
        'Return STRICT JSON ONLY: {"systemPrompt":"...","userPrompt":"..."}. If systemPromptEn is empty, use empty string for systemPrompt.';

      const contentToTranslate = JSON.stringify({
        systemPromptEn: systemPromptEn || '',
        userPromptEn: userPromptEn || '',
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
      const parsed = JSON.parse(jsonText) as { systemPrompt?: string; userPrompt?: string };

      if (typeof parsed.userPrompt !== 'string') {
        throw new Error(t('common.error') || '翻译结果解析失败');
      }

      if (parsed.systemPrompt !== undefined) {
        setSystemPrompt(parsed.systemPrompt);
      }
      if (parsed.userPrompt) {
        setUserPrompt(parsed.userPrompt);
      }

      showToast(t('prompt.localizedGenerated', '已生成当前语言版本'), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : (t('common.error') || 'Translation failed'), 'error');
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

  // Video handling functions
  // 视频处理函数
  const handleSelectVideo = async () => {
    try {
      const filePaths = await window.electron?.selectVideo?.();
      if (filePaths && filePaths.length > 0) {
        const savedVideos = await window.electron?.saveVideo?.(filePaths);
        if (savedVideos) {
          setVideos([...videos, ...savedVideos]);
        }
      }
    } catch (error) {
      console.error('Failed to select videos:', error);
    }
  };

  const handleRemoveVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
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
      // Exit native fullscreen with Escape
      if (e.key === 'Escape' && isNativeFullscreen) {
        handleExitNativeFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSubmit, isNativeFullscreen]);

  // 进入真正的全屏模式
  const handleEnterNativeFullscreen = (field: 'system' | 'systemEn' | 'user' | 'userEn') => {
    setActiveFullscreenField(field);
    setIsNativeFullscreen(true);
    window.electron?.enterFullscreen?.();
  };

  // 退出真正的全屏模式
  const handleExitNativeFullscreen = () => {
    setActiveFullscreenField(null);
    setIsNativeFullscreen(false);
    window.electron?.exitFullscreen?.();
  };

  // 获取当前全屏字段的值
  const getFullscreenFieldValue = () => {
    switch (activeFullscreenField) {
      case 'system': return systemPrompt;
      case 'systemEn': return systemPromptEn;
      case 'user': return userPrompt;
      case 'userEn': return userPromptEn;
      default: return '';
    }
  };

  // 设置当前全屏字段的值
  const setFullscreenFieldValue = (val: string) => {
    switch (activeFullscreenField) {
      case 'system': setSystemPrompt(val); break;
      case 'systemEn': setSystemPromptEn(val); break;
      case 'user': setUserPrompt(val); break;
      case 'userEn': setUserPromptEn(val); break;
    }
  };

  // 获取全屏字段的标题
  const getFullscreenFieldTitle = () => {
    switch (activeFullscreenField) {
      case 'system': return t('prompt.systemPromptOptional');
      case 'systemEn': return `${t('prompt.systemPromptOptional')} (EN)`;
      case 'user': return t('prompt.userPromptLabel');
      case 'userEn': return `${t('prompt.userPromptLabel')} (EN)`;
      default: return '';
    }
  };

  // 全屏编辑器的 Markdown 列表续行处理
  const handleFullscreenKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const currentValue = getFullscreenFieldValue();
    const handled = handleMarkdownListKeyDown(
      e,
      currentValue,
      (newValue, cursorPos) => {
        setFullscreenFieldValue(newValue);
        // Set cursor position after React updates the DOM
        requestAnimationFrame(() => {
          if (fullscreenTextareaRef.current) {
            fullscreenTextareaRef.current.selectionStart = cursorPos;
            fullscreenTextareaRef.current.selectionEnd = cursorPos;
          }
        });
      }
    );
    // handled is used implicitly by preventDefault in handleMarkdownListKeyDown
  }, [activeFullscreenField, systemPrompt, systemPromptEn, userPrompt, userPromptEn]);

  // 如果是真正的全屏模式，渲染全屏编辑器（左右分屏：编辑 + 预览）
  if (isNativeFullscreen && activeFullscreenField) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        {/* 全屏编辑器头部 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{getFullscreenFieldTitle()}</h2>
            <span className="text-sm text-muted-foreground">{t('common.markdownSupported')}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" />
              {t('common.exitFullscreen', 'Exit Fullscreen')}
            </button>
            <Button variant="primary" onClick={handleExitNativeFullscreen}>
              {t('common.done', 'Done')}
            </Button>
          </div>
        </div>
        {/* 分屏区域：左边编辑 + 右边预览 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左边：编辑区 */}
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t('prompt.edit', '编辑')}
            </div>
            <textarea
              ref={fullscreenTextareaRef}
              className="flex-1 w-full p-6 resize-none bg-background border-none outline-none text-base font-mono leading-relaxed"
              value={getFullscreenFieldValue()}
              onChange={(e) => setFullscreenFieldValue(e.target.value)}
              onKeyDown={handleFullscreenKeyDown}
              autoFocus
              placeholder={t('prompt.typeYourPrompt')}
            />
          </div>
          {/* 右边：实时预览 */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t('prompt.preview', '预览')}
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none markdown-content">
                {getFullscreenFieldValue() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                    {getFullscreenFieldValue()}
                  </ReactMarkdown>
                ) : (
                  <div className="text-muted-foreground text-sm italic">{t('prompt.noContent', '暂无内容')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseRequest}
      title={prompt ? t('prompt.editPrompt') : t('prompt.createPrompt')}
      size={isFullscreen ? 'fullscreen' : 'xl'}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={isFullscreen ? t('prompt.exitFullscreen', 'Exit Fullscreen') : t('prompt.fullscreen', 'Fullscreen')}
          >
            {isFullscreen ? <Minimize2Icon className="w-4 h-4" /> : <Maximize2Icon className="w-4 h-4" />}
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || !userPrompt.trim()}
          >
            <SaveIcon className="w-4 h-4" />
            {prompt ? t('prompt.save') : t('prompt.create')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 标题 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">{t('prompt.titleLabel')}</label>
          <input
            type="text"
            placeholder={t('prompt.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-muted/50 border-0 text-xl font-semibold placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
          />
        </div>

        {/* 可折叠的属性面板 */}
        <div className="border border-border/50 rounded-xl bg-muted/20 overflow-hidden">
          <button 
            onClick={() => setShowAttributes(!showAttributes)}
            className="flex items-center gap-2 px-4 py-3 w-full text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            {showAttributes ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground" /> : <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />}
            <span>{t('prompt.properties', 'Properties')}</span>
            {!showAttributes && (
              <span className="text-xs text-muted-foreground ml-2 font-normal truncate max-w-[400px]">
                {[
                  folders.find(f => f.id === folderId)?.name, 
                  tags.length > 0 ? `${tags.length} ${t('prompt.tags', 'tags')}` : null,
                  images.length + videos.length > 0 ? `${images.length + videos.length} ${t('prompt.media', 'media')}` : null
                ].filter(Boolean).join(' • ')}
              </span>
            )}
          </button>

          {showAttributes && (
            <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-1">
              {/* 描述 */}
              <Input
                label={t('prompt.descriptionOptional')}
                placeholder={t('prompt.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              {/* Prompt 类型 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">{t('prompt.type', 'Prompt Type')}</label>
                <div className="flex gap-2">
                  {(['text', 'image'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setPromptType(type)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        promptType === type
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {type === 'text' && <MessageSquareTextIcon className="w-4 h-4" />}
                      {type === 'image' && <ImageIcon className="w-4 h-4" />}
                      {type === 'text' && t('prompt.typeText', 'Text')}
                      {type === 'image' && t('prompt.typeImage', 'Media')}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {promptType === 'text' && t('prompt.typeTextDesc', 'Test with chat models (e.g. GPT-4)')}
                  {promptType === 'image' && t('prompt.typeImageDesc', 'Test with image models (e.g. DALL-E)')}
                </p>
              </div>

              {/* 参考媒体 (图片和视频) */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">{t('prompt.referenceMedia')}</label>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, index) => (
                    <div key={`img-${index}`} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border">
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
                  {videos.map((video, index) => (
                    <div key={`vid-${index}`} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border bg-black">
                      <video src={`local-video://${video}`} className="w-full h-full object-cover opacity-70" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <PlayIcon className="w-6 h-6 text-white/80" />
                      </div>
                      <button
                        onClick={() => handleRemoveVideo(index)}
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
                    <span className="text-[10px] leading-tight">{t('prompt.uploadImage', 'Upload/Add Link')}</span>
                  </button>
                  <button
                    onClick={handleSelectVideo}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
                  >
                    <VideoIcon className="w-6 h-6 mb-1" />
                    <span className="text-[10px] leading-tight">{t('prompt.uploadVideo', 'Upload Video')}</span>
                  </button>
                </div>
                {/* 通过链接添加 */}
                {!showUrlInput ? (
                  <button
                    onClick={() => setShowUrlInput(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('prompt.addImageByUrl', 'Add by URL')}
                  </button>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="https://example.com/image.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && imageUrl && !isDownloadingImage) {
                          handleUrlUpload(imageUrl);
                          setImageUrl('');
                          setShowUrlInput(false);
                        }
                        if (e.key === 'Escape') {
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
                      className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloadingImage ? t('common.loading', 'Loading...') : t('common.confirm', 'Confirm')}
                    </button>
                    <button
                      onClick={() => {
                        setShowUrlInput(false);
                        setImageUrl('');
                      }}
                      disabled={isDownloadingImage}
                      className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 disabled:opacity-50"
                    >
                      {t('common.cancel', 'Cancel')}
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

              {/* 来源 / Source */}
              <div className="space-y-1.5 relative">
                <label className="block text-sm font-medium text-foreground">
                  {t('prompt.sourceOptional') || 'Source (Optional)'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t('prompt.sourcePlaceholder') || 'Record prompt source (e.g. website, book)'}
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

              {/* 备注 / Notes */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  {t('prompt.notesOptional', '备注（可选）')}
                </label>
                <textarea
                  placeholder={t('prompt.notesPlaceholder', '记录关于这个 Prompt 的个人笔记...')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[80px] px-4 py-3 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 英文版本切换 */}
        {/* 英文版本切换 / Toggle English Version (Hide if language is English) */}
        {!i18n.language.startsWith('en') && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border">
          <div className="flex items-center gap-2">
            <GlobeIcon className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{t('prompt.bilingualHint')}</div>
            </div>
          </div>
          {!i18n.language.startsWith('en') && (
          <div className="flex items-center gap-2">
            {/* 当前语言 → 英文 */}
            <button
              onClick={handleTranslateToEnglish}
              disabled={isTranslating || !canTranslate || (!systemPrompt && !userPrompt)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isTranslating || !canTranslate || (!systemPrompt && !userPrompt)
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
              → EN
            </button>
            {/* 英文 → 当前语言 */}
            <button
              onClick={handleTranslateFromEnglish}
              disabled={isTranslating || !canTranslate || (!systemPromptEn && !userPromptEn)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isTranslating || !canTranslate || (!systemPromptEn && !userPromptEn)
                  ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
              title={t('prompt.translateFromEnglish', '从英文翻译到当前语言')}
            >
              {isTranslating ? (
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="w-3.5 h-3.5" />
              )}
              EN →
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
          )}
        </div>
        )}

        {/* System Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">{t('prompt.systemPromptOptional')}</label>
            <button
              onClick={() => handleEnterNativeFullscreen('system')}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
              title={t('prompt.fullscreen', '全屏编辑')}
            >
              <Maximize2Icon className="w-4 h-4" />
            </button>
          </div>
          {/* 分屏布局：左边编辑 + 右边预览 */}
          <div className="flex rounded-xl border border-border overflow-hidden min-h-[200px]">
            {/* 左边：编辑区 */}
            <div className="w-1/2 border-r border-border flex flex-col">
              <Textarea
                placeholder={t('prompt.systemPromptPlaceholder')}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="flex-1 min-h-[200px] rounded-none border-0"
                enableMarkdownList
              />
            </div>
            {/* 右边：实时预览 */}
            <div className="w-1/2 flex flex-col bg-muted/30">
              <div className="px-3 py-1.5 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground shrink-0">
                {t('prompt.preview', '预览')}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="prose prose-sm max-w-none markdown-content">
                  {systemPrompt ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                      {systemPrompt}
                    </ReactMarkdown>
                  ) : (
                    <div className="text-muted-foreground text-sm italic">{t('prompt.noContent', '暂无内容')}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* System Prompt English */}
          {showEnglishVersion && (
            <div className="mt-2 pl-4 border-l-2 border-primary/20 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span className="bg-primary/10 text-primary px-1 rounded text-[10px]">EN</span>
                  {t('prompt.systemPromptEn')}
                </label>
                <button
                  onClick={() => handleEnterNativeFullscreen('systemEn')}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={t('prompt.fullscreen')}
                >
                  <Maximize2Icon className="w-3 h-3" />
                </button>
              </div>
              <Textarea
                placeholder="Enter English System Prompt..."
                value={systemPromptEn}
                onChange={(e) => setSystemPromptEn(e.target.value)}
                className="min-h-[80px]"
                enableMarkdownList
              />
            </div>
          )}
        </div>

        {/* User Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">
              {t('prompt.userPromptLabel')}
              <span className="ml-2 text-xs text-destructive">*</span>
            </label>
            <button
              onClick={() => handleEnterNativeFullscreen('user')}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
              title={t('prompt.fullscreen', '全屏编辑')}
            >
              <Maximize2Icon className="w-4 h-4" />
            </button>
          </div>
          {/* 分屏布局：左边编辑 + 右边预览 */}
          <div className="flex rounded-xl border border-border overflow-hidden min-h-[280px]">
            {/* 左边：编辑区 */}
            <div className="w-1/2 border-r border-border flex flex-col">
              <Textarea
                placeholder={t('prompt.userPromptPlaceholder')}
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="flex-1 min-h-[280px] rounded-none border-0"
                enableMarkdownList
              />
            </div>
            {/* 右边：实时预览 */}
            <div className="w-1/2 flex flex-col bg-muted/30">
              <div className="px-3 py-1.5 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground shrink-0">
                {t('prompt.preview', '预览')}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="prose prose-sm max-w-none markdown-content">
                  {userPrompt ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                      {userPrompt}
                    </ReactMarkdown>
                  ) : (
                    <div className="text-muted-foreground text-sm italic">{t('prompt.noContent', '暂无内容')}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* User Prompt English */}
          {showEnglishVersion && (
            <div className="mt-2 pl-4 border-l-2 border-primary/20 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span className="bg-primary/10 text-primary px-1 rounded text-[10px]">EN</span>
                  {t('prompt.userPromptEn')}
                </label>
                <button
                  onClick={() => handleEnterNativeFullscreen('userEn')}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={t('prompt.fullscreen')}
                >
                  <Maximize2Icon className="w-3 h-3" />
                </button>
              </div>
              <Textarea
                placeholder="Enter English User Prompt..."
                value={userPromptEn}
                onChange={(e) => setUserPromptEn(e.target.value)}
                className="min-h-[120px]"
                enableMarkdownList
              />
            </div>
          )}
        </div>
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
