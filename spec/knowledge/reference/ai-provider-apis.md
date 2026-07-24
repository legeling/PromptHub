# AI Provider API Assets

## Purpose

本文件记录 PromptHub 当前 AI 供应商与外部路由平台的稳定 API 资产信息，作为设置页默认值、请求适配层、错误排查和后续兼容性修复的内部真相源。

重点覆盖：

- 供应商标识与 PromptHub 默认 host
- 官方基础 URL / Base URL
- PromptHub 当前采用的协议形态
- 认证方式
- 常用聊天与模型发现端点
- 与 PromptHub 现状相关的重要兼容说明
- 常见 provider 标签与别名的归类结果
- 官方证据链接与证据级别

## Stable Asset Rules

- 本文档记录长期稳定、可反复查阅的供应商 API 基线信息，不是一次性的变更提案。
- 当 `AISettingsPrototype.tsx`、`ai-workbench/constants.ts`、`renderer/services/ai.ts`、`packages/core/src/ai-client.ts` 的 provider 默认值或协议选择逻辑发生稳定变化时，应同步更新本文件。
- endpoint、鉴权头、URL 标准化和旧配置协议推断的代码真相源是 `packages/shared/utils/ai-protocol.ts`；Desktop、Core 与 Web 必须复用它，不能分别维护同名策略。
- 对已经通过官方公开文档核验的供应商，记录为 `Officially documented`。
- 对当前仅确认了 PromptHub 默认值、未完成完整官方核验的供应商，记录为 `PromptHub inferred` 或 `Evidence limited`，不得伪装为已核验事实。
- 对文档中出现、但尚不能确认是独立 provider 还是模型/别名的名称，必须单独标为 `Evidence limited` 或 `PromptHub inferred`，不要直接并入 canonical provider 列表。

## Evidence Levels

- `Officially documented`: 官方公开文档明确给出 Base URL、认证头或端点格式。
- `Officially documented (partial)`: 已确认核心协议，但部分兼容行为、模型发现方式或区域差异未在本轮完整核验。
- `PromptHub inferred`: 当前主要来自 PromptHub 内部默认值与兼容目标，缺少足够公开官方证据。
- `Evidence limited`: 有公开入口但正文不可稳定抓取，或当前公开资料不足以确认协议细节。

## Modeling Note

本文档同时记录三层信息：

- **Official API baseline**：供应商官方公开协议
- **PromptHub current usage**：PromptHub 目前在设置页和传输层的默认建模方式
- **Common alias mapping**：常见 provider 标签与 canonical provider / model family 的映射

这三层可能并不完全相同。例如：

- Google / Gemini 同时存在原生 Gemini API 与 OpenAI 兼容 API
- Anthropic 官方主接口是 `messages`，而 PromptHub 当前聊天层仍以 OpenAI 风格统一适配为主
- `Kimi k2`、`DouBaoSeed`、`ERNIE` 这类名称更像模型族、平台标签或品牌预设，而不是独立 provider

## PromptHub Built-in Provider Matrix

下表覆盖 PromptHub 当前内建 provider 默认值，来源于 `AISettings.tsx` 与 `ai-workbench/constants.ts`。

排序优先级：御三家 -> 国内主流厂商 -> 其他补充 provider。

