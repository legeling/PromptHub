# 贡献指南

感谢你对 PromptHub 的关注！我们欢迎任何形式的贡献。

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- Git

### 本地开发

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/PromptHub.git
cd PromptHub

# 2. 安装依赖
pnpm install

# 3. 启动开发服务器
pnpm dev

# 4. 运行测试
pnpm test
```

## 📝 贡献类型

### 🐛 Bug 修复

1. 先在 Issues 中搜索是否已有相关问题
2. 如果没有，创建一个新的 Issue 描述问题
3. Fork 仓库，创建修复分支
4. 提交 PR，关联对应的 Issue

### ✨ 新功能

1. 先在 Issues 或 Discussions 中讨论你的想法
2. 等待维护者确认后再开始开发
3. 遵循现有的代码风格和架构
4. 添加必要的测试和文档

### 📖 文档改进

- 修复错别字
- 改进说明
- 添加示例
- 翻译

## 🔧 开发规范

### 代码风格

- 使用 TypeScript
- 遵循 ESLint 规则
- 使用 Prettier 格式化

```bash
# 检查代码
pnpm lint

# 格式化代码
pnpm format

# 类型检查
pnpm typecheck
```

### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 构建/工具变更
```

示例：
```
feat(editor): 添加变量自动补全功能
fix(sync): 修复同步冲突问题
docs: 更新安装说明
```

### 分支命名

```
feature/xxx    # 新功能
fix/xxx        # Bug 修复
docs/xxx       # 文档
refactor/xxx   # 重构
```

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行单元测试
pnpm test:unit

# 运行 E2E 测试
pnpm test:e2e

# 测试覆盖率
pnpm test:coverage
```

## 📦 项目结构

```
packages/
├── core/        # 核心逻辑（共享）
├── desktop/     # Electron 桌面应用
├── extension/   # Chrome 插件
└── shared-ui/   # 共享 UI 组件
```

修改核心逻辑时，请确保同时考虑桌面端和插件端的兼容性。

## 🔄 PR 流程

1. 确保所有测试通过
2. 更新相关文档
3. 填写 PR 模板
4. 等待 Code Review
5. 根据反馈修改
6. 合并！

## 💬 交流

- [GitHub Issues](https://github.com/legeling/PromptHub/issues) - Bug 反馈
- [GitHub Discussions](https://github.com/legeling/PromptHub/discussions) - 功能讨论

## 📄 许可证

贡献的代码将采用 [AGPL-3.0 License](./LICENSE)。
