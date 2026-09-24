# 贡献指南

仓库根目录的 `CONTRIBUTING.md` 是 GitHub 自动发现的入口文件；本文件是 PromptHub 当前有效的 canonical 贡献指南。

感谢你对 PromptHub 的关注。我们欢迎代码、测试、文档、设计、部署说明和问题复现等各种形式的贡献。

## 先判断你要改哪里

| 区域       | 路径                                          | 说明                                           |
| ---------- | --------------------------------------------- | ---------------------------------------------- |
| 桌面端     | `apps/desktop`                                | Electron 桌面应用、Renderer、Main Process、CLI |
| 自部署 Web | `apps/web`                                    | 轻量自托管浏览器工作区                         |
| 共享包     | `packages/shared`、`packages/db`              | 共享类型、协议、数据层                         |
| 对外文档   | `docs/`、根 `README.md`、根 `CONTRIBUTING.md` | 用户、部署者、贡献者可读文档                   |
| 内部 SSD   | `spec/`                                       | 稳定 spec、设计约束、活跃变更、实施记录        |

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

| 场景             | 命令                  |
| ---------------- | --------------------- |
| 桌面端开发       | `pnpm electron:dev`   |
| Web 开发         | `pnpm dev:web`        |
| 桌面端构建       | `pnpm build`          |
| Web 构建         | `pnpm build:web`      |
| 桌面端 lint      | `pnpm lint`           |
| Web lint         | `pnpm lint:web`       |
| 桌面端 typecheck | `pnpm typecheck`      |
| Web typecheck    | `pnpm typecheck:web`  |
| 桌面端测试验收   | `pnpm test:run`       |
| Web 全量验证     | `pnpm verify:web`     |
| E2E              | `pnpm test:e2e`       |
| 根级发布候选门禁 | `pnpm verify:release` |

> `pnpm build` 在仓库根默认只构建桌面版；如果改动了 Web，请显式执行 `pnpm build:web` 或 `pnpm verify:web`。

## 测试与验收

测试设计与完成标准统一见 [测试标准](../spec/rules/testing-standards.md)。先从真实入口完成正常流程并检查结果，再从同一入口验证异常输入和失败后的状态；覆盖率与 mock 调用不能替代功能验收。

提交测试时说明前置数据、触发操作、具体预期和实际验证边界。持久化检查实际读回及必要的重开，UI 变更记录真实操作结果。测试代码也要接受静态检查；Vitest 通过不等于类型检查通过。使用 `pnpm typecheck:tests` 检查测试与 E2E 类型；`pnpm test:run` 依次运行真实集成基线、测试类型检查和单元回归。当前目录结构与命令边界见 [验证入口](../spec/workflow/04-verification/README.md)。

Playwright Test Agents 可辅助规划、生成或诊断 E2E，使用时遵守 GUI 与委派授权。生成源码只是待审查产物，须由普通 Playwright 独立执行后才有测试结果；不要求每次测试调用 Agent。操作方式见 [使用指南](./testing-playwright-agents.md)。

## 文档

内部主题从 [spec 入口](../spec/README.md) 定向查找；用户与贡献者说明保留在 `docs/`。文档投入、需求权威及计划统一遵循 [文档规则](../spec/rules/document-routing-rules.md)。已有主题原位更新，只有独立新主题才新建说明，跨会话工作按需保留一份计划。

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

更完整的提交、分批 commit、文档关联、issue 引用与 PR 说明要求，见 [spec/rules/submission-traceability-rules.md](../spec/rules/submission-traceability-rules.md)。

## PR 检查清单

1. 按改动范围运行必要的 lint、测试、构建或验证命令。
2. 更新本次受影响的权威约定、现行引用和已有计划状态。
3. 在 PR 中说明问题、结果、验证、残余风险及现有主题或 issue 关联。
4. 根据 review 修正，不把未发布的本地完成误记为 issue 已关闭。

## 交流

- [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 许可证

贡献的代码将采用 [AGPL-3.0 License](../LICENSE)。