| Provider | PromptHub Default Host | Official Base URL / Host | Auth | Primary Chat Endpoint | Model Discovery Endpoint | PromptHub Current Usage | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | `https://api.openai.com` | `https://api.openai.com` | `Authorization: Bearer` | `POST /v1/chat/completions` | `GET /v1/models` | OpenAI-native baseline | Officially documented |
| Anthropic | `https://api.anthropic.com` | `https://api.anthropic.com` | `x-api-key` + `anthropic-version` | `POST /v1/messages` | `GET /v1/models` | PromptHub 当前仍按统一 `/v1/chat/completions` 风格构造请求，并仅在 header 层做 Anthropic 特化 | Officially documented |
| Google / Gemini | `https://generativelanguage.googleapis.com` | `https://generativelanguage.googleapis.com` | Native: `x-goog-api-key`; OpenAI compat: `Authorization: Bearer` | OpenAI compat: `POST /v1beta/openai/chat/completions` | Native: `GET /v1beta/models` | PromptHub 使用 OpenAI compat 做聊天，原生 `/v1beta/models` 做模型发现 | Officially documented |
| DeepSeek | `https://api.deepseek.com` | OpenAI: `https://api.deepseek.com`; Anthropic: `https://api.deepseek.com/anthropic` | OpenAI compat: `Authorization: Bearer` | `POST /chat/completions` | not separately confirmed in this pass | PromptHub 默认 host 走 generic `/v1/chat/completions` 自动补齐，和本轮抓到的官方 quickstart 路径不完全一致 | Officially documented (partial) |
| Moonshot / Kimi | `https://api.moonshot.cn` | SDK base URL commonly `https://api.moonshot.cn/v1` | `Authorization: Bearer` | `POST /v1/chat/completions` | not separately confirmed in this pass | PromptHub 默认 host 不含 `/v1`，传输层自动补齐 `/v1/chat/completions` | Officially documented (partial) |
| 智谱 AI / BigModel | `https://open.bigmodel.cn/api/paas` | OpenAI compat examples use `https://open.bigmodel.cn/api/paas/v4/` | OpenAI SDK compat with API key / bearer-style auth | `POST /chat/completions` under `/api/paas/v4/` | not separately confirmed in this pass | PromptHub 默认 host 缺少 `/v4`，当前 generic `/v1/chat/completions` 归一化与官方 compat 文档不完全一致 | Officially documented (partial) |
| 阿里百炼 / Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode` | OpenAI compat SDK base URL commonly `https://dashscope.aliyuncs.com/compatible-mode/v1` | `Authorization: Bearer` | `POST /compatible-mode/v1/chat/completions` | not separately confirmed in this pass | PromptHub 默认 host 不含 `/v1`，传输层负责自动补齐 | Officially documented |
| Atlas Cloud | `https://api.atlascloud.ai/v1` | `https://api.atlascloud.ai/v1` | `Authorization: Bearer` | `POST /chat/completions` | `GET /models` | PromptHub 作为 OpenAI-compatible provider preset，保存 `/v1` base URL 并由共享传输层构造 chat/model endpoints | Live catalog verified |
| 豆包 / Ark | `https://ark.cn-beijing.volces.com/api` | Data plane: `https://ark.cn-beijing.volces.com/api/v3`; Control plane: `https://ark.cn-beijing.volcengineapi.com/` | Data plane: `Authorization: Bearer`; Control plane uses HMAC auth | `POST /chat/completions` | not confirmed in this pass | PromptHub 默认 host 缺少 `/v3`，当前 generic `/v1/chat/completions` 建模与官方数据面接口不一致 | Officially documented (partial) |
| 文心一言 / Qianfan | `https://qianfan.baidubce.com/v2` | `https://qianfan.baidubce.com/v2` | `Authorization: Bearer` | `POST /chat/completions` | `GET /models` | PromptHub 默认 host 已含 `/v2`，renderer / main 当前都会直接补成 `/chat/completions` 与 `/models`，与本轮官方 OpenAI-compatible 文档一致 | Officially documented |
| 讯飞星火 | `https://spark-api-open.xf-yun.com` | OpenAI SDK compat base URL `https://spark-api-open.xf-yun.com/v1/` | `Authorization: Bearer <APIPassword>` | `POST /v1/chat/completions` | not confirmed in this pass | PromptHub 默认 host 不含 `/v1`，传输层会自动补齐 | Officially documented (partial) |
| MiniMax | `https://api.minimax.chat` | official docs in this pass show `https://api.minimax.io` | `Authorization: Bearer` | `POST /v1/text/chatcompletion_v2` | not confirmed in this pass | PromptHub 当前默认 host 与本轮官方 docs 不一致，且 transport 仍按 generic `/v1/chat/completions` 建模 | Officially documented (partial) |
| StepFun | `https://api.stepfun.com` | `https://api.stepfun.com/v1` | `Authorization: Bearer` | `POST /chat/completions` | `GET /models` | PromptHub 默认 host 不含 `/v1`，传输层自动补齐后与官方 OpenAI-compatible 形态一致 | Officially documented |
| 零一万物 Yi | `https://api.lingyiwanwu.com` | `https://api.lingyiwanwu.com/v1` | `Authorization: Bearer` | `POST /chat/completions` | `GET /models` | PromptHub 默认 host 不含 `/v1`，传输层自动补齐后与官方 OpenAI-compatible 形态一致 | Officially documented |
| xAI | `https://api.x.ai` | `https://api.x.ai/v1` | `Authorization: Bearer` | `POST /v1/chat/completions` or `POST /v1/responses` | not fully confirmed in this pass | PromptHub 当前以 chat completions 兼容层为主 | Officially documented (partial) |
| Mistral | `https://api.mistral.ai` | `https://api.mistral.ai` | `Authorization: Bearer` | `POST /v1/chat/completions` | `GET /v1/models` | 与当前 OpenAI-compatible transport 兼容性较好 | Officially documented |
| Azure OpenAI | none | Azure resource-specific endpoint | API key or Azure AD token | deployment-scoped chat endpoint | deployment/model listing differs | PromptHub 仅保留 provider 占位，未提供默认 host | PromptHub inferred |
| Ollama | `http://localhost:11434` | `http://localhost:11434` | local daemon typically no bearer key | `POST /api/chat` | `GET /api/tags` | PromptHub 仅提供 provider 占位，当前默认 transport 未按原生 Ollama API 专门建模 | PromptHub inferred |
| Custom (OpenAI compatible) | none | user supplied | usually `Authorization: Bearer` | usually `POST /v1/chat/completions` | usually `GET /v1/models` | PromptHub 作为通用兼容入口 | PromptHub inferred |

