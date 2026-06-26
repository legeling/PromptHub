# 贡献指南

仓库根目录的 `CONTRIBUTING.md` 是 GitHub 自动发现的入口文件；本文件是 PromptHub 当前有效的 canonical 贡献指南。

感谢你对 PromptHub 的关注。我们欢迎代码、测试、文档、设计、部署说明和问题复现等各种形式的贡献。

## 先判断你要改哪里

| 区域 | 路径 | 说明 |
| ---- | ---- | ---- |
| 桌面端 | `apps/desktop` | Electron 桌面应用、Renderer、Main Process、CLI |
| 自部署 Web | `apps/web` | 轻量自托管浏览器工作区 |
| 共享包 | `packages/shared`、`packages/db` | 共享类型、协议、数据层 |
| 对外文档 | `docs/`、根 `README.md`、根 `CONTRIBUTING.md` | 用户、部署者、贡献者可读文档 |
| 内部 SSD | `spec/` | 稳定 spec、设计约束、活跃变更、实施记录 |

如果你在开发自部署 Web，请优先阅读 [docs/web-self-hosted.md](./web-self-hosted.md)。

## 环境要求

- Node.js 24+
- pnpm 9+
- Git

## 快速启动

### 桌面端

```bash
git clone https://github.com/YOUR_USERNAME/PromptHub.git
cd PromptHub
pnpm install
pnpm electron:dev
```

### 自部署 Web

```bash
pnpm install
pnpm dev:web
```

### CLI

```bash
pnpm --filter @prompthub/cli dev -- --help
```

## 常用命令

| 场景 | 命令 |
| ---- | ---- |
| 桌面端开发 | `pnpm electron:dev` |
| Web 开发 | `pnpm dev:web` |
| 桌面端构建 | `pnpm build` |
| Web 构建 | `pnpm build:web` |
| 桌面端 lint | `pnpm lint` |
| Web lint | `pnpm lint:web` |
| 桌面端 typecheck | `pnpm typecheck` |
| Web typecheck | `pnpm typecheck:web` |
| 桌面端全量测试 | `pnpm test -- --run` |
| Web 全量验证 | `pnpm verify:web` |
| E2E | `pnpm test:e2e` |
| 发布前桌面门禁 | `pnpm test:release` |

> `pnpm build` 在仓库根默认只构建桌面版；如果改动了 Web，请显式执行 `pnpm build:web` 或 `pnpm verify:web`。

## 文档与 SSD 工作流

PromptHub 对非 trivial 改动采用 SSD（Specification / Design / Delivery）工作流：

- `docs/`：对外文档，面向用户、部署者、贡献者
- `spec/`：内部 SSD、稳定领域文档、稳定逻辑、固定资产、活跃变更与归档

以下改动通常都应先建立或更新 `spec/changes/active/<change-key>/`：

- 新功能
- 多文件 bug 修复
- 重构
- 迁移
- 跨 `desktop / web / packages` 的联动修改
- 重要文档结构重构

每个重要变更至少包含：

- `proposal.md`
- `specs/<domain>/spec.md`
- `design.md`
- `tasks.md`
- `implementation.md`

实施完成后需要同步：

- 项目级稳定入口到 `spec/workflow/*`
- 稳定行为与规则到 `spec/knowledge/behavior/`
- 固定参考资料到 `spec/knowledge/reference/`
- 长期工程约束到 `spec/knowledge/structure/`
- 发布规则与版本摘要到 `spec/releases/`
- 对外契约到 `docs/` 或根 `README.md`

更多入口见：

- [docs/README.md](./README.md)
- [spec/README.md](../spec/README.md)

## 代码与文档约束

- 使用 TypeScript，遵循 ESLint / Prettier 规则
- 不使用 `any`、`@ts-ignore`、空 `catch` 来掩盖问题
- 行为变化必须补测试，文档变化必须同步相关入口文档
- 桌面端新增用户可见文案时，需要同步 i18n locale 文件
- 不提交密钥、密码、token 或其他敏感信息

## Commit 与分支建议

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
refactor: 代码重构
test: 添加测试
chore: 构建/工具变更
perf: 性能优化
```

分支命名建议：

```text
feature/xxx
fix/xxx
docs/xxx
refactor/xxx
```

更完整的提交、分批 commit、文档编号、`FR -> DES -> TEST -> T` 追踪链、issue 引用与 PR 说明要求，见 [spec/rules/submission-traceability-rules.md](../spec/rules/submission-traceability-rules.md)。

## PR 检查清单

1. 按改动范围运行对应的 lint、测试、构建或验证命令。
2. 如果是非 trivial 改动，更新或新建 `spec/changes/active/<change-key>/`。
3. 为非 trivial change 建立或更新 `FR -> DES -> TEST -> T` 追踪链。
4. 同步用户文档、开发文档和 `implementation.md`。
5. 在 PR 描述中说明变更动机、影响范围、验证方式、相关 issue / active change 和残留风险。
6. 根据 review 反馈继续修正。

## 交流

- [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 许可证

贡献的代码将采用 [AGPL-3.0 License](../LICENSE)。
