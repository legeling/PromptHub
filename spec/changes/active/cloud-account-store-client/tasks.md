# Tasks

## Analyze gate

- [x] 确认 Cloud auth/session、Store release/package 是远程真源，desktop SQLite/repo 是本地内容真源。
- [x] 记录 bearer session + Electron safeStorage 方案及不回退明文的取舍。
- [x] 建立 `FR -> DES -> TEST -> T` 追踪表。

## Cloud contract

- [x] T-ACC-007a：新增 desktop login contract、Bearer middleware 和 auth regression tests。
- [x] T-ACC-007b：补 account disabled/deletion/invalid session 的结构化错误回归。
- [x] T-STORE-010a：补 package/feed contract 对 desktop 所需字段和安全路径的验证。

## Desktop account

- [x] T-ACC-007c：实现 safeStorage credential store 和 main-side Cloud API。
- [x] T-ACC-007d：实现 preload IPC、账号状态和设置页登录/注销入口。
- [x] T-ACC-007e：接入桌面资料、验证、密码、Session、通知、导出和注销自助动作；签名导出 URL 只由主进程打开。
- [x] T-ACC-007f：接入桌面套餐与权益读取，main 侧裁剪 billing 内部字段并在 Cloud 设置展示安全摘要。

## Desktop Store

- [x] T-STORE-010b：接入 Cloud Store feed/detail/package 到现有 Store UI。
- [x] T-STORE-010c：安装前 package diff + safety scan + confirm 流程。
- [x] T-STORE-010d：更新前 package diff + B/L/T 对账 + confirm 流程。
- [x] T-STORE-010e：安装 intent、终态回传、安装历史与失败状态展示。
- [x] T-STORE-010f：公开 Cloud package 检查摘要、Web 版本/差异预览与同包下载。
- [x] T-STORE-010g：接入桌面 Cloud Store 详情互动：公开 metrics/viewerState、点赞、收藏和带原因举报；补 IPC、输入校验和 renderer 回归。
- [x] T-STORE-010h：默认隐藏未发布的 Cloud 账号与商店入口；统一门禁持久化恢复、程序化选择和后台刷新，并净化 IPC 错误展示。
- [x] 补齐 Web Vite 环境声明，确保共享 Desktop renderer runtime 在 Web typecheck 中保持类型安全。

## Verification/converge

- [x] 补 main/preload/renderer 的单元、IPC contract、回滚和不泄露测试。
- [x] 运行 desktop typecheck、targeted tests；运行 Cloud backend/admin/web typecheck/lint 与 auth/review/install/analytics targeted tests。
- [x] 运行完整 desktop build/full suite、Cloud full suite；真实 PostgreSQL/生产 endpoint 验证仍待发布环境。
- [x] 更新 Cloud capability matrix、两边 implementation/verification 记录和稳定 Skill Store 行为文档；本轮无独立 release notes。
- [ ] 确认外部验证完成后执行 converge 并按日期归档 change。

## 2026-10-29 第三方登录增量

- [x] T-ACC-014：接入浏览器授权与独立 desktop session；验证 main/IPC/设置入口、S256、取消与监听器释放。
- [ ] 与 Cloud 验证协议联动；记录本地验证与发布边界，不改写已发布 0.6.2。

2026-10-29：定向 22 项、lint、源码与测试 typecheck、Cloud 门禁开启的构建通过。生产 Edge → Web 授权 → 本机 main 源码 → Cloud 独立会话实测成功，测试会话撤销后 401；无凭据落盘，端口/标签/进程已清理。新安装包尚未发布，原有 0.6.2 不包含新入口。