## Additional Mainstream Platforms

下表记录目前不属于 PromptHub 内建默认项、但在主流生态中常见的平台型入口。

| Provider / Platform | Built into PromptHub | Official Base URL / Host | Auth | Primary Chat Endpoint | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 腾讯混元 / Hunyuan | no | `https://api.hunyuan.cloud.tencent.com/v1` | `Authorization: Bearer` | `POST /chat/completions` | 官方 OpenAI 兼容接口，属于国内主流厂商但当前未内建到 PromptHub 默认清单 | Officially documented |
| OpenRouter | no | `https://openrouter.ai/api/v1` | `Authorization: Bearer` | `POST /chat/completions` | 多模型路由平台，不是单一模型厂商；也支持 OpenAI SDK 指向其 `api/v1` base URL | Officially documented |
| SiliconFlow | no | `https://api.siliconflow.cn/v1` | `Authorization: Bearer` | `POST /chat/completions` | 聚合/云平台；官方文档明确采用 OpenAI-compatible chat completions 形态 | Officially documented |
| ModelScope | no | official API inference platform exists | provider-specific | platform supports API inference, but stable chat endpoint details were not fully captured in this pass | 更像模型平台/推理平台，不应直接等同于某一模型族 | Evidence limited |

## Common Provider Alias Mapping

下表优先收录御三家与国内主流厂商的常见标签、别名与模型族映射，避免把模型名、英文别名或平台标签误记为独立厂商。

