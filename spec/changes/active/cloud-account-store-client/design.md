# Design

## 边界

Cloud 是账号、发布 release、安装意图与指标的真源；PromptHub desktop 是本地 Skill 内容、版本快照、安全扫描和最终写入的真源。Cloud package 通过 `prompthub-store-package.v1` 文件列表交付，桌面端不直接读取 Cloud 数据库或对象存储。

## 认证方案

Cloud 新增 `POST /api/v1/auth/desktop/login`。它复用现有密码校验和 session 表，但固定写入 `clientPlatform=desktop`，只在该显式 endpoint 返回 opaque session token。认证 middleware 同时接受 HttpOnly cookie 和 `Authorization: Bearer <sessionId>`；普通 Web login 响应不返回 token。

桌面端 main 使用 Electron `safeStorage.encryptString` 保存 `{baseUrl, token}` 到 userData 下受保护的 credential 文件。renderer 通过最小 IPC 获取 `authenticated/user/baseUrl`，Cloud Store 请求在 main 完成，token 不跨 IPC 返回。

## Cloud API client

`cloud-api.ts` 只允许固定的 auth/store 方法：login、me、logout、feed、listing/package、install intent/status、installation history。响应错误统一转换为 code/status；错误摘要脱敏，不包含 Authorization、密码或 package 原文。

桌面商店互动通过 main-side Cloud API 完成：listing detail 只向 renderer 返回公开 listing、metrics 和 viewerState；点赞、收藏、举报均通过显式 IPC 方法发送，token 不进入 renderer。举报请求只允许固定原因枚举和受限长度的说明文本。

账号权益通过 main-side `/api/v1/entitlements/me` 读取，main 只投影套餐、来源和额度字段；不透传 subscription、plan grant 的内部标识或支付 provider 字段。

## Store 映射

Cloud `sourceType=skill` 的 listing 映射为 `RegistrySkill`：

- `source_id = cloud:<listing.id>`
- `source_url/store_url` 指向 Cloud listing
- `content` 使用 listing summary snapshot 作为列表降级内容；详情/安装必须以 package 的 `SKILL.md` 为准
- Cloud release 的 `contentFingerprint` 只用于 Cloud install intent 的 expectation；桌面本地 `directory_fingerprint` 仍按包文件计算 `skill-package-sha256-v1`，两个算法不能混写
- `version` 使用 release `versionLabel`，feed 未提供 release 版本时仅作为展示/候选提示，不作为本地基线算法

Cloud package 文件列表只允许安全相对路径。安装/更新写入 `SKILL.md` 和其余 package files，复用现有 `writeLocalFile` / source version snapshot，不允许写出 Skill repo 根目录。

## 更新状态与确认

Cloud package 的 `contentFingerprint` 作为 Cloud delivery expectation，桌面端对账仍使用本地 `skill-package-sha256-v1`。先构造现有 `RegistrySkillUpdateCheck`，再在详情中打开确认预览。安装和更新预览至少显示 release/version、包文件差异、SKILL.md 行差异和安全扫描级别。确认动作才调用现有 `installRegistrySkill` 或 `updateRegistrySkill`，禁止“检查后自动更新”。确认前若来源内容变化，必须重新展示预览；阻断级安全结果不得继续。

## 失败与恢复

- 获取 package、Cloud auth 或安全扫描失败：不写本地内容。
- 创建 intent 成功但本地写入失败：回传 `failed`，保留 Cloud install record 供指标/历史查询。
- 本地写入成功但终态回传失败：本地仍视为成功，显示“已安装，云端记录稍后重试”类状态；不重复写入。
- Cloud 多文件写入失败：恢复已写入文件和新建条目；安装失败不得留下半成品 Skill，更新失败不得提前刷新 DB 来源基线。
- safeStorage 不可用：拒绝登录，不落明文 token。

## 发布门禁

`runtime.ts` 是 renderer 能力的单一真源。`promptHubCloud` 仅在桌面构建显式设置 `VITE_PROMPTHUB_CLOUD_ENABLED=true` 时启用，默认和 Web runtime 均为关闭。设置导航、Skill Store 来源、来源状态恢复和远程定时刷新必须消费同一能力，避免入口隐藏但后台仍请求的半门禁状态。

持久化的 `selectedStoreSourceId=prompthub-cloud` 在能力关闭时归一化为 `official`。Cloud 错误进入 renderer 状态前转换为本地化的通用远程商店错误，不保存 Electron 的 `Error invoking remote method` 包装文本。

Desktop 与 Web 两个 Vite 应用分别声明共享 renderer build flag 的环境类型。Web 编译器会跟随导入的 Desktop renderer runtime 模块，但不会包含 Desktop 自己的 ambient declaration；因此 Web 必须在应用边界提供同一只读字段声明。

## 可验证追踪

| ID | Design | Test | Task |
| --- | --- | --- | --- |
| FR-CLOUD-ACC-001 | DES-AUTH-001 | TEST-AUTH-001..004 | T-ACC-007a..c |
| FR-CLOUD-ACC-002 | DES-AUTH-002 | TEST-AUTH-005..007 | T-ACC-007d |
| FR-CLOUD-ACC-003 | DES-AUTH-003 | TEST-AUTH-008 | T-ACC-007f |
| FR-CLOUD-STORE-001 | DES-STORE-001 | TEST-STORE-001..003 | T-STORE-010a |
| FR-CLOUD-STORE-002 | DES-STORE-002 | TEST-STORE-004..008 | T-STORE-010b |
| FR-CLOUD-STORE-003 | DES-STORE-003 | TEST-STORE-009..012 | T-STORE-010c |
| FR-CLOUD-STORE-004 | DES-STORE-004 | TEST-STORE-013..015 | T-STORE-010d |
| FR-CLOUD-STORE-005 | DES-STORE-005 | TEST-STORE-016 | T-STORE-010e |
| FR-CLOUD-STORE-006 | DES-STORE-006 | TEST-STORE-017..019 | T-STORE-010g |
| FR-CLOUD-STORE-007 | DES-STORE-007 | TEST-STORE-020..023 | T-STORE-010h |

## 2026-10-29 第三方浏览器登录

FR-ACC-007 / DES-ACC-014：桌面设置仅展示浏览器登录，main 生成 state/verifier 与 127.0.0.1 临时端口，通过当前 Cloud API 的 `/api/v1/auth/desktop/start` 进入官网授权页。用户确认后，票据与 state 返回本机，main 以 S256 verifier 调用 `/api/v1/auth/desktop/exchange`，只在 safeStorage 保存新独立会话。renderer 不获取 verifier、票据或令牌。错误/取消/10 分钟到期/退出关闭本轮监听器；不启用常驻 HTTP 服务。

官网和 API 共同规范 `callbackUrl/state/codeChallenge`、`ticket/codeVerifier`；票据在 Cloud 端 60 秒有效并一次性消费，校验父会话和账号状态。官方 API 真源更新为 `packages/shared/constants/cloud.ts` 中的 api.prompthub.click；保留显式自定义 endpoint。既有密码接口保留供既有调用方使用，第三方账号不展示改密码/验证邮件入口。继续遵守 Cloud 现有发布门禁；此源码不是已发布 0.6.2 安装包的能力。

TEST-ACC-014：main HTTP loopback 真连接与清理、API 凭据保存与返回裁剪、IPC、组件入口，另由 Cloud 仓库验证真实 Web BFF 与后端服务协议（第三方身份交换使用 fixture）。无数据库迁移；撤回新桌面构建即可回滚。
