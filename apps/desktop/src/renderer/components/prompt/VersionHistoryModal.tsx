import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';
import {
  ClockIcon,
  RotateCcwIcon,
  GitCompareIcon,
  PlusIcon,
  MinusIcon,
  SparklesIcon,
  TrashIcon,
  FileTextIcon,
  TableIcon,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { deletePromptVersion, getPromptVersions } from '../../services/database';
import { scheduleAllSaveSync } from '../../services/webdav-save-sync';
import type { Prompt, PromptVersion, Variable } from '@prompthub/shared/types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  onRestore: (version: PromptVersion) => void;
}

// Calculate LCS (Longest Common Subsequence) of two strings for diff
// 计算两个字符串的 LCS (最长公共子序列) 用于 diff
function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

interface DiffLine {
  type: 'add' | 'remove' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

type PromptHistoryViewMode = 'detail' | 'diff' | 'table';
type PromptVersionFieldKey =
  | 'systemPrompt'
  | 'userPrompt'
  | 'variables'
  | 'aiResponse'
  | 'note';

interface VersionFieldDefinition {
  key: PromptVersionFieldKey;
  label: string;
  monospace: boolean;
}

interface TableFieldDiff {
  field: VersionFieldDefinition;
  from: PromptVersion;
  to: PromptVersion;
  oldText: string;
  newText: string;
}

const VARIABLE_TOKEN_PATTERN = /\{\{([^}:]+)(?::([^}]*))?\}\}/g;

function normalizeStoredVariables(value: unknown): Variable[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((variable): Variable | null => {
      if (typeof variable === 'string') {
        const name = variable.trim();
        return name
          ? { name, type: 'text', required: false }
          : null;
      }
      if (!variable || typeof variable !== 'object') {
        return null;
      }
      const candidate = variable as Partial<Variable>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      return name
        ? {
            name,
            type: candidate.type || 'text',
            label: candidate.label,
            defaultValue: candidate.defaultValue,
            options: candidate.options,
            required: candidate.required ?? false,
          }
        : null;
    })
    .filter((variable): variable is Variable => variable !== null);
}

function extractVariablesFromPromptText(version: PromptVersion): Variable[] {
  const variables = new Map<string, Variable>();
  const text = `${version.systemPrompt || ''}\n${version.userPrompt || ''}`;

  for (const match of text.matchAll(VARIABLE_TOKEN_PATTERN)) {
    const name = match[1]?.trim();
    if (!name || variables.has(name)) {
      continue;
    }
    variables.set(name, {
      name,
      type: 'text',
      defaultValue: match[2],
      required: false,
    });
  }

  return Array.from(variables.values());
}

function getVersionVariables(version: PromptVersion): Variable[] {
  const storedVariables = normalizeStoredVariables(version.variables);
  return storedVariables.length > 0
    ? storedVariables
    : extractVariablesFromPromptText(version);
}

function normalizeVersionField(
  version: PromptVersion,
  field: PromptVersionFieldKey,
): string {
  if (field === 'variables') {
    return JSON.stringify(getVersionVariables(version), null, 2);
  }
  return String(version[field] ?? '');
}

function summarizeVersionField(
  version: PromptVersion,
  field: PromptVersionFieldKey,
  emptyLabel: string,
): string {
  if (field === 'variables') {
    const variables = getVersionVariables(version);
    if (variables.length === 0) {
      return emptyLabel;
    }
    return variables
      .map((variable) => variable.label || variable.name)
      .filter(Boolean)
      .join(', ');
  }

  const value = normalizeVersionField(version, field).trim();
  return value.length > 0 ? value : emptyLabel;
}

// Generate git-style diff
// 生成 git 风格的 diff
function generateDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  
  if (oldText === newText) {
    return oldLines.map((line, i) => ({
      type: 'unchanged' as const,
      content: line,
      oldLineNum: i + 1,
      newLineNum: i + 1,
    }));
  }
  
  const dp = computeLCS(oldLines, newLines);
  const diff: DiffLine[] = [];
  
  let i = oldLines.length;
  let j = newLines.length;
  const stack: DiffLine[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ 
        type: 'unchanged', 
        content: oldLines[i - 1], 
        oldLineNum: i, 
        newLineNum: j 
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ 
        type: 'add', 
        content: newLines[j - 1], 
        newLineNum: j 
      });
      j--;
    } else if (i > 0) {
      stack.push({ 
        type: 'remove', 
        content: oldLines[i - 1], 
        oldLineNum: i 
      });
      i--;
    }
  }
  
  while (stack.length > 0) {
    diff.push(stack.pop()!);
  }
  
  return diff;
}

