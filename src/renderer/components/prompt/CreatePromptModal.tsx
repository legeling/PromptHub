import { useState } from 'react';
import { Modal, Button, Input, Textarea } from '../ui';
import { Select } from '../ui/Select';
import { HashIcon, XIcon, FolderIcon, ImageIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { useTranslation } from 'react-i18next';

interface CreatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    systemPrompt?: string;
    userPrompt: string;
    tags: string[];
    images?: string[];
    folderId?: string;
  }) => void;
}

export function CreatePromptModal({ isOpen, onClose, onCreate }: CreatePromptModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [images, setImages] = useState<string[]>([]);
  const folders = useFolderStore((state) => state.folders);
  const prompts = usePromptStore((state) => state.prompts);

  // 获取所有已存在的标签
  const existingTags = [...new Set(prompts.flatMap((p) => p.tags))];

  const handleSubmit = () => {
    if (!title.trim() || !userPrompt.trim()) return;

    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim() || undefined,
      userPrompt: userPrompt.trim(),
      tags,
      images,
      folderId: folderId || undefined,
    });

    // 重置表单
    setTitle('');
    setDescription('');
    setSystemPrompt('');
    setUserPrompt('');
    setTags([]);
    setImages([]);
    setFolderId('');
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('prompt.createPrompt')}
      size="xl"
      headerActions={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!title.trim() || !userPrompt.trim()}
        >
          {t('prompt.create')}
        </Button>
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

        {/* 图片上传 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t('prompt.imagesOptional', '参考图片（可选）')}
          </label>
          <div className="flex flex-wrap gap-3">
            {images.map((img, index) => (
              <div key={index} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border">
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
              className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              <ImageIcon className="w-6 h-6 mb-1" />
              <span className="text-[10px]">{t('common.upload', '上传')}</span>
            </button>
          </div>
        </div>

        {/* System Prompt */}
        <Textarea
          label={t('prompt.systemPromptOptional')}
          placeholder={t('prompt.systemPromptPlaceholder')}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />

        {/* User Prompt */}
        <Textarea
          label={t('prompt.userPromptLabel')}
          placeholder={t('prompt.userPromptPlaceholder')}
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          className="min-h-[200px]"
        />

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
