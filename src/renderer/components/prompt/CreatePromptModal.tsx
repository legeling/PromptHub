import { useState, useEffect } from 'react';
import { Modal, Button, Input, Textarea } from '../ui';
import { Select } from '../ui/Select';
import { HashIcon, XIcon, FolderIcon, ImageIcon, Maximize2Icon, Minimize2Icon, PlusIcon, GlobeIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/Toast';

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
    folderId?: string;
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEnglishVersion, setShowEnglishVersion] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const folders = useFolderStore((state) => state.folders);
  const prompts = usePromptStore((state) => state.prompts);

  // When modal opens, set default folder
  // 当弹窗打开时，设置默认文件夹
  useEffect(() => {
    if (isOpen && defaultFolderId) {
      setFolderId(defaultFolderId);
    }
  }, [isOpen, defaultFolderId]);

  // Get all existing tags
  // 获取所有已存在的标签
  const existingTags = [...new Set(prompts.flatMap((p) => p.tags))];

  const handleSubmit = () => {
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
      folderId: folderId || undefined,
    });

    // Reset form
    // 重置表单
    setTitle('');
    setDescription('');
    setSystemPrompt('');
    setSystemPromptEn('');
    setUserPrompt('');
    setUserPromptEn('');
    setTags([]);
    setImages([]);
    setFolderId('');
    setShowEnglishVersion(false);
    onClose();
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
      // Add timeout handling
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

  // Listen for paste events
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

  // 监听快捷键 (Cmd+S / Cmd+Enter 保存，Cmd/Shift+F 全屏切换)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save: Cmd+S or Cmd+Enter
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
        e.preventDefault();
        handleSubmit();
      }
      // Fullscreen: Cmd+Shift+F
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
      onClose={onClose}
      title={t('prompt.createPrompt')}
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
            {t('prompt.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Title */}
        {/* 标题 */}
        <Input
          label={t('prompt.titleLabel')}
          placeholder={t('prompt.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Description */}
        {/* 描述 */}
        <Input
          label={t('prompt.descriptionOptional')}
          placeholder={t('prompt.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Folder selection */}
        {/* 文件夹选择 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.folderOptional')}
          </label>
          <Select
            value={folderId}
            onChange={setFolderId}
            placeholder={t('prompt.noFolder')}
            options={[
              { value: '', label: t('prompt.noFolder') },
              ...folders.map((folder) => ({
                value: folder.id,
                label: `${folder.icon || '📁'} ${folder.name}`,
              })),
            ]}
          />
        </div>

        {/* 标签 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.tagsOptional')}
          </label>
          {/* Selected tags */}
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
          {/* Existing tags selection */}
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
          {/* Create new tag */}
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

        {/* Image upload */}
        {/* 图片上传 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.referenceImages')}
          </label>
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

        {/* English version toggle */}
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
        <Textarea
          label={t('prompt.systemPromptOptional')}
          placeholder={t('prompt.systemPromptPlaceholder')}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />

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
              className="min-h-[120px]"
            />
          </div>
        )}

        {/* User Prompt */}
        <Textarea
          label={t('prompt.userPromptLabel')}
          placeholder={t('prompt.userPromptPlaceholder')}
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          className="min-h-[200px]"
        />

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
              className="min-h-[150px]"
            />
          </div>
        )}

        {/* Variable tips */}
        {/* 变量提示 */}
        <div className="p-4 rounded-xl bg-accent/50 text-sm">
          <p className="font-medium text-accent-foreground mb-1">💡 {t('prompt.variableTip')}</p>
          <p className="text-muted-foreground">
            {t('prompt.variableTipContent')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
