# PromptHub 项目规则

> Claude Code 项目级规则，自动加载到每次会话上下文。

## 项目概览

- **技术栈**：Electron 33 + React 18 + TypeScript 5.6 + Vite 6 + Tailwind CSS 3.4
- **数据库**：better-sqlite3（本地 SQLite）
- **状态管理**：Zustand 5
- **包管理器**：pnpm（禁止使用 npm/yarn）
- **测试**：Vitest + Playwright

## 强制规则

- 禁止自动 `git commit/push`，必须等用户明确指令
- 禁止在 `src/` 或其他代码目录创建 `.md` 文档，文档统一放 `docs/`
- 禁止 Mock 数据、TODO 占位符、空 catch
- 每次修改前端代码后必须运行 `pnpm lint`
- 修改功能时必须同步更新相关组件、类型定义、store、测试

## 代码规范

- TypeScript：使用 `interface` 定义类型，禁用 `any`
- 命名：`camelCase` 函数/变量，`PascalCase` 组件/类/接口，`UPPER_SNAKE_CASE` 常量
- 单个函数不超过 50 行，单个文件不超过 500 行

## 常用命令

```bash
pnpm dev        # 启动 Electron 开发模式
pnpm dev:web    # 启动 Web 开发模式
pnpm build      # 构建
pnpm lint       # ESLint 检查（改完前端必跑）
pnpm test       # Vitest 单元测试
pnpm test:e2e   # Playwright E2E 测试
```

## 项目结构

```
src/
├── main/           # Electron 主进程
├── preload/        # Electron preload 脚本
└── renderer/       # React 前端
    ├── components/ # UI 组件
    ├── store/      # Zustand 状态
    ├── hooks/      # 自定义 hooks
    └── utils/      # 工具函数
```
