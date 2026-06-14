# Design

## Overview

本变更包含两个相邻但独立的桌面需求：

1. **Agent Assistant 需求记录**
   - 把内置 Agent Assistant 明确建模为“自然语言规划 + 受限动作执行”的桌面能力，而不是自由聊天或模拟点击的 UI 自动化。
   - 执行层优先复用现有 Skill / Rules / MCP / Prompt 业务能力，不直接以 renderer 按钮为控制面。

2. **Git 仓库导入弹窗结果区优化**
   - 扫描完成后，收紧说明区的垂直占用，把候选列表区提升为弹窗主滚动区域。
   - 单个候选卡片保持足够信息量，但降低描述行数和内边距，提升同屏可见项数量。

3. **SSH GitHub 扫描链路修正**
   - 对 `git@github.com:owner/repo.git` 这类 URL，扫描阶段不再依赖 GitHub REST/tree/raw API。
   - 改为使用现有 `gitClone` 能力把仓库浅克隆到临时目录，再在本地收集 `SKILL.md`、计算目录指纹并生成导入候选。
   - 这样扫描与后续安装传输层保持一致，都走用户机器上的 SSH 配置与本地密钥。

4. **Skill 图片资源预览优化**
   - 图片缩放交互下沉到 `SkillFileEditor` 的资源预览画布内。
   - 鼠标滚轮在图片预览区域内被解释为缩放，不再只是滚动外层页面。
   - 缩放通过改变图片舞台的实际尺寸实现，避免单纯 `transform: scale()` 导致放大后滚动范围不变。
   - 图片预览拆成“外层固定浮层容器 + 内层滚动视口”：抓手拖拽只改变内层视口的 `scrollLeft` / `scrollTop`，右下角缩放控件固定在外层，不随图片内容滚动。
   - 右下角百分比按钮打开覆盖整个应用的全屏预览；全屏预览复用同一套滚轮缩放、抓手拖拽和缩放控件，并通过 `Escape` 或关闭按钮退出。
   - 图片本体保持裸图渲染，不额外添加阴影、圆角或边框感。

5. **Skill 详情标题复制**
   - 顶部标题在视觉上保持标题样式，但语义上改为无边框按钮。
   - 点击后复用既有 `copyTextToClipboard`，成功时使用现有 toast 反馈，失败时沿用复制失败提示。

## Affected Areas

- Data model:
  - 无运行时数据模型变化；仅新增 active change 文档。
- IPC / API:
  - 无新增 channel；仅修改既有 `skill:scanRemoteGithub` 的 SSH GitHub 执行路径。
- Filesystem / sync:
  - SSH GitHub 扫描会短暂创建临时 clone 目录，并在扫描结束后清理。
- UI / UX:
  - `CreateSkillModal` Git 导入结果态布局收口。
  - SSH GitHub 仓库扫描的错误表现从 “GitHub API rate limit reached” 收敛为真实 git/SSH 传输错误。
  - `SkillFileEditor` 图片预览控件移到预览区右下角，顶部工具栏不再显示“Preview”状态文案，图片区域支持抓手拖拽平移和全屏预览。
  - `SkillFullDetailPage` 顶部标题可点击复制 Skill 名称。

## Tradeoffs

- 选择先写 Agent Assistant 的 active change，而不是把需求直接同步进稳定 `spec/knowledge/*`，因为该功能尚未实现，当前仍属于待执行边界。
- 选择在结果出现后压缩说明区，而不是新增复杂分页/二级面板；这样改动小、风险低，且直接解决用户“看不到后面有哪些”的核心痛点。
- 对 GitHub HTTPS 保留现有 API-tree 轻量扫描路径，对 GitHub SSH 单独切到 clone 扫描；这样避免扩大 HTTP 路径的行为变化，同时修正 SSH 与用户预期不一致的问题。
- 对图片缩放选择改变预览舞台实际尺寸，而不是继续使用 `transform`；实现稍多一点，但能让浏览器滚动区域准确反映放大后的图片大小。
- 对图片预览选择拆分滚动视口和浮层容器，而不是用 `position: sticky` 修补；这样拖拽、滚轮和全屏复用的边界更清楚。