| Label / Alias | Classification | Canonical Provider / Model Family | Notes | Evidence |
| --- | --- | --- | --- | --- |
| `OpenAI`, `GPT` | canonical provider / model-family shorthand | OpenAI | `GPT` 通常指 OpenAI 模型族，不是新的 provider | Officially documented |
| `Anthropic`, `Claude`, `Claude Official` | provider label / official alias | Anthropic | `Claude Official` 应映射到 Anthropic 官方直连 API | Officially documented |
| `Google`, `Gemini` | provider label / model-family shorthand | Google / Gemini | `Gemini` 通常指 Google 模型族 | Officially documented |
| `DeepSeek` | canonical provider | DeepSeek | 官方同时提供 OpenAI / Anthropic 兼容面 | Officially documented (partial) |
| `Moonshot`, `Kimi`, `Kimi k2` | provider / model-family alias | Moonshot / Kimi | `Kimi k2` 是模型族名称，不是新的 provider | Officially documented (partial) |
| `智谱 AI`, `BigModel`, `GLM`, `Zhipu GLM`, `Zhipu GLM en` | provider / model-family alias | 智谱 AI / BigModel | GLM 家族标签应统一映射回智谱生态 | Officially documented (partial) |
| `通义千问`, `Qwen`, `DashScope` | provider / model-family / platform alias | 阿里百炼 / Qwen (DashScope) | `Qwen` 是模型族，`DashScope` 是平台入口 | Officially documented |
| `Atlas Cloud`, `AtlasCloud`, `atlascloud`, `atlas-cloud`, `atlas` | canonical provider / provider alias | Atlas Cloud | Atlas Cloud 是 OpenAI-compatible 聚合平台；模型名仍应按原始 model id 保存，例如 `qwen/qwen3.5-flash` | Live catalog verified |
| `腾讯混元`, `Hunyuan` | provider / model-family alias | 腾讯混元 / Hunyuan | 国内主流厂商标签；官方提供 OpenAI 兼容接口 | Officially documented |
| `豆包`, `Doubao`, `Ark`, `DouBaoSeed` | provider / platform / seed-family label | 豆包 / Ark | `Ark` 是官方平台标签；`DouBaoSeed` 仍混合了平台与 Seed 家族命名 | Officially documented (partial) |
| `文心一言`, `ERNIE`, `Qianfan` | provider / model-family / platform alias | 文心一言 / Qianfan | `Qianfan` 是平台标签，`ERNIE` 更接近模型族名称；PromptHub 当前默认接的是 Qianfan V2 OpenAI-compatible 面 | Officially documented |
| `讯飞星火`, `Spark` | provider / model-family alias | 讯飞星火 / Spark | 官方支持 OpenAI SDK 兼容接入 | Officially documented (partial) |
| `MiniMax`, `MiniMax en` | canonical provider / localized alias | MiniMax | 英文化预设名应映射回同一 provider | Officially documented (partial) |
| `阶跃星辰`, `StepFun` | canonical provider / localized alias | StepFun | 国内主流厂商标签；官方文档明确采用 OpenAI-compatible 形态 | Officially documented |
| `零一万物`, `Yi` | canonical provider / model-family alias | 零一万物 Yi | `Yi` 常作为模型族简称出现，官方文档明确给出 OpenAI-compatible 接口 | Officially documented |

## Protocol Mismatch Watchlist

以下差异已经足以进入后续修复候选，但本文件只记录事实，不在本轮直接改代码：

- Anthropic:
  PromptHub 当前默认 host 指向官方域名，但请求仍按统一 `/v1/chat/completions` 风格构造；官方原生接口是 `POST /v1/messages`。
- DeepSeek:
  本轮抓到的官方 quickstart 直接使用 `https://api.deepseek.com/chat/completions`；PromptHub generic 归一化会自动补成 `/v1/chat/completions`。
- 智谱 AI / BigModel:
  官方 OpenAI compat 示例使用 `/api/paas/v4/`，而 PromptHub 默认 host 目前只写到 `/api/paas`。
- 豆包 / Ark:
  官方数据面使用 `https://ark.cn-beijing.volces.com/api/v3/chat/completions`；PromptHub 当前默认 host 只到 `/api`，generic 归一化会补成 `/v1/chat/completions`。
- MiniMax:
  本轮官方文档使用 `https://api.minimax.io/v1/text/chatcompletion_v2`；PromptHub 仍预设 `https://api.minimax.chat` 并按 generic `/v1/chat/completions` 建模。

## Provider Notes

### OpenAI

- Official API host: `https://api.openai.com`
- Auth: `Authorization: Bearer <OPENAI_API_KEY>`
- Stable endpoints relevant to PromptHub:
  - `POST /v1/chat/completions`
  - `GET /v1/models`
