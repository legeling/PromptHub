# 贡献指南

感谢你对 PromptHub 的关注。我们欢迎任何形式的贡献。

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 9+
- Git

### 本地开发

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/PromptHub.git
cd PromptHub

# 2. 安装依赖
pnpm install

# 3. 启动桌面开发环境
pnpm electron:dev

# 4. 运行测试
pnpm test -- --run
```

如果你在开发 Web 自部署版本，请优先阅读 [docs/web-self-hosted.md](./web-self-hosted.md)。

## DOS / SSD 工作流

PromptHub 对非 trivial 改动采用 DOS（Documentation Operating System）工作流，内部结构参考 OpenSpec：稳定 specs 进入 `spec/specs/`，活跃增量进入 `spec/changes/active/`，完成后归档到 `spec/changes/archive/`。

当你要做以下工作时，请先在 `spec/changes/active/<change-key>/` 建变更目录：

- 新功能
- 大型 bug 修复
- 重构
- 迁移
- 跨 desktop / web / packages 的联动修改

每个重要变更至少包含：

- `proposal.md`
- `specs/<domain>/spec.md`
- `design.md`
- `tasks.md`
- `implementation.md`

完整规则见：

- [docs/README.md](./README.md)
- [spec/README.md](../spec/README.md)

这次结构也比旧版更完整：补齐了 stable specs、delta specs、archive、legacy 和模板目录，历史内部文档已恢复到 `spec/`，不再散落在 `docs/`。

## 贡献类型

### Bug 修复

1. 先在 Issues 中搜索是否已有相关问题
2. 如果没有，创建新的 Issue 或 Discussion
3. 对于小修复，可以直接提交 PR
4. 对于跨模块或高风险修复，先建立变更目录

### 新功能

1. 先在 Issues 或 Discussions 中讨论方向
2. 对非 trivial 功能先建立变更目录
3. 遵循现有的代码风格、类型规则、测试标准与文档同步规则
4. 提交 PR 前完成文档与测试同步

### 文档改进

- 修复错别字
- 补充说明
- 添加示例
- 同步代码与文档不一致的地方
- 改善 DOS / architecture / deployment 文档结构

## 开发规范

### 代码风格

- 使用 TypeScript
- 遵循 ESLint 规则
- 使用 Prettier 格式化
- 不用 `any` / `@ts-ignore` 逃避问题

```bash
pnpm lint
pnpm format
pnpm typecheck
```

### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 构建/工具变更
perf: 性能优化
```

示例：

```text
feat(skill): add update conflict protection
fix(sync): prevent web visibility regression
docs: refine DOS workflow and templates
```

### 分支命名

```text
feature/xxx
fix/xxx
docs/xxx
refactor/xxx
```

## 测试

```bash
# 全量桌面测试
pnpm test -- --run

# 单文件测试
pnpm test -- <path> --run

# Web 验证
pnpm verify:web

# E2E
pnpm test:e2e
```

发布相关改动建议执行：

```bash
pnpm --filter @prompthub/desktop test:release
```

## PR 流程

1. 确保相关测试通过
2. 更新相关文档
3. 对非 trivial 改动同步 `implementation.md`
4. 创建 Pull Request
5. 根据 review 反馈修正

## 交流

- [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 许可证

贡献的代码将采用 [AGPL-3.0 License](../LICENSE)。
