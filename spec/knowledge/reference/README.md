# PromptHub Knowledge Reference

`spec/knowledge/reference/` 对齐最新 `spec-init` 的 knowledge/reference 边界，用于沉淀 schema、样例、协议、固定参考资料和素材索引。

## 当前固定参考资料入口

### Agent 平台资产

- `spec/knowledge/reference/agent-platforms.md`
  - 平台根目录
  - 规则文件
  - skills / agents / workflows / commands 资产面
  - 配置文件与证据级别

### Codex 扩展面映射

- `spec/knowledge/reference/codex-extension-surfaces.md`
  - Skill / Plugin / MCP server / App 的概念边界
  - PromptHub 对插件、子资产和 Agent Assistant 调用的建模规则
  - 插件来源、静态扫描和安全基线

### Plugin Agent 适配矩阵

- `spec/knowledge/reference/plugin-agent-adapter-matrix.md`
  - Native / Adapter / RuntimeOnly / Composite / Pending 分类
  - 各 Agent 的插件包 marker、安装入口和 PromptHub 需要生成的目标格式
  - 首版启用与置灰规则
  - 官方文档和官方仓库证据链接

### 对外截图与公开素材

- `docs/imgs/`

### 稳定内部规范与约束

- `spec/knowledge/structure/`
- `spec/knowledge/reference/`

### 路由与目录拓扑

- `spec-init.topology.yml`
- `spec/rules/document-routing-rules.md`

## 使用规则

- 长期稳定、可被持续引用的 schema / 协议 / 平台矩阵 / 参考样例，应优先收敛到 reference 层
- 单次变更分析不放这里，放 `spec/changes/active/<change-key>/`
