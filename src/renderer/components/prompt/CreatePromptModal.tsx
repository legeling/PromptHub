import { useState } from 'react';
import { Modal, Button, Input, Textarea } from '../ui';
import { HashIcon, XIcon, FolderIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';

interface CreatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    systemPrompt?: string;
    userPrompt: string;
    tags: string[];
    folderId?: string;
  }) => void;
}

export function CreatePromptModal({ isOpen, onClose, onCreate }: CreatePromptModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const folders = useFolderStore((state) => state.folders);

  const handleSubmit = () => {
    if (!title.trim() || !userPrompt.trim()) return;
    
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim() || undefined,
      userPrompt: userPrompt.trim(),
      tags,
      folderId: folderId || undefined,
    });

    // 重置表单
    setTitle('');
    setDescription('');
    setSystemPrompt('');
    setUserPrompt('');
    setTags([]);
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新建 Prompt" size="lg">
      <div className="space-y-5">
        {/* 标题 */}
        <Input
          label="标题"
          placeholder="给你的 Prompt 起个名字"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* 描述 */}
        <Input
          label="描述（可选）"
          placeholder="简单描述这个 Prompt 的用途"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* 文件夹选择 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            文件夹（可选）
          </label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
          >
            <option value="">不选择文件夹</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.icon} {folder.name}
              </option>
            ))}
          </select>
        </div>

        {/* 标签 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            标签（可选）
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground"
              >
                <HashIcon className="w-3 h-3" />
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入标签后按回车"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="flex-1 h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
            />
            <Button variant="secondary" size="md" onClick={handleAddTag}>
              添加
            </Button>
          </div>
        </div>

        {/* System Prompt */}
        <Textarea
          label="System Prompt（可选）"
          placeholder="设置 AI 的角色和行为..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />

        {/* User Prompt */}
        <Textarea
          label="User Prompt"
          placeholder="输入你的 Prompt 内容，可以使用 {{变量名}} 定义变量..."
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          className="min-h-[200px]"
        />

        {/* 变量提示 */}
        <div className="p-4 rounded-xl bg-accent/50 text-sm">
          <p className="font-medium text-accent-foreground mb-1">💡 变量提示</p>
          <p className="text-muted-foreground">
            使用 <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{'{{变量名}}'}</code> 来定义变量，
            例如：<code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{'{{language}}'}</code>
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!title.trim() || !userPrompt.trim()}
          >
            创建
          </Button>
        </div>
      </div>
    </Modal>
  );
}
