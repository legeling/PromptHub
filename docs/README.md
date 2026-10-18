# PromptHub Docs 索引

`docs/` 现在只保留面向仓库访客、用户、部署者、贡献者的说明文档。

仓库根目录仍保留少量平台约定文件，方便 GitHub 和发布平台直接识别：

- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `AGENTS.md`

其中根 `CONTRIBUTING.md` 只是 GitHub 的发现入口，当前有效的贡献指南仍是 `docs/contributing.md`。

内部需求、规格、设计、任务、实现、规则、发布记录与问题追踪已经统一迁入 `spec/`。如果你要查 SSD 工作流或内部工程文档，请直接看 `spec/README.md`。

`spec/` 的内部结构参考 `spec-init` 边界与 OpenSpec 风格变更流：稳定项目文档位于 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/`、`spec/releases/`，活跃 delta specs 位于 `spec/changes/active/`，内部文档不再混放在 `docs/`。

## `docs/` 中应放什么

- 用户使用说明
- 部署与自部署文档
- 贡献指南与仓库协作说明（根 `CONTRIBUTING.md` 只做入口）
- 多语言 README
- 截图、图片和其他公开资源

## `docs/` 中不应放什么

- proposal / spec / design / tasks / implementation
- 内部 architecture 约束
- 内部 issue / quality tracking
- 活跃变更目录与历史变更档案

这些内容全部属于 `spec/`。

## 当前目录地图

主线开发中的 Desktop、独立 CLI、自托管 Web 和 Cloudflare 能力边界见各语言 README；
Web 的资源保存、完整包管理及不提供 Agent 分发的范围见
[自托管部署说明](web-self-hosted.md)和 [Cloudflare 说明](cloudflare-workers.md)。

```text
docs/
├── README.md
├── contributing.md
├── testing-playwright-agents.md
├── web-self-hosted.md
├── README.en.md
├── README.zh-TW.md
├── README.ja.md
├── README.de.md
├── README.es.md
├── README.fr.md
└── imgs/
```

## 贡献者测试指南

- `docs/testing-playwright-agents.md`：仓库级 Playwright Test Agents 的适用范围、调用方法、Electron Seed、独立执行和失败诊断边界。

## 版本与更新说明

当前稳定版为 [v0.6.0](https://github.com/legeling/PromptHub/releases/tag/v0.6.0)，于 2026-10-18 正式发布。

- [主 README](../README.md) 区分最新稳定下载、已发布预览版和当前开发版本。
- [CHANGELOG.md 的 Unreleased](../CHANGELOG.md#unreleased) 记录尚未随新发行包发布的主线改动；合并贡献分支不等于发布其版本号。
- [0.6.0 发布记录](../spec/releases/0.6.0.md) 维护版本线、当前候选身份和发布门禁，历史预览说明不被后续主线改动覆盖。

## 内部文档入口

- `spec/README.md`
- `spec/workflow/`
- `spec/knowledge/`
- `spec/rules/`
- `spec/releases/`
- `spec/changes/active/`
- `spec/changes/archive/`
- `spec/changes/legacy/`
- `spec/issues/active/`