// Git-style diff view
// Git 风格差异视图
function GitDiffView({
  oldText,
  newText,
  label,
  emptyLabel,
}: {
  oldText: string;
  newText: string;
  label: string;
  emptyLabel: string;
}) {
  const diff = useMemo(() => generateDiff(oldText, newText), [oldText, newText]);
  
  const stats = useMemo(() => {
    const added = diff.filter(d => d.type === 'add').length;
    const removed = diff.filter(d => d.type === 'remove').length;
    return { added, removed };
  }, [diff]);
  
  const isUnchanged = stats.added === 0 && stats.removed === 0;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase">{label}</div>
        {!isUnchanged && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <PlusIcon className="w-3 h-3" />
              {stats.added}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <MinusIcon className="w-3 h-3" />
              {stats.removed}
            </span>
          </div>
        )}
      </div>
      
      {isUnchanged ? (
        <div className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
          {emptyLabel}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden font-mono text-xs">
          <div className="max-h-64 overflow-y-auto">
            {diff.map((line, index) => (
              <div
                key={index}
                className={`flex ${
                  line.type === 'add' 
                    ? 'bg-green-500/15 text-green-700 dark:text-green-300' 
                    : line.type === 'remove' 
                      ? 'bg-red-500/15 text-red-700 dark:text-red-300' 
                      : 'bg-transparent text-foreground/80'
                }`}
              >
                {/* Line numbers */}
                {/* 行号 */}
                <div className="flex-shrink-0 w-16 flex text-muted-foreground/50 select-none border-r border-border/50">
                  <span className="w-8 text-right px-1 border-r border-border/30">
                    {line.oldLineNum || ''}
                  </span>
                  <span className="w-8 text-right px-1">
                    {line.newLineNum || ''}
                  </span>
                </div>
                {/* Symbol */}
                {/* 符号 */}
                <div className={`flex-shrink-0 w-5 text-center font-bold ${
                  line.type === 'add' ? 'text-green-600' : line.type === 'remove' ? 'text-red-600' : ''
                }`}>
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </div>
                {/* Content */}
                {/* 内容 */}
                <div className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
                  {line.content || ' '}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionMatrixView({
  versions,
  fields,
  selectedVersion,
  onSelectVersion,
  onOpenFieldDiff,
  emptyLabel,
  tableLabel,
  versionLabel,
  timeLabel,
}: {
  versions: PromptVersion[];
  fields: VersionFieldDefinition[];
  selectedVersion: PromptVersion | null;
  onSelectVersion: (version: PromptVersion) => void;
  onOpenFieldDiff: (diff: TableFieldDiff) => void;
  emptyLabel: string;
  tableLabel: string;
  versionLabel: string;
  timeLabel: string;
}) {
  return (
    <div className="min-h-0 overflow-hidden rounded-xl border border-border app-wallpaper-surface">
      <div className="max-h-[460px] overflow-auto">
        <table
          aria-label={tableLabel}
          className="min-w-[980px] w-full border-separate border-spacing-0 text-sm"
        >
          <thead className="sticky top-0 z-20 app-wallpaper-panel-strong">
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="sticky left-0 z-30 w-24 border-b border-r border-border app-wallpaper-panel-strong px-3 py-2 font-medium">
                {versionLabel}
              </th>
              <th className="w-44 border-b border-r border-border px-3 py-2 font-medium">
                {timeLabel}
              </th>
              {fields.map((field) => (
                <th
                  key={field.key}
                  className="w-56 border-b border-r border-border px-3 py-2 font-medium last:border-r-0"
                >
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((version, index) => {
              const previousVersion = versions[index + 1] ?? null;
              const isSelected = selectedVersion?.id === version.id;
              const rowId = version.id === 'current' ? 'current' : `v${version.version}`;

              return (
                <tr
                  key={version.id}
                  className={isSelected ? 'bg-primary/5' : 'bg-background/40'}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-border app-wallpaper-panel-strong px-3 py-3 align-top"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectVersion(version)}
                      className={`rounded-lg px-2 py-1 text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      v{version.version}
                    </button>
                  </th>
                  <td className="border-b border-r border-border px-3 py-3 align-top text-xs text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString()}
                  </td>
                  {fields.map((field) => {
                    const currentValue = normalizeVersionField(version, field.key);
                    const previousValue = previousVersion
                      ? normalizeVersionField(previousVersion, field.key)
                      : null;
                    const changeState = previousVersion
                      ? currentValue === previousValue
                        ? 'unchanged'
                        : 'changed'
                      : 'baseline';
                    const cellClass =
                      changeState === 'changed'
                        ? 'border-primary/25 bg-primary/10 text-foreground hover:bg-primary/15'
                        : changeState === 'baseline'
                          ? 'bg-muted/20 text-muted-foreground'
                          : 'text-muted-foreground hover:bg-muted/40';
                    const content = summarizeVersionField(
                      version,
                      field.key,
                      emptyLabel,
                    );

                    return (
                      <td
                        key={field.key}
                        className={`border-b border-r border-border p-0 align-top last:border-r-0 ${cellClass}`}
                        data-testid={`version-table-cell-${rowId}-${field.key}`}
                        data-change-state={changeState}
                      >
                        <button
                          type="button"
                          disabled={!previousVersion}
                          onClick={() => {
                            onSelectVersion(version);
                            if (!previousVersion) {
                              return;
                            }
                            onOpenFieldDiff({
                              field,
                              from: previousVersion,
                              to: version,
                              oldText: previousValue ?? '',
                              newText: currentValue,
                            });
                          }}
                          className={`block h-full min-h-[76px] w-full px-3 py-3 text-left disabled:cursor-default ${
                            field.monospace ? 'font-mono text-xs' : ''
                          }`}
                        >
                          <span className="line-clamp-3 whitespace-pre-wrap break-words">
                            {content}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VersionHistoryModal({ isOpen, onClose, prompt, onRestore }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);
  const [viewMode, setViewMode] = useState<PromptHistoryViewMode>('detail');
  const [tableFieldDiff, setTableFieldDiff] = useState<TableFieldDiff | null>(null);
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<PromptVersion | null>(null);
  const isDiffView = viewMode === 'diff';
  const isTableView = viewMode === 'table';
  const versionFields = useMemo<VersionFieldDefinition[]>(
    () => [
      {
        key: 'systemPrompt',
        label: t('prompt.systemPromptLabel'),
        monospace: true,
      },
      {
        key: 'userPrompt',
        label: t('prompt.userPromptLabel'),
        monospace: true,
      },
      {
        key: 'variables',
        label: t('prompt.variables'),
        monospace: true,
      },
      {
        key: 'aiResponse',
        label: t('prompt.aiResponse'),
        monospace: false,
      },
      {
        key: 'note',
        label: t('prompt.changeNote'),
        monospace: false,
      },
    ],
    [t],
  );

  useEffect(() => {
    if (isOpen && prompt) {
      loadVersions();
    }
  }, [isOpen, prompt]);

  const loadVersions = async () => {
    setIsLoading(true);
    setViewMode('detail');
    setCompareVersion(null);
    setTableFieldDiff(null);
    try {
      const historyVersions = await getPromptVersions(prompt.id);
      
      // Add current version to list (as latest version)
      // 将当前版本也加入列表（作为最新版本）
      const currentVersion: PromptVersion = {
        id: 'current',
        promptId: prompt.id,
        version: prompt.version,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        variables: prompt.variables || [],
        note: t('prompt.currentVersion'),
        aiResponse: prompt.lastAiResponse, // Use current version's AI response
        createdAt: prompt.updatedAt,
      };
      
      // Merge current version and history versions, sorted by version number descending
      const allVersions = [currentVersion, ...historyVersions.filter(v => v.version !== prompt.version)];
      
      setVersions(allVersions);
      if (allVersions.length > 0) {
        setSelectedVersion(allVersions[0]);
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = () => {
    if (selectedVersion) {
      if (
        confirm(
          t('prompt.restoreConfirm', {
            version: selectedVersion.version,
          }),
        )
      ) {
        onRestore(selectedVersion);
        onClose();
      }
    }
  };

  const handleDeleteVersion = async () => {
    if (!versionToDelete || versionToDelete.id === 'current') {
      setVersionToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      await deletePromptVersion(versionToDelete.id);
      scheduleAllSaveSync('prompt:delete-version');
      await loadVersions();
      setVersionToDelete(null);
    } catch (error) {
      console.error('Failed to delete prompt version:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('prompt.history')} size="full">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">{t('prompt.historyLoading')}</div>
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClockIcon className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('prompt.noHistory')}</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {t('prompt.noHistoryHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-border app-wallpaper-surface p-1">
              {[
                {
                  mode: 'detail' as const,
                  label: t('prompt.detailView', 'Detail'),
                  icon: <FileTextIcon className="h-4 w-4" />,
                },
                {
                  mode: 'diff' as const,
                  label: t('prompt.versionCompare'),
                  icon: <GitCompareIcon className="h-4 w-4" />,
                },
                {
                  mode: 'table' as const,
                  label: t('prompt.tableView', 'Table'),
                  icon: <TableIcon className="h-4 w-4" />,
                },
              ].map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => {
                    setViewMode(item.mode);
                    if (item.mode !== 'diff') {
                      setCompareVersion(null);
                    }
                    if (item.mode !== 'table') {
                      setTableFieldDiff(null);
                    }
                  }}
                  className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                    viewMode === item.mode
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
            {isTableView && (
              <div className="text-xs text-muted-foreground">
                {t(
                  'prompt.tableViewHint',
                  'Changed cells compare each version with the next older version.',
                )}
              </div>
            )}
          </div>

          <div className={isTableView ? 'min-h-[400px]' : 'flex gap-4 min-h-[400px]'}>
          {/* Version list */}
          {/* 版本列表 */}
          {!isTableView && (
          <div className="w-48 border-r border-border pr-4 space-y-1">
            <div className="text-xs text-muted-foreground mb-2 px-1">
              {isDiffView ? t('prompt.selectCompareVersion') : t('prompt.selectVersion')}
            </div>
            {versions.map((version, index) => (
              <button
                key={version.id}
                onClick={() => {
                  if (isDiffView) {
                    setCompareVersion(version);
                  } else {
                    setSelectedVersion(version);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isDiffView 
                    ? compareVersion?.id === version.id
                      ? 'bg-green-500 text-white'
                      : selectedVersion?.id === version.id
                        ? 'bg-red-500 text-white'
                        : 'hover:bg-muted'
                    : selectedVersion?.id === version.id
                      ? 'bg-primary text-white'
                      : 'hover:bg-muted'
                }`}
              >
                <div className="font-medium">v{version.version}</div>
                <div className={`text-xs ${
                  (isDiffView ? (compareVersion?.id === version.id || selectedVersion?.id === version.id) : selectedVersion?.id === version.id)
                    ? 'text-white/70' 
                    : 'text-muted-foreground'
                }`}>
                  {new Date(version.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
          )}

          {/* Version content / Diff comparison */}
          {/* 版本内容 / 差异对比 */}
          <div className={isTableView ? 'space-y-4' : 'flex-1 space-y-4'}>
            {isDiffView && selectedVersion && compareVersion ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-2 rounded-lg bg-muted/30">
                  <span className="px-2 py-1 rounded bg-red-500/20 text-red-600 font-mono text-xs">v{selectedVersion.version}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="px-2 py-1 rounded bg-green-500/20 text-green-600 font-mono text-xs">v{compareVersion.version}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(selectedVersion.createdAt).toLocaleDateString()} → {new Date(compareVersion.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <GitDiffView 
                  oldText={selectedVersion.systemPrompt || ''} 
                  newText={compareVersion.systemPrompt || ''} 
                  label={t('prompt.systemPromptLabel')}
                  emptyLabel={t('prompt.noChanges')}
                />
                <GitDiffView 
                  oldText={selectedVersion.userPrompt} 
                  newText={compareVersion.userPrompt} 
                  label={t('prompt.userPromptLabel')}
                  emptyLabel={t('prompt.noChanges')}
                />
              </>
            ) : isTableView ? (
              <>
                <VersionMatrixView
                  versions={versions}
                  fields={versionFields}
                  selectedVersion={selectedVersion}
                  onSelectVersion={setSelectedVersion}
                  onOpenFieldDiff={setTableFieldDiff}
                  emptyLabel={t('prompt.noContent')}
                  tableLabel={t('prompt.versionMatrix', 'Version matrix')}
                  versionLabel={t('prompt.versionColumn', 'Version')}
                  timeLabel={t('prompt.timeColumn', 'Time')}
                />
                {tableFieldDiff && (
                  <div className="rounded-xl border border-border app-wallpaper-surface p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                      <span>{tableFieldDiff.field.label} {t('prompt.fieldDiffSuffix', 'diff')}</span>
                      <span className="ml-auto rounded bg-red-500/10 px-2 py-0.5 font-mono text-xs text-red-600">
                        v{tableFieldDiff.from.version}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-xs text-green-600">
                        v{tableFieldDiff.to.version}
                      </span>
                    </div>
                    <GitDiffView
                      oldText={tableFieldDiff.oldText}
                      newText={tableFieldDiff.newText}
                      label={tableFieldDiff.field.label}
                      emptyLabel={t('prompt.noChanges')}
                    />
                  </div>
                )}
              </>
            ) : selectedVersion && (
              <>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                    {t('prompt.systemPromptLabel')}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {selectedVersion.systemPrompt || t('prompt.noContent')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                    {t('prompt.userPromptLabel')}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedVersion.userPrompt}
                  </div>
                </div>
                {selectedVersion.note && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                      {t('prompt.changeNote')}
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      {selectedVersion.note}
                    </div>
                  </div>
                )}
                {/* AI response */}
                {/* AI 响应 */}
                {selectedVersion.aiResponse && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                      <SparklesIcon className="w-3.5 h-3.5 text-primary" />
                      {t('prompt.aiResponse')}
                    </div>
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {selectedVersion.aiResponse}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {/* 操作按钮 */}
      {versions.length > 0 && selectedVersion && (
        <div className="flex justify-between mt-6 pt-4 border-t border-border">
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (isDiffView) {
                  setViewMode('detail');
                  setCompareVersion(null);
                } else {
                  setViewMode('diff');
                  setTableFieldDiff(null);
                }
              }}
              className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
                isDiffView 
                  ? 'bg-primary text-white' 
                  : 'hover:bg-muted'
              }`}
            >
              <GitCompareIcon className="w-4 h-4" />
              {isDiffView ? t('prompt.exitCompare') : t('prompt.versionCompare')}
            </button>
            {!isDiffView &&
              selectedVersion.id !== 'current' &&
              selectedVersion.version > 1 && (
              <button
                onClick={() => setVersionToDelete(selectedVersion)}
                disabled={isDeleting}
                className="flex items-center gap-2 h-9 px-4 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4" />
                {t('common.delete', 'Delete')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              {t('common.cancel')}
            </button>
            {!isDiffView && (
              <button
                onClick={handleRestore}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <RotateCcwIcon className="w-4 h-4" />
                {t('prompt.restoreVersion')}
              </button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={Boolean(versionToDelete)}
        onClose={() => {
          if (isDeleting) return;
          setVersionToDelete(null);
        }}
        onConfirm={handleDeleteVersion}
        title={t('prompt.deleteVersionTitle', 'Delete version')}
        message={t('prompt.deleteVersionConfirm', {
          version: versionToDelete?.version ?? '',
        })}
        confirmText={
          isDeleting ? t('common.loading', 'Loading...') : t('common.delete', 'Delete')
        }
        cancelText={t('common.cancel')}
        variant="destructive"
      />
    </Modal>
  );
}
