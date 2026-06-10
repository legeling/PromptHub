# Implementation

## Implemented

- 新增 `apps/web/src/services/auth-captcha.ts`，使用 `svg-captcha` 签发内存型一次性图形验证码 challenge，支持过期清理、大小写无关校验与错误分类。
- 在 `apps/web/src/routes/auth.ts` 增加 `GET /api/auth/captcha`，并要求 `/api/auth/login` 与 `/api/auth/register` 必须提交 `captchaId` 和 `captchaAnswer`；同时把答案约束调整为字母数字格式。
- 更新 `apps/web/src/client/api/auth.ts` 与 `apps/web/src/client/contexts/AuthContext.tsx`，让前端拉取 `imageData` 并提交验证码字段。
- 更新 `apps/web/src/client/pages/Login.tsx` 与 `apps/web/src/client/pages/Setup.tsx`，将原文本 challenge 改为 `<img>` 图形验证码，保留刷新与失败后自动换题行为。
- 更新 `apps/web/src/client/index.css` 与 7 个 locale 文件，使图形验证码样式、alt 文案与交互提示完整对齐。
- 更新测试辅助 `apps/web/src/test-helpers/auth-captcha.ts`，通过动态导入 `getCaptchaAnswerForTesting(...)` 获取答案，避免 `vi.resetModules()` 后读取旧 challenge。
- 补齐 `apps/web/src/routes/import-export.test.ts` 的导出 payload 类型字段，消除与 `images` / `videos` 字段不一致导致的 `typecheck` 误报。
- 修复 `docker compose up -d --build` 下的 Web 启动失败：`apps/web/vite.server.config.ts` 现在将 `svg-captcha` 视为 SSR external dependency，避免 Vite 将其打进 server bundle 后破坏 `../fonts/Comismsh.ttf` 的相对路径读取。
- 更新 `apps/web/src/build.test.ts`，把 `svg-captcha` 纳入 SSR external regression guard，防止后续再次被打包进 server bundle。
- 针对 issue 159 复核桌面端连接 Web 的 captcha 401 链路：桌面端现在会把用户粘贴的 `/api` 或 `/api/auth/...` URL 归一化为 Web 站点根地址，避免请求变成 `/api/api/auth/captcha` 后被受保护 API 中间件返回 `Missing or invalid Authorization header`。
- `apps/desktop/src/renderer/services/self-hosted-auth.ts` 对 captcha 401 的鉴权错误给出更明确的 URL/API 边界提示。
- 补充 Node Web 与 Cloudflare Worker 路由级测试，验证 `/api/auth/captcha`、`/api/auth/bootstrap` 在无登录态或携带无效 bearer token 时仍保持公开。
- 修复 Cloudflare Worker captcha 随机字符集包含未实现 SVG glyph 的字符，避免验证码签发偶发 500。
- 桌面端连接旧版自托管 Web 时，如果 `/api/auth/captcha` 被旧鉴权中间件拦截，会尝试旧版无验证码登录；如果服务端登录仍要求 captcha，则提示用户更新自托管 Web 部署。
- 导入截断 JSON 时，错误提示从底层 `Unterminated string` / `Unexpected end of JSON input` 收敛为“备份文件可能被截断，请重新导出完整备份”。
- Web runtime bridge 的 `updater.getVersion()` 不再硬编码 `0.5.5-web`，改为返回构建时注入的 monorepo 版本，例如 `0.5.7-web`。
- Web `/health` 在没有 `APP_VERSION` 环境变量时，也会回退到 monorepo 版本，避免关于页显示未知或旧版本。
- Web AuthContext 现在会在把 captcha `imageData` 返回给登录/初始化页面前校验格式，只接受 `data:image/svg+xml;base64,...`，拒绝不安全或畸形图片 URL。
- Web 登录页和初始化页现在会在 captcha 加载失败时清空 captcha 状态、显示失败提示、不渲染空 `src` 图片，并在没有有效 `captchaId` 时禁用提交。
- Web 登录页和初始化页现在用同步提交锁阻止重复提交同一个一次性 captcha，避免双击产生多次 login/register 请求。

## Verification

- `pnpm --filter @prompthub/web exec vitest run src/client/pages/Login.test.tsx src/client/pages/Setup.test.tsx src/client/api/auth.test.ts src/client/contexts/AuthContext.test.tsx src/routes/auth.test.ts`
  - 结果：通过（38/38）
