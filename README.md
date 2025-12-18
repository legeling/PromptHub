<div align="center">
  <img src="./docs/imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />
  
  # PromptHub
  
  **🚀 开源免费的 AI Prompt 管理工具 | 数据本地存储 | 隐私优先**
  
  *高效管理 · 版本控制 · 变量模板 · 多模型测试 — 一站式 Prompt 工作台*

  <br/>
  
  <!-- Badges -->
  [![GitHub Stars](https://img.shields.io/github/stars/legeling/PromptHub?style=for-the-badge&logo=github&color=yellow)](https://github.com/legeling/PromptHub/stargazers)
  [![GitHub Forks](https://img.shields.io/github/forks/legeling/PromptHub?style=for-the-badge&logo=github)](https://github.com/legeling/PromptHub/network/members)
  [![Downloads](https://img.shields.io/github/downloads/legeling/PromptHub/total?style=for-the-badge&logo=github&color=blue)](https://github.com/legeling/PromptHub/releases)
  
  [![Version](https://img.shields.io/badge/version-v0.2.10-success?style=for-the-badge)](https://github.com/legeling/PromptHub/releases)
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
> 还在笔记本、文档和聊天记录里到处翻找 Prompt？PromptHub 让你像管理代码一样管理 Prompt — 支持版本控制、变量模板、多模型测试，所有数据都存在本地，隐私安全有保障。

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

</td>
<td width="50%">

### 🤖 AI 能力
- 内置 AI 测试，支持 **18+ 服务商**
- OpenAI、Claude、Gemini、DeepSeek、通义千问...
- 同一 Prompt 多模型并行测试对比
- 支持图像生成模型（DALL-E、Stability AI）

</td>
</tr>
<tr>
<td width="50%">

### 💾 数据与同步
- 所有数据存储在本地，隐私安全有保障
- 全量备份与恢复（`.phub.gz` 压缩格式）
- WebDAV 云同步（坚果云、Nextcloud 等）
- 支持启动同步 + 定时同步

</td>
<td width="50%">

### 🎨 界面与体验
- 多视图模式：卡片、画廊、列表
- 深色/浅色/跟随系统，多种主题色
- 7 种语言支持
- Markdown 渲染与代码高亮
- 跨平台：macOS / Windows / Linux

</td>
</tr>
</table>

### 🔐 安全功能

- **主密码保护** - 支持设置应用级主密码
- **私密文件夹** - 私密文件夹内容加密存储（Beta）

## 📸 截图

<div align="center">
  <p><strong>主界面</strong></p>
  <img src="./docs/imgs/1-index.png" width="80%" alt="主界面"/>
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

从 [Releases](https://github.com/legeling/PromptHub/releases) 下载对应平台的安装包：

| 平台 | 架构 | 格式 |
|------|------|------|
| Windows | x64 | `.exe` 安装包 |
| macOS | Apple Silicon (M系列) | `.dmg` 镜像 |
| macOS | Intel | `.dmg` 镜像 |
| Linux | x64 | `.AppImage` / `.deb` |

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

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 33 |
| 前端 | React 18 + TypeScript 5 |
| 样式 | TailwindCSS |
| 状态管理 | Zustand |
| 本地存储 | IndexedDB + SQLite |
| 构建工具 | Vite + electron-builder |

## 项目结构

```
PromptHub/
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── database/        # SQLite 数据库操作
│   │   ├── ipc/             # IPC 通信处理
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
│   │   │   ├── settings/    # 设置页面
│   │   │   └── ui/          # 通用 UI 组件
│   │   ├── i18n/            # 国际化
│   │   ├── services/        # 服务层 (IndexedDB, AI, WebDAV)
│   │   ├── stores/          # Zustand 状态管理
│   │   └── styles/          # 全局样式
│   └── shared/              # 共享类型和常量
│       ├── constants/       # 常量定义
│       └── types/           # TypeScript 类型
├── resources/               # 应用图标等静态资源
├── .github/workflows/       # CI/CD 配置
└── package.json
```

## Star History

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## 路线图

### v0.2.7 (当前)
- [x] Prompt CRUD 管理
- [x] 文件夹和标签系统
- [x] 收藏功能
- [x] 版本历史
- [x] 数据导入导出
- [x] 主题定制 (深色/浅色/跟随系统)
- [x] 多语言支持（简体中文、繁体中文、英文、日语、西班牙语、德语、法语）
- [x] WebDAV 同步功能
- [x] Windows 无边框窗口
- [x] 文件夹拖拽排序
- [x] AI 模型配置（18+ 服务商）
- [x] AI 连接测试 & 模型对比
- [x] 多模型配置管理（无限数量）
- [x] MAC 窗口拖动优化
- [x] 自定义下拉选择框样式
- [x] 全面国际化支持（主页、编辑器、弹窗）
- [x] 应用内自动更新
- [x] 变量填充界面（复制/AI测试时均支持）
- [x] 最小化到系统托盘
- [x] Linux 平台支持
- [x] 编辑器行号显示
- [x] 列表视图模式（表格式展示所有 Prompt）
- [x] AI 测试结果持久化（每个 Prompt 保留最后一次测试结果）
- [x] 排序功能（按时间、标题、使用次数排序）
- [x] Markdown 全场景预览
- [x] 主密码与安全设置（私密文件夹 WIP）
- [x] Qwen/通义模型兼容性优化

### 未来规划
- [ ] Web 版本（Docker/Cloudflare 部署）
- [ ] Prompt 模板市场
- [ ] 浏览器插件

## 更新日志

查看完整的更新日志：**[CHANGELOG.md](./CHANGELOG.md)**

### 最新版本 v0.2.7 (2025-12-16)

**新功能**
- 全局快捷键：自定义快捷键唤起应用、新建 Prompt、搜索、打开设置
- 快捷键冲突检测：自动检测并提示快捷键冲突
- 生图模型扩展：新增 Google Gemini 和 Stability AI
- 未保存更改提醒：编辑时关闭会提示保存/放弃/取消

**优化**
- 完善多语言翻译（中/英/日/德/法/西/繁体中文）
- 图片下载失败使用自定义 Toast 提示

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
        <img src="./docs/imgs/donate/alipay.png" width="200" alt="Alipay"/>
        <br/>
        <b>支付宝 / Alipay</b>
      </td>
    </tr>
  </table>
</div>

**联系邮箱 / Contact**: legeling567@gmail.com

感谢每一位支持者！你们的支持是我持续开发的动力！

Thank you to every supporter! Your support keeps me motivated to continue development!