- PromptHub note:
  - 当前多数 OpenAI-compatible provider 逻辑都以 OpenAI chat completions 为统一抽象基线。

### Anthropic

- Official API host: `https://api.anthropic.com`
- Required auth headers:
  - `x-api-key: <ANTHROPIC_API_KEY>`
  - `anthropic-version: 2023-06-01` or newer required version
- Stable endpoints relevant to PromptHub:
  - `POST /v1/messages`
  - `GET /v1/models`
- PromptHub note:
  - PromptHub 当前聊天传输层没有单独建模 Anthropic Messages body，而是沿用统一消息抽象并在 header 层做特殊处理。
  - 这意味着“PromptHub current usage”与“Anthropic official native protocol”并不完全等同，应谨慎继续扩展。

### Google / Gemini

- Official service host: `https://generativelanguage.googleapis.com`
- Two stable protocol surfaces matter to PromptHub:
  - Native Gemini API
  - OpenAI compatibility API
- Native Gemini API:
  - model discovery: `GET /v1beta/models`
  - auth: `x-goog-api-key: <GEMINI_API_KEY>`
- OpenAI compatibility API:
  - SDK base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`
  - chat endpoint: `POST /v1beta/openai/chat/completions`
  - auth: `Authorization: Bearer <GEMINI_API_KEY>`
- PromptHub note:
  - PromptHub 当前设置页默认 host 只保存到 `https://generativelanguage.googleapis.com`，再由传输层自动补到兼容端点。
  - 聊天测试和实际聊天调用走 OpenAI compat。
  - 模型获取仍走 native `/v1beta/models`。
  - 不能只按域名决定 header，必须按最终协议决定。

### DeepSeek

- Official OpenAI-compatible host: `https://api.deepseek.com`
- Official Anthropic-compatible host: `https://api.deepseek.com/anthropic`
- Auth for OpenAI-compatible access: `Authorization: Bearer <DEEPSEEK_API_KEY>`
- PromptHub-relevant endpoint in official quickstart:
  - `POST /chat/completions`
- PromptHub note:
  - PromptHub 当前默认值走 OpenAI-compatible host，不直接走 Anthropic-compatible surface。
  - 但当前 transport 的 generic `/v1` 自动补齐与本轮官方 quickstart 文档并不完全一致。

### Moonshot / Kimi

- Official examples use OpenAI SDK with base URL `https://api.moonshot.cn/v1`
- Auth: `Authorization: Bearer <MOONSHOT_API_KEY>`
- Stable endpoint captured in this pass:
  - `POST /v1/chat/completions`
- PromptHub note:
  - `Kimi k2` 这类名称应视为模型族标签，而不是新的 provider。
  - PromptHub 默认 host 不含 `/v1`，当前 transport 会自动补齐。

### 智谱 AI / BigModel

- Official OpenAI SDK compatibility docs use base URL `https://open.bigmodel.cn/api/paas/v4/`
- Official examples show OpenAI SDK compatible `chat.completions.create(...)`
- PromptHub note:
  - `Zhipu GLM` / `Zhipu GLM en` 应视为智谱 GLM 生态标签，不是新的 provider。
  - PromptHub 默认 host 目前少了 `/v4` 版本段，后续应单独验证是否需要修正默认值与 endpoint 拼接逻辑。

### 阿里百炼 / Qwen (DashScope)

- PromptHub default host: `https://dashscope.aliyuncs.com/compatible-mode`
- Official OpenAI-compatible SDK base URL commonly includes `/v1`, for example:
  - `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Full chat endpoint example:
  - `POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- Auth: `Authorization: Bearer <DASHSCOPE_API_KEY>`
- PromptHub note:
  - PromptHub 默认 host 不带 `/v1`，传输层负责自动补齐；这属于产品层简化输入，不等于官方文档推荐的最完整 base URL 形式。
  - `Qwen` 更适合被视为模型族标签，实际 API 面仍应映射回 DashScope / 百炼平台。

### 豆包 / Ark

