# 活跃问题追踪：质量与工具链

## 2026-03-12

### 已解决

- `Q-001` `pnpm lint` 无法执行
  - 处理：新增 `eslint.config.mjs`
  - 结果：`pnpm lint` 已恢复通过

- `Q-002` updater 单测失败
  - 处理：修正 `tests/unit/main/updater.test.ts` 断言
  - 结果：`pnpm test:run` 全绿

- `Q-004` 根级 release quick harness 暴露 desktop unit 失败
  - 处理：补齐桌面 renderer/main 回归覆盖，并修复 quick harness 暴露的
    `AISettingsPrototype` 模型选择器测试断言漂移。
  - 结果：2026-06-10 `pnpm verify:release:quick` 已通过 shared/db/core
    typecheck、CLI lint/typecheck/test/build、desktop lint/typecheck/unit/build、
    web lint/typecheck；desktop unit 为 239 个测试文件 / 2228 个测试全过。
    quick harness 在受限网络下仍会卡在 Web Docker runtime deps 集成测试的
    内部 `pnpm install --prod --frozen-lockfile --ignore-scripts`，该单测在
    registry/network access 下单独重跑通过。

- 2026-06-10 提交前敏感信息扫描
  - 范围：当前 tracked diff 与 untracked 文件。
  - 结果：未命中私钥、AWS access key、GitHub token、Slack token、OpenAI key
    等真实密钥形态；命中项均为测试中的伪 `apiKey` / `password` fixture 或文档
    中的占位 `JWT_SECRET` 示例。

- 2026-06-10 Web streamed JSON body size bypass
  - 发现：多个 Web JSON 路由只用 `Content-Length` 做大小预检，未声明长度的
    streamed/chunked body 会在 `c.req.json()` / `c.req.text()` 中被完整读入。
  - 处理：新增受限 byte/text body reader，并让 `parseJsonBody()` 在读取过程中
    执行默认 1 MiB 上限；auth、AI、sync/import、media 上传保留各自业务上限。
  - 结果：新增无 `Content-Length` 的 auth streamed oversized 回归测试；
    `pnpm --filter @prompthub/web typecheck`、目标 Web 路由测试、Web lint 和
    `git diff --check` 均通过。

- 2026-06-10 Web multipart import streaming limit
  - 发现：multipart import 使用 `c.req.formData()` 后才检查 `file.size`，无
    `Content-Length` 的 streaming multipart 可能在到达大小检查前占用内存。
  - 处理：multipart import 现在先通过受限 byte reader 按 50 MiB import 上限
    读取请求，再构造临时 `Request` 解析 `formData()`。
  - 结果：新增无 `Content-Length` 的 streamed multipart import 超限回归测试；
    `pnpm --filter @prompthub/web typecheck` 和目标 import-export 测试通过。

- 2026-06-10 Desktop media IPC filename boundary
  - 发现：`video:getPath` 对非法文件名会直接抛出 IPC 异常，且媒体文件名校验
    依赖 `basename` / 字符串前缀判断，跨平台语义不够明确。
  - 处理：媒体 IPC 文件名现在拒绝空名、路径分隔符、遍历片段、控制字符和
    NTFS alternate-stream 分隔符，并用 `path.resolve` / `path.relative` 二次确认
    结果仍在媒体目录内；`video:getPath` 对非法文件名返回 `null`。
  - 结果：新增 unsafe video filename 回归测试；desktop image IPC 单测、
    typecheck、lint 和 `git diff --check` 均通过。

- 2026-06-10 Desktop media IPC content size boundary
  - 发现：`image:save-buffer`、`image:saveBase64` 和 `video:saveBase64` 没有
    统一内容大小上限；`saveImageBuffer` 的 preload 契约是 `ArrayBuffer`，主进程
    直接按 `Buffer` 处理也不够稳。
  - 处理：新增 20 MiB 媒体写入上限、严格 base64 校验和 decoded-size 预估；
    `image:save-buffer` 现在会先把 `Buffer` / `ArrayBuffer` / typed array 统一
    规范化为 `Buffer`。
  - 结果：新增 ArrayBuffer 正常保存、超大 buffer、非法 base64、超大 base64
    回归测试；desktop image IPC 单测、typecheck、lint 和 `git diff --check` 均通过。

- 2026-06-10 Desktop local media protocol boundary
  - 发现：`local-image` / `local-video` 协议解析已阻止目录穿越和绝对路径，但没有
    按协议限制媒体扩展名，也没有拒绝控制字符或 NTFS alternate-stream 分隔符。
  - 处理：协议解析现在按 `local-image` / `local-video` 分别限制支持的图片和视频
    后缀，并在解析前拒绝控制字符、DEL 和 `:`。
  - 结果：新增扩展名错配、文本伪装、NUL 字符和 stream 分隔符回归测试；
    `local-media-protocol` 单测通过。

- 2026-06-10 Desktop skill markdown URL protocol boundary
  - 发现：技能 markdown 的 GitHub 相对链接解析 helper 会通过 `new URL()` 接受
    `javascript:` / `file:` / `data:` 等绝对 URL；即使 markdown sanitize 层通常会兜底，
    URL helper 本身不应产出危险协议。
  - 处理：链接只允许 `http:`、`https:`、`mailto:`、`tel:` 和 fragment；图片只允许
    `http:`、`https:` 和既有 `local-image://`。其它协议解析为空字符串。
  - 结果：新增 unsafe markdown URL 协议回归测试；`skill-detail-utils` 单测通过。

- 2026-06-10 Desktop prompt markdown URL protocol boundary
  - 发现：Prompt markdown preview/detail/edit 三处自定义 anchor 渲染依赖
    sanitize 插件兜底，组件层没有统一限制 `href` 协议；Prompt source 字段也用
    `startsWith("http")` 判断是否渲染为外链。
  - 处理：新增共享 prompt markdown URL helper；只允许 `http:`、`https:`、
    `mailto:`、`tel:` 和 fragment 链接，不安全协议降级为可见但不可点击文本；
    Prompt source 字段复用同一 helper。
  - 结果：新增 Prompt markdown unsafe link 和 Prompt source unsafe URL 回归测试；
    目标单测通过。

