import { useState, useEffect, useMemo } from 'react';
import { Modal, Button } from '../ui';
import { useTranslation } from 'react-i18next';
import { CopyIcon, CheckIcon, BracesIcon, HistoryIcon, CalendarIcon, ClockIcon, PlayIcon, Loader2Icon } from 'lucide-react';

type ModalMode = 'copy' | 'aiTest';

interface VariableInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId: string;
  systemPrompt?: string;
  userPrompt: string;
  mode?: ModalMode;
  onCopy?: (filledPrompt: string) => void;
  onAiTest?: (filledSystemPrompt: string | undefined, filledUserPrompt: string) => void;
  isAiTesting?: boolean;
}

// Parse variables: supports {{name}} and {{name:defaultValue}} formats
// 解析变量：支持 {{name}} 和 {{name:默认值}} 格式
interface ParsedVariable {
  fullMatch: string;
  name: string;
  defaultValue?: string;
}

// Extract variable regex - supports default values
// 提取变量的正则表达式 - 支持默认值
const VARIABLE_REGEX = /\{\{([^}:]+)(?::([^}]*))?\}\}/g;

// System variables
// 系统变量
const SYSTEM_VARIABLES: Record<string, () => string> = {
  'CURRENT_DATE': () => new Date().toLocaleDateString(),
  'CURRENT_TIME': () => new Date().toLocaleTimeString(),
  'CURRENT_DATETIME': () => new Date().toLocaleString(),
  'CURRENT_YEAR': () => new Date().getFullYear().toString(),
  'CURRENT_MONTH': () => (new Date().getMonth() + 1).toString().padStart(2, '0'),
  'CURRENT_DAY': () => new Date().getDate().toString().padStart(2, '0'),
  'CURRENT_WEEKDAY': () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
};

// Get variable history from localStorage
// 从 localStorage 获取历史变量值
function getVariableHistory(promptId: string): Record<string, string> {
  try {
    const history = localStorage.getItem(`prompt_vars_${promptId}`);
    return history ? JSON.parse(history) : {};
  } catch {
    return {};
  }
}

// Save variable values to history
// 保存变量值到历史
function saveVariableHistory(promptId: string, variables: Record<string, string>) {
  try {
    localStorage.setItem(`prompt_vars_${promptId}`, JSON.stringify(variables));
  } catch {
    // ignore
  }
}

