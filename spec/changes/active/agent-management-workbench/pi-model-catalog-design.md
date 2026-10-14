# Pi Model Catalog 适配设计

## 目标与所有权

Pi（`pi-coding-agent`）的供应商/模型目录由 Desktop main 读取，renderer 只接收脱敏投影。
`settings.json` 选择默认模型；Pi 安装包和上游缓存拥有内置目录；`models.json` 拥有用户覆盖；
`auth.json` 拥有原生凭据。Pi 与 Oh My Pi 不合并。

## 原生文件契约

本机 0.83.0 的 `core/provider-composer.js`、`core/resolve-config-value.js`、
`core/auth-storage.js` 及 `@earendil-works/pi-ai` 数据是模型解析证据。

| 来源 | 行为 |
| --- | --- |
| `settings.json` | 读写 defaultProvider/defaultModel/defaultThinkingLevel；缺失时仍展示目录 |
| 已安装 npm 包的 `pi-ai/dist/providers/data/*.json` | 只读公开模型数据，不执行 CLI、SDK、extensions 或凭据命令 |
| `models-store.json` | 上游刷新缓存；同名 provider 替换安装包目录，不写入 |
| `models.json` | 自定义 provider/model 及 modelOverrides；受控写入 |
| `auth.json` | main 解析 api_key 或确认 OAuth 状态；受控投影托管密钥，不提供原始编辑器 |

安装目录通过声明的 Pi executable 和包依赖解析定位，不硬编码用户 home。
当前安装数据读取覆盖可定位 npm 包的安装方式；独立二进制/不对应包目录的包装脚本只使用已有缓存及用户模型，
不宣称已覆盖其内置目录。不存在 Pi 安装包时不启动或安装 Pi。

## 解析与测试契约

- 目录合并采用 Map，时间与空间为 `O(P + M)`；不按供应商数或模型数截断。
  文件读取复用现有大小与软链接安全校验，依次读取安装数据文件，不创建并发池。
- 模型 API/端点优先级为 model → provider → 同 id 原生模型或该 provider 首个模型。
  自定义模型其他元数据使用 Pi 原生默认值，再应用 modelOverrides；thinkingLevelMap 按键合并。
- modelOverrides 只覆盖展示元数据，不覆盖 API/端点，也不凭空创建模型。
- 凭据优先使用 auth.json 的 api_key/OAuth，再使用 models.json 的 apiKey。
  api_key 支持字面值、`$ENV`、`${ENV}` 和原生 `$$`/`$!` 转义；
  auth.json 的显式 env 值优先于进程环境。缺失引用不能标记就绪。
- 目录和模型测试共用一次加载的解析来源。所选模型决定探测协议与端点，不按 provider 默认协议猜测。
- 四个直接探测 API：openai-completions、openai-responses、anthropic-messages、google-generative-ai。
  其他 API、OAuth 以及 `!command` 凭据返回 unsupported，不执行命令、不刷新 OAuth、不回退 Chat。
- Pi 内置供应商默认环境变量映射、扩展注册模型、请求 headers/compat/authHeader 的完整运行时行为仍由 Pi 拥有，
  当前探测不宣称复现这些路径，凭据就绪只代表本次已解析到的凭据/原生 OAuth 记录。

## 写入、数据保全与恢复

默认选择写 settings.json；用户模型写 models.json；托管凭据投影 auth.json（0600）。
models-store.json 和安装包目录永不写入。既有 backup → revision check → atomic write → readback → rollback
管线保留，两个文件的供应商导入维持失败恢复，保留其他 provider、未知字段和 JSONC 注释。

无数据库/schema/布局迁移，无历史数据重写；endpoint 只是可选的脱敏派生字段。
回退代码无需迁移数据；文件写入仍可由既有备份恢复。
明文凭据只在 main 中解析/调用，不进入目录、测试结果、SQLite、导出或普通备份。

## MCP 版本边界

[上游原生 MCP 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md)
在 2026-10-13 的 1.2.0 契约中定义用户 `<root>/mcp.json` 和项目 `.pi/mcp.json`。
原生支持 stdio/HTTP，不支持 SSE；项目同名条目替换用户条目，
仅 enabled/exposure/toolExposure 的最小项目覆盖保留用户传输字段。
共享 adapter 候选和原生文件仍独立可选，不由 PromptHub 合并生效层。

本机 0.83.0 不作为 1.2.0 原生 MCP 消费验收。
本批仅核对契约及真实 MCP 库导入/重开/文件投影；不升级 Pi、不安装 adapter，不提升 partial 能力等级。

## 验证

回归覆盖目录冷启动、缓存覆盖、模型路由、modelOverrides、环境/字面值凭据、未解析引用、
OAuth/命令/未知 API 不执行、合法大目录、超出旧模型上限的写入、真实 HTTP Responses 探测、
文件保全/重读及原生 MCP stdio/HTTP 配置导入-重开-投影。

2026-10-13 验证结果：

- 分批定向 Vitest 回归累计 14 个文件、145 项通过；只重跑受修复影响的检查。
  覆盖 Pi 目录/写入/导入/默认选择/会话、现有目录页面（41 项）、MCP 配置与真实投影、通用模型和执行开关。
- 真实 HTTP Responses fixture 验证路径、模型、Authorization、流式输出、结果脱敏和文件不变。
- 本机 0.83.0 公开安装目录已进入实际读取路径；另有 import-only npm 包及 .manifest.json fixture，
  验证不执行 CLI/SDK、缓存覆盖、重开一致、畸形数据与软链接拒绝。
- 70 个缓存 provider × 80 个模型，加 81 个用户模型，共 5,681 项投影约 5.8 ms，
  heapUsed 增量约 5.3 MB（单次本机 fixture 测量，含分配但不等于峰值/稳定预算）。
- 定向 ESLint、Shared typecheck、git diff --check 通过。
- 初始 Desktop source/test typecheck 被范围外 Skill 改动阻塞：skill-library-actions 的 RegistrySkill.content、
  canonical-skill-sources 的 unknown 类型，以及 skill-first-launch/skill-scanned-import fixture 字段；
  本批未改动这些文件。最终按 tsconfig.test.json 建立完整 TypeScript program：
  13 个本批文件全部包含，完整 program 无诊断。
  最终标准命令 `pnpm --filter @prompthub/desktop typecheck:tests` 通过，涵盖源码及测试。

HTTP/MCP 完整场景测试保留单个较长用例，使建立 fixture、执行、读回及释放资源保持同一验收边界；
生产函数维持小粒度。GUI、Pi 原生 1.2.0 消费和完整发布门禁不属于本批结论。
