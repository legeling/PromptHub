# Implementation

## Product

Desktop

## Status

review-pending. Production endpoint and external-service acceptance remain open.

## 当前状态

2026-07-12：已完成 Cloud desktop 账号与 Store 的首段闭环；本轮继续补齐桌面账号自助操作、公开 package 检查摘要和 Web 版本预览，保留生产环境与外部服务证据作为明确残余。

2026-07-14：发现生产 endpoint 尚未完成外部验证时，桌面正式构建已经无条件展示账号与商店入口，并会在后台刷新 Cloud。这与 proposal 中“Cloud 来源可独立隐藏”的回滚边界冲突。当前修复将能力改为显式构建启用，默认关闭，并覆盖旧状态恢复与错误净化。

## 已实现

- Cloud 新增 desktop login contract；Bearer middleware 同时兼容 cookie 和 bearer session，普通 Web login 不返回 token。
- Desktop main 使用 Electron safeStorage 保存 Cloud credential；token 不进入 renderer、localStorage、UI 或日志。
- 新增 Cloud IPC/preload/API client 与设置页账号登录、注销、网络不可用保留会话和安装历史摘要。
- 桌面账号设置已接入资料修改、邮箱验证重发、密码修改、Session 查看/撤销、通知摘要、导出请求/主进程打开下载和注销申请/取消；Bearer 与签名下载 URL 不进入 renderer 状态。
- PromptHub Cloud feed/detail/package 接入现有 Skill Store；Cloud package 详情以发布包内的 `SKILL.md` 为准，路径边界在 main 侧校验。
- 安装前和更新前都先取得内容、运行安全扫描、展示文件/行差异并等待显式确认；更新支持 local-modified/conflict 的覆盖确认。
- Cloud install/update intent 使用 Cloud `store-package-sha256-v1` release fingerprint；本地 Skill baseline 使用 `skill-package-sha256-v1`，避免跨算法比较。
- Cloud 多文件写入失败会按已读文件快照回滚，安装失败清理新建 Skill；成功/失败尽力回传 Cloud install 状态。
- Cloud 安装历史补齐商店名称、版本、发布时间和失败摘要；Web 账号中心也消费同一 Cloud 历史接口。
- Cloud package 公开响应增加不含 finding 内容、凭证和对象 key 的机器检查摘要；Web Store 详情展示已发布版本、指纹算法、结构化文件差异、安全检查计数，并下载同一 normalized package。
- 桌面 Cloud Store 详情补齐公开 metrics/viewerState、点赞/取消、收藏/取消和带原因举报；写请求全部通过 main/preload IPC，renderer 不接触 bearer token，举报字段在 IPC 边界限制为固定原因和 2000 字符说明。
- 桌面 Cloud 设置补齐套餐与权益摘要，main 侧只返回有效套餐、额度和开关，不把 Stripe customer 或 plan grant 内部字段带到 renderer；旧 Cloud endpoint 暂时缺少权益时不阻断账号资料加载。
- 2026-07-14 起，Cloud 桌面入口由 `promptHubCloud` runtime capability 统一控制；普通构建默认隐藏设置与商店入口，禁止程序化选择和后台刷新，旧 `prompthub-cloud` 选择回退到 `official`。仅显式设置 `VITE_PROMPTHUB_CLOUD_ENABLED=true` 的桌面构建可启用；启用后的请求错误也不再把 Electron IPC 包装文本展示或保存到 renderer 状态。
- Web Vite 环境边界声明了共享 renderer runtime 读取的 Cloud build flag，修复 Web typecheck 跟随 Desktop 模块时缺少 `ImportMeta.env` 的发布门禁错误。

## 本轮验证

- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- Desktop targeted Vitest：Cloud auth/storage/API/IPC、Cloud store mapping、安装指纹契约、安装/更新确认交互和 Cloud 多文件回滚，共 39 tests passed。
- Desktop full Vitest：345 test files、2929 tests passed。
- Desktop build、typecheck、lint passed；build 仅保留既有大 chunk warning。
- Cloud full suite：backend 62 test files passed、4 skipped（345 passed、18 skipped）；Admin 与 Web production smoke 各 1 test passed。
- `pnpm --filter @prompthub/desktop exec eslint`（本轮 touched modules）
- Cloud backend targeted Vitest：auth 26、store review 12、store install 4、store analytics 4 tests passed。
- Cloud backend/admin/web typecheck 与 web lint passed；Cloud backend lint passed。
- 2026-07-14 Cloud 发布门禁回归：renderer runtime、设置导航、Skill Store 侧栏、旧来源恢复、禁用时零请求与启用后错误净化，共 64 tests passed。
- 2026-07-14 `pnpm --filter @prompthub/desktop typecheck`、`pnpm --filter @prompthub/desktop lint`、`pnpm --filter @prompthub/desktop build` passed；build 仅保留既有 chunk size 和 fflate dynamic/static import warning。
- 2026-07-14 `pnpm --filter @prompthub/web typecheck` passed after adding the Web-owned Vite environment declaration.

## 残余风险

- Cloud 多文件回滚通过现有文件 IPC 完成，不是单次主进程 atomic replace；回滚失败会记录 warning，后续应补 native batch writer。
- Cloud feed 当前以列表时间作为没有 release version 时的候选提示；详情/确认会重新读取 published package，不能把 feed 时间当作 durable release fingerprint。
- 真实生产 Cloud endpoint、PostgreSQL migration verify 和正式邮件投递仍需在发布环境补验证；本机 Cloud full suite 的 PostgreSQL 专项仍按环境条件 skipped。
- desktop 仍未接入 OAuth 绑定/解绑、邮件收件结果和完整风险评分；Cloud 生产环境仍需外部证据。

## 验证记录

本变更的桌面定向测试、Cloud contract 测试和静态检查已完成；Cloud migration verify 因当前环境缺少 `DATABASE_URL` 未执行，不能把本地结果写成生产数据库证据。
