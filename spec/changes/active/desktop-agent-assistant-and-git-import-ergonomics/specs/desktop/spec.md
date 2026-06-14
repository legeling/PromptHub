# Delta Spec

## Added

### Requirement: Desktop should support an in-app Agent Assistant workflow

桌面端应支持一个内置 `Agent Assistant` 入口，用自然语言帮助用户完成 PromptHub 内已有能力的组合操作。

#### Scenario: Install and distribute a skill from one instruction

- Given 用户提供一个 Git / GitHub / Gitea Skill 链接
- And 用户希望把该 Skill 分发到一个或多个 Agent 平台
- When 用户通过桌面端 Agent Assistant 提交自然语言指令
- Then 系统应能够把该意图规划成受限的 Skill 安装与分发动作
- And 执行层应复用 PromptHub 已有能力，而不是依赖模拟点击 UI
- And 高风险动作在真正覆盖/删除前必须经过用户确认

#### Scenario: Agent Assistant should orchestrate existing capabilities

- Given PromptHub 已具备 Skill、Rules、MCP、Prompt 等业务能力
- When 设计桌面端 Agent Assistant
- Then 该能力应优先建立在 typed action / IPC / service contract 之上
- And 不得把 durable business rules 只放进气泡聊天组件内部

## Modified

### Requirement: Git repository import should preserve a primary scroll area for large result sets

Git 仓库导入弹窗在扫描出大量导入候选时，结果列表必须拥有明确且足够大的主滚动区域，便于用户浏览剩余候选项。

#### Scenario: Large Git repo scan result keeps the candidate list prominent

- Given 用户在 “Install from Git Repository” 中扫描出多个 Skill 候选
- When 扫描结果展示在桌面弹窗中
- Then 仓库说明区应收紧到不遮挡主要浏览任务的程度
- And 结果列表应成为主滚动区域
- And footer 操作按钮应保持固定，不随结果列表滚动
- And 单个候选卡片应在保留名称、来源和描述摘要的前提下，提高同屏可见项数量

### Requirement: SSH GitHub repository scan should use local git transport instead of GitHub API metadata

当用户在桌面端输入 `git@github.com:owner/repo.git` 这类 SSH GitHub 仓库地址时，扫描阶段必须走本地 git/本地 SSH 密钥能力，而不是退回匿名 GitHub API 元数据扫描。

#### Scenario: SSH GitHub scan avoids anonymous API rate limits

- Given 用户在 “Install from Git Repository” 中输入一个 SSH GitHub 仓库地址
- When 桌面端开始扫描其中的 Skill 候选
- Then 系统应通过本地 `git clone` 到临时目录后解析 `SKILL.md`
- And 不应先请求 `api.github.com/repos/...` 或 `raw.githubusercontent.com` 作为扫描前提
- And 返回的 `source_url`、`source_branch` 与 `canonical_skill_path` 仍需保持与现有 Git 仓库导入流程兼容

### Requirement: Git repository import should reset stale scan state when the repository URL changes or the mode is reopened

Git 仓库导入模式不能把上一次仓库的扫描结果静态保留给下一次输入；当地址变化或用户返回再进入时，界面需要明确进入新的扫描上下文。

#### Scenario: Editing the repository URL requires a fresh scan

- Given 用户已经扫描过一个 Git 仓库并看到导入候选
- When 用户修改仓库地址输入框
- Then 旧的扫描结果不应继续作为当前仓库的可导入候选显示
- And 界面应提供明确的“重新扫描仓库”动作
- And 在重新扫描完成前，不应允许用户直接拿旧结果执行导入

#### Scenario: Reopening the Git import mode starts clean

- Given 用户从 Git 仓库导入模式返回到添加方式选择页
- When 用户再次进入 “Install from Git Repository”
- Then 仓库地址输入框应回到空状态
- And 上一次的候选列表、选择状态和导入提示不应残留

### Requirement: HTTP GitHub rate limit errors should explain the SSH workaround

当 GitHub HTTPS 扫描碰到匿名 API 限流时，错误提示应直接告诉用户等待重试，或改用 SSH 仓库地址绕过该限制。

#### Scenario: HTTPS GitHub rate limit message recommends SSH

- Given 用户通过 HTTPS GitHub 仓库地址扫描导入候选
- When GitHub API 返回 rate limit 错误
- Then 错误提示应明确说明这是匿名 API 限流
- And 提示用户可几分钟后重试，或改用 SSH 仓库地址

### Requirement: Skill current version labels should never display v0 in the desktop UI

桌面端 Skill 详情页的“当前版本”是用户可见标识，不应把内部“尚未生成快照”的 `0` 计数直接暴露成 `v0`。

#### Scenario: Newly created or unsnapshotted skills display as v1

- Given 一个 Skill 的内部 `currentVersion` 仍为 `0`
- When 用户在桌面端查看它的详情页
- Then “当前版本”标签应显示为 `v1`
- And 已存在快照的版本号显示规则不应因此整体偏移

### Requirement: Skill image resource preview should support in-canvas zooming

桌面端 Skill 文件编辑器在预览图片资源时，应提供接近图片浏览器的缩放体验，避免用户必须依赖顶部工具栏或无法在放大后滚动查看图片细节。

#### Scenario: Mouse wheel zooms the image preview

- Given 用户在 Skill 文件编辑器中打开一个图片资源
- When 用户把鼠标放在图片预览区域并滚动滚轮
- Then 图片应根据滚轮方向放大或缩小
- And 预览区域应拦截默认滚动以优先执行缩放
- And 放大后的图片应拥有真实可滚动尺寸，便于用户查看边缘与细节

#### Scenario: Dragging pans a zoomed image

- Given 用户在 Skill 文件编辑器中打开一个图片资源
- And 图片已经被放大到可滚动查看的尺寸
- When 用户在图片预览区域按住鼠标并拖拽
- Then 预览区域应以抓手交互平移图片
- And 横向与纵向滚动位置应跟随拖拽距离变化

#### Scenario: Image zoom controls live inside the preview canvas

- Given 用户在 Skill 文件编辑器中打开一个图片资源
- When 图片预览区域展示缩放控件
- Then 缩放控件应固定在预览区域右下角
- And 用户拖拽平移图片时，缩放控件不应跟随图片内容移动
- And 顶部文件工具栏不应再显示“资源预览 / Preview”状态文案
- And 普通预览中的中间百分比按钮应打开全屏预览，而不是重置缩放
- And 图片本体不应额外添加阴影、圆角或边框感

#### Scenario: Fullscreen image preview supports the same viewing interactions

- Given 用户在 Skill 文件编辑器中打开一个图片资源
- When 用户点击预览区右下角的百分比/全屏按钮
- Then 应显示覆盖整个应用窗口的大图预览
- And 全屏预览应继续支持滚轮缩放、抓手拖拽平移、放大、缩小和重置缩放
- And 用户按 `Escape` 或点击关闭按钮时，应退出全屏预览

### Requirement: Skill detail title should be directly copyable

桌面端 Skill 详情页顶部标题应支持直接复制 Skill 名称，减少用户手动选中文本的操作成本。

#### Scenario: Clicking the Skill title copies the title

- Given 用户正在查看一个 Skill 详情页
- When 用户点击顶部 Skill 标题
- Then 系统应把该 Skill 名称写入剪贴板
- And 标题应保留原有标题视觉形态
- And 成功后应显示已复制反馈
