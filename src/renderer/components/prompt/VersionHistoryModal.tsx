import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { ClockIcon, RotateCcwIcon, DiffIcon } from 'lucide-react';
import { getPromptVersions } from '../../services/database';
import type { Prompt, PromptVersion } from '../../../shared/types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  onRestore: (version: PromptVersion) => void;
}

export function VersionHistoryModal({ isOpen, onClose, prompt, onRestore }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && prompt) {
      loadVersions();
    }
  }, [isOpen, prompt]);

  const loadVersions = async () => {
    setIsLoading(true);
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
            {versions.map((version) => (
              <button
                key={version.id}
                onClick={() => setSelectedVersion(version)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedVersion?.id === version.id
                    ? 'bg-primary text-white'
                    : 'hover:bg-muted'
                }`}
              >
                <div className="font-medium">v{version.version}</div>
                <div className={`text-xs ${
                  selectedVersion?.id === version.id ? 'text-white/70' : 'text-muted-foreground'
                }`}>
                  {new Date(version.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>

          {/* 版本内容 */}
          <div className="flex-1 space-y-4">
            {selectedVersion && (
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
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleRestore}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCcwIcon className="w-4 h-4" />
            恢复此版本
          </button>
        </div>
      )}
    </Modal>
  );
}