- `pnpm lint:web`
  - 结果：通过
- `pnpm --filter @prompthub/web typecheck`
  - 结果：通过
- `pnpm --filter @prompthub/web exec vitest run src/routes/auth.test.ts`
  - 结果：通过（16/16）
- `pnpm --filter @prompthub/web exec vitest run src/build.test.ts`
  - 结果：通过（1/1）
- `pnpm --filter @prompthub/web build`
  - 结果：通过
- `pnpm --filter @prompthub/web lint`
  - 结果：通过
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/self-hosted-auth.test.ts tests/unit/services/self-hosted-sync.test.ts`
  - 结果：通过（17/17）
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/database-backup.test.ts`
  - 结果：通过（19/19）
- `pnpm --filter @prompthub/web exec vitest run src/routes/auth.test.ts`
  - 结果：通过（17/17）
- `pnpm --filter @prompthub/web exec vitest run src/client/desktop/install-bridge.test.ts src/routes/auth.test.ts`
  - 结果：通过（20/20）
- `pnpm --filter @prompthub/web-cloudflare test -- tests/worker.test.ts tests/auth.test.ts`
  - 结果：通过（3/3）
- `pnpm --filter @prompthub/desktop typecheck`
  - 结果：通过
- `pnpm --filter @prompthub/desktop lint`
  - 结果：通过
- `pnpm --filter @prompthub/web typecheck`
  - 结果：通过
- `pnpm --filter @prompthub/web lint`
  - 结果：通过
- `pnpm --filter @prompthub/web-cloudflare typecheck`
  - 结果：通过
- `pnpm --filter @prompthub/web-cloudflare lint`
  - 结果：通过
- `pnpm --filter @prompthub/web test -- --run src/client/contexts/AuthContext.test.tsx -t "unsafe image data"`
  - 结果：先失败后通过
- `pnpm --filter @prompthub/web test -- --run src/client/contexts/AuthContext.test.tsx`
  - 结果：通过（9/9）
- `pnpm --filter @prompthub/web test -- --run src/client/contexts/AuthContext.test.tsx src/client/pages/Login.test.tsx src/client/pages/Setup.test.tsx`
  - 结果：通过（18/18）
- `pnpm --filter @prompthub/web typecheck`
  - 结果：通过
- `pnpm --filter @prompthub/web lint`
  - 结果：通过
- `git diff --check -- apps/web/src/client/contexts/AuthContext.tsx apps/web/src/client/contexts/AuthContext.test.tsx spec/changes/active/web-auth-captcha spec/issues/active/quality.md`
  - 结果：通过
- `pnpm --filter @prompthub/web test -- --run src/client/pages/Login.test.tsx -t "captcha loading fails"`
  - 结果：先失败后通过
- `pnpm --filter @prompthub/web test -- --run src/client/pages/Setup.test.tsx -t "captcha loading fails"`
  - 结果：先失败后通过
- `pnpm --filter @prompthub/web test -- --run src/client/pages/Login.test.tsx src/client/pages/Setup.test.tsx`
  - 结果：通过（11/11）
- `pnpm --filter @prompthub/web test -- --run src/client/pages/Login.test.tsx -t "duplicate submits"`
  - 结果：先失败后通过
- `pnpm --filter @prompthub/web test -- --run src/client/pages/Setup.test.tsx -t "duplicate submits"`
  - 结果：先失败后通过
- `pnpm --filter @prompthub/web test -- --run src/client/contexts/AuthContext.test.tsx src/client/pages/Login.test.tsx src/client/pages/Setup.test.tsx`
  - 结果：通过（22/22）

## Notes

- 额外执行了 `pnpm --filter @prompthub/web exec vitest run src/routes/import-export.test.ts` 以抽查受当前脏工作树影响的其它 Web 路由测试。
- 该测试当前失败，表现为 `GET /api/export` 返回 `400`、import summary 中 `settingsUpdated` 为 `false`、invalid import 返回 `400` 而非 `422`。
- 这些失败点位于现有的 import/export 与 sync 契约改动范围内，不是本次验证码链路新增逻辑引入的回归；本次变更未修改 `apps/web/src/routes/import-export.ts` 的运行时行为。