- 2026-06-10 Desktop AI test generated image URL boundary
  - 发现：AI 生图结果 URL 会进入生成图 `<img>`、下载按钮和“添加到 Prompt”路径；
    renderer 侧只用 `startsWith("http")` 区分远程 URL，下载按钮会直接创建 anchor。
    AI 设置页的生图测试结果也会直接把服务返回的 `imageUrl` 渲染进 `<img>`。
  - 处理：生成图结果进入 state 前先过滤，只允许 `http:` / `https:` 和支持的
    `data:image/*;base64` URL；添加到 Prompt、AI 设置结果弹窗和下载路径也复用
    同一解析结果。通用下载工具现在会拒绝不支持的生成图 URL，不再 fetch 或 click。
  - 结果：新增 unsafe generated image URL 过滤和 safe generated image add-to-prompt
    回归测试；新增共享 generated-image-url、download-generated-image 和 AISettings
    unsafe image result 回归测试；目标单测通过。

- 2026-06-10 Desktop skill source/store URL boundary
  - 发现：技能来源元数据会先根据 `source_label` 等字段推断远端来源，导致
    `javascript:` 这类显式不安全协议可能被当作远端来源；技能商店详情页也直接把
    远端 `source_url` / `store_url` 渲染为外链。
  - 处理：新增技能外链 URL 白名单，只允许 `http:` / `https:` 成为可点击外链；
    `getSkillSourceMeta()` 在本地路径兜底前拒绝显式不安全协议。
  - 结果：新增 unsafe skill source metadata 和 unsafe store detail URL 回归测试；
    `skill-detail-utils`、`skill-store-remote` 目标单测通过。

- 2026-06-10 Desktop skill icon URL boundary
  - 发现：远端 skill store metadata、导入数据或用户编辑产生的 `icon_url` 会经
    `SkillIcon` 直接进入 `<img src>`，缺少显式协议边界。
  - 处理：`SkillIcon` 新增图标 URL 解析白名单，只允许 HTTP(S)、相对 app 资源和
    支持的 `data:image/*;base64` 图标；危险显式协议降级到已有 emoji/首字母/默认图标。
  - 结果：新增 unsafe icon URL 和内置 SVG data preset 兼容回归测试；
    `skill-icon`、`skill-icon-picker`、`skill-store-card` 目标单测通过。

- 2026-06-10 Desktop image reverse reference size boundary
  - 发现：图片反推 modal 对拖拽/粘贴图片只检查 MIME，随后立即 `arrayBuffer()`
    读取完整文件；超大图片会先进入 renderer 内存，之后才可能被主进程媒体写入上限拦截。
  - 处理：renderer 侧在读取前按 20 MiB 上限预检文件大小，并为
    `imageReverse.tooLarge` 补齐桌面多语言 key；超限时不读取、不保存、不创建预览 URL。
  - 结果：新增 oversized dropped image 回归测试；`image-prompt-reverse-modal`
    目标单测和整文件单测通过。

- 2026-06-10 Desktop variable AI test attachment boundary
  - 发现：变量填充弹窗的 AI 测试附件选择会静默过滤不支持格式或超过 10 MiB 的图片，
    用户不知道附件为何没有加入；该路径也缺少“拒绝后不启动 FileReader”的回归覆盖。
  - 处理：变量弹窗复用现有 AI 测试附件数量、格式和大小错误 toast；不支持或超限的
    文件在读取前被拒绝。
  - 结果：新增 unsupported/oversized attachment 回归测试；`variable-input-modal`
    目标单测通过。

- 2026-06-10 Desktop skill variant source badge boundary
  - 发现：技能变体来源徽标用 `source_label.trim().startsWith("http")` 判断 Community
    来源，`httpx://...` 或 `http-local-team` 这类非 HTTP(S) 字符串会被误判，和
    详情页的显式 URL 协议边界不一致。
  - 处理：来源徽标改为通过 `new URL()` 解析并只接受 `http:` / `https:` 协议。
  - 结果：新增 `skill-variant-badges` 单测覆盖 HTTP(S) 正常分类和 http 前缀误判；
    相关 SkillStore source/badge 组件筛选测试通过。

- 2026-06-10 Desktop updater download URL boundary
  - 发现：macOS 直接下载 DMG 的 updater redirect 处理用 `startsWith("http")`
    判断绝对 URL，`file:` 或 `httpx:` 等非 HTTP(S) `Location` 会进入下一轮下载
    请求路径，边界依赖 Node HTTP 抛错而不是 updater 自身明确拒绝。
  - 处理：新增 updater 下载 URL resolver，初始下载 URL 和 redirect URL 都必须能解析
    为 `http:` / `https:`，否则在发起下一次请求前失败。
  - 结果：新增 updater redirect URL 协议回归测试；`updater.test.ts` 和
    `updater-install.test.ts` 通过。

- 2026-06-10 Desktop renderer external link opener boundary
  - 发现：桌面 renderer 多处 prompt/skill markdown 和来源链接使用
    `target="_blank"` 时只有 `rel="noreferrer"`，而同项目其它外链已显式使用
    `noopener noreferrer`。
  - 处理：统一剩余桌面 renderer 外链为 `rel="noopener noreferrer"`，保留既有 URL
    协议白名单和不安全链接降级逻辑。
  - 结果：目标 markdown/source 组件测试通过；脚本检查确认所有桌面/web client
    `target="_blank"` anchor 均包含 `noopener`。

- 2026-06-10 Desktop legacy AI settings invalid endpoint render
  - 发现：旧版 AI 设置页聊天模型分组 header 直接执行 `new URL(apiUrl).host`；
    如果用户保存了不完整或非法 API URL，设置页会在渲染阶段抛 `Invalid URL`。
  - 处理：抽出 endpoint host fallback helper，URL 解析失败时显示原始 `apiUrl`
    文本；图像模型分组也复用同一 helper。
  - 结果：新增非法 API URL 回归测试；`ai-settings-legacy` 整文件测试通过。

