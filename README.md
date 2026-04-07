<div align="center">
  <img src="./docs/imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />
  
  # PromptHub
  
  **🚀 开源免费的 AI Prompt 与 Skill 管理工具 | 数据本地存储 | 隐私优先**
  
  *Prompt 管理 · 技能商店 · 多平台分发 · 版本控制 · 变量模板 · 多模型测试 — 一站式 AI 工作台*

  <br/>
  
  <!-- Badges -->
  [![GitHub Stars](https://img.shields.io/github/stars/legeling/PromptHub?style=for-the-badge&logo=github&color=yellow)](https://github.com/legeling/PromptHub/stargazers)
  [![GitHub Forks](https://img.shields.io/github/forks/legeling/PromptHub?style=for-the-badge&logo=github)](https://github.com/legeling/PromptHub/network/members)
  [![Downloads](https://img.shields.io/github/downloads/legeling/PromptHub/total?style=for-the-badge&logo=github&color=blue)](https://github.com/legeling/PromptHub/releases)
  
  [![Version](https://img.shields.io/badge/version-v0.4.8-success?style=for-the-badge)](https://github.com/legeling/PromptHub/releases)
  [![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge)](./LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)](https://github.com/legeling/PromptHub/pulls)
  
  <br/>
  
  <!-- Tech Stack -->
  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
  ![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
  ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
  ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
  
  <br/>
  
  <!-- Platform Support -->
  ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)
  ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)
  ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)
  
  <br/>
  
  [简体中文](./README.md) · [繁體中文](./docs/README.zh-TW.md) · [English](./docs/README.en.md) · [日本語](./docs/README.ja.md) · [Deutsch](./docs/README.de.md) · [Español](./docs/README.es.md) · [Français](./docs/README.fr.md)

</div>

<br/>

<div align="center">
  <a href="https://github.com/legeling/PromptHub/releases">
    <img src="https://img.shields.io/badge/📥_立即下载-Releases-blue?style=for-the-badge&logo=github" alt="Download"/>
  </a>
</div>

<br/>

> 💡 **为什么选择 PromptHub？**
>
> PromptHub 不仅是 Prompt 管理工具，更是 **AI 技能分发中心**。管理你的 Prompt 和 SKILL.md 技能，一键安装到 Claude Code、Cursor、Windsurf、Codex 等 15+ 主流 AI 编程工具。支持版本控制、变量模板、多模型测试，所有数据都存在本地，隐私安全有保障。

---

## ✨ 功能特性

<table>
<tr>
<td width="50%">

### 📝 Prompt 管理

- 创建、编辑、删除，支持文件夹和标签分类
- 自动保存历史版本，支持查看、对比和回滚
- 模板变量 `{{variable}}`，复制时动态替换
- 快速收藏常用 Prompt，一键访问
- 全文搜索标题、描述和内容
- 支持多媒体参考（图片/视频）预览与附件管理

</td>
<td width="50%">

### 🧩 Skill 技能管理 🆕

- **技能商店**：内置 20+ 精选技能（来自 Anthropic、OpenAI 等）
- **多平台安装**：一键安装到 Claude Code、Cursor、Windsurf、Codex、Kiro、Gemini CLI、Qoder、QoderWork、CodeBuddy 等 15+ 平台
- **本地扫描**：自动发现本地已有 SKILL.md，预览选择后导入
- **软链接/复制模式**：支持 Symlink 同步编辑或独立复制
- **平台目标目录**：支持为每个平台覆写 Skills 目录，扫描与分发保持一致
- **AI 翻译**：沉浸式/全文翻译技能内容，方便阅读
- **标签筛选**：按标签快速过滤技能

</td>
</tr>
<tr>
<td width="50%">

### 🤖 AI 能力

- 内置 AI 测试，支持 **国内外主流服务商**
- 覆盖各类主流大语言模型、各类开源及闭源模型
- 同一 Prompt 多模型并行测试对比
- 支持各类图像生成模型性能测评
- AI 生成技能内容、智能润色

</td>
<td width="50%">

### 💾 数据与同步

- 所有数据存储在本地，隐私安全有保障
- 全量备份与恢复（`.phub.gz` 压缩格式）
- WebDAV 云同步（坚果云、Nextcloud 等）
- 支持启动同步 + 定时同步

</td>
</tr>
<tr>
<td width="50%">

### 🎨 界面与体验

- 多视图模式：卡片、画廊、列表
- 深色/浅色/跟随系统，多种主题色
- 7 种语言支持
- Markdown 渲染与代码高亮
- 跨平台：macOS / Windows / Linux

</td>
<td width="50%">

### 🔐 安全功能

- **主密码保护** - 支持设置应用级主密码
- **私密文件夹** - 私密文件夹内容加密存储（Beta）

</td>
</tr>
</table>

## 📸 截图

<div align="center">
  <p><strong>主界面</strong></p>
  <img src="./docs/imgs/1-index.png" width="80%" alt="主界面"/>
  <br/><br/>
  <p><strong>Skill 商店</strong></p>
  <img src="./docs/imgs/10-skill-store.png" width="80%" alt="Skill 商店"/>
  <br/><br/>
  <p><strong>Skill 详情与平台安装</strong></p>
  <img src="./docs/imgs/11-skill-platform-install.png" width="80%" alt="Skill 详情与平台安装"/>
  <br/><br/>
  <p><strong>Skill 文件编辑与版本对比</strong></p>
  <img src="./docs/imgs/12-skill-files-version-diff.png" width="80%" alt="Skill 文件编辑与版本对比"/>
  <br/><br/>
  <p><strong>画廊视图</strong></p>
  <img src="./docs/imgs/2-gallery-view.png" width="80%" alt="画廊视图"/>
  <br/><br/>
  <p><strong>列表视图</strong></p>
  <img src="./docs/imgs/3-list-view.png" width="80%" alt="列表视图"/>
  <br/><br/>
  <p><strong>数据备份</strong></p>
  <img src="./docs/imgs/4-backup.png" width="80%" alt="数据备份"/>
  <br/><br/>
  <p><strong>主题设置</strong></p>
  <img src="./docs/imgs/5-theme.png" width="80%" alt="主题设置"/>
  <br/><br/>
  <p><strong>双语对照</strong></p>
  <img src="./docs/imgs/6-double-language.png" width="80%" alt="双语对照"/>
  <br/><br/>
  <p><strong>变量填充</strong></p>
  <img src="./docs/imgs/7-variable.png" width="80%" alt="变量填充"/>
  <br/><br/>
  <p><strong>版本对比</strong></p>
  <img src="./docs/imgs/8-version-compare.png" width="80%" alt="版本对比"/>
  <br/><br/>
  <p><strong>多语言支持</strong></p>
  <img src="./docs/imgs/9-i18n.png" width="80%" alt="多语言支持"/>
</div>

## 安装

### 下载

从 [Releases](https://github.com/legeling/PromptHub/releases) 下载最新版本 v0.4.8：

| 平台    | 下载                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.4.8-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.4.8-arm64.exe) |
| macOS   | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.4.8-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.4.8-x64.dmg)     |
| Linux   | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.4.8-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/prompthub_0.4.8_amd64.deb)              |

> 💡 **架构选择建议**
>
> - **macOS**：Apple Silicon（M1/M2/M3/M4）下载 `arm64`，Intel Mac 下载 `x64`
> - **Windows**：绝大多数电脑下载 `x64`；只有 Windows on ARM 设备才下载 `arm64`

### macOS 通过 Homebrew 安装

```bash
brew tap legeling/tap   # 首次安装只需执行一次
brew install --cask prompthub
```

### Homebrew 用户升级

如果你是通过 Homebrew 安装的，后续升级建议优先使用 Homebrew，不要和应用内更新混用：

```bash
brew update
brew upgrade --cask prompthub
```

如果 Homebrew 已同步到新版本，但本地安装状态异常，可以重新安装当前版本：

```bash
brew reinstall --cask prompthub
```

> 💡 **说明**
>
> - **通过 DMG/EXE 手动安装的用户**：优先使用应用内「检查更新」或前往 Releases 手动下载
> - **通过 Homebrew 安装的用户**：优先使用 `brew upgrade --cask prompthub`
> - 混用两种升级方式可能导致 Homebrew 记录的版本与实际安装状态不一致

### macOS 首次启动

由于应用未经过 Apple 公证签名，首次打开时可能会提示 **"PromptHub 已损坏，无法打开"** 或 **"无法验证开发者"**。

**解决方法（推荐）**：打开终端，执行以下命令绕过公证检查：

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

> 💡 **提示**：如果应用安装在其他位置，请将路径替换为实际安装路径。

**或者**：打开「系统设置」→「隐私与安全性」→ 向下滚动找到安全性部分 → 点击「仍要打开」。

<div align="center">
  <img src="./docs/imgs/install.png" width="60%" alt="macOS 安装提示"/>
</div>

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/legeling/PromptHub.git
cd PromptHub

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建应用
pnpm build
```

## 命令行 CLI

PromptHub 现在同时提供 GUI 和 CLI。

> ⚠️ **当前行为**
>
> - **桌面版安装后并首次启动一次应用**：PromptHub 会自动安装 `prompthub` 命令
> - **重新打开一个终端窗口后**：就可以直接使用 `prompthub --参数`
> - **源码运行 / 构建后的 CLI bundle**：仍然保留，适合开发和调试

### 桌面版用户直接使用

```bash
prompthub --help
prompthub prompt list
prompthub skill list
prompthub --output table prompt search SEO --favorite
```

> 💡 **提示**
>
> - 如果你刚安装完桌面版，请先启动一次 PromptHub
> - 如果当前终端还识别不到 `prompthub`，请关闭并重新打开终端

### 从源码运行 CLI

```bash
pnpm install

# 查看帮助
pnpm cli:dev -- --help

# Prompt 命令
pnpm cli:dev -- prompt list
pnpm cli:dev -- prompt get <id>
pnpm cli:dev -- prompt create --title "Landing Hero" --user-prompt "Write a landing page hero"

# Skill 命令
pnpm cli:dev -- skill list
pnpm cli:dev -- skill get <id-or-name>
pnpm cli:dev -- skill scan
pnpm cli:dev -- skill install ~/.claude/skills/my-skill
```

### 使用构建后的 CLI bundle

```bash
pnpm build

node out/cli/prompthub.cjs --help
node out/cli/prompthub.cjs prompt list
node out/cli/prompthub.cjs skill list
```

### 常用全局参数

```bash
prompthub --help
prompthub --output table prompt list
prompthub --data-dir /path/to/user-data prompt list
prompthub --app-data-dir /path/to/app-data skill list
```

- `--output json|table`：切换 JSON 或表格输出
- `--data-dir`：显式指定 PromptHub 的 `userData` 目录
- `--app-data-dir`：显式指定应用数据根目录

### 支持的资源命令

- `prompt list|get|create|update|delete|search`
- `skill list|get|install|scan|delete|remove`

### 说明

- CLI 直接读写 PromptHub 的本地数据库和 skill 仓库
- CLI 适合脚本化管理、批量导入导出、自动化扫描
- 桌面版会在首次启动时自动安装 shell 命令包装器
- 如果你移动了应用安装位置，再次启动 PromptHub 会自动刷新命令包装器路径

## 快速开始

### 1. 创建 Prompt

点击「新建」按钮，填写：

- **标题** - Prompt 名称
- **描述** - 简短说明用途
- **System Prompt** - 设置 AI 角色（可选）
- **User Prompt** - 实际的提示词内容
- **标签** - 便于分类和搜索

### 2. 使用变量

在 Prompt 中使用 `{{变量名}}` 语法定义变量：

```
请将以下 {{source_lang}} 文本翻译成 {{target_lang}}：

{{text}}
```

### 3. 复制使用

选中 Prompt，点击「复制」，Prompt 内容将复制到剪贴板。

### 4. 版本管理

编辑 Prompt 时会自动保存历史版本，点击「历史版本」可以查看和恢复。

### 5. Skill 技能管理

1. **从商店添加**：进入「技能商店」浏览精选技能，点击「添加到库」
2. **安装到平台**：添加后自动弹出平台选择弹窗，勾选目标 IDE 一键安装
3. **扫描本地**：自动发现本地已有的 SKILL.md，预览后选择性导入
4. **管理与编辑**：在库中编辑技能内容，支持 AI 生成和润色

> 💡 **支持的平台**：Claude Code、GitHub Copilot、Cursor、Windsurf、Kiro、Gemini CLI、Trae、OpenCode、Codex CLI、Roo Code、Amp、OpenClaw、Qoder、QoderWork、CodeBuddy

## 技术栈

| 类别     | 技术                    |
| -------- | ----------------------- |
| 框架     | Electron 33             |
| 前端     | React 18 + TypeScript 5 |
| 样式     | TailwindCSS             |
| 状态管理 | Zustand                 |
| 本地存储 | SQLite（WASM）          |
| 构建工具 | Vite + electron-builder |

## 项目结构

```
PromptHub/
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── database/        # SQLite 数据库操作
│   │   ├── ipc/             # IPC 通信处理
│   │   ├── services/        # 核心服务 (Skill 安装器等)
│   │   ├── index.ts         # 主进程入口
│   │   ├── menu.ts          # 应用菜单
│   │   ├── shortcuts.ts     # 快捷键
│   │   └── updater.ts       # 自动更新
│   ├── preload/             # 预加载脚本
│   ├── renderer/            # React 渲染进程
│   │   ├── components/      # UI 组件
│   │   │   ├── folder/      # 文件夹组件
│   │   │   ├── layout/      # 布局组件
│   │   │   ├── prompt/      # Prompt 组件
│   │   │   ├── skill/       # Skill 组件
│   │   │   ├── settings/    # 设置页面
│   │   │   └── ui/          # 通用 UI 组件
│   │   ├── i18n/            # 国际化 (7 种语言)
│   │   ├── services/        # 服务层 (AI, WebDAV)
│   │   ├── stores/          # Zustand 状态管理
│   │   └── styles/          # 全局样式
│   └── shared/              # 共享类型和常量
│       ├── constants/       # 常量定义 (平台配置、技能注册表)
│       └── types/           # TypeScript 类型
├── resources/               # 应用图标等静态资源
├── .github/workflows/       # CI/CD 配置
└── package.json
```

代码结构与超长文件治理规范见 [docs/architecture/code-structure-guidelines.md](./docs/architecture/code-structure-guidelines.md)，回归检查清单见 [docs/architecture/refactor-regression-checklist.md](./docs/architecture/refactor-regression-checklist.md)。

## Star History

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## 路线图

### v0.4.8 (当前) 🎉

- [x] **AI 工作台实装**：模型管理、端点编辑、连接测试与场景默认模型已接入真实设置链路
- [x] **skills.sh 社区商店接入**：社区榜单、每周安装量、GitHub Star 与商店详情已集成到 PromptHub
- [x] **Prompt / Skill 历史版本删除**：支持清理不再需要保留的单条历史记录
- [x] **Skill 手动修改回写**：重新打开详情页时会从本地 `SKILL.md` 同步最新元数据与内容
- [x] **备份与 WebDAV 修复**：统一备份导入格式，补齐 Skill 的 WebDAV 上传与恢复链路
- [x] **数据目录与迁移表达修复**：设置页显示真实数据目录，并明确提示迁移后需重启切换
- [x] **大规模 Skill 性能优化**：本地数百个 Skill 的列表和画廊视图改为分批渲染，并补上性能预算测试

### v0.4.3

- [x] **Skill 技能商店**：内置 20+ 精选 AI 代理技能，来自 Anthropic、OpenAI 等官方源
- [x] **多平台安装**：支持一键安装 SKILL.md 到 Claude Code、Cursor、Windsurf、Codex、Qoder、CodeBuddy 等 15+ 平台
- [x] **本地扫描预览**：自动发现本地已有 SKILL.md，支持预览选择后批量导入
- [x] **软链接/复制模式**：支持 Symlink 同步编辑或独立复制到各平台
- [x] **AI 技能翻译**：支持沉浸式翻译和全文翻译，方便阅读英文技能
- [x] **AI 技能生成**：支持 AI 生成技能内容和智能润色
- [x] **技能标签筛选**：侧边栏标签快速过滤技能
- [x] **清晰的工作流**：「添加到库」→「安装到平台」，添加后自动弹出平台选择

### v0.3.x

- [x] **多层级文件夹**：支持分层嵌套与拖拽管理
- [x] **版本控制系统**：像管理代码一样管理 Prompt，支持历史对比与一键回滚
- [x] **变量模板系统**：支持 `{{variable}}` 语法，自动生成填充表单，支持复制前预览
- [x] **多模型实验室**：内置国内外主流服务商，支持多模型并行对比测试与响应时间分析
- [x] **跨设备同步**：支持 WebDAV 增量同步与全量备份，数据高度可控
- [x] **极致阅读体验**：支持 Markdown 全场景渲染、代码高亮、双语对照模式
- [x] **多维高效管理**：文件夹、标签、收藏、使用次数统计、全文评分搜索
- [x] **多视图模式**：提供卡片、精简列表、画廊三种视图，适配不同使用场景
- [x] **系统深度集成**：全局快捷键唤起、最小化到系统托盘、暗黑模式支持
- [x] **更新镜像加速**：内置多个 GitHub 加速镜像，解决国内用户下载更新缓慢的问题
- [x] **安全与隐私**：主密码保护、私密文件夹加密存储，所有数据坚持本地优先

### 未来规划

- [ ] **浏览器扩展**：在网页端（如 ChatGPT/Claude）直接调取 PromptHub 库，实现无缝工作
- [ ] **移动端应用**：支持手机端查看、搜索与简单的编辑同步
- [ ] **插件系统**：支持用户自定义扩展 AI 供应商或本地模型（如 Ollama）集成
- [ ] **批量导出与转换**：支持将提示词导出为常用 AI 工具支持的特定格式
- [ ] **增强型变量**：支持选择框、动态日期等更复杂的变量类型
- [ ] **技能市场**：支持用户上传和分享自己创建的技能

## 更新日志

查看完整的更新日志：**[CHANGELOG.md](./CHANGELOG.md)**

### 最新版本 v0.4.8 (2026-03-31)

**新增 / Added**

- 🗑️ **历史版本删除**：支持删除 Prompt 与 Skill 的单条历史快照
- 🌐 **skills.sh 社区商店接入**：支持从 skills.sh 社区商店直接导入热门 Skill
- 🤖 **AI 工作台实装**：最新 AI 设置界面已接入真实模型管理、连接测试与场景默认模型

**修复 / Fixed**

- 💾 **备份导入格式统一**：`prompthub-backup`、`prompthub-export` 与旧裸 JSON 可通过统一入口恢复
- ☁️ **WebDAV Skill 同步修复**：修复 WebDAV 同步遗漏 Skill、Skill 版本与 Skill 文件的问题
- 📂 **数据目录状态修复**：设置页显示当前真实数据目录，并区分待重启切换的新目录
- 🪟 **Windows 升级路径修复**：持久化安装目录并修复自定义安装目录升级时的数据目录策略问题

**优化 / Improvements**

- 🚀 **大规模 Skill 列表性能优化**：列表与画廊视图改为分批渲染，并降低首次进入页面卡顿
- 🧪 **备份/同步测试矩阵补强**：新增本地备份恢复、WebDAV legacy/incremental 与 Skill 恢复回归测试
- 📚 **发版文档同步**：CHANGELOG、README 与英文 README 同步到 `v0.4.8`

> [查看完整更新日志](./CHANGELOG.md)

## 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目采用 [AGPL-3.0 License](./LICENSE) 开源协议。

## 支持

- **问题反馈**: [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- **功能建议**: [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - UI 框架
- [TailwindCSS](https://tailwindcss.com/) - CSS 框架
- [Zustand](https://zustand-demo.pmnd.rs/) - 状态管理
- [Lucide](https://lucide.dev/) - 图标库

## 贡献者

感谢所有为 PromptHub 做出贡献的开发者！

<a href="https://github.com/legeling/PromptHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=legeling/PromptHub" alt="Contributors" />
</a>

特别感谢：

- [@yizhimuzhuozi](https://github.com/yizhimuzhuozi)

---

<div align="center">
  <p><strong>如果这个项目对你有帮助，请给个 ⭐ 支持一下！</strong></p>
  <p><strong>If this project helps you, please give it a ⭐!</strong></p>
  
  <a href="https://www.buymeacoffee.com/legeling" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
  </a>
</div>

---

## 赞助支持 / Sponsor

如果 PromptHub 对你的工作有帮助，欢迎请作者喝杯咖啡！

If PromptHub is helpful to your work, feel free to buy the author a coffee!

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./docs/imgs/donate/wechat.png" width="200" alt="WeChat Pay"/>
        <br/>
        <b>微信支付 / WeChat Pay</b>
      </td>
      <td align="center">
        <img src="./docs/imgs/donate/alipay.jpg" width="200" alt="Alipay"/>
        <br/>
        <b>支付宝 / Alipay</b>
      </td>
    </tr>
  </table>
</div>

<div id="backers"></div>

## 💖 致谢支持者 / Backers

感谢以下朋友对 PromptHub 的捐赠支持：

| 日期       | 支持者 | 金额     | 留言                             |
| :--------- | :----- | :------- | :------------------------------- |
| 2026-01-08 | \*🌊   | ￥100.00 | 支持优秀的软件！                 |
| 2025-12-29 | \*昊   | ￥20.00  | 感谢您的软件！能力有限，小小支持 |

**联系邮箱 / Contact**: legeling567@gmail.com

感谢每一位支持者！你们的支持是我持续开发的动力！

Thank you to every supporter! Your support keeps me motivated to continue development!
