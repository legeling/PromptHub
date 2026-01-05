import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SparklesIcon, XIcon, FolderIcon, Loader2Icon, Wand2Icon } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { chatCompletion, type AIConfig } from '../../services/ai';
import { renderFolderIcon } from '../layout/folderIconHelper';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    userPrompt: string;
    systemPrompt?: string;
    description?: string;
    folderId?: string;
    source?: string;
  }) => Promise<any>;
}

export function QuickAddModal({ isOpen, onClose, onCreate }: QuickAddModalProps) {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const prompts = usePromptStore((state) => state.prompts);
  
  const [promptText, setPromptText] = useState('');
  const [source, setSource] = useState('');
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  
  const sourceHistory = useSettingsStore((state) => state.sourceHistory);
  const addSourceHistory = useSettingsStore((state) => state.addSourceHistory);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if AI is configured
  const hasAiConfig = aiModels.length > 0 || (aiApiKey && aiApiKey.trim() !== '');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPromptText('');
      setSource('');
      setSelectedFolderId(undefined);
      setIsSubmitting(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle create
  const handleCreate = async () => {
    if (!promptText.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    // Create prompt immediately with placeholder info
    const createdPrompt = await onCreate({
      title: t('quickAdd.analyzing') || '正在分析...',
      userPrompt: promptText,
      folderId: selectedFolderId,
      source: source.trim() || undefined,
    });
    
    // 保存来源到历史 / Save source to history
    if (source.trim()) {
      addSourceHistory(source.trim());
    }
    
    onClose();

    // Background AI analysis
    if (hasAiConfig && createdPrompt) {
      try {
        const folderNames = folders.map(f => f.name).join(', ');
        const existingTags = [...new Set(prompts.flatMap(p => p.tags || []))].sort();
        const tagsString = existingTags.length > 0 ? existingTags.join(', ') : '无现有标签';

        const analysisPrompt = `请分析以下用户提供的 Prompt，并返回 JSON 格式的结果：
  
用户 Prompt:
"""
${promptText}
"""

可用的文件夹列表：
${folderNames || '暂无文件夹'}

已知存在的标签（请优先从这些标签中提取或匹配）：
${tagsString}

请分析并返回以下 JSON 格式（不要包含任何其他文字，只返回纯 JSON）：
{
  "title": "为这个 Prompt 起一个简洁的标题（不超过20字）",
  "systemPrompt": "如果 Prompt 中包含系统提示词/角色设定，提取出来；如果没有，根据 Prompt 内容生成一个合适的系统提示词",
  "description": "用一句话描述这个 Prompt 的用途（不超过50字）",
  "suggestedFolder": "根据内容推荐最适合的文件夹名称，如果没有合适的则返回 null",
  "tags": ["根据内容提取关键词作为标签，优先使用已存在的标签，如果必要可以生成1-2个新标签"]
}`;

        const aiModel = aiModels.find(m => m.isDefault) || aiModels[0];
        if (aiModel) {
          const config: AIConfig = {
            provider: aiModel.provider,
            apiKey: aiModel.apiKey,
            apiUrl: aiModel.apiUrl,
            model: aiModel.model,
          };
          
          const aiResult = await chatCompletion(config, [
            { role: 'user', content: analysisPrompt }
          ], { temperature: 0.3 });
          
          const responseContent = aiResult.content;
          const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            const parsedResult = JSON.parse(jsonMatch[0]);
            let targetFolderId = selectedFolderId;

            // If no folder selected, use AI suggestion
            if (!targetFolderId && parsedResult.suggestedFolder) {
              const matchedFolder = folders.find(f => 
                f.name.toLowerCase().includes(parsedResult.suggestedFolder.toLowerCase()) ||
                parsedResult.suggestedFolder.toLowerCase().includes(f.name.toLowerCase())
              );
              if (matchedFolder) {
                targetFolderId = matchedFolder.id;
              }
            }

            // Update prompt with AI results
            const { usePromptStore } = await import('../../stores/prompt.store');
            await usePromptStore.getState().updatePrompt(createdPrompt.id, {
              title: parsedResult.title || createdPrompt.title,
              systemPrompt: parsedResult.systemPrompt,
              description: parsedResult.description,
              folderId: targetFolderId,
              tags: Array.isArray(parsedResult.tags) ? parsedResult.tags : [],
            });
          }
        }
      } catch (err) {
        console.error('Background AI analysis failed:', err);
        // Fallback title if analysis fails
        const { usePromptStore } = await import('../../stores/prompt.store');
        await usePromptStore.getState().updatePrompt(createdPrompt.id, {
          title: promptText.trim().split('\n')[0].slice(0, 30) || 'New Prompt',
        });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('quickAdd.title') || '快速添加 Prompt'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('quickAdd.pastePrompt') || '粘贴你的 Prompt'}
            </label>
            <textarea
              ref={textareaRef}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={t('quickAdd.placeholder') || '在这里粘贴你的 Prompt 内容...'}
              className="w-full h-48 px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm leading-relaxed"
            />
          </div>

          <div className="space-y-2 relative">
            <label className="text-sm font-medium text-muted-foreground">
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
                className="w-full h-10 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
              />
              {showSourceSuggestions && sourceHistory.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                  {sourceHistory
                    .filter(s => s.toLowerCase().includes(source.toLowerCase()))
                    .slice(0, 8)
                    .map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="w-full px-4 py-2 text-sm text-left hover:bg-accent transition-colors truncate"
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('prompt.folderOptional') || '保存到文件夹（可选）'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              <button
                onClick={() => setSelectedFolderId(undefined)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                  !selectedFolderId 
                    ? 'bg-primary/10 border-primary/30 text-primary' 
                    : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <Wand2Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('quickAdd.smartFolder') || 'AI 智能分类'}</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    selectedFolderId === folder.id
                      ? 'bg-primary/10 border-primary/30 text-primary' 
                      : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50'
                  }`}
                  title={folder.name}
                >
                  <span className="shrink-0 flex items-center justify-center w-5 h-5">
                    {renderFolderIcon(folder.icon)}
                  </span>
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {t('common.cancel') || '取消'}
          </button>
          <button
            onClick={handleCreate}
            disabled={!promptText.trim() || isSubmitting}
            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-primary/20"
          >
            {isSubmitting && <Loader2Icon className="w-4 h-4 animate-spin" />}
            {t('quickAdd.create') || '立即创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
