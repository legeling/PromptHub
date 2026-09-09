# PromptHub Coding Standards

本规则是 PromptHub 编码标准的项目入口。详细架构、测试和提交要求分别由 `code-quality-architecture.md`、`testing-standards.md` 和 `submission-traceability-rules.md` 承担。

## 基本原则

- 先理解需求和边界，再设计，再实现。
- 优先做最小正确改动，避免无必要抽象和跨边界改动。
- 遵循项目现有风格、目录职责、共享类型和 helper。
- 不确定的信息写入 `[待确认]` 或 active change，不要在代码里靠猜测补齐。
- 业务规则、存储语义、同步策略和公共 contract 不得只藏在 React component 或 one-off IPC handler 中。

## 命名和结构

- 变量和函数使用 `camelCase`。
- 常量使用 `UPPER_SNAKE_CASE`。
- 类型、类、React 组件使用 `PascalCase`。
- 函数默认控制在 50 行以内；超出时优先拆分纯 helper 和 side-effect orchestration。
- 单个 source/test 文件不得超过 2,000 行；已有超限文件只能拆分或迁移，不继续堆行为。

## 变更要求

- 变更必须有可验证目标；文档投入与关联按 `spec/rules/document-routing-rules.md`，不额外要求编号。
- 接口、数据结构、配置、IPC/API、filesystem layout 或 sync payload 变化必须更新所属主题及受影响引用。
- 关键技术取舍记录在所属主题；只有独立重大决策才另建 ADR，其他文档引用该决定。
- 修改 UI 时优先复用现有组件、状态模式、i18n key、Tailwind token 和 Lucide 图标。
- 新增用户可见字符串必须使用 i18n，不能硬编码单语言 UI。

## 错误处理

- 不忽略错误，不写空 catch。
- 错误信息要说明失败边界，但不能泄露密钥、token、私有路径或敏感 payload。
- 文件系统、数据库、网络、sync、install/import/export 等 side effect 必须定义 partial failure 行为。
- 一个用户动作跨多个 side effect 时，必须有 rollback、恢复路径或明确的错误状态。

## 安全要求

- 不硬编码密钥、密码、token、个人账号或真实私有部署地址。
- 外部输入必须验证，包括路径、URL、JSON、frontmatter、IPC payload、CLI 参数和上传/导入内容。
- 涉及路径的逻辑必须考虑路径穿越、null byte、软链接、隐藏目录和平台差异。
- 涉及网络源的逻辑必须考虑代理/镜像、SSRF-like 输入、下载失败和校验失败。

## 禁止行为

- 用硬编码假数据掩盖真实问题。
- 用 `TODO` 占位代替关键逻辑。
- 注释掉失败逻辑来绕过问题。
- 新增重复组件、重复 store selector、重复服务 helper 而不检查现有实现。
- 绕过 shared/package/process 依赖方向。

## 相关规则

- `spec/rules/code-quality-architecture.md`
- `spec/rules/testing-standards.md`
- `spec/rules/document-routing-rules.md`
- `spec/rules/submission-traceability-rules.md`
