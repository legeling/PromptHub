import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Modal, Button } from '../ui';
import { useToast } from '../ui/Toast';
import { useTranslation } from 'react-i18next';
import { CopyIcon, CheckIcon, BracesIcon, HistoryIcon, CalendarIcon, ClockIcon, PlayIcon, Loader2Icon, ImageIcon, XIcon } from 'lucide-react';
import type { ChatImageAttachment } from '../../services/ai';
import {
  parsePromptVariables,
  replacePromptVariables,
  type ParsedPromptVariable,
} from './prompt-modal-utils';
import { copyTextToClipboard } from './prompt-copy-utils';

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

export interface VariableInputImageAttachment extends ChatImageAttachment {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
}

interface VariableInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId: string;
  systemPrompt?: string;
  userPrompt: string;
  mode?: ModalMode;
  onCopy?: (filledPrompt: string) => void;
  onAiTest?: (
    filledSystemPrompt: string | undefined,
    filledUserPrompt: string,
    outputFormat?: OutputFormatConfig,
    imageAttachments?: VariableInputImageAttachment[],
  ) => void;
  isAiTesting?: boolean;
}

const MAX_AI_TEST_IMAGES = 8;
const MAX_AI_TEST_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AI_TEST_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

// Parse variables: supports {{name}} and {{name:defaultValue}} formats
// 解析变量：支持 {{name}} 和 {{name:默认值}} 格式
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
  const { showToast } = useToast();
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const modalSessionRef = useRef(0);
  // Output format state (Issue #38)
  // 输出格式状态
  const [outputFormat, setOutputFormat] = useState<OutputFormatType>('text');
  const [jsonSchemaName, setJsonSchemaName] = useState('response');
  const [jsonSchemaContent, setJsonSchemaContent] = useState('');
  const [imageAttachments, setImageAttachments] = useState<VariableInputImageAttachment[]>([]);

  // Parse all variables (including default values)
  // 解析所有变量（包括默认值）
  const parsedVariables = useMemo(() => {
    const combined =
      mode === 'copy' ? userPrompt : `${systemPrompt || ''}\n${userPrompt}`;
    return parsePromptVariables(combined).filter(
      (variable: ParsedPromptVariable) => !SYSTEM_VARIABLES[variable.name],
    );
  }, [mode, systemPrompt, userPrompt]);

  // Initialize variable values (priority: history > default > empty)
  // 初始化变量值（优先级：历史值 > 默认值 > 空）
  useEffect(() => {
    if (isOpen) {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
      const history = getVariableHistory(promptId);
      const initialVars: Record<string, string> = {};

      parsedVariables.forEach((v) => {
        initialVars[v.name] = history[v.name] || v.defaultValue || '';
      });

      setVariables(initialVars);
      setCopied(false);
      setImageAttachments([]);
    }
  }, [isOpen, parsedVariables, promptId]);

  const clearCopiedTimer = useCallback(() => {
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
      modalSessionRef.current += 1;
      clearCopiedTimer();
    };
  }, [clearCopiedTimer]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    modalSessionRef.current += 1;

    if (!isOpen) {
      clearCopiedTimer();
      setCopied(false);
    }
  }, [clearCopiedTimer, isOpen, promptId]);

  const canApplyAsyncResult = useCallback(
    (session: number) =>
      isMountedRef.current &&
      isOpenRef.current &&
      modalSessionRef.current === session,
    [],
  );

  const formatImageSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const readImageFileAsAttachment = (file: File): Promise<VariableInputImageAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error(t('prompt.aiTestImageReadFailed')));
          return;
        }

        const commaIndex = reader.result.indexOf(',');
        if (commaIndex === -1) {
          reject(new Error(t('prompt.aiTestImageReadFailed')));
          return;
        }

        resolve({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl: reader.result,
          base64: reader.result.slice(commaIndex + 1),
        });
      };
      reader.onerror = () => reject(new Error(t('prompt.aiTestImageReadFailed')));
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_AI_TEST_IMAGES - imageAttachments.length;
    if (remainingSlots <= 0) {
      showToast(t('prompt.aiTestImageLimit', { count: MAX_AI_TEST_IMAGES }), 'error');
      return;
    }

    const selectedFiles = Array.from(files);
    if (selectedFiles.length > remainingSlots) {
      showToast(t('prompt.aiTestImageLimit', { count: MAX_AI_TEST_IMAGES }), 'error');
    }

    const acceptedFiles: File[] = [];
    for (const file of selectedFiles.slice(0, remainingSlots)) {
      if (!SUPPORTED_AI_TEST_IMAGE_MIME_TYPES.has(file.type)) {
        showToast(t('prompt.aiTestImageUnsupported', { name: file.name }), 'error');
        continue;
      }
      if (file.size > MAX_AI_TEST_IMAGE_BYTES) {
        showToast(t('prompt.aiTestImageTooLarge', { name: file.name, size: formatImageSize(MAX_AI_TEST_IMAGE_BYTES) }), 'error');
        continue;
      }
      acceptedFiles.push(file);
    }

    if (acceptedFiles.length === 0) return;

    const selectionSession = modalSessionRef.current;

    try {
      const nextAttachments = await Promise.all(acceptedFiles.map(readImageFileAsAttachment));
      if (!canApplyAsyncResult(selectionSession)) {
        return;
      }
      setImageAttachments((prev) => [...prev, ...nextAttachments].slice(0, MAX_AI_TEST_IMAGES));
    } catch {
      // Ignore read failures here; the user can retry selecting the image.
    }
  };

  // Replace variables to generate final text
  // 替换变量生成最终文本
  const filledPrompt = useMemo(() => {
    let result = userPrompt;
    if (mode !== 'copy' && systemPrompt) {
      result = `[System]\n${systemPrompt}\n\n[User]\n${userPrompt}`;
    }

    return replacePromptVariables(result, variables);
  }, [mode, systemPrompt, userPrompt, variables]);

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
    result = replacePromptVariables(result, variables);

    return result;
  };

  const handleCopy = async () => {
    // Save variable history
    // 保存变量历史
    saveVariableHistory(promptId, variables);

    const filledUserPrompt = replaceVariables(userPrompt);
    const result = filledUserPrompt;
    const copySession = modalSessionRef.current;

    try {
      await copyTextToClipboard(result);
    } catch {
      return;
    }

    if (!canApplyAsyncResult(copySession)) {
      return;
    }

    try {
      await onCopy?.(result);
    } catch {
      return;
    }

    if (!canApplyAsyncResult(copySession)) {
      return;
    }

    setCopied(true);
    clearCopiedTimer();
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 2000);
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

    onAiTest?.(filledSystemPrompt, filledUserPrompt, formatConfig, imageAttachments);
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
              <BracesIcon className="w-4 h-4" aria-hidden="true" />
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
                        <HistoryIcon className="w-3 h-3" aria-hidden="true" />
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
                    className="w-full min-h-[40px] px-4 py-2.5 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-base resize-none overflow-hidden"
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

          {mode === 'aiTest' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{t('prompt.aiTestAttachments')}</div>
                  <p className="text-xs text-muted-foreground">
                    {t('prompt.aiTestAttachmentHint', {
                      count: MAX_AI_TEST_IMAGES,
                      size: formatImageSize(MAX_AI_TEST_IMAGE_BYTES),
                    })}
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-accent transition-colors">
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  {t('prompt.aiTestAddImages')}
                  <input
                    type="file"
                    aria-label={t('prompt.aiTestAddImages')}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleImageSelection(event.currentTarget.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              {imageAttachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {imageAttachments.map((attachment) => (
                    <div key={attachment.id} className="relative overflow-hidden rounded-lg border border-border bg-muted/40">
                      <img src={attachment.dataUrl} alt={attachment.name} className="h-20 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImageAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                        aria-label={t('prompt.aiTestRemoveImage')}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                        title={t('prompt.aiTestRemoveImage')}
                      >
                        <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <div className="px-2 py-1.5">
                        <p className="truncate text-xs font-medium" title={attachment.name}>{attachment.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatImageSize(attachment.size)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed action buttons / 固定操作按钮 */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4 shrink-0">
          {/* Output format selector (Issue #38) - compact version in footer */}
          {mode === 'aiTest' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('prompt.outputFormat')}:</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setOutputFormat('text')}
                  aria-pressed={outputFormat === 'text'}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${outputFormat === 'text'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatText')}
                </button>
                <button
                  type="button"
                  onClick={() => setOutputFormat('json_object')}
                  aria-pressed={outputFormat === 'json_object'}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${outputFormat === 'json_object'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setOutputFormat('json_schema')}
                  aria-pressed={outputFormat === 'json_schema'}
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
                onClick={() => void handleCopy()}
                disabled={!allFilled}
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    {t('prompt.copied')}
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4 mr-1.5" aria-hidden="true" />
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
                    <Loader2Icon
                      className="w-4 h-4 mr-1.5 animate-spin"
                      aria-hidden="true"
                    />
                    {t('prompt.testing')}
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-4 h-4 mr-1.5" aria-hidden="true" />
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