- 2026-06-10 Desktop remote image download type boundary
  - 发现：桌面 `image:download` 在远程 URL 没有图片扩展名、响应也没有
    `image/*` Content-Type 时，会兜底保存为 `.png`，可能把非图片响应写入媒体目录。
  - 处理：远程下载现在必须能从最终 URL 扩展名或响应 Content-Type 推断出支持的
    图片类型，否则返回 `null` 且不写入文件。
  - 结果：新增无图片扩展且无图片 Content-Type 的远程下载回归测试；
    `image-ipc` 目标单测和整文件单测通过。

- 2026-06-10 Web folder legacy visibility boundary
  - 发现：Web folder API 同时接受 `visibility` 和旧字段 `isPrivate`，但只传
    `isPrivate: false` 时会默认写入 `visibility='private'`，同时写入
    `is_private=0`，造成同一 folder 可见性状态矛盾；普通用户也能绕过 shared
    folder 的 admin-only 校验。
  - 处理：`FolderService` 现在先把 legacy `isPrivate` 规范化成当前
    `visibility`，并以 `visibility` 为单一真相持久化 `visibility` / `is_private`。
  - 结果：新增 legacy `isPrivate` create/update 回归测试；`folders.test.ts`
    整文件通过。

- 2026-06-10 Web settings nested patch boundary
  - 发现：Web settings 是 patch-style API，但 `sync` 和 `device` 这类 nested
    设置使用浅合并；更新一个 nested 字段会丢掉已保存的兄弟字段。`sync` 还会直接
    拒绝只包含 `lastSyncAt` 的部分 patch，和 `device` 的部分更新语义不一致；Web
    client `updateSettings()` 类型也要求完整 `SyncSettings`。
  - 处理：新增 `syncSettingsPatchSchema` 支持部分 sync patch，并让
    `SettingsService.set()` 仅对 `sync` / `device` 做有边界的 nested merge；客户端
    settings update payload 类型同步为 patch 语义。
  - 结果：新增 partial nested settings 回归测试和 client endpoint 类型覆盖；
    `settings.test.ts` 与 `endpoints.test.ts` 通过。

- 2026-06-10 Web prompt folder clear boundary
  - 发现：共享 `UpdatePromptDTO` 和 DB 层都支持 `folderId: null`，但 Web prompt
    更新 route schema 只接受字符串，导致用户无法通过 API 把 prompt 从文件夹移回根目录。
  - 处理：`PUT /api/prompts/:id` 现在接受 `folderId: null`，继续由
    `PromptService` 做 owner/visibility 边界校验。
  - 结果：新增 `folderId: null` 清空文件夹归属回归测试；目标 prompt route 测试通过。

- 2026-06-10 Web client prompt list query forwarding
  - 发现：后端 prompt list route 和 desktop bridge 已支持 `tags`、`folderId`、
    `limit`、`offset`，但 Web client API wrapper 的 `getPrompts()` 会静默丢弃这些
    查询参数，导致前端无法通过该封装使用后端已有筛选和分页能力。
  - 处理：补齐 `PromptListQuery` 类型和 query string builder，转发 tag、folder、
    pagination 参数。
  - 结果：新增 client prompts API query string 回归测试；目标测试通过。

- 2026-06-10 Web client folder create parent boundary
  - 发现：后端 folder create route 支持 `parentId` 创建子文件夹，但 Web client
    `createFolder()` 封装类型没有暴露该字段，前端代码通过封装无法创建嵌套文件夹。
  - 处理：补齐 `createFolder()` payload 类型中的 `parentId?: string`，请求体继续
    原样序列化。
  - 结果：新增 client endpoints API 回归覆盖，typecheck 先失败后通过。

- 2026-06-10 WebDAV endpoint base URL boundary
  - 发现：WebDAV endpoint 只校验 HTTPS，仍接受 `?query` 或 `#fragment`；目标
    URL 字符串拼接会把备份文件名追加进 query/fragment 语义中。同时共享 sync
    settings 校验把 WebDAV-only endpoint 规则套到了 self-hosted provider 上。
  - 处理：WebDAV endpoint 现在必须是无 query/fragment 的 HTTPS 集合基址；
    连接测试和目标 URL 构造也复用同一校验。WebDAV 专属规则仅在有效 provider 为
    `webdav` 时执行。
  - 结果：新增 WebDAV service endpoint/URL 构造/PROPFIND 前置拒绝回归测试，
    并确认 self-hosted `http://` endpoint 不再被 WebDAV 规则误拒。

- 2026-06-10 Web browser device heartbeat resilience
  - 发现：Web workspace heartbeat 直接信任 `localStorage` 中的 browser device id；
    如果该值为空白或超过服务端 128 字符限制，浏览器设备记录会持续注册失败。
    heartbeat 同时绕过了 Web client 已有的 auth retry 包装。
  - 处理：发送 heartbeat 前按服务端边界校验并自愈本地 device id；heartbeat 请求
    改走 `fetchWithAuthRetry`，非成功响应进入既有 warning 路径。
  - 结果：新增 DesktopWorkspace heartbeat 回归测试；Web 目标测试、typecheck、
    lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Desktop updater status render boundary
  - 发现：`UpdateDialog` 直接读取 updater IPC 状态中的 `info.version` 和
    `error.includes()`；虽然主进程正常会发送完整字段，但 renderer 边界没有运行时兜底，
    畸形状态载荷会让弹窗渲染阶段 TypeError。
  - 处理：更新弹窗渲染层为 `available/downloaded` 缺失版本回退当前版本，为缺失错误
    文本显示通用未知错误，并将下载进度限制在 `0..100`。
  - 结果：新增 updater 畸形状态载荷回归测试；`update-dialog.test.tsx` 整文件通过。

- 2026-06-10 Web video media route guidance
  - 发现：Web media route builder 实际暴露 `/api/media/videos/download`，但根
    `POST /api/media/videos` 的错误提示只引导到 `/api/media/videos/base64`，
    造成 API/用户指导与真实能力不一致。
  - 处理：视频媒体根 POST 的拒绝提示同步列出 `/api/media/videos/base64` 和
    `/api/media/videos/download`。
  - 结果：新增 video media route guidance 回归测试；`media.test.ts` 整文件通过。

