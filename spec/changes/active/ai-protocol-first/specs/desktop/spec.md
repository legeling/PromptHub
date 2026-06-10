# Delta Spec

## Added

- 每个桌面端 AI 模型配置必须持久化一个显式 `apiProtocol` 字段，可选值为 `openai`、`gemini`、`anthropic`。
- legacy root AI 配置和 Safety Scan AI 配置也必须携带同一协议字段，以保证默认模型回退链路与主进程请求行为一致。
- AI workbench 在新增/编辑模型和编辑端点时，必须允许用户显式选择请求协议，而不仅是选择 provider。
- 同版本 renderer settings localStorage hydrate 时也必须过滤畸形 AI provider/model 记录，并补齐 `apiProtocol` 与模型能力字段，不能只依赖 zustand `migrate`。

## Modified

- 预制 provider 不再决定最终请求协议；它只提供默认 base URL、推荐协议和展示文案。
- 聊天请求与模型发现请求的 endpoint、header、body 构造逻辑必须按 `apiProtocol` 分支：
- `openai`: `POST /v1/chat/completions`，`GET /v1/models`，使用 `Authorization: Bearer`。
- `gemini`: 聊天使用 OpenAI 兼容 `.../v1beta/openai/chat/completions`，模型发现使用原生 `GET .../v1beta/models`，聊天使用 `Authorization: Bearer`，模型发现使用 `x-goog-api-key`。
- `anthropic`: 聊天使用原生 `POST /v1/messages`，模型发现使用 `GET /v1/models`，使用 `x-api-key` 和 `anthropic-version`。
- 当聊天模型使用 `anthropic` 协议时，系统不得继续发送 OpenAI 风格流式请求；本次版本必须禁用其流式聊天配置。
- 桌面端主进程 AI HTTP transport 必须支持请求级超时；AI workbench 的模型发现请求必须在 12 秒内失败并返回可恢复的 network 类错误，而不是无限等待。

## Removed

- 按 provider 或 host 自动推断 `Anthropic` / `Gemini` 聊天协议的隐式行为，不再作为唯一真实来源。

## Scenarios

- 当用户选择 `custom` provider，但协议选择为 `Gemini` 且 base URL 是代理域名时：
- 系统必须仍按 Gemini 协议补全聊天和模型发现 endpoint，而不是退回 OpenAI 默认路径。

- 当用户选择 `Anthropic` 协议测试聊天模型时：
- 系统必须请求 `POST <base>/v1/messages`
- 请求头必须包含 `x-api-key` 与 `anthropic-version`
- 若用户此前开启了流式输出，本次请求必须按非流式发送。

- 当 AI workbench 获取模型列表时目标端点长时间无响应：
- 桌面端请求必须在 12 秒左右终止
- UI 必须把该结果视为 network 类失败并提示可恢复 warning，而不是一直保持获取中。

- 当旧版本设置被迁移到新版本时：
- 现有 AI 模型和 legacy root AI 配置必须获得稳定的默认协议值，不得因为缺失 `apiProtocol` 而丢失可用性。

- 当 current-version settings 快照已包含无效或缺字段的 AI provider/model 记录时：
- hydrate 后的 renderer state 只能包含满足 AI workbench 协议契约的 provider/model 记录。
- 缺失或非法 `apiProtocol` 必须根据 provider 和 API URL 推断为稳定协议值。
