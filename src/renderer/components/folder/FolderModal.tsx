import { useState, useEffect } from 'react';
import { XIcon, FolderIcon, TrashIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import type { Folder } from '../../../shared/types';

// 可选的文件夹图标
const FOLDER_ICONS = ['📁', '💼', '📚', '🎨', '💡', '🔧', '📝', '🎯', '🚀', '⭐'];

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder?: Folder | null; // 编辑模式时传入
}

export function FolderModal({ isOpen, onClose, folder }: FolderModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const createFolder = useFolderStore((state) => state.createFolder);
  const updateFolder = useFolderStore((state) => state.updateFolder);
  const deleteFolder = useFolderStore((state) => state.deleteFolder);

  const isEditMode = !!folder;

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setIcon(folder.icon || '📁');
    } else {
      setName('');
      setIcon('📁');
    }
  }, [folder, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      if (isEditMode && folder) {
        await updateFolder(folder.id, { name: name.trim(), icon });
      } else {
        await createFolder({ name: name.trim(), icon });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save folder:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    if (!confirm(`确定要删除文件夹「${folder.name}」吗？`)) return;

    try {
      await deleteFolder(folder.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-card rounded-xl w-full max-w-md mx-4 overflow-hidden border border-border">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {isEditMode ? '编辑文件夹' : '新建文件夹'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <XIcon className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* 图标选择 */}
          <div>
            <label className="block text-sm font-medium mb-2">图标</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                    icon === emoji
                      ? 'bg-primary text-white'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 名称输入 */}
          <div>
            <label className="block text-sm font-medium mb-2">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入文件夹名称"
              className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
              autoFocus
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2">
            {isEditMode ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-2 h-10 px-4 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm"
              >
                <TrashIcon className="w-4 h-4" />
                删除
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