- Official data-plane base URL: `https://ark.cn-beijing.volces.com/api/v3`
- Official control-plane base URL: `https://ark.cn-beijing.volcengineapi.com/`
- Auth:
  - data plane: `Authorization: Bearer <ARK_API_KEY>`
  - control plane: `Authorization: HMAC-SHA256 ...`
- Stable endpoint captured in this pass:
  - `POST /chat/completions`
- PromptHub note:
  - PromptHub 默认 host `https://ark.cn-beijing.volces.com/api` 当前少了 `/v3`。
  - 当前 generic `/v1/chat/completions` 归一化与官方数据面文档不一致。
  - 本轮尚未单独确认模型发现端点。

### 文心一言 / Qianfan

- Official OpenAI-compatible base URL: `https://qianfan.baidubce.com/v2`
- Auth:
  - API Key auth via `Authorization: Bearer <API Key>`
- Stable endpoints captured in this pass:
  - `POST /chat/completions`
  - `GET /models`
- PromptHub note:
  - PromptHub 默认 host 已直接使用官方 `/v2` base URL。
  - `renderer/services/ai.ts` 与 `main/services/ai-client.ts` 在已有版本段时会直接补成 `/chat/completions`；模型发现也会直接补成 `/models`，当前传输层与本轮官方文档一致。
  - `Qianfan` 更接近平台标签，`ERNIE` 更接近模型族标签；当前文档把两者合并记录为同一百度生态入口。

### MiniMax

- Official docs captured in this pass show:
  - server: `https://api.minimax.io`
  - text endpoint: `POST /v1/text/chatcompletion_v2`
  - auth: `Authorization: Bearer <API_KEY>`
- PromptHub note:
  - PromptHub 当前默认 host `https://api.minimax.chat` 与本轮官方文档不一致。
  - 当前 generic `/v1/chat/completions` 逻辑也不等于官方 `chatcompletion_v2` 文档，应作为单独兼容修复候选。

### StepFun

- Official OpenAI-compatible base URL: `https://api.stepfun.com/v1`
- Auth: `Authorization: Bearer <STEP_API_KEY>`
- Stable endpoints captured in this pass:
  - `POST /chat/completions`
  - `GET /models`
- PromptHub note:
  - PromptHub 默认 host 当前不带 `/v1`，由 transport 自动补齐。
  - `step-router-v1` 的 Step Plan 通道使用单独的 `https://api.stepfun.com/step_plan/v1`，不应和普通 chat 通道混写。

### 讯飞星火 / Spark

- Official OpenAI SDK compatibility docs use base URL `https://spark-api-open.xf-yun.com/v1/`
- Stable endpoint captured in this pass:
  - `POST /v1/chat/completions`
- Auth:
  - `Authorization: Bearer <APIPassword>`
- PromptHub note:
  - PromptHub 默认 host 当前不带 `/v1`，由 transport 自动补齐。
  - `Spark` 更适合作为星火生态标签，而不是独立新 provider。

### 零一万物 Yi

- Official OpenAI-compatible base URL: `https://api.lingyiwanwu.com/v1`
- Auth: `Authorization: Bearer <API_KEY>`
- Stable endpoints captured in this pass:
  - `POST /chat/completions`
  - `GET /models`
- PromptHub note:
  - PromptHub 默认 host 当前不带 `/v1`，由 transport 自动补齐。
  - `Yi` 更适合作为模型族标签，实际 API 面应映射回零一万物开放平台。

### 腾讯混元 / Hunyuan

- Official OpenAI compatibility docs use base URL `https://api.hunyuan.cloud.tencent.com/v1`
- Stable endpoint captured in this pass:
  - `POST /chat/completions`
- Auth:
  - `Authorization: Bearer <HUNYUAN_API_KEY>`
- PromptHub note:
  - 腾讯混元属于国内主流厂商，但当前不在 PromptHub 内建 provider 默认值中。
  - 若后续要新增内建 preset，可直接按 OpenAI-compatible provider 建模。

### OpenRouter