- 2026-06-10 Desktop updater top bar version fallback
  - 发现：顶栏更新提示对运行时可用更新状态使用 `info?.version`，缺少版本号时不会崩溃，
    但会显示 `v available` 这类半截文案。
  - 处理：顶栏更新按钮有版本时显示 `v{{version}} available`，缺版本时回退到通用
    `Update Available` 文案。
  - 结果：新增缺版本 updater 状态回归测试；`top-bar.test.tsx` 整文件通过。

- 2026-06-10 Desktop settings same-version background hydration
  - 发现：背景图设置的非法来源和越界 opacity/blur 只在 persist `migrate`
    中规范化；如果当前版本 localStorage 已包含坏值，Zustand 同版本 rehydrate 会走
    `merge` 而不是 `migrate`，导致 store state 保留远程背景图 URL，后续仍可能被继续持久化或同步。
  - 处理：settings store 的 `persist.merge` 现在也会规范化背景图文件名并 clamp
    opacity/blur，和同版本 `syncProvider` 修复保持一致。
  - 结果：新增 same-version persisted background image 回归测试；
    `settings-background-image.test.ts`、desktop typecheck、desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Web media filename stream separator boundary
  - 发现：Web media filename normalization 已拒绝遍历、路径分隔符、控制字符、空名和超长名，
    但仍接受 `:`；在 Windows/NTFS 上该字符可能具有 alternate stream 语义。
  - 处理：`normalizeMediaFileName()` 现在拒绝包含 `:` 的媒体文件名，错误为
    `stream separator detected`。
  - 结果：新增 `avatar:stream.png` 服务、sync 和 route 回归覆盖；
    `media-filename.test.ts`、`sync-media.test.ts`、`media.test.ts` 通过。

- 2026-06-10 Web captcha image payload boundary
  - 发现：Web AuthContext 直接透传 `/api/auth/captcha` 的 `imageData`，登录和初始化页会
    将该值写入 `<img src>`；服务端正常只返回 SVG data URL，但客户端缺少运行时边界。
  - 处理：AuthContext 在返回 captcha 前只接受 `data:image/svg+xml;base64,...`，
    其它格式抛出 `Invalid captcha image payload`。
  - 结果：新增 unsafe captcha image payload 回归测试；`AuthContext.test.tsx` 通过。

- 2026-06-10 Web auth captcha load failure UI
  - 发现：登录页和初始化页在 captcha 加载失败后会退出 loading 并渲染空 `src` 的
    captcha 图片；表单提交按钮也只按 loading 状态禁用，没有要求已有有效 `captchaId`。
  - 处理：captcha 加载/刷新失败时清空 captcha 状态、显示失败提示，不渲染空图片；
    没有有效 `captchaId` 时禁用提交。
  - 结果：新增 Login/Setup captcha loading failure 回归测试；两个页面测试通过。

- 2026-06-10 Web auth duplicate submit boundary
  - 发现：登录页和初始化页没有提交中 guard，双击提交会对同一个一次性 captcha 发起多次
    login/register 请求，增加限流噪音并制造不稳定错误。
  - 处理：两个页面新增同步提交锁和提交中状态；认证请求未完成时忽略重复提交。
  - 结果：新增 Login/Setup duplicate submit 回归测试；AuthContext/Login/Setup 测试通过。

- 2026-06-10 Web client API path segment encoding
  - 发现：Web client prompt/skill API wrapper 将动态 ID 直接插入 URL path；
    Web runtime desktop bridge 也有同类 prompt/folder/skill/version ID 插值。
    包含 `/`、`?` 或 `#` 的 ID-like 值会改变 URL 结构，而不是作为一个 path segment
    发送给后端验证。
  - 处理：prompt、skill client wrapper 以及 Web runtime desktop bridge 对动态 ID
    path segment 使用 `encodeURIComponent`，与 media filename wrapper 的路径编码边界对齐。
  - 结果：新增 prompt/skill client API 和 desktop bridge path encoding 回归测试；
    相关 client API 与 bridge 测试通过。

- 2026-06-10 Web prompt literal tag query boundary
  - 发现：Prompt 创建/更新允许合法标签包含逗号，但列表筛选只支持
    `tags=a,b` 逗号格式；客户端和 Web runtime desktop bridge 也把标签数组拼成
    逗号字符串，导致 `legal,review` 这类单个标签被误拆成两个筛选条件。
  - 处理：`GET /api/prompts` 新增 repeated `tag=` literal 标签筛选，同时保留旧
    `tags=` 逗号格式；Web client 和 bridge prompt search 改为发送 repeated
    `tag` 参数。
  - 结果：新增 client、bridge、route 回归测试；相关测试、Web typecheck、Web lint
    和目标 `git diff --check` 均通过。

- 2026-06-10 Web media directory entry boundary
  - 发现：Web media list 只按扩展名过滤，`nested.png` 这类目录会被当成图片返回；
    `/exists`、`/size`、读取和删除接口对该目录的结果也不一致，可能暴露不可用媒体项或
    触发底层文件系统错误。
  - 处理：media list 只返回普通文件；单文件 read/exists/size/delete 遇到非普通文件
    时按不存在处理。
  - 结果：新增目录伪装媒体文件回归测试；`media.test.ts`、Web typecheck、Web lint
    和目标 `git diff --check` 均通过。

