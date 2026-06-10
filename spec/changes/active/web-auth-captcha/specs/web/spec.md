# Web Delta Spec

## Added Requirements

### Requirement: Auth forms require a valid captcha challenge

Web 登录与首次初始化表单必须在提交用户名和密码之外，同时提交一个有效的一次性验证码答案。

#### Scenario: login without captcha

- Given 用户访问登录页
- When 客户端未提交有效 `captchaId` 或 `captchaAnswer`
- Then 服务端拒绝登录请求

#### Scenario: setup without captcha

- Given 实例尚未初始化
- When 用户提交初始化管理员表单但验证码无效
- Then 服务端拒绝注册请求

#### Scenario: captcha refresh after failed submit

- Given 用户提交了错误验证码
- When 前端收到校验失败响应
- Then 前端刷新 challenge，避免重复提交旧验证码

#### Scenario: captcha loading fails on auth pages

- Given 登录页或初始化页请求 captcha challenge 失败
- When 页面退出加载状态
- Then 页面不会渲染空 `src` 的 captcha 图片
- And 表单提交按钮保持禁用，直到获得有效 `captchaId`
- And 用户可以看到加载失败提示并重新刷新 challenge

#### Scenario: auth form is submitted repeatedly

- Given 登录页或初始化页已经获得有效 captcha challenge
- When 用户在认证请求仍未完成时重复点击提交按钮
- Then 客户端只发送一次 login 或 register 请求
- And the same one-time captcha challenge is not submitted multiple times

### Requirement: Self-hosted web auth captcha must survive SSR packaging

Web 自部署构建后的 server runtime 必须能够正常签发图形验证码，不能因为 SSR 打包改变 `svg-captcha` 的字体资源相对路径而在启动阶段崩溃。

#### Scenario: dockerized web server starts with captcha enabled

- Given 用户通过 `docker compose up -d --build` 启动 Web 服务
- When server 加载认证验证码服务
- Then 服务能够正常启动并继续签发 captcha challenge，而不是因为缺失 `../fonts/Comismsh.ttf` 报 `ENOENT`

### Requirement: Desktop self-hosted sync must use the Web site origin for auth

桌面端连接自托管 Web 时，用户可以粘贴站点根地址，也可能粘贴 `/api` 或完整认证接口地址；客户端必须归一化为站点 origin，再调用 `/api/auth/captcha` 和 `/api/auth/login`，避免生成 `/api/api/...` 并被受保护 API 中间件误判为缺少授权。

#### Scenario: user pastes an API URL into desktop sync settings

- Given 用户在桌面端自托管连接设置中填写 `https://host/api` 或 `https://host/api/auth/captcha`
- When 桌面端开始连接 Web
- Then 客户端请求 `https://host/api/auth/captcha`，而不是 `https://host/api/api/auth/captcha`

#### Scenario: desktop connects to an older Web server without public captcha

- Given 自托管 Web 还未更新到公开 `/api/auth/captcha` 的版本
- When captcha 签发返回 `Missing or invalid Authorization header`
- Then 桌面端允许尝试旧版无验证码登录；若服务端仍要求 captcha，则提示用户更新自托管 Web 部署

### Requirement: Captcha and bootstrap endpoints remain public

`/api/auth/captcha` 与 `/api/auth/bootstrap` 是登录前端点，不能依赖访问令牌，也不能因为请求携带无效 `Authorization` 头而被全局 API 鉴权中间件拦截。

#### Scenario: invalid bearer header reaches public auth endpoints

- Given 请求包含无效 `Authorization: Bearer ...` 头
- When 客户端请求 `/api/auth/captcha` 或 `/api/auth/bootstrap`
- Then 服务端仍返回公开端点的正常响应，而不是 `Missing or invalid Authorization header`

#### Scenario: worker-generated captcha characters are drawable

- Given Cloudflare Worker 生成验证码答案
- When Worker 构造 SVG 图形验证码
- Then 答案字符必须来自已支持的 glyph 表，不能随机生成无法绘制的字符导致 500

#### Scenario: client receives an unsafe captcha image payload

- Given Web 客户端拉取 `/api/auth/captcha`
- When 响应中的 `imageData` 不是 `data:image/svg+xml;base64,...`
- Then 客户端拒绝该 captcha payload
- And 登录或初始化页面不会把不安全的值写入 `<img src>`

### Requirement: Broken backup imports must explain data truncation

导入备份文件时，如果 JSON 解析失败表现为字符串未闭合或输入提前结束，UI 必须提示“备份文件可能被截断，需要重新导出完整文件”，而不是直接暴露底层 `Unterminated string`。

#### Scenario: truncated JSON backup is selected

- Given 用户选择了不完整的 JSON 备份文件
- When 导入预览解析文件失败
- Then toast 展示可操作的截断文件提示，并且不会清空当前数据

### Requirement: Web runtime must expose the current release version

自托管 Web 的关于页和 Web runtime bridge 必须显示当前构建版本，不能硬编码旧桌面版本号。

#### Scenario: Web about page reads runtime version

- Given Web 前端以 monorepo 当前版本构建
- When UI 调用 `window.electron.updater.getVersion()`
- Then 返回 `<current-version>-web`，而不是历史硬编码值

#### Scenario: Web health endpoint has no deployment version env

- Given Web 服务启动时没有显式设置 `APP_VERSION`
- When UI 或健康检查请求 `/health`
- Then 响应中的 `version` 使用 monorepo 当前版本，而不是 `unknown`