export function VariableInputModal({
  isOpen,
  onClose,
  promptId,
  systemPrompt,
  userPrompt,
  mode = 'copy',
  onCopy,
  onAiTest,
  isAiTesting = false,
}: VariableInputModalProps) {
  const { t } = useTranslation();
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Parse all variables (including default values)
  // 解析所有变量（包括默认值）
  const parsedVariables = useMemo(() => {
    const combined = `${systemPrompt || ''}\n${userPrompt}`;
    const matches = combined.matchAll(VARIABLE_REGEX);
    const vars: ParsedVariable[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const name = match[1].trim();
      if (!seen.has(name) && !SYSTEM_VARIABLES[name]) {
        seen.add(name);
        vars.push({
          fullMatch: match[0],
          name,
          defaultValue: match[2]?.trim(),
        });
      }
    }
    return vars;
  }, [systemPrompt, userPrompt]);

  // Initialize variable values (priority: history > default > empty)
  // 初始化变量值（优先级：历史值 > 默认值 > 空）
  useEffect(() => {
    if (isOpen) {
      const history = getVariableHistory(promptId);
      const initialVars: Record<string, string> = {};

      parsedVariables.forEach((v) => {
        initialVars[v.name] = history[v.name] || v.defaultValue || '';
      });

      setVariables(initialVars);
      setCopied(false);
    }
  }, [isOpen, parsedVariables, promptId]);

  // Replace variables to generate final text
  // 替换变量生成最终文本
  const filledPrompt = useMemo(() => {
    let result = userPrompt;
    if (systemPrompt) {
      result = `[System]\n${systemPrompt}\n\n[User]\n${userPrompt}`;
    }

    Object.entries(variables).forEach(([name, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
      result = result.replace(regex, value || `{{${name}}}`);
    });

    return result;
  }, [systemPrompt, userPrompt, variables]);

  // Check if all variables are filled
  // 检查是否所有变量都已填写
  const allFilled = parsedVariables.every((v) => variables[v.name]?.trim());

  // Replace variables (including system variables)
  // 替换变量（包括系统变量）
  const replaceVariables = (text: string) => {
    let result = text;

    // Replace system variables
    // 替换系统变量
    Object.entries(SYSTEM_VARIABLES).forEach(([name, getValue]) => {
      const regex = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
      result = result.replace(regex, getValue());
    });

    // Replace user variables (including default value format)
    // 替换用户变量（包括带默认值的格式）
    parsedVariables.forEach((v) => {
      const value = variables[v.name] || '';
      // Match both {{name}} and {{name:defaultValue}} formats
      // 匹配 {{name}} 和 {{name:默认值}} 两种格式
      const regex = new RegExp(`\\{\\{\\s*${v.name}(?::[^}]*)?\\s*\\}\\}`, 'g');
      result = result.replace(regex, value || `{{${v.name}}}`);
    });

    return result;
  };

  const handleCopy = () => {
    // Save variable history
    // 保存变量历史
    saveVariableHistory(promptId, variables);

    // Replace variables
    // 替换变量
    const result = replaceVariables(userPrompt);

    navigator.clipboard.writeText(result);
    onCopy?.(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAiTest = () => {
    // Save variable history
    // 保存变量历史
    saveVariableHistory(promptId, variables);

    // Replace variables
    // 替换变量
    const filledUserPrompt = replaceVariables(userPrompt);
    const filledSystemPrompt = systemPrompt ? replaceVariables(systemPrompt) : undefined;

    onAiTest?.(filledSystemPrompt, filledUserPrompt);
  };

  // If no variables, copy original text directly
  // 如果没有变量，直接复制原文
  if (parsedVariables.length === 0) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('prompt.variableInput')} size="2xl">
      <div className="flex flex-col max-h-[70vh]">
        {/* Scrollable content / 可滚动内容 */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Variable input / 变量输入 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BracesIcon className="w-4 h-4" />
              <span>{t('prompt.fillVariables')}</span>
            </div>

            <div className="grid gap-3">
              {parsedVariables.map((v) => (
                <div key={v.name} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <label className="text-sm font-medium text-foreground">
                      {t('prompt.variableName', '变量名')}: <span className="text-primary">{v.name}</span>
                    </label>
                    {variables[v.name] && variables[v.name] !== v.defaultValue && (
                      <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                        <HistoryIcon className="w-3 h-3" />
                        {t('prompt.fromHistory')}
                      </span>
                    )}
                  </div>
                  {v.defaultValue && (
                    <div className="text-xs text-muted-foreground">
                      {t('prompt.exampleValue', '示例值')}: <span className="text-foreground/80">{v.defaultValue}</span>
                    </div>
                  )}
                  <textarea
                    value={variables[v.name] || ''}
                    onChange={(e) => {
                      setVariables({ ...variables, [v.name]: e.target.value });
                      // Auto adjust height / 自动调整高度
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    placeholder={`${t('prompt.inputVariable', { name: v.name })}${v.defaultValue ? ` ${t('prompt.exampleHint', '例如')}: ${v.defaultValue}` : ''}`}
                    rows={1}
                    className="w-full min-h-[40px] px-4 py-2.5 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200 resize-none overflow-hidden"
                    style={{ height: 'auto' }}
                    onFocus={(e) => {
                      // Initialize height / 初始化高度
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Preview / 预览 */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">{t('prompt.previewResult')}</div>
            <div className="p-4 rounded-xl bg-muted/50 font-mono text-sm leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {filledPrompt}
            </div>
          </div>
        </div>

        {/* Fixed action buttons / 固定操作按钮 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4 shrink-0">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {mode === 'copy' ? (
            <Button
              variant="primary"
              onClick={handleCopy}
              disabled={!allFilled}
            >
              {copied ? (
                <>
                  <CheckIcon className="w-4 h-4 mr-1.5" />
                  {t('prompt.copied')}
                </>
              ) : (
                <>
                  <CopyIcon className="w-4 h-4 mr-1.5" />
                  {t('prompt.copyResult')}
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleAiTest}
              disabled={!allFilled || isAiTesting}
              className="bg-green-500 hover:bg-green-600"
            >
              {isAiTesting ? (
                <>
                  <Loader2Icon className="w-4 h-4 mr-1.5 animate-spin" />
                  {t('prompt.testing')}
                </>
              ) : (
                <>
                  <PlayIcon className="w-4 h-4 mr-1.5" />
                  {t('prompt.aiTest')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
