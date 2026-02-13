import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, GithubIcon, SearchIcon, EditIcon, FolderOpenIcon, CuboidIcon, LoaderIcon, CheckIcon, SparklesIcon, AlertCircleIcon, BrainIcon, UploadIcon, TagIcon, PlusIcon, XCircleIcon, Maximize2Icon, Minimize2Icon, SaveIcon, FileTextIcon, CheckSquareIcon, SquareIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { useSkillStore } from '../../stores/skill.store';
import { useSettingsStore } from '../../stores/settings.store';
import { generateSkillContent, polishSkillContent, AIConfig } from '../../services/ai';
import { BUILTIN_SKILL_REGISTRY } from '../../../shared/constants/skill-registry';

/** Represents a locally discovered skill (preview, not yet imported) */
interface ScannedSkillItem {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  instructions: string;
  filePath: string;
  platforms: string[];
}

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CreateMode = 'select' | 'github' | 'manual' | 'scan' | 'ai';

export function CreateSkillModal({ isOpen, onClose }: CreateSkillModalProps) {
  const { t } = useTranslation();
  const createSkill = useSkillStore((state) => state.createSkill);
  const existingSkills = useSkillStore((state) => state.skills);
  
  // AI settings for generation
  // AI 生成设置
  const aiModels = useSettingsStore((state) => state.aiModels);
  
  const [mode, setMode] = useState<CreateMode>('select');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // GitHub mode
  const [githubUrl, setGithubUrl] = useState('');
  
  // Manual mode
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // Editor state
  // 编辑器状态
  const [instrTab, setInstrTab] = useState<'edit' | 'preview'>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Scan mode state
  // 扫描模式状态
  const [scanResults, setScanResults] = useState<ScannedSkillItem[]>([]);
  const [selectedScanItems, setSelectedScanItems] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  
  // Get default chat model for AI generation
  // 获取默认对话模型用于 AI 生成
  const defaultChatModel = useMemo(() => {
    const chatModels = aiModels.filter((m) => (m.type ?? 'chat') === 'chat');
    return chatModels.find((m) => m.isDefault) ?? chatModels[0] ?? null;
  }, [aiModels]);
  
  // Check if AI generation is available
  // 检查 AI 生成是否可用
  const canGenerateWithAI = useMemo(() => {
    return defaultChatModel && defaultChatModel.apiKey && defaultChatModel.apiUrl;
  }, [defaultChatModel]);

  // Get skill-creator content from registry for use as system prompt
  const skillCreatorContent = useMemo(() => {
    const creator = BUILTIN_SKILL_REGISTRY.find(s => s.slug === 'skill-creator');
    return creator?.content || null;
  }, []);

  // Fullscreen handlers (must be before early return to maintain hooks order)
  const handleEnterNativeFullscreen = useCallback(() => {
    setIsNativeFullscreen(true);
    window.electron?.enterFullscreen?.();
  }, []);

  const handleExitNativeFullscreen = useCallback(() => {
    setIsNativeFullscreen(false);
    window.electron?.exitFullscreen?.();
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    setMode('select');
    setError(null);
    setGithubUrl('');
    setName('');
    setDescription('');
    setInstructions('');
    setVersion('1.0.0');
    setAuthor('');
    setTags([]);
    setTagInput('');
    setInstrTab('edit');
    setIsFullscreen(false);
    setIsNativeFullscreen(false);
    setIsGenerating(false);
    setScanResults([]);
    setSelectedScanItems(new Set());
    setIsScanning(false);
    setScanDone(false);
    setImportingCount(0);
    onClose();
  };

  // MD file upload handler
  // MD 文件上传处理
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInstructions(content);
        // Auto-fill name from filename if empty
        if (!name.trim()) {
          const baseName = file.name.replace(/\.md$/i, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
          setName(baseName);
        }
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // Tag handlers
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

  // AI Polish SKILL.md content
  // AI 润色 SKILL.md 内容
  const handleAIPolish = async () => {
    if (!instructions.trim()) {
      setError(t('skill.polishNeedsContent', 'Please write some content first before polishing'));
      return;
    }
    
    if (!defaultChatModel) {
      setError(t('skill.noAiModelConfigured', 'Please configure an AI model in settings first'));
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const config: AIConfig = {
        provider: defaultChatModel.provider,
        apiKey: defaultChatModel.apiKey,
        apiUrl: defaultChatModel.apiUrl,
        model: defaultChatModel.model,
        chatParams: defaultChatModel.chatParams,
      };
      
      const polished = await polishSkillContent(config, instructions, name || undefined);
      setInstructions(polished);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.polishFailed', 'Failed to polish skill content'));
    } finally {
      setIsGenerating(false);
    }
  };

  // AI mode: generate and create in one step
  const handleAICreate = async () => {
    if (!name.trim()) {
      setError(t('skill.nameRequired', 'Please enter a skill name'));
      return;
    }
    if (!description.trim()) {
      setError(t('skill.descriptionRequired', 'Please enter a skill description for AI generation'));
      return;
    }
    if (!defaultChatModel) {
      setError(t('skill.noAiModelConfigured', 'Please configure an AI model in settings first'));
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const config: AIConfig = {
        provider: defaultChatModel.provider,
        apiKey: defaultChatModel.apiKey,
        apiUrl: defaultChatModel.apiUrl,
        model: defaultChatModel.model,
        chatParams: defaultChatModel.chatParams,
      };
      
      const generated = await generateSkillContent(config, name, description, undefined, skillCreatorContent || undefined);
      setInstructions(generated);
      // Auto-switch to manual mode to let user review & create
      setMode('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.generateFailed', 'Failed to generate skill content'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGitHubInstall = async () => {
    if (!githubUrl.trim()) {
      setError(t('skill.enterGithubUrl', 'Please enter a GitHub URL'));
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Parse GitHub URL to extract repo info
      const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error(t('skill.invalidGithubUrl', 'Invalid GitHub URL format'));
      }
      
      const [, owner, repo] = match;
      const repoName = repo.replace(/\.git$/, '');
      
      // For now, create a skill with the repo info
      // TODO: Actually fetch and parse the skill manifest from the repo
      await createSkill({
        name: repoName,
        description: `Skill from ${owner}/${repoName}`,
        protocol_type: 'skill',
        source_url: githubUrl,
        is_favorite: false,
        tags: ['github']
      });
      
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.installFailed', 'Failed to install from GitHub'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCreate = async () => {
    if (!name.trim()) {
      setError(t('skill.nameRequired', 'Please enter a skill name'));
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await createSkill({
        name,
        description,
        instructions,
        content: instructions,
        protocol_type: 'skill',
        is_favorite: false,
        tags,
        version: version || '1.0.0',
        author: author || undefined,
      });
      
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.createFailed', 'Failed to create skill'));
    } finally {
      setIsLoading(false);
    }
  };

  // Scan local skills (preview mode - returns list for user to select)
  // 扫描本地技能（预览模式 - 返回列表供用户选择）
  const handleScanLocal = async () => {
    setIsScanning(true);
    setScanDone(false);
    setError(null);
    setScanResults([]);
    setSelectedScanItems(new Set());
    
    try {
      const allResults: ScannedSkillItem[] = await window.api.skill.scanLocalPreview();
      // Filter out skills that already exist in the library (by name)
      // 过滤掉已经存在于库中的技能（按名称）
      const existingNames = new Set(existingSkills.map(s => s.name.toLowerCase()));
      const results = allResults.filter(r => !existingNames.has(r.name.toLowerCase()));
      setScanResults(results);
      // Auto-select all by default
      setSelectedScanItems(new Set(results.map(r => r.filePath)));
      setScanDone(true);
      if (allResults.length > 0 && results.length === 0) {
        setError(t('skill.allAlreadyImported', 'All found skills already exist in your library.'));
      } else if (allResults.length === 0) {
        setError(t('skill.noSkillsFound', 'No new local SKILL.md files found.'));
      }
    } catch (err) {
      setError(t('skill.scanFailed', 'Failed to scan: ') + String(err));
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle selection of a scanned skill
  const toggleScanItem = (filePath: string) => {
    setSelectedScanItems(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  // Toggle select all / deselect all
  const toggleSelectAll = () => {
    if (selectedScanItems.size === scanResults.length) {
      setSelectedScanItems(new Set());
    } else {
      setSelectedScanItems(new Set(scanResults.map(r => r.filePath)));
    }
  };

  // Import selected scanned skills
  // 导入选中的扫描到的技能
  const handleImportSelected = async () => {
    const toImport = scanResults.filter(r => selectedScanItems.has(r.filePath));
    if (toImport.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    setImportingCount(0);
    
    let imported = 0;
    let failed = 0;
    
    for (const skill of toImport) {
      try {
        await createSkill({
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          content: skill.instructions,
          protocol_type: 'skill',
          is_favorite: false,
          tags: skill.tags,
          version: skill.version,
          author: skill.author,
        });
        imported++;
        setImportingCount(imported);
      } catch (err) {
        // Silently skip duplicates
        failed++;
      }
    }
    
    setIsLoading(false);
    
    if (imported > 0) {
      handleClose();
    } else if (failed > 0) {
      setError(t('skill.allDuplicates', 'All selected skills already exist in your library.'));
    }
  };

  // Native fullscreen: split-screen editor + preview (for manual mode)
  // 原生全屏：左右分屏编辑器 + 预览（手动模式）
  if (isNativeFullscreen && mode === 'manual') {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{t('skill.instructions', 'Instructions (SKILL.md)')}</h2>
            <span className="text-sm text-muted-foreground">{t('common.markdownSupported', 'Supports Markdown')}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <UploadIcon className="w-4 h-4" />
              {t('skill.uploadMd', 'Upload .md')}
            </button>
            <button
              onClick={handleExitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" />
              {t('common.exitFullscreen', 'Exit Fullscreen')}
            </button>
            <button
              onClick={() => { handleManualCreate(); handleExitNativeFullscreen(); }}
              disabled={isLoading || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <SaveIcon className="w-4 h-4" />
              {t('skill.create', 'Create')}
            </button>
          </div>
        </div>
        {/* Split-screen: left editor + right preview */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t('prompt.edit', 'Edit')}
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 w-full p-6 resize-none bg-background border-none outline-none text-base font-mono leading-relaxed"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              autoFocus
              placeholder={t('skill.instructionsPlaceholder', 'Enter skill instructions or SKILL.md content...')}
            />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t('prompt.preview', 'Preview')}
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {instructions ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                    {instructions}
                  </ReactMarkdown>
                ) : (
                  <div className="text-muted-foreground text-sm italic">{t('skill.noContent', 'No content')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt"
          className="hidden"
          onChange={handleFileUpload}
        />
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
      
      {/* Modal - wider for manual/scan mode */}
      <div className={`relative bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col transition-all ${
        mode === 'manual' 
          ? isFullscreen ? 'w-[95vw] h-[95vh]' : 'w-full max-w-2xl max-h-[90vh]'
          : (mode === 'scan' && scanDone && scanResults.length > 0)
            ? 'w-full max-w-2xl max-h-[90vh]'
            : 'w-full max-w-lg max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <CuboidIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {mode === 'select' ? t('skill.addSkill', 'Add Skill') : 
               mode === 'github' ? t('skill.installFromGithub', 'Install from GitHub') :
               mode === 'manual' ? t('skill.createTitle', 'Create Skill') :
               mode === 'ai' ? t('skill.aiCreate', 'AI Create') : t('skill.scanLocal', 'Scan Local')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'manual' && (
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                title={isFullscreen ? t('common.exitFullscreen', 'Exit Fullscreen') : t('common.fullscreen', 'Fullscreen')}
              >
                {isFullscreen ? <Minimize2Icon className="w-4 h-4" /> : <Maximize2Icon className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`p-6 ${mode === 'manual' ? 'flex-1 overflow-y-auto' : ''}`}>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {mode === 'select' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                {t('skill.chooseAddMethod', 'Choose how you want to add a new skill:')}
              </p>
              
              {/* AI Create Option */}
              <button
                onClick={() => setMode('ai')}
                className="w-full flex items-center gap-4 p-4 bg-primary/5 hover:bg-primary/10 border border-primary/30 rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-primary rounded-lg">
                  <BrainIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    {t('skill.aiCreate', 'AI Create')}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-normal">skill-creator</span>
                  </h3>
                  <p className="text-sm text-muted-foreground">{t('skill.aiCreateDesc', 'Describe what you need, AI generates the SKILL.md')}</p>
                </div>
              </button>

              {/* GitHub Option */}
              <button
                onClick={() => setMode('github')}
                className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
                  <GithubIcon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{t('skill.installFromGithub', 'Install from GitHub')}</h3>
                  <p className="text-sm text-muted-foreground">{t('skill.githubDesc', 'Paste a GitHub repository URL')}</p>
                </div>
              </button>

              {/* Manual Option */}
              <button
                onClick={() => setMode('manual')}
                className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
                  <EditIcon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{t('skill.createManually', 'Create Manually')}</h3>
                  <p className="text-sm text-muted-foreground">{t('skill.manualDesc', 'Build a skill from scratch')}</p>
                </div>
              </button>

              {/* Scan Option */}
              <button
                onClick={() => setMode('scan')}
                className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
                  <FolderOpenIcon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{t('skill.scanLocal', 'Scan Local')}</h3>
                  <p className="text-sm text-muted-foreground">{t('skill.scanLocalDesc', 'Detect existing SKILL.md files')}</p>
                </div>
              </button>
            </div>
          )}

          {mode === 'github' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('skill.githubUrl', 'GitHub Repository URL')}</label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/skill-repo"
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('skill.githubUrlHint', 'Enter a GitHub URL containing a skill manifest (manifest.json + SKILL.md)')}
                </p>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMode('select')}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  {t('common.back', 'Back')}
                </button>
                <button
                  onClick={handleGitHubInstall}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                  {t('skill.install', 'Install')}
                </button>
              </div>
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('skill.skillName', 'Skill Name')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setName(value);
                  }}
                  placeholder="my-skill-name"
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t('skill.nameHint', 'Lowercase letters, numbers, and hyphens only, e.g. my-skill-name')}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">{t('skill.skillDescription', 'Description')}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('skill.descriptionPlaceholder', 'What does this skill do?')}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Version & Author (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('skill.version', 'Version')}</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('skill.author', 'Author')}</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder={t('skill.authorPlaceholder', 'Author name')}
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-2">{t('skill.tags', 'Tags')}</label>
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
                    placeholder={t('skill.addTag', 'Add tag')}
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

              {/* Instructions (SKILL.md) with edit/preview tabs + upload + AI generate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    {t('skill.instructions', 'Instructions (SKILL.md)')}
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Upload MD button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                      <UploadIcon className="w-3.5 h-3.5" />
                      {t('skill.uploadMd', 'Upload .md')}
                    </button>
                    {/* AI Polish Button */}
                    <button
                      onClick={handleAIPolish}
                      disabled={isGenerating || !canGenerateWithAI || !instructions.trim()}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        canGenerateWithAI
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }`}
                      title={!canGenerateWithAI ? t('skill.configureAiFirst', 'Please configure AI model in settings first') : !instructions.trim() ? t('skill.polishNeedsContent', 'Write some content first') : t('skill.aiPolishHint', 'Polish content to SKILL.md standard format')}
                    >
                      {isGenerating ? (
                        <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <SparklesIcon className="w-3.5 h-3.5" />
                      )}
                      {isGenerating ? t('skill.polishing', 'Polishing...') : t('skill.aiPolish', 'AI Polish')}
                    </button>
                    {/* Edit/Preview tabs */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                      <button
                        onClick={() => setInstrTab('edit')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          instrTab === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t('prompt.edit', 'Edit')}
                      </button>
                      <button
                        onClick={() => setInstrTab('preview')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          instrTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t('prompt.preview', 'Preview')}
                      </button>
                    </div>
                    {/* Fullscreen button */}
                    <button
                      onClick={handleEnterNativeFullscreen}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                      title={t('common.fullscreen', 'Fullscreen Edit')}
                    >
                      <Maximize2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {!canGenerateWithAI && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {t('skill.aiGenerateHint', 'Configure an AI model in settings to enable AI generation')}
                    </p>
                  </div>
                )}
                {instrTab === 'edit' ? (
                  <textarea
                    ref={textareaRef}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder={t('skill.instructionsPlaceholder', 'Enter skill instructions or SKILL.md content...')}
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
                      <div className="text-muted-foreground text-sm italic">{t('skill.noContent', 'No content')}</div>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t('skill.instructionsHint', 'Supports Markdown format for guiding AI on how to use this skill')}
                </p>
              </div>

              {/* Hidden file input for MD upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {mode === 'ai' && (
            <div className="space-y-4">
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-xs text-primary flex items-center gap-2">
                  <BrainIcon className="w-3.5 h-3.5" />
                  {t('skill.aiCreateHint', 'Uses the Skill Creator skill to generate a professional SKILL.md. You can review and edit before saving.')}
                </p>
              </div>

              {!canGenerateWithAI && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('skill.aiGenerateHint', 'Configure an AI model in settings to enable AI generation')}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">{t('skill.name', 'Name')} *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('skill.namePlaceholder', 'my-skill')}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('skill.description', 'Description')} *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('skill.aiDescPlaceholder', 'Describe what this skill should do, its purpose, and when to use it...')}
                  rows={4}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMode('select')}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  {t('common.back', 'Back')}
                </button>
                <button
                  onClick={handleAICreate}
                  disabled={isGenerating || !canGenerateWithAI || !name.trim() || !description.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isGenerating ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                  {isGenerating ? t('skill.generating', 'Generating...') : t('skill.generateAndReview', 'Generate & Review')}
                </button>
              </div>
            </div>
          )}

          {mode === 'scan' && (
            <div className="space-y-4">
              {/* Before scan or while scanning */}
              {!scanDone && (
                <div className="text-center py-8">
                  <FolderOpenIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="font-medium mb-2">{t('skill.scanLocalTitle', 'Scan for Local Skills')}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('skill.scanLocalHint', 'Automatically detect SKILL.md files from Claude, Cursor, Windsurf and other AI tools.')}
                  </p>
                  <button
                    onClick={handleScanLocal}
                    disabled={isScanning}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isScanning ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                    {isScanning ? t('skill.scanning', 'Scanning...') : t('skill.startScan', 'Start Scan')}
                  </button>
                </div>
              )}

              {/* Scan results */}
              {scanDone && scanResults.length > 0 && (
                <div className="space-y-3">
                  {/* Results header with count and select-all */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {t('skill.scanFound', 'Found {{count}} skill(s)').replace('{{count}}', String(scanResults.length))}
                    </p>
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      {selectedScanItems.size === scanResults.length ? (
                        <><CheckSquareIcon className="w-3.5 h-3.5" /> {t('skill.deselectAll', 'Deselect All')}</>
                      ) : (
                        <><SquareIcon className="w-3.5 h-3.5" /> {t('skill.selectAll', 'Select All')}</>
                      )}
                    </button>
                  </div>

                  {/* Scrollable results list */}
                  <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                    {scanResults.map((skill) => {
                      const isSelected = selectedScanItems.has(skill.filePath);
                      return (
                        <button
                          key={skill.filePath}
                          onClick={() => toggleScanItem(skill.filePath)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? 'border-primary/50 bg-primary/5 hover:bg-primary/10'
                              : 'border-border bg-card hover:bg-accent/50'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className="mt-0.5 shrink-0">
                            {isSelected ? (
                              <CheckSquareIcon className="w-4 h-4 text-primary" />
                            ) : (
                              <SquareIcon className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          {/* Skill info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <FileTextIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium text-sm truncate">{skill.name}</span>
                              <span className="text-xs text-muted-foreground">v{skill.version}</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{skill.description}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              {skill.platforms.map(p => (
                                <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                  {p}
                                </span>
                              ))}
                              {skill.author && skill.author !== 'Local' && (
                                <span className="text-[10px] text-muted-foreground">
                                  {t('skill.author', 'Author')}: {skill.author}
                                </span>
                              )}
                              {skill.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Rescan button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handleScanLocal}
                      disabled={isScanning}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      {isScanning ? <LoaderIcon className="w-3 h-3 animate-spin" /> : <SearchIcon className="w-3 h-3" />}
                      {t('skill.rescan', 'Rescan')}
                    </button>
                  </div>
                </div>
              )}

              {/* Scan done but no results */}
              {scanDone && scanResults.length === 0 && (
                <div className="text-center py-8">
                  <FolderOpenIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('skill.noSkillsFound', 'No new local SKILL.md files found.')}
                  </p>
                  <button
                    onClick={handleScanLocal}
                    disabled={isScanning}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    {isScanning ? <LoaderIcon className="w-3.5 h-3.5 animate-spin" /> : <SearchIcon className="w-3.5 h-3.5" />}
                    {t('skill.rescan', 'Rescan')}
                  </button>
                </div>
              )}
              
              {/* Footer: Back + Import */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => { setMode('select'); setScanDone(false); setScanResults([]); }}
                  className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  {t('common.back', 'Back')}
                </button>
                {scanDone && scanResults.length > 0 && (
                  <button
                    onClick={handleImportSelected}
                    disabled={isLoading || selectedScanItems.size === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <LoaderIcon className="w-4 h-4 animate-spin" />
                        {t('skill.importing', 'Importing...')} ({importingCount}/{selectedScanItems.size})
                      </>
                    ) : (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        {t('skill.importSelected', 'Import Selected')} ({selectedScanItems.size})
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer for manual mode */}
        {mode === 'manual' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-card">
            <button
              onClick={() => setMode('select')}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              {t('common.back', 'Back')}
            </button>
            <button
              onClick={handleManualCreate}
              disabled={isLoading || isGenerating || !name.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {t('skill.create', 'Create')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
