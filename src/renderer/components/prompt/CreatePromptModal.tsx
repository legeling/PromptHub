
import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Textarea } from '../ui';
import { Select } from '../ui/Select';
import { HashIcon, XIcon, ImageIcon, Maximize2Icon, Minimize2Icon, PlusIcon, GlobeIcon, PlayIcon, VideoIcon, ChevronDownIcon, ChevronRightIcon, SaveIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/Toast';
import { renderFolderIcon } from '../layout/folderIconHelper';

interface CreatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    systemPrompt?: string;
    systemPromptEn?: string;
    userPrompt: string;
    userPromptEn?: string;
    tags: string[];
    images?: string[];
    videos?: string[];
    folderId?: string;
    source?: string;
    notes?: string;
  }) => void;
  defaultFolderId?: string;
}

export function CreatePromptModal({ isOpen, onClose, onCreate, defaultFolderId }: CreatePromptModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptEn, setSystemPromptEn] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [userPromptEn, setUserPromptEn] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEnglishVersion, setShowEnglishVersion] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  const [showAttributes, setShowAttributes] = useState(false);
  const [userTab, setUserTab] = useState<'edit' | 'preview'>('edit');
  const [systemTab, setSystemTab] = useState<'edit' | 'preview'>('edit');
  // 真正的全屏编辑状态
  const [activeFullscreenField, setActiveFullscreenField] = useState<'system' | 'systemEn' | 'user' | 'userEn' | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  const folders = useFolderStore((state) => state.folders);
  const prompts = usePromptStore((state) => state.prompts);
  const sourceHistory = useSettingsStore((state) => state.sourceHistory);
  const addSourceHistory = useSettingsStore((state) => state.addSourceHistory);

  // 获取所有已存在的标签
  const existingTags = [...new Set(prompts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));

  // 当弹窗打开时，设置默认文件夹
  useEffect(() => {
    if (isOpen && defaultFolderId) {
      setFolderId(defaultFolderId);
    }
  }, [isOpen, defaultFolderId]);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !userPrompt.trim()) return;

    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim() || undefined,
      systemPromptEn: systemPromptEn.trim() || undefined,
      userPrompt: userPrompt.trim(),
      userPromptEn: userPromptEn.trim() || undefined,
      tags,
      images,
      videos,
      folderId: folderId || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    // 保存来源到历史
    if (source.trim()) {
      addSourceHistory(source.trim());
    }

    // 重置表单
    setTitle('');
    setDescription('');
    setSystemPrompt('');
    setSystemPromptEn('');
    setUserPrompt('');
    setUserPromptEn('');
    setTags([]);
    setImages([]);
    setVideos([]);
    setFolderId('');
    setSource('');
    setNotes('');
    setShowEnglishVersion(false);
    onClose();
  }, [title, description, systemPrompt, systemPromptEn, userPrompt, userPromptEn, tags, images, videos, folderId, source, notes, onCreate, addSourceHistory, onClose]);

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
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // 监听快捷键
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
        e.preventDefault();
        handleSubmit();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
      }
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

  // 如果是真正的全屏模式，渲染全屏编辑器
  if (isNativeFullscreen && activeFullscreenField) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{getFullscreenFieldTitle()}</h2>
            <span className="text-sm text-muted-foreground">Markdown Supported</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" />
              {t('common.exitFullscreen', '退出全屏')}
            </button>
            <Button variant="primary" onClick={handleExitNativeFullscreen}>
              {t('common.done', '完成')}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <textarea
            className="w-full h-full p-8 resize-none bg-background border-none outline-none text-lg font-mono leading-relaxed"
            value={getFullscreenFieldValue()}
            onChange={(e) => setFullscreenFieldValue(e.target.value)}
            autoFocus
            placeholder="Type your prompt here..."
          />
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('prompt.createPrompt')}
      size={isFullscreen ? 'fullscreen' : 'xl'}
      headerActions={
        <div className="flex items-center gap-2">
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
            <SaveIcon className="w-4 h-4" />
            {t('prompt.create')}
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
            <span>{t('prompt.properties', '属性 (Properties)')}</span>
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



              {/* 参考媒体 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">{t('prompt.referenceMedia')}</label>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, index) => (
                    <div key={`img-${index}`} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border">
                      <img src={`local-image://${img}`} alt={`preview-${index}`} className="w-full h-full object-cover" />
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
                    <span className="text-[10px] leading-tight">{t('prompt.uploadImage', '上传/粘贴/链接')}</span>
                  </button>
                  <button
                    onClick={handleSelectVideo}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
                  >
                    <VideoIcon className="w-6 h-6 mb-1" />
                    <span className="text-[10px] leading-tight">{t('prompt.uploadVideo', '上传视频')}</span>
                  </button>
                </div>
                {!showUrlInput ? (
                  <button onClick={() => setShowUrlInput(true)} className="text-xs text-primary hover:underline">
                    {t('prompt.addImageByUrl', '通过链接添加')}
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
                      {isDownloadingImage ? t('common.loading', '加载中...') : t('common.confirm', '确定')}
                    </button>
                    <button
                      onClick={() => { setShowUrlInput(false); setImageUrl(''); }}
                      disabled={isDownloadingImage}
                      className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 disabled:opacity-50"
                    >
                      {t('common.cancel', '取消')}
                    </button>
                  </div>
                )}
              </div>

              {/* 文件夹 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">{t('prompt.folderOptional')}</label>
                <Select
                  value={folderId || ''}
                  onChange={(val) => setFolderId(val || '')}
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
                <label className="block text-sm font-medium text-foreground">{t('prompt.tagsOptional')}</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white">
                      <HashIcon className="w-3 h-3" />
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-white/70">
                        <XIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
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

              {/* 备注 */}
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
        <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border">
          <div className="flex items-center gap-2">
            <GlobeIcon className="w-4 h-4 text-primary" />
            <div className="text-sm font-medium">{t('prompt.bilingualHint')}</div>
          </div>
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

        {/* System Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">{t('prompt.systemPromptOptional')}</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                <button
                  onClick={() => setSystemTab('edit')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    systemTab === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('prompt.edit', '编辑')}
                </button>
                <button
                  onClick={() => setSystemTab('preview')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    systemTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('prompt.preview', '预览')}
                </button>
              </div>
              <button
                onClick={() => handleEnterNativeFullscreen('system')}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                title={t('prompt.fullscreen', '全屏编辑')}
              >
                <Maximize2Icon className="w-4 h-4" />
              </button>
            </div>
          </div>
          {systemTab === 'edit' ? (
            <Textarea
              placeholder={t('prompt.systemPromptPlaceholder')}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[120px]"
            />
          ) : (
            <div className="p-4 rounded-xl bg-card border border-border text-sm break-words min-h-[120px] whitespace-pre-wrap">
              {systemPrompt || <span className="text-muted-foreground italic">{t('prompt.noContent')}</span>}
            </div>
          )}
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
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                <button
                  onClick={() => setUserTab('edit')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    userTab === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('prompt.edit', '编辑')}
                </button>
                <button
                  onClick={() => setUserTab('preview')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    userTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('prompt.preview', '预览')}
                </button>
              </div>
              <button
                onClick={() => handleEnterNativeFullscreen('user')}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                title={t('prompt.fullscreen', '全屏编辑')}
              >
                <Maximize2Icon className="w-4 h-4" />
              </button>
            </div>
          </div>
          {userTab === 'edit' ? (
            <Textarea
              placeholder={t('prompt.userPromptPlaceholder')}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="min-h-[200px]"
            />
          ) : (
            <div className="p-4 rounded-xl bg-card border border-border text-sm break-words min-h-[200px] whitespace-pre-wrap">
              {userPrompt || <span className="text-muted-foreground italic">{t('prompt.noContent')}</span>}
            </div>
          )}
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
              />
            </div>
          )}
        </div>

        {/* 变量提示 */}
        <div className="p-4 rounded-xl bg-accent/50 text-sm">
          <p className="font-medium text-accent-foreground mb-1">💡 {t('prompt.variableTip')}</p>
          <p className="text-muted-foreground">{t('prompt.variableTipContent')}</p>
        </div>
      </div>
    </Modal>
  );
}
