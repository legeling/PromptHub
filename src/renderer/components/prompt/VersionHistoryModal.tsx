import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui';
import { ClockIcon, RotateCcwIcon, GitCompareIcon, PlusIcon, MinusIcon } from 'lucide-react';
import { getPromptVersions } from '../../services/database';
import type { Prompt, PromptVersion } from '../../../shared/types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  onRestore: (version: PromptVersion) => void;
}

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

// Git 风格差异视图
function GitDiffView({ oldText, newText, label }: { oldText: string; newText: string; label: string }) {
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
        <div className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">无变化</div>
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
                {/* 行号 */}
                <div className="flex-shrink-0 w-16 flex text-muted-foreground/50 select-none border-r border-border/50">
                  <span className="w-8 text-right px-1 border-r border-border/30">
                    {line.oldLineNum || ''}
                  </span>
                  <span className="w-8 text-right px-1">
                    {line.newLineNum || ''}
                  </span>
                </div>
                {/* 符号 */}
                <div className={`flex-shrink-0 w-5 text-center font-bold ${
                  line.type === 'add' ? 'text-green-600' : line.type === 'remove' ? 'text-red-600' : ''
                }`}>
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </div>
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

export function VersionHistoryModal({ isOpen, onClose, prompt, onRestore }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && prompt) {
      loadVersions();
    }
  }, [isOpen, prompt]);

  const loadVersions = async () => {
    setIsLoading(true);
    setShowDiff(false);
    setCompareVersion(null);
    try {
      const data = await getPromptVersions(prompt.id);
      setVersions(data);
      if (data.length > 0) {
        setSelectedVersion(data[0]);
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = () => {
    if (selectedVersion) {
      if (confirm(`确定要恢复到 v${selectedVersion.version} 版本吗？当前内容将被覆盖。`)) {
        onRestore(selectedVersion);
        onClose();
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="历史版本" size="xl">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClockIcon className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">暂无历史版本</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            编辑 Prompt 后会自动保存版本记录
          </p>
        </div>
      ) : (
        <div className="flex gap-4 min-h-[400px]">
          {/* 版本列表 */}
          <div className="w-48 border-r border-border pr-4 space-y-1">
            <div className="text-xs text-muted-foreground mb-2 px-1">
              {showDiff ? '选择对比版本' : '选择版本'}
            </div>
            {versions.map((version, index) => (
              <button
                key={version.id}
                onClick={() => {
                  if (showDiff) {
                    setCompareVersion(version);
                  } else {
                    setSelectedVersion(version);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  showDiff 
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
                  (showDiff ? (compareVersion?.id === version.id || selectedVersion?.id === version.id) : selectedVersion?.id === version.id)
                    ? 'text-white/70' 
                    : 'text-muted-foreground'
                }`}>
                  {new Date(version.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>

          {/* 版本内容 / 差异对比 */}
          <div className="flex-1 space-y-4">
            {showDiff && selectedVersion && compareVersion ? (
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
                  label="System Prompt"
                />
                <GitDiffView 
                  oldText={selectedVersion.userPrompt} 
                  newText={compareVersion.userPrompt} 
                  label="User Prompt"
                />
              </>
            ) : selectedVersion && (
              <>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                    System Prompt
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {selectedVersion.systemPrompt || '(无)'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                    User Prompt
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedVersion.userPrompt}
                  </div>
                </div>
                {selectedVersion.note && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                      修改说明
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      {selectedVersion.note}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      {versions.length > 0 && selectedVersion && (
        <div className="flex justify-between mt-6 pt-4 border-t border-border">
          <button
            onClick={() => {
              if (showDiff) {
                setShowDiff(false);
                setCompareVersion(null);
              } else {
                setShowDiff(true);
              }
            }}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
              showDiff 
                ? 'bg-primary text-white' 
                : 'hover:bg-muted'
            }`}
          >
            <GitCompareIcon className="w-4 h-4" />
            {showDiff ? '退出对比' : '版本对比'}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              取消
            </button>
            {!showDiff && (
              <button
                onClick={handleRestore}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <RotateCcwIcon className="w-4 h-4" />
                恢复此版本
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