- Official base URL: `https://openrouter.ai/api/v1`
- Auth: `Authorization: Bearer <OPENROUTER_API_KEY>`
- Stable endpoint captured in this pass:
  - `POST /chat/completions`
- PromptHub note:
  - OpenRouter 是多模型路由平台，不是单一模型厂商。
  - 若后续加内建 preset，应按 router 而不是 model vendor 建模。

### SiliconFlow

- Official base URL: `https://api.siliconflow.cn/v1`
- Auth: `Authorization: Bearer <API_KEY>`
- Stable endpoint captured in this pass:
  - `POST /chat/completions`
- PromptHub note:
  - SiliconFlow 更像聚合/云推理平台，可作为独立 router/provider 候选，而不是 Qwen/GLM/DeepSeek 的别名。

## PromptHub Source of Truth Mapping

- Provider defaults in current UI:
  - `apps/desktop/src/renderer/components/settings/AISettings.tsx`
  - `apps/desktop/src/renderer/components/settings/ai-workbench/constants.ts`
- Chat/image transport normalization:
  - `apps/desktop/src/renderer/services/ai.ts`
- Main-process lightweight AI client:
  - `apps/desktop/src/main/services/ai-client.ts`

## Evidence Links

- OpenAI API chat completions: `https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create`
- Anthropic API overview: `https://docs.anthropic.com/en/api/overview`
- Gemini OpenAI compatibility: `https://ai.google.dev/gemini-api/docs/openai`
- Gemini API service endpoint / native API: `https://ai.google.dev/api`
- Mistral API chat endpoint: `https://docs.mistral.ai/api/`
- xAI API reference: `https://docs.x.ai/docs/api-reference`
- DeepSeek quick start: `https://api-docs.deepseek.com/`
- Moonshot chat completions: `https://platform.kimi.com/docs/api/chat`
- Zhipu OpenAI compatibility: `https://docs.bigmodel.cn/cn/guide/develop/openai/introduction`
- DashScope OpenAI compatibility: `https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope`
- MiniMax text generation API: `https://platform.minimax.io/docs/api-reference/text-post`
- 腾讯混元 OpenAI compatibility: `https://cloud.tencent.com/document/product/1729/111007`
- 讯飞星火 HTTP / OpenAI SDK compatibility: `https://www.xfyun.cn/doc/spark/HTTP调用文档.html`
- OpenRouter quickstart: `https://openrouter.ai/docs/quickstart`
- SiliconFlow chat completions: `https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions`
- Volcengine Ark OpenAI compatibility: `https://www.volcengine.com/docs/82379/1330626`
- Volcengine Ark base URL and auth: `https://www.volcengine.com/docs/82379/1298459`
- Volcengine Ark chat API: `https://www.volcengine.com/docs/82379/1494384`
- 百度千帆认证鉴权: `https://cloud.baidu.com/doc/qianfan-api/s/ym9chdsy5`
- 百度千帆获取模型列表: `https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y`
- 百度千帆文本生成: `https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb`
- ModelScope API inference intro: `https://modelscope.cn/docs/model-service/API-Inference/intro`
- StepFun chat completions: `https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create.md`
- StepFun models list: `https://platform.stepfun.com/docs/zh/api-reference/models/list.md`
- 零一万物 Yi API reference: `https://platform.lingyiwanwu.com/docs/api-reference`

## Open Questions / Follow-ups

- 评估是否要修正 PromptHub 对 Anthropic、DeepSeek、智谱、MiniMax 的默认 endpoint 归一化策略
- 补齐豆包 / Ark 的模型发现端点证据
- 评估是否要新增腾讯混元作为 PromptHub 内建 provider preset
- 明确 OpenRouter、SiliconFlow 是否值得提升为 PromptHub 内建 preset
- 继续核验中优先级较低但仍可能需要支持的名称，如 `BaiLing`、`Xiaomi MiMo`
- 明确 Azure OpenAI 在 PromptHub 中是否要引入 deployment-aware UI，而不是仅保留 provider 占位
- 明确 Ollama 是否需要独立原生 transport，而不是继续仅视作 generic compatible provider
