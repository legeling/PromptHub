import { useState, useEffect, useMemo } from 'react';
import { Modal, Button } from '../ui';
import { useTranslation } from 'react-i18next';
import { CopyIcon, CheckIcon, BracesIcon, HistoryIcon, CalendarIcon, ClockIcon, PlayIcon, Loader2Icon } from 'lucide-react';

type ModalMode = 'copy' | 'aiTest';

// Output format type for AI test (Issue #38)
// AI 测试的输出格式类型
export type OutputFormatType = 'text' | 'json_object' | 'json_schema';
export interface OutputFormatConfig {
  type: OutputFormatType;
  jsonSchema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
}

interface VariableInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId: string;
  systemPrompt?: string;
  userPrompt: string;
  mode?: ModalMode;
  onCopy?: (filledPrompt: string) => void;
  onAiTest?: (filledSystemPrompt: string | undefined, filledUserPrompt: string, outputFormat?: OutputFormatConfig) => void;
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
  // Output format state (Issue #38)
  // 输出格式状态
  const [outputFormat, setOutputFormat] = useState<OutputFormatType>('text');
  const [jsonSchemaName, setJsonSchemaName] = useState('response');
  const [jsonSchemaContent, setJsonSchemaContent] = useState('');

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

    // Build output format config
    // 构建输出格式配置
    let formatConfig: OutputFormatConfig | undefined;
    if (outputFormat !== 'text') {
      formatConfig = { type: outputFormat };
      if (outputFormat === 'json_schema' && jsonSchemaContent) {
        try {
          formatConfig.jsonSchema = {
            name: jsonSchemaName || 'response',
            strict: true,
            schema: JSON.parse(jsonSchemaContent),
          };
        } catch {
          // Invalid JSON, ignore schema
        }
      }
    }

    onAiTest?.(filledSystemPrompt, filledUserPrompt, formatConfig);
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
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4 shrink-0">
          {/* Output format selector (Issue #38) - compact version in footer */}
          {mode === 'aiTest' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('prompt.outputFormat')}:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setOutputFormat('text')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${outputFormat === 'text'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatText')}
                </button>
                <button
                  onClick={() => setOutputFormat('json_object')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${outputFormat === 'json_object'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  JSON
                </button>
                <button
                  onClick={() => setOutputFormat('json_schema')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${outputFormat === 'json_schema'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  Schema
                </button>
              </div>
            </div>
          ) : (
            <div /> // Empty placeholder for copy mode
          )}

          <div className="flex gap-3">
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

        {/* JSON Schema editor modal - show when json_schema selected */}
        {mode === 'aiTest' && outputFormat === 'json_schema' && (
          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border space-y-2">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">{t('prompt.jsonSchemaName')}</label>
                <input
                  type="text"
                  value={jsonSchemaName}
                  onChange={(e) => setJsonSchemaName(e.target.value)}
                  placeholder="response"
                  className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('prompt.jsonSchemaContent')}</label>
              <textarea
                value={jsonSchemaContent}
                onChange={(e) => setJsonSchemaContent(e.target.value)}
                placeholder={t('prompt.jsonSchemaPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <p className="text-xs text-muted-foreground">{t('prompt.jsonSchemaHint')}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
