import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayIcon, LoaderIcon, CopyIcon, CheckIcon, GitCompareIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult } from '../../services/ai';
import { useSettingsStore } from '../../stores/settings.store';
import type { Prompt } from '../../../shared/types';

interface AiTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt | null;
  filledSystemPrompt?: string;
  filledUserPrompt?: string;
  onUsageIncrement?: (promptId: string) => void;
  onSaveResponse?: (promptId: string, response: string) => void;
}

export function AiTestModal({
  isOpen,
  onClose,
  prompt,
  filledSystemPrompt,
  filledUserPrompt,
  onUsageIncrement,
  onSaveResponse,
}: AiTestModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  // 分离单模型和多模型的 loading 状态
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<AITestResult[] | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  // 变量填充状态
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // AI 设置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const aiModels = useSettingsStore((state) => state.aiModels);

  // 提取变量
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches;
  };

  // 获取所有变量
  const allVariables = useMemo(() => {
    if (!prompt) return [];
    const sysVars = extractVariables(prompt.systemPrompt || '');
    const userVars = extractVariables(prompt.userPrompt);
    return [...new Set([...sysVars, ...userVars])];
  }, [prompt]);

  // 重置状态
  useEffect(() => {
    if (isOpen && prompt) {
      setAiResponse(null);
      setCompareResults(null);
      setIsSingleLoading(false);
      setIsCompareLoading(false);
      // 初始化变量值
      const initialValues: Record<string, string> = {};
      allVariables.forEach((v) => {
        initialValues[v] = '';
      });
      setVariableValues(initialValues);
    }
  }, [isOpen, prompt?.id]);

  if (!prompt) return null;

  // 替换变量
  const replaceVariables = (text: string): string => {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      return variableValues[varName] || match;
    });
  };

  const systemPrompt = filledSystemPrompt ?? replaceVariables(prompt.systemPrompt || '');
  const userPrompt = filledUserPrompt ?? replaceVariables(prompt.userPrompt);

  // 单模型测试
  const runSingleTest = async () => {
    if (!aiApiKey) return;
    
    setIsSingleLoading(true);
    setAiResponse(null);
    
    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }
    
    try {
      const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);
      const response = await chatCompletion(
        { provider: aiProvider, apiKey: aiApiKey, apiUrl: aiApiUrl, model: aiModel },
        messages
      );
      setAiResponse(response);
      // 保存 AI 响应到 Prompt
      if (onSaveResponse && response) {
        onSaveResponse(prompt.id, response);
      }
    } catch (error) {
      setAiResponse(`${t('common.error')}: ${error instanceof Error ? error.message : t('common.error')}`);
    } finally {
      setIsSingleLoading(false);
    }
  };

  // 多模型对比
  const runCompare = async () => {
    if (selectedModelIds.length < 2) return;
    
    setIsCompareLoading(true);
    setCompareResults(null);
    
    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }
    
    const selectedConfigs = aiModels
      .filter((m) => selectedModelIds.includes(m.id))
      .map((m) => ({
        provider: m.provider,
        apiKey: m.apiKey,
        apiUrl: m.apiUrl,
        model: m.model,
      }));

    const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);

    try {
      const result = await multiModelCompare(selectedConfigs, messages);
      setCompareResults(result.results);
    } catch (error) {
      // Handle error
    } finally {
      setIsCompareLoading(false);
    }
  };

  // 切换模型选择
  const toggleModelSelection = (modelId: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
    );
  };

  // 复制响应
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('prompt.aiTest')}
      size="2xl"
    >
      <div className="space-y-4">
        {/* 模式切换 */}
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={() => setMode('single')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'single'
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <PlayIcon className="w-4 h-4" />
            {t('prompt.aiTest')}
          </button>
          <button
            onClick={() => setMode('compare')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'compare'
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <GitCompareIcon className="w-4 h-4" />
            {t('settings.multiModelCompare')}
          </button>
        </div>

        {/* 变量填充 */}
        {allVariables.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.fillVariables')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allVariables.map((variable) => (
                <div key={variable} className="space-y-1">
                  <label className="text-xs text-muted-foreground font-mono">{`{{${variable}}}`}</label>
                  <input
                    type="text"
                    value={variableValues[variable] || ''}
                    onChange={(e) => setVariableValues((prev) => ({ ...prev, [variable]: e.target.value }))}
                    placeholder={t('prompt.enterValue')}
                    className="w-full px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prompt 预览 */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.userPrompt')}</h4>
          <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap">{userPrompt}</p>
          </div>
        </div>

        {/* 单模型测试 */}
        {mode === 'single' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('settings.model')}: {aiModel || '-'}
              </span>
              <button
                onClick={runSingleTest}
                disabled={isSingleLoading || !aiApiKey}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSingleLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
                {isSingleLoading ? t('prompt.testing') : t('prompt.aiTest')}
              </button>
            </div>

            {/* 响应结果 */}
            {aiResponse && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.aiResponse')}</h4>
                  <button
                    onClick={() => handleCopy(aiResponse)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                    {copied ? t('prompt.copied') : t('prompt.copyResponse')}
                  </button>
                </div>
                <div className="bg-card border border-border rounded-lg p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{aiResponse}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 多模型对比 */}
        {mode === 'compare' && (
          <div className="space-y-4">
            {/* 模型选择 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('prompt.selectModelsHint')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {aiModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => toggleModelSelection(model.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedModelIds.includes(model.id)
                        ? 'bg-primary text-white'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {model.name || model.model}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('prompt.compareModels', { count: selectedModelIds.length })}
              </span>
              <button
                onClick={runCompare}
                disabled={isCompareLoading || selectedModelIds.length < 2}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isCompareLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <GitCompareIcon className="w-4 h-4" />
                )}
                {isCompareLoading ? t('prompt.comparing') : t('settings.runCompare')}
              </button>
            </div>

            {/* 对比结果 */}
            {compareResults && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
                {compareResults.map((res, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      res.success ? 'border-border bg-card' : 'border-destructive/50 bg-destructive/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium truncate">{res.model}</span>
                      <span className="text-[10px] text-muted-foreground">{res.latency}ms</span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                      {res.success ? (res.response || '(空)') : (res.error || '未知错误')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