- 2026-06-10 Web AI stream non-2xx replay boundary
  - 发现：`POST /api/ai/stream` 在上游 stream transport 返回非 2xx 时，会再调用
    buffered transport 重发同一个请求；对带 body 的 POST AI 请求可能造成重复上游调用、
    重复计费或副作用。
  - 处理：非 2xx stream 响应现在直接读取第一次上游响应体，返回 AI transport
    envelope，不再重放请求。
  - 结果：新增 non-2xx stream replay 回归测试；`ai.test.ts`、Web typecheck、
    Web lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Web AI buffered transport error detail boundary
  - 发现：`POST /api/ai/request` 的 buffered transport 异常会把原始
    `Error.message` 返回给客户端，可能暴露 DNS、内部地址或底层网络错误细节；stream
    路径已使用通用内部错误。
  - 处理：buffered transport 异常现在返回固定 AI proxy failure envelope，不再使用
    原始异常文案；上游已返回的 HTTP 非 2xx 响应仍保留原响应 envelope。
  - 结果：新增 buffered transport error detail 泄露回归测试；`ai.test.ts`、Web
    typecheck、Web lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Web rule project name/rootPath boundary
  - 发现：`POST /api/rules/projects` 只约束项目 `id`，但 `name` 和 `rootPath`
    仅做非空校验；包含 NUL/换行等控制字符或超长 rootPath 的值会进入
    `targetPath/projectRootPath` metadata，并可能在后续展示、同步或外部规则写入链路
    形成不可用路径状态。
  - 处理：Rules 项目创建 route 现在对 `name` 和 `rootPath` 做 trim 后非空、长度上限
    和控制字符拒绝；在进入 workspace 写入前返回 `422 VALIDATION_ERROR`。
  - 结果：新增 unsafe project rule name/rootPath 回归测试；`rules.test.ts`、Web
    typecheck、Web lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Web remote skill import visibility default
  - 发现：普通用户通过 `POST /api/skills/fetch-remote` 导入远程 Skill 时，如果请求
    未显式传 `visibility: "private"`，会继承 Skill 创建的 shared 默认值并被权限
    校验拒绝，造成默认导入流程对普通用户不可用。
  - 处理：远程导入未显式传 visibility 时，admin 保持 shared 默认，普通用户默认导入
    到自己的 private library；显式 shared 仍由既有权限校验拦截。
  - 结果：新增 route 和 service 回归测试；`skills.test.ts`、`skill.service.test.ts`、
    Web typecheck、Web lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Web skill URL metadata protocol boundary
  - 发现：Web Skill 的 `source_url`、`content_url`、`icon_url` 使用
    `z.string().url()` 校验；该校验会接受 `javascript:`、`file:` 和不受限 `data:`
    URL。相关字段会持久化、导出和同步，可能流入下游客户端渲染。
  - 处理：新增共享 Skill URL 元数据协议校验；来源/内容 URL 仅允许 HTTP(S)，图标
    URL 仅允许 HTTP(S) 或 base64 image data URL。live route、`SkillService` 直接
    写入和 sync/import snapshot 解析都复用该边界。
  - 结果：新增 route、service 和 import 回归测试；`skills.test.ts`、
    `skill.service.test.ts`、`import-export.test.ts`、sync import 聚焦测试、
    Web typecheck、Web lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Web trusted proxy secure request boundary
  - 发现：安全头无条件信任 `x-forwarded-proto: https` 发 HSTS，但 auth cookie 的
    `Secure` 标志只看本地请求 URL。未启用 trusted proxy 时可伪造 forwarded proto
    触发 HSTS；启用可信 HTTPS 反代时 cookie 又可能缺少 `Secure`。
  - 处理：新增共享 secure-request helper；直接 HTTPS 始终视为安全，只有
    `TRUST_PROXY_HEADERS=true` 时才信任首个 `x-forwarded-proto=https`。HSTS 和
    auth cookie 复用同一判断。
  - 结果：新增 security header 和 auth cookie 回归测试；`auth.test.ts`、
    `security-headers.test.ts`、Web typecheck、Web lint 和目标 `git diff --check`
    均通过。

