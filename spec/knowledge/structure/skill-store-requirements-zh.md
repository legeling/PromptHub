# Skill 商店需求文档

本文档定义了 PromptHub Skill 商店的完整需求，参考了 OpenAI Codex Skills UI 和 Claude Code Skills 的最佳实践。

## 📋 目录

1. [需求概述](#1-需求概述)
2. [Skill 商店 UI 设计](#2-skill-商店-ui-设计)
3. [预置技能库](#3-预置技能库)
4. [技能图标系统](#4-技能图标系统)
5. [技能详情页](#5-技能详情页)
6. [安装与管理流程](#6-安装与管理流程)
7. [数据模型变更](#7-数据模型变更)
8. [实施计划](#8-实施计划)

---

## 1. 需求概述

### 1.1 背景

当前 PromptHub 的 Skill 管理页面（参考图4）仅展示用户已安装/创建的技能，缺少：
- **预置技能商店**：用户无法浏览和发现优质预置技能
- **技能图标**：所有技能使用相同的默认 Cuboid 图标，缺乏辨识度
- **技能详情弹窗**：无法在安装前查看技能的完整介绍、来源、使用说明

### 1.2 目标

参照 OpenAI Codex Skills（参考图1-3）的设计，实现：
1. **左侧 Skill 商店导航**：在侧边栏添加 Skill 商店入口
2. **预置技能库**：内置一批高质量常用技能（Excel、PDF、代码分析等）
3. **技能图标系统**：每个技能有独立图标，支持在线获取
4. **技能详情弹窗**：点击技能可查看完整简介、来源、前置条件、工作流等
5. **一键安装**：从商店安装技能到本地

### 1.3 参考 UI

| 参考图 | 描述 |
|--------|------|
| 图1 | Codex Skills 主页面 — "Installed" 区域，2列网格布局，每项含图标+名称+描述 |
| 图2 | Codex Skills "Recommended" 区域，可安装的推荐技能（带 + 按钮） |
| 图3 | 技能详情弹窗 — 大图标、名称、描述、Overview、Prerequisites、Required Workflow、Install 按钮 |
| 图4 | 当前 PromptHub Skills 页面 — 网格卡片，缺乏商店和图标 |

---

## 2. Skill 商店 UI 设计

### 2.1 整体布局

```
┌──────────────────────────────────────────────────┐
│ TopBar: [Search Skills...] [Refresh] [+ New Skill] │
├──────────┬───────────────────────────────────────┤
│ Sidebar  │  Skill 商店主内容区                     │
│          │                                         │
│ Prompts  │  ┌─ Installed ──────────────────────┐  │
│ Skills ← │  │ [icon] Excel    [icon] PDF       │  │
│  所有技能 │  │ [icon] Figma   [icon] Image Gen  │  │
│  收藏     │  └─────────────────────────────────┘  │
│  商店  ←  │                                        │
│          │  ┌─ Recommended ────────────────────┐  │
│ Settings │  │ [icon] Notion  [+]  [icon] Git  [+]│  │
│          │  │ [icon] Deploy  [+]  [icon] Sentry[+]│  │
│          │  └─────────────────────────────────┘  │
└──────────┴───────────────────────────────────────┘
```

### 2.2 侧边栏导航变更

在现有 Sidebar 的 Skill 区域新增子导航：

| 导航项 | 图标 | 描述 |
|--------|------|------|
| 所有技能 | `LayoutGridIcon` | 显示全部已安装技能（现有功能） |
| 收藏 | `StarIcon` | 显示收藏的技能（现有功能） |
| **商店** | `StoreIcon / ShoppingBagIcon` | **新增**：浏览预置技能商店 |

### 2.3 商店主页面

**布局要求：**
- 顶部搜索栏：搜索商店中的技能
- **Installed** 区域：已安装的技能，2列网格，每项含图标+名称+描述+编辑按钮
- **Recommended** 区域：推荐安装的技能，2列网格，每项含图标+名称+描述+安装按钮(+)
- 支持按类别筛选：全部 / 办公工具 / 开发工具 / AI生成 / 数据分析 / 项目管理

**交互行为：**
- 点击已安装技能 → 进入技能详情页（编辑模式）
- 点击推荐技能 → 弹出技能详情弹窗（安装模式）
- 点击 `+` 按钮 → 直接安装（无需弹窗确认）
- 点击编辑按钮 → 进入技能编辑页

---

## 3. 预置技能库

### 3.1 预置技能清单

以下技能将作为内置推荐技能，存储在 `registry.json` 中：

#### 办公工具类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Spreadsheet** | `spreadsheet` | 创建、编辑和分析电子表格（Excel/CSV） | 📊 |
| **PDF Skill** | `pdf-skill` | 创建、编辑和审查 PDF 文件 | 📄 |
| **Word Docs** | `word-docs` | 编辑和审查 Word 文档 | 📝 |
| **Presentation** | `presentation` | 创建和编辑演示文稿 | 📽️ |

#### 开发工具类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Git Release** | `git-release` | 创建一致的发布版本和变更日志 | 🏷️ |
| **Code Review** | `code-review` | 系统化代码审查和质量评估 | 🔍 |
| **Yeet** | `yeet` | Stage、commit 并提交 PR | 🚀 |
| **Playwright CLI** | `playwright-cli` | 使用 Playwright 自动化浏览器测试 | 🎭 |
| **API Designer** | `api-designer` | 设计 RESTful API 和接口规范 | 🔗 |

#### AI 生成类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Image Gen** | `image-gen` | 使用 AI 生成和编辑图片 | 🎨 |
| **Speech Generation** | `speech-generation` | 从文本生成语音旁白 | 🎙️ |
| **Transcribe** | `transcribe` | 使用 AI 转录音频为文本 | 📝 |
| **Video Generation** | `video-generation` | 生成和管理 AI 视频 | 🎬 |

#### 数据分析类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Data Analyst** | `data-analyst` | 分析数据集，生成统计报告和图表 | 📈 |
| **Scientific Skills** | `scientific-skills` | 科研辅助，论文检索和实验分析 | 🔬 |
| **Screenshot** | `screenshot` | 截取和标注屏幕截图 | 📸 |

#### 项目管理类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Linear** | `linear` | 在 Codex 中管理 Linear 问题 | 📋 |
| **Notion** | `notion-knowledge` | 捕获对话到 Notion 结构化页面 | 📓 |
| **Sentry** | `sentry` | 只读 Sentry 可观测性 | 🐛 |

#### 部署与平台类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Vercel Deploy** | `vercel-deploy` | 零配置部署应用到 Vercel | ▲ |
| **Netlify Deploy** | `netlify-deploy` | 使用 Netlify CLI 部署 Web 项目 | 🌐 |
| **Render Deploy** | `render-deploy` | 通过 Blueprints 或 MCP 部署到 Render | 🖥️ |

#### 设计工具类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Figma** | `figma` | 使用 Figma MCP 进行设计到代码 | 🎨 |
| **Build Things** | `build-things` | 快速构建和原型开发 | 🛠️ |

#### 安全类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Security Best Practices** | `security-best-practices` | 安全审查和安全默认指导 | 🛡️ |
| **Security Threat Model** | `security-threat-model` | 基于代码仓库的威胁建模 | ⚠️ |

#### 元技能类

| 技能名称 | slug | 描述 | 图标 |
|----------|------|------|------|
| **Skill Creator** | `skill-creator` | 创建或更新技能 | ✨ |
| **Skill Installer** | `skill-installer` | 从 openai/skills 或其他仓库安装技能 | 📦 |

### 3.2 预置技能数据格式

```json
{
  "version": "1.0.0",
  "skills": [
    {
      "slug": "spreadsheet",
      "name": "Spreadsheet",
      "description": "Create, edit, and analyze spreadsheets",
      "category": "office",
      "icon_url": "https://cdn.prompthub.ai/skills/icons/spreadsheet.png",
      "icon_emoji": "📊",
      "author": "PromptHub",
      "source_url": "https://github.com/anthropics/skills/tree/main/spreadsheet",
      "tags": ["excel", "csv", "data", "office"],
      "version": "1.0.0",
      "content_url": "https://raw.githubusercontent.com/anthropics/skills/main/spreadsheet/SKILL.md",
      "prerequisites": [
        "A file system MCP server for reading/writing files"
      ],
      "compatibility": ["claude", "cursor", "windsurf", "opencode"]
    }
  ]
}
```

### 3.3 技能内容来源

预置技能的 SKILL.md 内容来源优先级：
1. **本地内置**：App 内嵌常用技能的完整内容（离线可用）
2. **远程获取**：从 GitHub 或 CDN 获取最新版本
3. **社区贡献**：community `registry.json` 源

---

## 4. 技能图标系统

### 4.1 图标来源

**优先级从高到低：**

1. **自定义图标 URL** (`icon_url`)：
   - 支持 PNG/SVG/WebP 格式
   - 推荐尺寸: 64x64 或 128x128
   - 通过 CDN 加载，本地缓存

2. **Emoji 图标** (`icon_emoji`)：
   - 每个预置技能关联一个 emoji
   - 作为 URL 加载失败时的后备方案
   - 渲染为大号 emoji 字符

3. **默认图标**：
   - 使用当前的 `CuboidIcon` 作为最终后备
   - 以技能名称首字母+随机色彩背景作为备选

### 4.2 图标组件设计

```tsx
interface SkillIconProps {
  iconUrl?: string;
  iconEmoji?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';  // 32px / 48px / 64px
  className?: string;
}

function SkillIcon({ iconUrl, iconEmoji, name, size = 'md', className }: SkillIconProps) {
  // 1. 尝试加载 icon_url
  // 2. 加载失败 → 显示 emoji
  // 3. 无 emoji → 显示首字母+色彩背景
  // 4. 最终后备 → CuboidIcon
}
```

### 4.3 图标缓存策略

- **内存缓存**：已加载的图标 URL 缓存在内存中
- **磁盘缓存**：图片下载后存储在 `~/.config/prompthub/cache/icons/`
- **过期策略**：7天过期，重新从远程获取
- **加载状态**：显示 skeleton 占位符，加载失败时平滑降级

---

## 5. 技能详情页

### 5.1 详情弹窗（安装模式）

参考图3的 Codex 技能详情弹窗：

```
┌───────────────────────────────────────┐
│  [大图标]                        [X]  │
│  Figma Implement Design               │
│  Turn Figma designs into code          │
│                                        │
│  ┌─ Overview ────────────────────┐    │
│  │ This skill provides a         │    │
│  │ structured workflow for...    │    │
│  │                               │    │
│  │ Prerequisites:                │    │
│  │ • Figma MCP server            │    │
│  │ • A Figma URL                 │    │
│  │                               │    │
│  │ Required Workflow:            │    │
│  │ Step 0: Set up Figma MCP...   │    │
│  └───────────────────────────────┘    │
│                                        │
│  来源: anthropics/skills               │
│  版本: 1.0.0                           │
│  兼容: Claude, Cursor, Windsurf        │
│                                        │
│                        [+ Install]     │
└───────────────────────────────────────┘
```

**弹窗内容：**
- **头部**：大图标 (64px) + 技能名称 + 简短描述
- **正文**：SKILL.md 内容的 Markdown 渲染
  - Overview
  - Prerequisites
  - Required Workflow / Instructions
  - Examples
- **元信息**：来源 URL、版本号、兼容平台、作者
- **操作按钮**：
  - 未安装：`+ Install` 主按钮
  - 已安装：`Installed ✓` 状态 + `Edit` / `Uninstall` 按钮

### 5.2 详情页（已安装模式）

已安装技能点击后进入全宽详情页（复用现有 `SkillFullDetailPage`），增加：
- 技能图标显示
- 来源信息（GitHub URL）
- 平台安装状态（已有）

---

## 6. 安装与管理流程

### 6.1 从商店安装

```
用户浏览商店 → 点击技能 → 查看详情弹窗 → 点击 Install
                                              ↓
                                    1. 下载 SKILL.md 内容
                                    2. 保存到本地数据库
                                    3. 下载并缓存图标
                                    4. 更新 Installed 列表
                                    5. 可选：安装到平台(Claude/Cursor等)
```

### 6.2 快速安装（+按钮）

```
用户点击 + 按钮 → 直接安装（跳过详情页）
                  ↓
        1. 从远程获取 SKILL.md
        2. 存储到本地
        3. 显示成功提示
        4. 技能从 Recommended 移到 Installed
```

### 6.3 卸载流程

```
用户进入已安装技能详情 → 点击 Uninstall
                        ↓
              1. 确认弹窗
              2. 从平台卸载 SKILL.md
              3. 从本地数据库删除
              4. 技能回到 Recommended 列表
```

### 6.4 更新流程

```
刷新按钮 / 自动检查 → 检测远程 registry.json 版本
                       ↓
            版本不一致 → 显示更新提示
                         ↓
                用户确认 → 更新 SKILL.md 内容
```

### 6.5 批量商店管理

```
用户进入 Skill 商店 → 点击批量管理图标 → 选择当前列表中的 Skill
                                      ↓
                        1. 批量安装未导入的 Skill
                        2. 批量更新已有更新的 Skill
                        3. 批量从我的 Skill 中移除已导入的 Skill
```

约束：

- 批量管理只作用于商店条目与「我的 Skill」之间的导入、更新、移除关系。
- 不在商店批量管理里处理项目 Skill 或 Agent Skill 分发。
- “移除”只删除本地 My Skill 条目，不删除远程商店内容。
- 每个 Skill 必须有独立的异步 pending 状态，列表和详情页共享同一个操作状态。
- 批量选择必须使用稳定的商店 Skill 身份，不得按渲染行号或虚拟列表 index 保存。

---

## 7. 数据模型变更

### 7.1 Skill 类型扩展

```typescript
export interface Skill {
  // ... 现有字段 ...
  
  // 新增字段
  icon_url?: string;        // 技能图标 URL
  icon_emoji?: string;      // Emoji 图标后备
  category?: string;        // 类别: office | dev | ai | data | management | deploy | design | security | meta
  is_builtin?: boolean;     // 是否为预置技能
  registry_slug?: string;   // 注册表中的唯一标识
  content_url?: string;     // 远程 SKILL.md URL
  prerequisites?: string[]; // 前置条件
  compatibility?: string[]; // 兼容平台列表
}
```

### 7.2 数据库迁移

```sql
ALTER TABLE skills ADD COLUMN icon_url TEXT;
ALTER TABLE skills ADD COLUMN icon_emoji TEXT;
ALTER TABLE skills ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE skills ADD COLUMN is_builtin INTEGER DEFAULT 0;
ALTER TABLE skills ADD COLUMN registry_slug TEXT;
ALTER TABLE skills ADD COLUMN content_url TEXT;
ALTER TABLE skills ADD COLUMN prerequisites TEXT; -- JSON array
ALTER TABLE skills ADD COLUMN compatibility TEXT; -- JSON array
```

### 7.3 Registry 数据模型

```typescript
interface SkillRegistry {
  version: string;
  updated_at: string;
  skills: RegistrySkill[];
}

interface RegistrySkill {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon_url?: string;
  icon_emoji?: string;
  author: string;
  source_url: string;
  tags: string[];
  version: string;
  content_url: string;
  prerequisites?: string[];
  compatibility?: string[];
}
```

### 7.4 Store 变更

```typescript
// skill.store.ts 新增
interface SkillState {
  // ... 现有字段 ...
  
  // 新增
  registrySkills: RegistrySkill[];    // 注册表中的技能
  isLoadingRegistry: boolean;
  storeCategory: string;              // 当前筛选类别
  
  // 新增 Actions
  loadRegistry: () => Promise<void>;  // 加载注册表
  installFromRegistry: (slug: string) => Promise<Skill | null>;
  setStoreCategory: (category: string) => void;
  getInstalledSlugs: () => string[];  // 获取已安装的 slug 列表
  getRecommendedSkills: () => RegistrySkill[];  // 获取推荐（未安装）技能
}
```

---

## 8. 实施计划

### Phase 1: 数据层 — 技能注册表与类型扩展

**优先级: 高 | 预计工时: 2-3天**

- [ ] 扩展 `Skill` 类型，添加 `icon_url`, `icon_emoji`, `category`, `is_builtin`, `registry_slug`, `content_url`, `prerequisites`, `compatibility` 字段
- [ ] 编写数据库迁移脚本，在 `skills` 表中添加新字段
- [ ] 创建 `src/shared/constants/skill-registry.ts`，内置预置技能注册表数据
- [ ] 创建 `RegistrySkill` 类型定义
- [ ] 实现注册表加载逻辑（本地内置 + 远程更新）

### Phase 2: 图标组件 — SkillIcon

**优先级: 高 | 预计工时: 1-2天**

- [ ] 创建 `src/renderer/components/skill/SkillIcon.tsx` 组件
- [ ] 实现图标加载优先级：URL → Emoji → 首字母 → 默认图标
- [ ] 实现图标加载状态和错误降级
- [ ] 替换现有 `CuboidIcon` 为 `SkillIcon`（SkillManager, SkillListView, SkillFullDetailPage, SkillDetailView）
- [ ] 添加图标缓存逻辑

### Phase 3: Skill 商店页面 — SkillStore 组件

**优先级: 高 | 预计工时: 3-4天**

- [ ] 创建 `src/renderer/components/skill/SkillStore.tsx` 商店主页面组件
- [ ] 实现 Installed / Recommended 两段式布局
- [ ] 实现技能分类筛选 tabs (全部/办公/开发/AI/数据/管理/部署/设计/安全)
- [ ] 实现商店内搜索功能
- [ ] 2列网格布局，每项含图标+名称+描述
- [ ] 已安装项显示编辑按钮，推荐项显示 `+` 安装按钮

### Phase 4: 技能详情弹窗 — SkillStoreDetail

**优先级: 高 | 预计工时: 2-3天**

- [ ] 创建 `src/renderer/components/skill/SkillStoreDetail.tsx` 详情弹窗组件
- [ ] 弹窗头部：大图标 + 名称 + 描述
- [ ] 弹窗正文：Markdown 渲染 SKILL.md 内容（复用现有 ReactMarkdown 配置）
- [ ] 弹窗底部：元信息（来源、版本、兼容平台）+ Install / Installed 按钮
- [ ] 安装后状态切换动效

### Phase 5: 侧边栏导航集成

**优先级: 中 | 预计工时: 1天**

- [ ] 在 `Sidebar.tsx` Skill 区域新增 "商店" 导航项
- [ ] `skill.store.ts` 新增 `storeView` 状态（'my-skills' | 'store'）
- [ ] 点击 "商店" 导航时切换到 SkillStore 组件
- [ ] 点击 "所有技能" 回到现有 SkillManager
- [ ] 更新 `SkillManager.tsx` 根据 storeView 状态渲染不同组件

### Phase 6: 安装流程

**优先级: 中 | 预计工时: 2天**

- [ ] 实现 `installFromRegistry` action：从远程 URL 下载 SKILL.md → 存储到本地数据库
- [ ] 实现快速安装（+按钮直接安装，不打开详情）
- [ ] 安装成功后技能从 Recommended 移入 Installed，动画过渡
- [ ] 实现卸载时技能回到 Recommended
- [ ] 加载状态和错误处理

### Phase 7: 预置技能内容填充

**优先级: 中 | 预计工时: 2-3天**

- [ ] 编写/收集每个预置技能的 SKILL.md 内容
- [ ] 准备技能图标资源（PNG/SVG）
- [ ] 本地内嵌核心技能内容（确保离线可用）
- [ ] 测试所有预置技能的安装/卸载流程

### Phase 8: 优化与完善

**优先级: 低 | 预计工时: 2天**

- [ ] 图标磁盘缓存和过期策略
- [ ] 注册表远程更新和版本检查
- [ ] 商店页面加载动画和空状态
- [ ] i18n 国际化：所有新增文本添加中英文翻译
- [ ] 响应式布局适配
- [ ] 性能优化：虚拟列表、懒加载

---

## 附录

### A. 文件变更清单

| 文件路径 | 变更类型 | 说明 |
|----------|----------|------|
| `src/shared/types/skill.ts` | 修改 | 扩展 Skill 接口，新增 RegistrySkill |
| `src/shared/constants/skill-registry.ts` | 新建 | 预置技能注册表数据 |
| `src/renderer/stores/skill.store.ts` | 修改 | 新增商店相关状态和 actions |
| `src/renderer/components/skill/SkillIcon.tsx` | 新建 | 技能图标组件 |
| `src/renderer/components/skill/SkillStore.tsx` | 新建 | 商店主页面 |
| `src/renderer/components/skill/SkillStoreDetail.tsx` | 新建 | 商店详情弹窗 |
| `src/renderer/components/skill/SkillManager.tsx` | 修改 | 集成商店视图切换 |
| `src/renderer/components/skill/SkillListView.tsx` | 修改 | 替换图标为 SkillIcon |
| `src/renderer/components/skill/SkillFullDetailPage.tsx` | 修改 | 替换图标为 SkillIcon，增加来源信息 |
| `src/renderer/components/skill/SkillDetailView.tsx` | 修改 | 替换图标为 SkillIcon |
| `src/renderer/components/layout/Sidebar.tsx` | 修改 | 新增商店导航项 |
| `src/main/database.ts` (或相应) | 修改 | 数据库迁移脚本 |
| `src/renderer/i18n/*/translation.json` | 修改 | 新增翻译 key |

### B. 技能类别定义

```typescript
export const SKILL_CATEGORIES = {
  all: { label: '全部', labelEn: 'All', icon: 'LayoutGridIcon' },
  office: { label: '办公工具', labelEn: 'Office', icon: 'FileSpreadsheetIcon' },
  dev: { label: '开发工具', labelEn: 'Development', icon: 'CodeIcon' },
  ai: { label: 'AI 生成', labelEn: 'AI Generation', icon: 'SparklesIcon' },
  data: { label: '数据分析', labelEn: 'Data Analysis', icon: 'BarChartIcon' },
  management: { label: '项目管理', labelEn: 'Management', icon: 'KanbanIcon' },
  deploy: { label: '部署', labelEn: 'Deploy', icon: 'RocketIcon' },
  design: { label: '设计', labelEn: 'Design', icon: 'PaletteIcon' },
  security: { label: '安全', labelEn: 'Security', icon: 'ShieldIcon' },
  meta: { label: '元技能', labelEn: 'Meta', icon: 'WandIcon' },
} as const;
```
