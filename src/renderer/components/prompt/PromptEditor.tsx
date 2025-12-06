import { useState, useEffect, useCallback, useMemo } from 'react';
import { Textarea, Input, Button } from '../ui';
import { SaveIcon, XIcon, HashIcon, PlayIcon, CopyIcon, ImageIcon } from 'lucide-react';
import type { Prompt } from '../../../shared/types';
import { useSettingsStore } from '../../stores/settings.store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { defaultSchema } from 'hast-util-sanitize';

interface PromptEditorProps {
  prompt: Prompt;
  onSave: (data: Partial<Prompt>) => void;
  onCancel: () => void;
}

export function PromptEditor({ prompt, onSave, onCancel }: PromptEditorProps) {
  const [title, setTitle] = useState(prompt.title);
  const [description, setDescription] = useState(prompt.description || '');
  const [systemPrompt, setSystemPrompt] = useState(prompt.systemPrompt || '');
  const [userPrompt, setUserPrompt] = useState(prompt.userPrompt);
  const [tags, setTags] = useState<string[]>(prompt.tags);
  const [images, setImages] = useState<string[]>(prompt.images || []);
  const [tagInput, setTagInput] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const { editorMarkdownPreview, setEditorMarkdownPreview } = useSettingsStore((state) => ({
    editorMarkdownPreview: state.editorMarkdownPreview,
    setEditorMarkdownPreview: state.setEditorMarkdownPreview,
  }));
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>(editorMarkdownPreview ? 'preview' : 'edit');

  // 提取变量
  const extractVariables = useCallback((text: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.add(match[1]);
    }
    return Array.from(matches);
  }, []);

  const variables = extractVariables(userPrompt + (systemPrompt || ''));

  useEffect(() => {
    setActiveTab(editorMarkdownPreview ? 'preview' : 'edit');
  }, [editorMarkdownPreview]);

  useEffect(() => {
    setEditorMarkdownPreview(activeTab === 'preview');
  }, [activeTab, setEditorMarkdownPreview]);

  // 生成预览
  const generatePreview = useCallback(() => {
    let preview = userPrompt;
    for (const [key, value] of Object.entries(variableValues)) {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
    }
    return preview;
  }, [userPrompt, variableValues]);

  const sanitizeSchema: any = useMemo(() => {
    const schema = { ...defaultSchema, attributes: { ...defaultSchema.attributes } };
    schema.attributes.code = [...(schema.attributes.code || []), ['className']];
    schema.attributes.span = [...(schema.attributes.span || []), ['className']];
    schema.attributes.pre = [...(schema.attributes.pre || []), ['className']];
    return schema;
  }, []);

  const rehypePlugins = useMemo(
    () => [
      [rehypeHighlight, { ignoreMissing: true }] as any,
      [rehypeSanitize, sanitizeSchema] as any,
    ],
    [sanitizeSchema],
  );

  const markdownComponents = {
    h1: (props: any) => <h1 className="text-2xl font-bold mb-4 text-foreground" {...props} />,
    h2: (props: any) => <h2 className="text-xl font-semibold mb-3 mt-5 text-foreground" {...props} />,
    h3: (props: any) => <h3 className="text-lg font-semibold mb-3 mt-4 text-foreground" {...props} />,
    h4: (props: any) => <h4 className="text-base font-semibold mb-2 mt-3 text-foreground" {...props} />,
    p: (props: any) => <p className="mb-3 leading-relaxed text-foreground/90" {...props} />,
    ul: (props: any) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    code: (props: any) => <code className="px-1 py-0.5 rounded bg-muted font-mono text-[13px]" {...props} />,
    pre: (props: any) => (
      <pre className="p-3 rounded-lg bg-muted overflow-x-auto text-[13px] leading-relaxed" {...props} />
    ),
    blockquote: (props: any) => (
      <blockquote className="border-l-4 border-border pl-3 text-muted-foreground italic mb-3" {...props} />
    ),
    hr: () => <hr className="my-4 border-border" />,
    table: (props: any) => <table className="table-auto border-collapse w-full text-sm mb-3" {...props} />,
    th: (props: any) => (
      <th className="border border-border px-2 py-1 bg-muted text-left font-medium" {...props} />
    ),
    td: (props: any) => <td className="border border-border px-2 py-1" {...props} />,
    a: (props: any) => <a className="text-primary hover:underline" {...props} target="_blank" rel="noreferrer" />,
    strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
    em: (props: any) => <em className="italic text-foreground/90" {...props} />,
  };

  const handleSave = () => {
    onSave({
      title,
      description: description || undefined,
      systemPrompt: systemPrompt || undefined,
      userPrompt,
      tags,
      images,
    });
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(generatePreview());
  };

  const handleSelectImage = async () => {
    try {
      const filePaths = await window.electron?.selectImage?.();
      if (filePaths && filePaths.length > 0) {
        const savedImages = await window.electron?.saveImage?.(filePaths);
        if (savedImages) {
          setImages([...images, ...savedImages]);
        }
      }
    } catch (error) {
      console.error('Failed to select images:', error);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <h2 className="text-lg font-semibold">编辑 Prompt</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <XIcon className="w-4 h-4" />
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            <SaveIcon className="w-4 h-4" />
            保存
          </Button>
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* 图片管理 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">参考图片</label>
            <div className="flex flex-wrap gap-3">
              {images.map((img, index) => (
                <div key={index} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border">
                  <img
                    src={`local-image://${img}`}
                    alt={`preview-${index}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleSelectImage}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors"
              >
                <ImageIcon className="w-6 h-6 mb-1" />
                <span className="text-xs">上传图片</span>
              </button>
            </div>
          </div>

          {/* 标签 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground"
                >
                  <HashIcon className="w-3 h-3" />
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-destructive">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="添加标签..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="h-7 px-3 rounded-full bg-muted/50 border-0 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* System Prompt */}
          <Textarea
            label="System Prompt（可选）"
            placeholder="设置 AI 的角色和行为..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[100px]"
          />

          {/* User Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">User Prompt</label>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                <button
                  onClick={() => setActiveTab('edit')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'edit'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  编辑
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  预览
                </button>
              </div>
            </div>
            {activeTab === 'edit' ? (
              <Textarea
                placeholder="输入你的 Prompt 内容..."
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="min-h-[200px]"
              />
            ) : (
              <div className="p-4 rounded-xl bg-card border border-border text-[15px] leading-[1.7] markdown-content break-words space-y-3 min-h-[200px]">
                {userPrompt ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={rehypePlugins}
                    components={markdownComponents}
                  >
                    {userPrompt}
                  </ReactMarkdown>
                ) : (
                  <div className="text-muted-foreground text-sm">暂无内容</div>
                )}
              </div>
            )}
          </div>

          {/* 变量填充 */}
          {variables.length > 0 && (
            <div className="p-5 rounded-2xl bg-accent/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <PlayIcon className="w-4 h-4 text-primary" />
                  变量预览
                </h3>
                <Button variant="ghost" size="sm" onClick={handleCopyPreview}>
                  <CopyIcon className="w-4 h-4" />
                  复制结果
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {variables.map((variable) => (
                  <Input
                    key={variable}
                    label={variable}
                    placeholder={`输入 ${variable} 的值...`}
                    value={variableValues[variable] || ''}
                    onChange={(e) => setVariableValues({ ...variableValues, [variable]: e.target.value })}
                  />
                ))}
              </div>

              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-xs text-muted-foreground mb-2">预览结果：</p>
                <pre className="text-sm font-mono whitespace-pre-wrap">{generatePreview()}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
