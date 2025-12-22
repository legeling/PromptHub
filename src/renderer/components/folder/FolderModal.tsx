import { useState, useEffect } from 'react';
import { XIcon, FolderIcon, TrashIcon, LockIcon, AlertTriangleIcon, Folder as FolderIconLucide, FolderOpen, BookOpen, Code, Database, FileText, Image, Music, Video, Archive, Package, Briefcase, GraduationCap, Palette, Rocket, Heart, Star, Zap, Coffee, Home, Settings, BookMarked, Bug, Calendar, Camera, CheckCircle, Circle, Cloud, Cpu, CreditCard, Crown, Flame, Gamepad2, Gift, Globe, Hammer, Headphones, Inbox, Key, Layers, Lightbulb, Mail, Map, MessageSquare, Monitor, Moon, Newspaper, PenTool, Phone, Pizza, Plane, Play, Search, Shield, ShoppingCart, Smartphone, Sparkles, Sun, Tag, Target, Terminal, Trash2, Trophy, Truck, Tv, Upload, Users, Wallet, Watch, Wrench } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import type { Folder } from '../../../shared/types';
import { useToast } from '../ui/Toast';
import { useTranslation } from 'react-i18next';

// Optional folder icons - categorized
// 可选的文件夹图标 - 分类整理
const FOLDER_ICON_CATEGORIES = [
  {
    name: '常用',
    icons: ['📁', '📂', '🗂️', '📋', '📌', '⭐', '❤️', '🔥', '✨', '💎', '🎯', '🏆', '👑', '💯', '🌟'],
  },
  {
    name: '工作',
    icons: ['💼', '📊', '📈', '📉', '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📱', '☎️', '📞', '📠', '🔧', '⚙️', '🛠️', '⚡', '🔌', '💡', '🔦'],
  },
  {
    name: '学习',
    icons: ['📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '📝', '✏️', '✒️', '🖊️', '🖍️', '🖌️', '🎓', '🔬', '🧪', '🧬', '🔭', '🧠', '💭', '📐', '📏', '✂️'],
  },
  {
    name: '创意',
    icons: ['🎨', '🖼️', '🎭', '🎬', '🎥', '📷', '📸', '📹', '📽️', '🎞️', '🎵', '🎶', '🎼', '🎹', '🎸', '🎺', '🎷', '🥁', '🎮', '🕹️', '🎲', '🎰', '🚀', '🌈', '🎪', '🎡', '🎢'],
  },
  {
    name: '生活',
    icons: ['🏠', '🏡', '🏢', '🏬', '🏭', '🏗️', '🏘️', '🌍', '🌎', '🌏', '🗺️', '🧭', '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌱', '🍀', '🌿', '☘️', '☀️', '🌙', '⭐', '🌟', '✨', '⛅', '🌤️', '⛈️', '🌈', '🎁', '🎀', '🎉', '🎊', '🎈', '🎂', '🍰'],
  },
  {
    name: '符号',
    icons: ['💬', '💭', '🗨️', '🗯️', '💡', '📢', '📣', '🔔', '🔕', '🔒', '🔓', '🔐', '🔑', '🗝️', '🏷️', '📎', '🖇️', '📍', '📌', '🔗', '⛓️', '🧲', '💰', '💵', '💴', '💶', '💷', '💳', '💸'],
  },
  {
    name: '食物',
    icons: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🥝', '🥑', '🍅', '🥕', '🌽', '🥦', '🥒', '🍞', '🥐', '🥖', '🧀', '🍕', '🍔', '🌭', '🥪', '🌮', '🌯', '🍜', '🍝', '🍱', '🍛', '🍣', '🍤', '🍰', '🎂', '🍪', '🍩', '☕', '🍵', '🥤', '🍺', '🍷', '🥂'],
  },
  {
    name: '动物',
    icons: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈'],
  },
  {
    name: '旅行',
    icons: ['✈️', '🛫', '🛬', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '⛴️', '🚢', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🚲', '🛴', '🛹', '⛷️', '🏂'],
  },
  {
    name: '运动',
    icons: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🏋️', '🤸', '🤼', '🤺', '🤾', '🏌️', '🏇', '🧘', '🏊', '🤽', '🚣', '🧗', '🚴', '🚵', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️'],
  },
  {
    name: '天气',
    icons: ['☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '🌪️', '🌫️', '🌈', '☔', '⚡', '🔥', '💧', '🌊', '🌙', '⭐', '🌟', '✨', '💫'],
  },
];


interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder?: Folder | null; // 编辑模式时传入
}

export function FolderModal({ isOpen, onClose, folder }: FolderModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<{ configured: boolean; unlocked: boolean }>({ configured: false, unlocked: false });
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'folder-only' | 'all-content'>('folder-only');
  const [promptsInFolder, setPromptsInFolder] = useState(0);
  const [iconMode, setIconMode] = useState<'emoji' | 'icon'>('emoji');
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const { showToast } = useToast();

  const createFolder = useFolderStore((state) => state.createFolder);
  const updateFolder = useFolderStore((state) => state.updateFolder);
  const deleteFolder = useFolderStore((state) => state.deleteFolder);
  const folders = useFolderStore((state) => state.folders);
  const prompts = usePromptStore((state) => state.prompts);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const deletePrompt = usePromptStore((state) => state.deletePrompt);

  const isEditMode = !!folder;

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setIcon(folder.icon || '📁');
      setIsPrivate(folder.isPrivate || false);
    } else {
      setName('');
      setIcon('📁');
      setIsPrivate(false);
    }
    window.api?.security?.status?.().then((s) => setSecurityStatus(s)).catch(() => {});
  }, [folder, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent, skipDuplicateCheck = false) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Check for duplicate folder name (only when creating or renaming)
    // 检查文件夹名称是否重复（仅在创建或重命名时）
    if (!skipDuplicateCheck) {
      const trimmedName = name.trim();
      const isDuplicate = folders.some(f => 
        f.name === trimmedName && (!isEditMode || f.id !== folder?.id)
      );
      
      if (isDuplicate) {
        setShowDuplicateConfirm(true);
        return;
      }
    }

    // If private is enabled and currently not unlocked, require unlock first
    // 如果开启私密且当前未解锁，要求先解锁
    if (isPrivate && securityStatus.configured && !securityStatus.unlocked) {
      setShowUnlockModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && folder) {
        await updateFolder(folder.id, {
          name: name.trim(),
          icon,
          isPrivate,
        });
      } else {
        await createFolder({
          name: name.trim(),
          icon,
          isPrivate
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save folder:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicateConfirm = () => {
    setShowDuplicateConfirm(false);
    handleSubmit({ preventDefault: () => {} } as any, true);
  };

  const handleUnlock = async () => {
    if (!unlockPassword.trim()) {
      showToast(t('folder.masterPasswordRequired', '请输入主密码'), 'error');
      return;
    }
    setUnlocking(true);
    try {
      const result = await window.api.security.unlock(unlockPassword);
      if (result.success) {
        showToast(t('folder.unlockSuccess', '解锁成功'), 'success');
        setSecurityStatus({ ...securityStatus, unlocked: true });
        setShowUnlockModal(false);
        setUnlockPassword('');
        // 解锁后继续保存
        handleSubmit({ preventDefault: () => {} } as any);
      } else {
        showToast(t('folder.wrongPassword', '密码错误'), 'error');
      }
    } catch (error) {
      showToast(t('folder.unlockFailed', '解锁失败'), 'error');
    } finally {
      setUnlocking(false);
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    
    // 检查文件夹内是否有 prompt
    const count = prompts.filter(p => p.folderId === folder.id).length;
    setPromptsInFolder(count);
    
    if (count > 0) {
      // 有内容，显示自定义删除选项弹窗
      setShowDeleteOptions(true);
    } else {
      // 空文件夹，直接删除
      if (folder.isPrivate && securityStatus.configured) {
        setShowDeleteConfirm(true);
      } else {
        try {
          await deleteFolder(folder.id);
          showToast(t('folder.folderDeleted', '文件夹已删除'), 'success');
          onClose();
        } catch (error) {
          console.error('Failed to delete folder:', error);
          showToast(t('folder.deleteFailed', '删除失败'), 'error');
        }
      }
    }
  };

  const handleDeleteWithOptions = async () => {
    if (!folder) return;
    
    // 私密文件夹需要验证主密码
    if (folder.isPrivate && securityStatus.configured) {
      setShowDeleteOptions(false);
      setShowDeleteConfirm(true);
      return;
    }
    
    await executeDelete();
  };

  const executeDelete = async () => {
    if (!folder) return;
    
    try {
      if (deleteMode === 'all-content') {
        // 删除文件夹及所有内部 prompt
        const folderPrompts = prompts.filter(p => p.folderId === folder.id);
        for (const prompt of folderPrompts) {
          await deletePrompt(prompt.id);
        }
        await deleteFolder(folder.id);
        showToast(t('folder.deletedWithPrompts', '已删除文件夹及 {{count}} 个提示词', { count: folderPrompts.length }), 'success');
      } else {
        // 仅删除文件夹，保留 prompt 并解除关联
        const folderPrompts = prompts.filter(p => p.folderId === folder.id);
        for (const prompt of folderPrompts) {
          await updatePrompt(prompt.id, { folderId: undefined });
        }
        await deleteFolder(folder.id);
        showToast(t('folder.deletedMovedPrompts', '已删除文件夹，{{count}} 个提示词已移至根目录', { count: folderPrompts.length }), 'success');
      }
      setShowDeleteOptions(false);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      showToast(t('folder.deleteFailed', '删除失败'), 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!folder) return;
    if (!deletePassword.trim()) {
      showToast(t('folder.masterPasswordRequired', '请输入主密码'), 'error');
      return;
    }
    setDeleting(true);
    try {
      const result = await window.api.security.unlock(deletePassword);
      if (result.success) {
        await executeDelete();
        setDeletePassword('');
      } else {
        showToast(t('folder.wrongPasswordCannotDelete', '主密码错误，无法删除'), 'error');
      }
    } catch (error) {
      showToast(t('folder.deleteFailed', '删除失败'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
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
            {isEditMode ? t('folder.edit', '编辑文件夹') : t('folder.new', '新建文件夹')}
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
            <label className="block text-sm font-medium mb-2">{t('folder.icon', '图标')}</label>
            
            {/* Tab 切换 */}
            <div className="flex gap-1 mb-3 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setIconMode('emoji')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  iconMode === 'emoji'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Emoji
              </button>
              <button
                type="button"
                onClick={() => setIconMode('icon')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  iconMode === 'icon'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Icon
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-3 pr-2">
              {iconMode === 'emoji' ? (
                FOLDER_ICON_CATEGORIES.map((category) => (
                  <div key={category.name}>
                    <div className="text-xs text-muted-foreground mb-1.5">{category.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {category.icons.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setIcon(emoji)}
                          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
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
                ))
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: 'folder', Icon: FolderIconLucide }, { name: 'folder-open', Icon: FolderOpen }, { name: 'book-open', Icon: BookOpen }, { name: 'book-marked', Icon: BookMarked },
                    { name: 'code', Icon: Code }, { name: 'database', Icon: Database }, { name: 'file-text', Icon: FileText }, { name: 'image', Icon: Image }, { name: 'music', Icon: Music }, { name: 'video', Icon: Video },
                    { name: 'archive', Icon: Archive }, { name: 'package', Icon: Package }, { name: 'briefcase', Icon: Briefcase }, { name: 'graduation-cap', Icon: GraduationCap },
                    { name: 'palette', Icon: Palette }, { name: 'rocket', Icon: Rocket }, { name: 'heart', Icon: Heart }, { name: 'star', Icon: Star }, { name: 'zap', Icon: Zap }, { name: 'coffee', Icon: Coffee },
                    { name: 'home', Icon: Home }, { name: 'settings', Icon: Settings }, { name: 'bug', Icon: Bug }, { name: 'calendar', Icon: Calendar }, { name: 'camera', Icon: Camera },
                    { name: 'check-circle', Icon: CheckCircle }, { name: 'circle', Icon: Circle }, { name: 'cloud', Icon: Cloud }, { name: 'cpu', Icon: Cpu }, { name: 'credit-card', Icon: CreditCard },
                    { name: 'crown', Icon: Crown }, { name: 'flame', Icon: Flame }, { name: 'gamepad-2', Icon: Gamepad2 }, { name: 'gift', Icon: Gift }, { name: 'globe', Icon: Globe }, { name: 'hammer', Icon: Hammer },
                    { name: 'headphones', Icon: Headphones }, { name: 'inbox', Icon: Inbox }, { name: 'key', Icon: Key }, { name: 'layers', Icon: Layers }, { name: 'lightbulb', Icon: Lightbulb },
                    { name: 'mail', Icon: Mail }, { name: 'map', Icon: Map }, { name: 'message-square', Icon: MessageSquare }, { name: 'monitor', Icon: Monitor }, { name: 'moon', Icon: Moon },
                    { name: 'newspaper', Icon: Newspaper }, { name: 'pen-tool', Icon: PenTool }, { name: 'phone', Icon: Phone }, { name: 'pizza', Icon: Pizza }, { name: 'plane', Icon: Plane },
                    { name: 'play', Icon: Play }, { name: 'search', Icon: Search }, { name: 'shield', Icon: Shield }, { name: 'shopping-cart', Icon: ShoppingCart }, { name: 'smartphone', Icon: Smartphone },
                    { name: 'sparkles', Icon: Sparkles }, { name: 'sun', Icon: Sun }, { name: 'tag', Icon: Tag }, { name: 'target', Icon: Target }, { name: 'terminal', Icon: Terminal }, { name: 'trash-2', Icon: Trash2 },
                    { name: 'trophy', Icon: Trophy }, { name: 'truck', Icon: Truck }, { name: 'tv', Icon: Tv }, { name: 'upload', Icon: Upload }, { name: 'users', Icon: Users }, { name: 'wallet', Icon: Wallet },
                    { name: 'watch', Icon: Watch }, { name: 'wrench', Icon: Wrench },
                  ].map(({ name, Icon }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setIcon(`icon:${name}`)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        icon === `icon:${name}`
                          ? 'bg-primary text-white'
                          : 'bg-muted hover:bg-muted/80 text-foreground'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 名称输入 */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('folder.name', '名称')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('folder.namePlaceholder', '输入文件夹名称')}
              className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
              autoFocus
            />
          </div>

          {/* 隐私设置 */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                if (!securityStatus.configured) {
                  showToast(t('folder.privateNeedPassword', '请先在设置-安全中设置主密码后再开启私密'), 'error');
                  setIsPrivate(false);
                  return;
                }
                setIsPrivate((v) => !v);
              }}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-muted/60 hover:bg-muted px-3 py-2 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <LockIcon className="w-3.5 h-3.5 text-muted-foreground" />
                {t('folder.setPrivate', '设为私密文件夹')}
              </span>
              <span
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                  isPrivate ? 'bg-primary/80' : 'bg-border'
                }`}
                aria-hidden="true"
              >
                <span
                  className={`absolute left-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform ${
                    isPrivate ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>

            {isPrivate && (
              <div className="pl-6 animate-in fade-in slide-in-from-top-2 duration-200">
                {!securityStatus.configured ? (
                  <p className="text-xs text-destructive">{t('folder.privateNeedPasswordInline', '请到"设置 - 安全"设置主密码后再开启私密。')}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('folder.privateHint', '保存后此文件夹内容将加密存储，进入时需要验证密码。')}</p>
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2">
            {isEditMode ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-2 h-10 px-4 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-sm"
              >
                <TrashIcon className="w-4 h-4" />
                {t('folder.delete', '删除')}
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
                {t('common.cancel', '取消')}
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? t('common.saving', '保存中...') : t('common.save', '保存')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    {/* 解锁主密码弹窗 */}
    {showUnlockModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowUnlockModal(false)} />
        <div className="relative bg-card rounded-xl w-full max-w-sm mx-4 p-5 border border-border space-y-4">
          <h3 className="text-base font-semibold">{t('folder.unlockTitle', '输入主密码')}</h3>
          <p className="text-xs text-muted-foreground">{t('folder.unlockDesc', '保存私密文件夹前需要先解锁主密码')}</p>
          <input
            type="password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUnlock();
            }}
            placeholder={t('folder.unlockPlaceholder', '请输入主密码')}
            className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowUnlockModal(false);
                setUnlockPassword('');
              }}
              className="h-9 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlocking}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {unlocking ? t('folder.unlocking', '解锁中...') : t('settings.unlock', '解锁')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 删除选项弹窗 */}
    {showDeleteOptions && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteOptions(false)} />
        <div className="relative bg-card rounded-xl w-full max-w-md mx-4 p-5 border border-border space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangleIcon className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">{t('folder.deleteTitle', '删除文件夹「{{name}}」', { name: folder?.name || '' })}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('folder.containsPrompts', '此文件夹包含 {{count}} 个提示词', { count: promptsInFolder })}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setDeleteMode('folder-only')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                deleteMode === 'folder-only'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="mt-0.5">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  deleteMode === 'folder-only' ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {deleteMode === 'folder-only' && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{t('folder.deleteFolderOnly', '仅删除文件夹')}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t('folder.deleteFolderOnlyDesc', '保留 {{count}} 个提示词，移至根目录', { count: promptsInFolder })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDeleteMode('all-content')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                deleteMode === 'all-content'
                  ? 'border-destructive bg-destructive/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="mt-0.5">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  deleteMode === 'all-content' ? 'border-destructive' : 'border-muted-foreground/30'
                }`}>
                  {deleteMode === 'all-content' && (
                    <div className="w-2 h-2 rounded-full bg-destructive" />
                  )}
                </div>
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-destructive">{t('folder.deleteAllContent', '删除所有内容')}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t('folder.deleteAllContentDesc', '删除文件夹及内部所有 {{count}} 个提示词', { count: promptsInFolder })}
                </div>
              </div>
            </button>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setShowDeleteOptions(false);
                setDeleteMode('folder-only');
              }}
              className="h-9 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleDeleteWithOptions}
              className={`h-9 px-4 rounded-lg text-white text-sm font-medium transition-colors ${
                deleteMode === 'all-content'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {t('folder.confirmDelete', '确认删除')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 重复名称确认弹窗 */}
    {showDuplicateConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowDuplicateConfirm(false)} />
        <div className="relative bg-card rounded-xl w-full max-w-sm mx-4 p-5 border border-border space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <AlertTriangleIcon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">{t('folder.duplicateTitle', '文件夹名称已存在')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('folder.duplicateDesc', '已存在名为「{{name}}」的文件夹，是否仍要创建？', { name: name.trim() })}
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowDuplicateConfirm(false)}
              className="h-9 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleDuplicateConfirm}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('folder.confirmCreate', '确认创建')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 删除私密文件夹确认弹窗 */}
    {showDeleteConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
        <div className="relative bg-card rounded-xl w-full max-w-sm mx-4 p-5 border border-border space-y-4">
          <h3 className="text-base font-semibold text-destructive">{t('folder.deletePrivateTitle', '删除私密文件夹')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('folder.deletePrivateDesc', '此操作将删除文件夹「{{name}}」及其内的所有加密内容，请输入主密码确认', { name: folder?.name || '' })}
          </p>
          <input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDeleteConfirm();
            }}
            placeholder={t('folder.unlockPlaceholder', '请输入主密码')}
            className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword('');
              }}
              className="h-9 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="h-9 px-4 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deleting ? t('folder.deleting', '删除中...') : t('folder.confirmDelete', '确认删除')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
