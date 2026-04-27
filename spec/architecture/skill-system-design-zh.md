# PromptHub Agent Skill 体系设计方案

本文档详细设计了 PromptHub 的 "Agent Skill" (智能体技能) 体系。该设计参考了 Claude Code/Desktop 的技能架构以及 Model Context Protocol (MCP) 标准，旨在让 PromptHub 成为强大的 Agent 技能管理与运行平台。

## 📋 目录

1. [什么是 Skill (技能)](#1-什么是-skill-技能)
2. [技能获取方式](#2-技能获取方式)
3. [创建自定义技能](#3-创建自定义技能)
4. [安装与应用技能](#4-安装与应用技能)
5. [技能管理](#5-技能管理)
6. [高级功能](#6-高级功能)
7. [故障排查](#7-故障排查)
8. [开发路线图](#8-开发路线图)

## 1. 核心概念定义

### 什么是 "Skill" (技能)?

在 PromptHub 中，**Skill** 是一个可移植的、自包含的能力包，它赋予 AI Agent 特定的专业能力。它填补了静态 _System Prompts_ 和动态 _MCP Tools_ 之间的空白。

**一个 Skill 包含三个核心要素：**

1.  **程序性知识 (Procedural Knowledge)**: 即 System Prompt，指导 AI _如何_ 执行任务（例如：“如何撰写高转化率的营销邮件”）。
2.  **工具定义 (MCP Config)**: 引用需要的 MCP 服务器配置（例如：“需要挂载 `filesystem-server` 和 `postgres-server`”）。
3.  **本地资源 (Local Resources)**: (可选) 供 AI 调用的脚本、文档模板或知识库文件。

### 类比理解

- **Prompt**: 需求（例如：“我要盖个房子”）。
- **MCP Tool**: 工具箱（例如：锤子、锯子）。
- **Skill**: 建筑师（包含“如何盖房子”的知识 + 自带的特定工具箱）。

---

## 2. 架构设计

### 2.1 数据模型 (`Skill` Entity)

PromptHub 内部将新增 `skills` 表来存储技能定义：

```json
{
  "id": "skill_uuid",
  "name": "Data Analyst (数据分析师)",
  "description": "能够读取本地 CSV/Excel 文件，使用 Python 进行分析并绘制图表。",
  "version": "1.0.0",
  "author": "PromptHub Community",
  "instructions": "你是一个资深数据分析师。当用户提供数据时，你应该先检查数据结构... [System Prompt 内容]",
  "mcp_config": {
    "servers": {
      "python-analysis": {
        "command": "python",
        "args": ["-m", "mcp_analysis_server"],
        "env": {}
      }
    }
  },
  "tags": ["data", "analysis", "python"]
}
```

### 2.2 文件系统结构 (导出/导入格式)

为了兼容性，Skill 导出为文件夹或 ZIP 包时，应遵循以下标准结构（尽可能兼容 Claude 官方标准）：

```text
my-data-skill/
├── manifest.json      # 元数据 (名称, 版本, 作者, MCP配置)
├── SKILL.md           # 核心指令 (System Prompt)
├── scripts/           # (可选) 包含的可执行脚本
└── docs/              # (可选) 供 AI 参考的知识库文档
```

---

## 3. 功能需求详细说明

### 3.1 技能安装与发现 (Skill Installation & Discovery)

#### 3.1.1 文件放置位置

每个技能需要创建一个独立的文件夹,并在其中放置 `SKILL.md` 文件。PromptHub 会在以下位置搜索技能：

**项目级配置:**
- `.prompthub/skills/<skill-name>/SKILL.md`
- `.claude/skills/<skill-name>/SKILL.md` (兼容 Claude)

**全局配置:**
- `~/.config/prompthub/skills/<skill-name>/SKILL.md`
- `~/.claude/skills/<skill-name>/SKILL.md` (兼容 Claude)

#### 3.1.2 发现机制

对于项目本地路径,PromptHub 会从当前工作目录向上遍历,直到到达 git 工作树根目录。它会加载沿途所有匹配的 `skills/*/SKILL.md` 文件。

全局定义也会从用户配置目录加载。

#### 3.1.3 SKILL.md 格式规范

每个 `SKILL.md` 必须以 YAML frontmatter 开头,包含以下字段：

```yaml
---
name: skill-name           # 必需,技能名称
description: 技能描述      # 必需,1-1024 字符
license: MIT               # 可选,许可证
compatibility: prompthub   # 可选,兼容性标识
metadata:                  # 可选,字符串键值对
  audience: developers
  workflow: github
---
```

**名称验证规则:**
- 长度: 1-64 字符
- 格式: 小写字母数字,使用单个连字符分隔
- 不能以 `-` 开头或结尾
- 不能包含连续的 `--`
- 必须与包含 SKILL.md 的目录名称匹配
- 正则表达式: `^[a-z0-9]+(-[a-z0-9]+)*$`

**示例:**

创建 `.prompthub/skills/git-release/SKILL.md`：

```markdown
---
name: git-release
description: 创建一致的发布版本和变更日志
license: MIT
compatibility: prompthub
metadata:
  audience: maintainers
  workflow: github
---

## 我能做什么

- 从合并的 PR 中起草发布说明
- 建议版本号升级
- 提供可复制粘贴的 `gh release create` 命令

## 何时使用我

当你准备创建标签发布时使用此技能。
如果目标版本控制方案不清楚,请提出澄清问题。
```

#### 3.1.4 权限控制

在 `prompthub.json` 中使用基于模式的权限控制技能访问：

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "pr-review": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

**权限类型:**

| 权限 | 行为 |
|------|------|
| `allow` | 技能立即加载 |
| `deny` | 技能对 Agent 隐藏,拒绝访问 |
| `ask` | 加载前提示用户批准 |

模式支持通配符: `internal-*` 匹配 `internal-docs`、`internal-tools` 等。

#### 3.1.5 针对特定 Agent 的权限覆盖

**自定义 Agent (在 agent frontmatter 中):**

```yaml
---
permission:
  skill:
    "documents-*": "allow"
---
```

**内置 Agent (在 prompthub.json 中):**

```json
{
  "agent": {
    "plan": {
      "permission": {
        "skill": {
          "internal-*": "allow"
        }
      }
    }
  }
}
```

#### 3.1.6 禁用技能工具

完全禁用不应使用技能的 Agent：

**自定义 Agent:**

```yaml
---
tools:
  skill: false
---
```

**内置 Agent:**

```json
{
  "agent": {
    "plan": {
      "tools": {
        "skill": false
      }
    }
  }
}
```

禁用后,`<available_skills>` 部分将被完全省略。

## 4. 安装与应用技能

### 4.1 安装方式

#### 4.1.1 一键安装

**从 URL 安装：**
1. 复制 GitHub 仓库 URL
2. 在 PromptHub 中选择 "安装技能"
3. 粘贴 URL，确认安装
4. 系统自动验证和安装

**从注册表安装：**
1. 浏览官方或社区技能库
2. 点击 "安装" 按钮
3. 选择安装位置（项目/全局）
4. 确认安装

#### 4.1.2 手动安装

**下载安装：**
```bash
# 1. 下载技能包
curl -L https://github.com/user/skill/archive/main.zip -o skill.zip
unzip skill.zip

# 2. 复制到技能目录
cp -r skill-main ~/.config/prompthub/skills/my-skill

# 3. 验证格式
prompthub skill validate my-skill
```

**Git 克隆安装：**
```bash
# 1. 克隆仓库
git clone https://github.com/user/skill.git ~/.config/prompthub/skills/my-skill

# 2. 验证安装
prompthub skill list | grep my-skill
```

### 4.2 技能应用

#### 4.2.1 在聊天中使用

**直接调用：**
```
用户: /git-release v1.2.0
Agent: [加载 git-release 技能]
     我将帮您创建 v1.2.0 版本发布...
```

**自动触发：**
```
用户: 帮我分析这个 CSV 文件的数据
Agent: [检测到数据分析需求，自动加载 data-analyst 技能]
     我将使用数据分析技能来处理您的 CSV 文件...
```

#### 4.2.2 在项目中配置

**项目级技能配置：**
```json
// .prompthub/config.json
{
  "skills": ["api-conventions", "code-review"],
  "auto_load": true,
  "permissions": {
    "skill": {
      "*": "allow"
    }
  }
}
```

**会话级技能：**
```json
// 会话配置
{
  "session_skills": ["git-release", "deploy-staging"],
  "context": "development"
}
```

### 4.3 技能管理

#### 4.3.1 技能列表查看
```bash
# 查看所有可用技能
prompthub skill list

# 查看技能详情
prompthub skill info git-release

# 搜索技能
prompthub skill search --tag "git"
```

#### 4.3.2 技能更新
```bash
# 更新单个技能
prompthub skill update git-release

# 更新所有技能
prompthub skill update --all

# 检查更新
prompthub skill check-updates
```

#### 4.3.3 技能卸载
```bash
# 卸载技能
prompthub skill uninstall git-release

# 批量卸载
prompthub skill uninstall --tag "experimental"

# 清理无效技能
prompthub skill cleanup
```

## 5. 技能管理

### 5.1 技能库界面

**技能库视图：**
- 网格化展示已安装的技能
- 显示技能图标、名称、简介、版本
- 支持按类别、标签、使用频率排序
- 提供搜索和过滤功能

**技能详情页：**
- 完整的技能描述和使用说明
- 技能依赖和权限要求
- 使用统计和用户评价
- 相关技能推荐

### 5.2 版本管理

**语义化版本控制：**
- 遵循 SemVer 规范 (MAJOR.MINOR.PATCH)
- 向后兼容的更新策略
- 自动检查和提示更新

**版本回滚：**
- 保留历史版本
- 支持一键回滚到稳定版本
- 版本差异对比

### 5.3 依赖管理

**技能依赖：**
- 声明所需的 MCP 服务器
- 指定最低 PromptHub 版本
- 自动安装和配置依赖

**冲突检测：**
- 检测技能间的冲突
- 提供解决方案建议
- 支持技能分组管理

## 6. 高级功能

### 6.1 技能组合

**工作流编排：**
- 将多个技能组合成工作流
- 定义技能执行顺序和条件
- 支持并行和串行执行

**技能模板：**
- 创建可重用的技能模板
- 参数化配置
- 快速生成相似技能

### 6.2 动态技能

**条件触发：**
- 基于上下文自动加载技能
- 智能推荐相关技能
- 学习用户使用模式

**自适应优化：**
- 根据使用反馈优化技能
- 自动调整技能参数
- 持续改进性能

### 6.3 企业级功能

**权限管理：**
- 基于角色的访问控制
- 细粒度权限设置
- 审计日志和合规性

**技能分发：**
- 企业内部技能商店
- 批量部署和更新
- 统一的技能标准

### 6.4 集成扩展

**第三方集成：**
- 与 CI/CD 工具集成
- 支持外部 API 调用
- 插件系统架构

**数据同步：**
- 跨设备技能同步
- 云端备份和恢复
- 离线模式支持

## 7. 故障排查 (Troubleshooting)

如果技能未显示：

1. **验证文件名**: 确保文件名为 `SKILL.md` (全大写)。
2. **检查 frontmatter**: 确保包含 `name` 和 `description` 字段。
3. **唯一性检查**: 确保技能名称在所有位置中唯一。
4. **权限检查**: 检查权限设置,`deny` 权限的技能对 Agent 隐藏。
5. **目录名称匹配**: 确保目录名称与 frontmatter 中的 `name` 字段完全匹配。
6. **格式验证**: 使用正则表达式 `^[a-z0-9]+(-[a-z0-9]+)*$` 验证名称格式。

---

## 8. 开发路线图 (Roadmap)

### Phase 1: 基础架构 (MVP)

- [ ] 数据库新增 `skills` 表。
- [ ] 实现 Skill 的 CRUD (增删改查) 界面。
- [ ] 实现 Chat 模块加载 Skill 的 System Prompt 功能（暂不含 MCP）。

### Phase 2: MCP 深度集成

- [ ] 实现后台 MCP Client 管理器。
- [ ] Chat 运行时动态启动/停止 Skill 关联的 MCP Server。

### Phase 3: 生态与分发

- [ ] 制定 `.skill` 标准文件格式。
- [ ] 实现“一键安装”逻辑。
- [ ] 搭建基础的社区技能源 (Community Registry)。
