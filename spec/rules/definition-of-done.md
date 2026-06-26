# PromptHub Definition of Done

在把任务标记为完成之前，至少确认以下事项：

## 文档

- 相关 workflow / knowledge / change 记录已同步
- `README.md` 中的结构和说明仍然正确
- 关键技术取舍已记录到 `spec/adr/` 或稳定设计文档

## 代码与测试

- bugfix / 非平凡新功能已先补能失败的测试，或已记录无法先写测试的具体原因和替代验证
- 高优先级需求有自动化验证
- 关键失败场景有覆盖
- 回归测试已更新
- 新增或修改代码符合 `spec/rules/code-quality-architecture.md`
- 触碰文件不超过 2,000 行；若触碰的是已有超限文件，本次变更只能拆分/迁移，不能继续堆行为
- 模块保持高内聚、低耦合，依赖方向符合 `AGENTS.md` 架构边界
- 新增状态、持久化、IPC/API、文件系统行为已定义 source of truth、失败回滚和验证层
- lint / build / test 已执行，或明确说明阻塞原因

## 交付质量

- 不存在用默认值、空 catch、硬编码假数据掩盖问题的实现
- 未绕过既有设计边界；若存在设计冲突，已暂停并向用户确认
- 已知风险和未决事项已显式写出
- 关键疑点已经和用户完成确认，而不是开发者自行假定
- 准备提交时，已按 `spec/rules/submission-traceability-rules.md` 检查 commit 边界、编号引用、验证记录和 issue 关闭语义