- 2026-06-10 Desktop settings same-version GitHub token hydration
  - 发现：renderer settings store 已通过 `partialize` 避免未来持久化 `githubToken`，
    且 `migrate` 会清空旧版本 token；但 current-version localStorage 快照不会触发
    `migrate`，如果已经包含 `githubToken`，hydrate 时仍会进入 renderer state 并保留
    在 localStorage 原始 JSON 中。
  - 处理：`persist.merge` 遇到 persisted `githubToken` 时清空内存 token，并从
    `prompthub-settings` localStorage 快照中删除该字段。
  - 结果：新增 same-version hydration 泄漏回归测试；`settings-github-token.test.ts`、
    Desktop typecheck、Desktop lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Desktop home modules same-version hydration
  - 发现：桌面首页模块偏好在旧版本迁移时会过滤未知模块和重复项，但 current-version
    localStorage 快照不会触发 `migrate`；如果快照中包含 `ghost` 或重复模块，
    hydrate 后会进入 renderer state，违背“至少一个有效可见模块且顺序可预测”的首页边界。
  - 处理：settings store 的 `persist.merge` 现在也会复用
    `normalizeDesktopHomeModules()`，并清除废弃 `desktopHomeLayout` 字段。
  - 结果：新增 same-version desktop module hydration 回归测试；
    `settings-desktop-workspace.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop AI settings same-version hydration
  - 发现：`ai-protocol-first` 已要求每个 AI provider/model 持久化稳定
    `apiProtocol`，旧版本 `migrate` 也会过滤畸形 AI 记录并推断协议；但
    current-version localStorage 快照不会触发 `migrate`，畸形 provider/model、
    非法协议和缺失 capabilities 仍会进入 renderer state，影响 AI workbench
    模型选择和协议路由。
  - 处理：settings store 将 AI provider/model 规范化提成共享 helper，并在
    zustand `merge` 与 `migrate` 中复用；同版本 hydrate 会过滤坏记录、推断
    `apiProtocol` 并补齐 capabilities。
  - 结果：新增 same-version AI settings hydration 回归测试；
    `settings-ai-models.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop prompt tag settings same-version hydration
  - 发现：Prompt tag catalog 支持手工创建标签，但 `mergePromptTagCatalog()` 和标签
    管理 UI 假设 `promptTagCatalog` 是纯字符串数组；current-version localStorage
    快照不会触发 `migrate`，如果快照中有非法 `tagFilterMode` 或非字符串 catalog
    项，会把坏状态交给创建/编辑 Prompt 标签 UI。
  - 处理：settings store 新增 tag filter/catalog normalizer，并在 zustand `merge`
    与 `migrate` 中复用；catalog 会 trim、过滤非字符串/空值、去重并排序。
  - 结果：新增 same-version prompt tag settings hydration 回归测试；
    `settings-tags.test.ts`、TagManager、GeneralSettings、Desktop typecheck、
    Desktop lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Desktop skill projects same-version hydration
  - 发现：项目 Skills 的 `skillProjects` 在旧版本迁移时会 trim 名称/路径、过滤空项目、
    去重 scan/deploy paths，并剔除与 rootPath 等价的 scan path；但 current-version
    localStorage 快照不会触发 `migrate`，畸形项目、非字符串路径或重复目标目录会进入
    项目 Skills UI 和后续文件系统分发链路。
  - 处理：settings store 将 `skillProjects` 规范化提成共享 helper，并在 zustand
    `merge` 与 `migrate` 中复用；同版本 hydrate 会过滤坏项目并规范化 scan/deploy 路径。
  - 结果：新增 same-version skill projects hydration 回归测试；
    `settings-agent-roots.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop custom Agent settings same-version hydration
  - 发现：Agent Skills 视图依赖 `customAgents` 作为扫描来源，但 current-version
    localStorage 快照不会触发 `migrate`；空 name/root、重复 root、非字符串
    `configRelativePaths` 或陈旧 legacy root arrays 会进入 renderer state，可能制造无效
    Agent 扫描目标或让设置页展示坏数据。
  - 处理：settings store 将 custom Agent 设置规范化提成共享 helper，并在 zustand
    `merge` 与 `migrate` 中复用；共享 agent root helper 也会过滤非字符串
    `configRelativePaths`。
  - 结果：新增 same-version custom Agent hydration 回归测试；
    `settings-agent-roots.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop platform visibility same-version hydration
  - 发现：`disabledPlatformIds` 是 Skills/Rules 平台可见性的单一来源，`skillPlatformOrder`
    决定平台排序；current-version localStorage 快照不会触发 `migrate`，非字符串平台 id
    或旧 `trae` id 会进入 Skills/Rules 平台过滤和排序状态。
  - 处理：settings store 新增平台可见性/排序 normalizer，并在 zustand `merge` 与
    `migrate` 中复用；同版本 hydrate 会过滤非字符串平台 id，并继续把 `trae` 迁移到
    `trae-cn`。
  - 结果：新增 same-version platform visibility hydration 回归测试；
    `settings-agent-roots.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop AI model route defaults same-version hydration
  - 发现：AI 场景默认模型已从旧 `scenarioModelDefaults` 迁移到
    `modelRouteDefaults`，但 current-version localStorage 快照不会触发 `migrate`；
    非法旧场景 key、空模型 id、非字符串值或非法 route key 会进入 renderer state，
    影响快速任务、视觉任务和生图任务的默认模型路由。
  - 处理：settings store 新增 scenario/model route 默认值 normalizer，并在
    zustand `merge` 与 `migrate` 中复用；同版本 hydrate 会先清洗旧场景默认值，
    再清洗 route 默认值，route 为空时只从干净旧场景配置派生。
  - 结果：新增 same-version AI route defaults hydration 回归测试；
    `settings-ai-models.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop sync timing same-version hydration
  - 发现：启动同步延迟和周期同步间隔会直接参与 App startup sync 与 periodic auto-sync
    计时器注册；UI setter 会限制启动延迟为 `0..60` 秒并让周期间隔非负，但
    current-version localStorage 快照不会触发 `migrate`，负数、坏字符串或超范围值
    可进入 renderer state，导致启动同步立即执行或周期同步计时器收到异常间隔。
  - 处理：settings store 新增 sync timing normalizer，并在 zustand `merge` 与
    `migrate` 中复用；startup delay 按 UI 语义 clamp 到 `0..60` 秒，坏值回默认
    `10`，auto-sync interval 规范为有限非负数，坏值回 `0`。
  - 结果：新增 same-version sync timing hydration 回归测试；`settings-sync-provider.test.ts`
    与 `periodic-auto-sync.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop shortcut modes same-version hydration
  - 发现：`shortcutModes` 会被 App 本地快捷键处理和设置页模式切换消费；current-version
    localStorage 快照不会触发 `migrate`，如果快照只包含部分 action、非法 mode 或未知
    action，hydrate 后会丢失默认 key，且非法 mode 会让本应 local 的快捷键静默不触发。
  - 处理：settings store 新增 shortcut mode normalizer，并在 zustand `merge` 与
    `migrate` 中复用；仅保留已知 action，非法 mode 回退到每个 action 的默认值。
  - 结果：新增 same-version shortcut modes hydration 回归测试；`settings-shortcuts.test.ts`
    与 `shortcuts-settings.test.tsx`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop sidebar tag heights same-version hydration
  - 发现：Sidebar Prompt / Skill 标签区高度直接渲染成 CSS pixel height；拖拽路径会夹住
    最小高度，但 current-version localStorage 快照不会触发 `migrate`，且旧迁移只修正了
    prompt 标签区低值。负数、非数字或字符串坏值会让标签区不可见或产生异常布局。
  - 处理：settings store 新增 sidebar tag height normalizer，并在 setter、zustand
    `merge` 与 `migrate` 中复用；非有限、非数字或低于默认最小高度的值回退到
    `DEFAULT_TAGS_SECTION_HEIGHT`。
  - 结果：新增 same-version sidebar tag height hydration 回归测试；
    `settings-desktop-workspace.test.ts` 与 `sidebar.test.tsx`、Desktop typecheck、
    Desktop lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Desktop appearance settings same-version hydration
  - 发现：`themeMode`、`fontSize`、`motionPreference` 和 `language` 会直接影响首屏
    dark class / CSS 字号变量 / `<html data-motion>` / i18n 语言。current-version
    localStorage 快照不会触发 `migrate`，非法值会让主题、基础字号、减少动画偏好或语言
    状态落入不可预测状态。
  - 处理：settings store 新增 appearance normalizer，并在 setter、zustand `merge` 与
    `migrate` 中复用；非法 theme mode 回 `system`，非法 font size 回 `medium`，
    非法 motion preference 回 `standard`，非法 language 走既有语言归一化并回 `en`。
  - 结果：新增 same-version appearance settings hydration 回归测试；
    `settings-appearance.test.ts`、`settings-language.test.ts` 与
    `appearance-settings.test.tsx`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop prompt workflow same-version hydration
  - 发现：`creationMode` 决定顶部新建按钮打开手动创建还是 Quick Add，`translationMode`
    进入 Skill 翻译 prompt，`closeAction` 会同步给 Electron，`sourceHistory` 会在
    Create/Edit Prompt 来源建议中直接调用字符串方法；current-version localStorage 快照不会
    触发 `migrate`，非法模式或混杂来源历史会导致错误流程、错误翻译路径，或来源建议渲染崩溃。
  - 处理：settings store 新增 prompt workflow normalizer，并在 setter、zustand
    `merge` 与 `migrate` 中复用；source history 只保留非空字符串，trim、去重并限制 20 条。
  - 结果：新增 same-version prompt workflow hydration 回归测试；
    `settings-prompt-workflow.test.ts`、Prompt source suggestion、TopBar 和 translation
    设置相关测试、Desktop typecheck、Desktop lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Desktop main-process AI config overlay normalization
  - 发现：AI provider/model/route 已收口到 main-process `config/ai-models.json`，renderer
    启动时通过 `loadSettingsFromMainProcess()` overlay；此前该入口只检查
    `aiProviders` / `aiModels` 是否为数组，手工编辑或 CLI 写入的畸形记录、非法协议、
    缺失 capabilities 会绕过 localStorage hydrate normalizer 进入 AI workbench state。
  - 处理：`loadSettingsFromMainProcess()` 对 main 返回的 providers/models 复用 renderer
    AI normalizer，并按规范化后的 provider 列表补 `providerId`；route defaults 继续过滤
    非法 route。
  - 结果：新增 main-process AI config overlay 回归测试；
    `settings-ai-models.test.ts`、Desktop typecheck、Desktop lint 和目标
    `git diff --check` 均通过。

- 2026-06-10 Desktop main-process shortcut mode normalization
  - 发现：主进程快捷键模式独立保存在 `config/shortcut-mode.json`，并通过
    `shortcuts:setMode` IPC 写入；此前读取文件和 IPC handler 会直接展开 / 赋值整包对象，
    畸形 mode、未知 action 或缺失默认 action 可覆盖 `showApp` 的 global 默认值，
    使全局显示/隐藏应用快捷键被坏配置静默禁用。
  - 处理：主进程 `shortcuts.ts` 新增 shortcut mode normalizer，文件读取和 IPC 写入都只保留
    已知 action，非法 mode 回退到默认值，并保存规范化后的 modes。
  - 结果：新增 main-process shortcut mode IPC 回归测试；`shortcuts.test.ts` 通过，
    Desktop typecheck、Desktop lint 和目标 `git diff --check` 均通过。

- 2026-06-10 Desktop skill store remote cache identity hydration
  - 发现：`remoteStoreEntries` 会持久化远端 Skill Store 缓存；在修复 source identity
    生成规则后，旧缓存中的错误 `source_id`、空 entry 或 stale error 仍会在用户首次
    refresh 前进入 store，继续影响 `Imported` 判断。
  - 处理：`skill.store.ts` 的 persist `merge` 与 `partialize` 复用 remote cache
    normalizer；custom git source 会按 URL / branch / directory / canonical path
    重算 `source_id`，local-dir 和 marketplace-json 也按 loader 规则重算，空或畸形
    entry 不再恢复。
  - 结果：新增 same-version persisted custom git remote cache 回归测试；
    `skill.store.test.ts` 整文件和 Desktop typecheck 均通过。

- 2026-06-10 Desktop same-name skill variant platform status
  - 发现：同名 Skill 变体共享外部分发目录名，平台安装状态必须额外依赖 activation
    `skillId`，否则存在一个变体安装后另一个同名变体也显示 installed 的回归风险。
  - 处理：补充平台安装状态负例测试；当平台目录存在 `writer/SKILL.md` 但 activation
    指向 `skill-a` 时，同名 `skill-b` 的 boolean status 与 detail status 都必须是未安装。
  - 结果：`skill-installer-platform.test.ts` 聚焦用例和整文件均通过。

- 2026-06-10 Desktop skill version rollback fingerprint
  - 发现：版本回滚会替换 managed repo 文件树，但没有重新计算
    `directory_fingerprint`，回滚后可能让 DB 保留旧目录指纹，影响后续本地修改和同内容
    identity 判断。
  - 处理：`skill:versionRollback` 现在在替换 repo 文件后基于实际 repo path 重新计算
    `directory_fingerprint`，并且 DB 更新不触碰 `source_id`。
  - 结果：新增 source identity 保留和 rollback fingerprint 刷新的回归测试；version
    IPC、local repo IPC 与 repo sync 目标测试通过。

- 2026-06-10 Desktop direct Git import installed matching
  - 发现：direct Git import modal 使用独立的已导入判断，只看 `source_id/source_url`；
    旧安装记录如果只有 `content_url`，同一 Git skill 再次扫描时仍会被默认选中并允许重复导入。
  - 处理：direct Git scan 结果和默认选中集合复用 Store 列表已有的
    `findInstalledRegistrySkill()` canonical matcher。
  - 结果：新增 legacy `content_url` 匹配回归测试；`create-skill-modal.test.tsx` 整文件
    和 installed matcher / remote cache 目标测试通过。

- 2026-06-10 Desktop local scan project copy loop import
  - 发现：My Skills 分发到项目 target 后，copy 模式的项目副本路径与 managed repo 路径不同；
    Create Skill 本地扫描只按路径判断已导入，会把项目副本重新标为可导入，造成
    deploy -> rescan -> duplicate import 循环。
  - 处理：Create Skill 本地扫描复用 `matchScannedSkillToLibrary()`，通过路径、symlink
    target 和 `directory_fingerprint` 识别已在 My Skills 中的扫描结果。
  - 结果：新增项目分发副本目录指纹匹配回归测试；`create-skill-modal.test.tsx` 与
    `skill-scan-status.test.ts` 通过。

- 2026-06-10 Desktop project deploy same-name variant replacement
  - 发现：`My Skills -> Project` 部署目标物理路径固定为 `<targetDir>/<skill.name>`；
    旧逻辑只按 name 判断 target 是否缺失，并以 `{ ifExists: "skip" }` 写入，导致同名
    不同来源/变体在同一 target 下被误判为已导入，无法按用户选择替换。
  - 处理：新增 project target deployment helper，先定位同一 target 下的 logical name，
    再用 `directory_fingerprint`、`localPath` / `symlinkTargetPath` 与库技能源路径判断
    是否为同一 identity；同 identity 跳过，不同 identity 使用 overwrite 替换。
  - 结果：新增 helper 单元测试和 `SkillProjectsView` 同名替换回归测试；
    `project-skill-targets.test.ts`、`skill-projects-view.test.tsx`、
    `skill-library-import-modal.test.tsx`、`skill-full-detail-async-actions.test.tsx`、
    Desktop typecheck 与 Desktop lint 均通过。

- 2026-06-10 Desktop managed repo short suffix collision fallback
  - 发现：新 managed repo 容器默认使用 `skill-name--8位稳定后缀`；如果该 preferred
    目录已存在且 sidecar 明确属于另一个 source / variant，旧逻辑仍会直接复用该目录，
    存在把不同 skill 实例写进同一 managed 容器的理论碰撞风险。
  - 处理：`getManagedContainerPathForSkill()` 读取 `.prompthub/source.json` 校验
    preferred 容器归属；只有 metadata 匹配或无法确认时复用，明确冲突时自动扩展到
    12/16/24/32/48/64 位稳定后缀。sidecar `variantKey` 现在写入实际容器 basename。
  - 结果：新增 preferred short suffix collision 与 fallback sidecar metadata 回归测试；
    `skill-installer-repo.test.ts` 通过。

- 2026-06-10 Desktop local-path git-repo branch identity
  - 发现：custom source 类型为 `git-repo` 但 URL 是本地路径时，refresh 与 same-version
    persisted cache hydration 都会把它降级为 `local-dir` identity，丢掉用户配置的
    branch / directory；同一本地 repo 的 main/dev 来源可能被误判为同一来源。
  - 处理：明确边界：`local-dir` 不读 git 状态且不含 branch；本地路径 `git-repo` 保留用户
    显式配置的 branch / directory 作为 source identity 和 badge metadata。refresh 时按
    directory 扫描子目录，`canonical_skill_path` 使用相对 repo root 的路径。
  - 结果：新增 persisted cache hydration 与 custom source refresh 回归测试；
    `skill.store.test.ts` 与 `skill-store-custom-sources.test.tsx` 目标用例通过。

- 2026-06-10 Desktop local source identity matrix
  - 发现：同一来源矩阵还缺少组合断言，尤其是普通 `local-dir` 误带旧 branch metadata、
    本地 git repo 的不同 branch / worktree、detached/no-branch checkout，以及 dirty
    working tree 内容变化是否会让 identity 漂移。
  - 处理：补充矩阵测试并修复 `local-dir` persisted cache normalizer，使普通本地目录显式
    清空 `source_branch` / `source_directory`；本地 git repo 的 detached/no-branch 状态
    仍保持 `git-repo` identity，只是不设置 branch。
  - 结果：新增 hydration 矩阵和 dirty refresh 回归测试；同一 repo 的 main/dev、不同
    worktree、detached/no-branch 均有独立可验证语义，dirty 内容变化只更新 content 和
    `directory_fingerprint`，不改变 `source_id`。

### 已收敛

#### Q-003 renderer 主包与冷路径 chunk 偏大

- 现象：`pnpm build` 曾提示 renderer chunk size warning，先后来自主入口和
  `SkillFileEditor-*.js` CodeMirror 冷路径 chunk。
- 当前状态：2026-06-10 `pnpm --filter @prompthub/desktop bundle:budget`
  通过，renderer 主入口为 `122.95 kB gzip` / `150 kB` budget，已显著低于
  早期 `768.05 kB` 主入口。`SkillFileEditor-*.js` 为 `127.31 kB gzip` /
  `150 kB` budget，raw chunk 已降到 Vite 默认 500 kB 提示阈值以下。
- 最新处理：旧 `SkillDetailView` 也已将编辑弹窗、文件编辑器和 markdown 渲染改为
  lazy 加载，避免旧详情面板在关闭状态静态携带 CodeMirror / markdown 依赖；内置
  技能注册表与 base64 技能图标也从 `skill.store.ts` 启动路径移到 `loadRegistry()`
  动态加载路径；`SkillCodeEditor` 的 CodeMirror language extensions 改为按文件类型
  动态 import，避免任意文件编辑器一次性拉取全部语言包。
- 结果：新增 `skill-code-editor.test.tsx` 与 `check-bundle-budget.test.ts` 覆盖异步
  language loader 和预算聚合；Desktop typecheck、Desktop lint、`build:analyze` 和
  `bundle:budget` 均通过。Q-003 当前关闭，后续继续由 `bundle-budget.json`
  守护主入口、设置分区和 `SkillFileEditor` 重型 lazy chunk。

#### Q-005 Web workspace physical paths can exceed filesystem path limits

- 发现时间：2026-06-09
- 现象：Web imports can fail or write outside intended workspace directories when logical data maps directly to filesystem paths without segment validation. Prompt workspace mirrors nested folders under `data/prompts/`; skill workspace uses `<slug>__<id>` directories under `data/skills/`; rule workspace stores managed copies and versions under per-user `data/rules/` folders.
- 触发样例：a reversed import payload with roughly 57+ nested folders named `large-folder-*` failed while creating the prompt workspace directory tree.
- 当前状态：2026-06-10 已收敛为显式校验边界。Prompt、skill、rule workspace
  path preflight now covers web import, direct sync import, WebDAV pull,
  `BackupService.import()`, `syncPromptWorkspaceFromDatabase()`, and
  `syncSkillWorkspaceFromDatabase()`, so unsafe or over-deep imported/existing
  workspace trees fail before media/database/workspace writes or workspace
  clearing.
- 验证：2026-06-10 复跑 workspace service path-limit 覆盖、import/export
  path-limit 覆盖和 sync path-limit 覆盖均通过。
- 后续限制：unusually deep folder trees, very long skill names, or rule
  identifiers that cannot be represented as safe path segments are still not
  representable in the current directory-based workspace layout. A future
  layout strategy should cap physical path depth/segment length while preserving
  logical prompt folder hierarchy, skill identity, and rule identity in
  metadata, and must record migration/compatibility behavior before changing
  durable layout.
