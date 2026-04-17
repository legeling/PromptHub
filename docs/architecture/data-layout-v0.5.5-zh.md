# PromptHub 数据布局重构设计（v0.5.5）

> **状态**：桌面端主链已实施，导入导出与后续收尾仍在继续
> **目标版本**：v0.5.5
> **影响范围**：磁盘布局、导入导出、备份恢复、WebDAV/self-hosted 同步

---

## 1. 背景与动机

当前数据目录存在以下问题：

| 问题 | 后果 |
| --- | --- |
| `workspace/prompts/` 扁平存储 + `folders.json` 索引 | 用户打开 Finder 看到一堆 UUID，无法辨识内容 |
| `prompts` 在 `workspace/`，`skills` 在顶层 | 命名不一致，新业务类型无章可循 |
| `images/` `videos/` 散落顶层 | 后续扩展 `audios/` `attachments/` 会更乱 |
| 用户业务数据与 Electron 内部数据混在同一层 | 备份/同步/恢复必须维护黑名单 |
| 没有独立 `backups/` `cache/` `logs/` 目录 | 预升级备份、FTS 缓存、日志只能乱丢 |
| 新业务类型（agents/snippets/workflows）无处安放 | 只能继续往顶层堆 |

核心设计错误：**把文件系统当扁平存储 + 索引文件，背离了文件系统本身的树形表达能力**。

---

## 2. 目标结构

```
<userData>/
│
├── prompthub.db                  # 索引/搜索缓存（非真相源）
│
├── data/                         # ★ 用户业务数据（唯一真相、唯一备份对象）
│   ├── prompts/
│   │   ├── 常用/
│   │   │   ├── 代码审查.md
│   │   │   ├── 翻译助手.md
│   │   │   └── _folder.json
│   │   ├── 工作/
│   │   │   ├── 邮件/
│   │   │   │   ├── 正式邮件.md
│   │   │   │   └── _folder.json
│   │   │   ├── 周报.md
│   │   │   └── _folder.json
│   │   └── 未分类/               # 系统保留目录
│   │       └── 临时记录.md
│   │
│   ├── skills/                   # 已有，保持 SKILL.md 机制
│   │   └── <skill-name>/
│   │       └── SKILL.md
│   │
│   ├── agents/                   # 未来扩展
│   ├── snippets/                 # 未来扩展
│   ├── workflows/                # 未来扩展
│   │
│   └── assets/                   # 所有媒体资源统一入口
│       ├── images/
│       ├── videos/
│       └── attachments/
│
├── config/                       # 设备级配置（建议备份）
│   ├── settings.json
│   └── ai-providers.json         # API key 加密存储
│
├── cache/                        # 可重建，备份跳过
│   └── fts/
│
├── backups/                      # 自动快照（pre-upgrade / pre-migration）
│   └── pre-upgrade-v0.5.5-<timestamp>/
│
├── logs/                         # 诊断日志
│
└── [Electron 内部，永不迁移]
    ├── IndexedDB/
    ├── Local Storage/
    └── Session Storage/
```

---

## 3. 核心设计原则

### 3.1 文件系统是真相源

| 层级 | 角色 |
| --- | --- |
| **文件系统** (`data/`) | 用户内容的**唯一真相源**。用户可在 Finder / VSCode 直接编辑、移动、删除 |
| **SQLite** (`prompthub.db`) | 索引、搜索缓存（FTS5）、排序优化。**DB 丢了可从 `data/` 重建** |
| **`_folder.json`** | 文件夹元数据（排序、颜色、图标、描述），**可选**，缺失则退回字母排序 + 默认图标 |

### 3.2 Prompt 文件格式

每个 `.md` 文件即一个 prompt，frontmatter 存元数据：

```markdown
---
id: 01HXYZ...                    # 稳定 ULID，重命名不变
title: 代码审查                   # 真实标题（可含特殊字符）
tags: [代码, review]
variables:
  - name: language
    default: typescript
created_at: 2026-01-15T10:23:00Z
updated_at: 2026-04-17T08:00:00Z
version: 3
---

# 你的 prompt 正文...
```

### 3.3 命名规则

| 规则 | 策略 |
| --- | --- |
| **文件名** | `slugify(title) + 冲突后缀`（如 `-2` `-3`）。真实 title 存 frontmatter |
| **非法字符** | `/ \ : * ? " < > \|` 自动替换为 `_`（Windows 兼容） |
| **同名冲突** | UI 层强约束"同级不同名"；底层兜底加后缀 |
| **大小写敏感** | 按"不敏感冲突"拒绝（跨平台可移植） |
| **空文件夹** | 允许（文件系统原生支持） |

### 3.4 目录职责边界

| 目录 | 备份 | 同步 | 用户可见 |
| --- | --- | --- | --- |
| `data/` | ✅ 必须 | ✅ 必须 | ✅ |
| `config/` | ✅ 建议 | ✅ 建议（脱敏） | ⚠️ 配置界面 |
| `cache/` | ❌ 跳过 | ❌ 跳过 | ❌ |
| `backups/` | 自管理 | ❌ 跳过 | ⚠️ 恢复界面 |
| `logs/` | ❌ 跳过 | ❌ 跳过 | ⚠️ 诊断界面 |
| `prompthub.db` | ✅ 作为索引加速 | ❌（接收端重建） | ❌ |

---

## 4. 四条数据流动链路

围绕新结构，以下 4 条链路全部重写。详细设计见后续专题文档。

| 流 | 核心原则 | 操作对象 | 文件格式 |
| --- | --- | --- | --- |
| **导出** | 所见即所得，zip 内布局 = `data/` 布局 | `data/` 的用户选择子集 | `.zip`（标准格式） |
| **导入** | 永远 merge，绝不清空 | 合并进 `data/` | `.zip` / `.phub.gz` / legacy `.json` |
| **压缩备份** | 完整快照，可整机还原 | `data/` + `config/` + `prompthub.db` | `.phub.gz`（PromptHub 专有） |
| **同步** | 传输"备份对象"，两端各自落地到 `data/` | 内存对象，非文件 | 协议层不变 |

### 4.1 导出 `.zip` 结构示例

```
prompthub-export-2026-04-17.zip
├── README.txt
├── manifest.json               # kind: "prompthub-export", version, scope
├── prompts/
│   └── <folder-path>/
│       └── <prompt-title>.md
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
└── assets/
    ├── images/
    ├── videos/
    └── attachments/
```

**关键**：zip 解压后的布局 = 磁盘 `data/` 的布局。用户可直接在 Finder 打开查看。

### 4.2 导入格式识别

```
恢复/导入入口支持文件:
  - .phub.gz  (gzip + JSON)
    - kind: "prompthub-backup"  → 完整恢复（允许清空）
    - kind: "prompthub-export"  → 合并导入（不清空）
  - .zip      → 探测 manifest.json → 合并导入（不清空）
  - .json     → legacy，按 kind 走老路径，兼容 v0.4.7/v0.4.8/v0.5.1
```

---

## 5. 迁移策略

### 5.1 三段式迁移 + 强制预备份

| 阶段 | 动作 | 保底 |
| --- | --- | --- |
| **预迁移** | 创建 `backups/pre-upgrade-v0.5.5-<ts>/` 完整硬链接快照 | 出错可回滚 |
| **迁移** | 用 `rename()` 原子移动（同分区零拷贝）<br/>写 `data/.migration-marker.json` | marker 存在才算完成 |
| **运行期兼容** | 路径函数先查新路径，不存在则 fallback 旧路径 | 迁移中断也能读 |
| **清理** | v0.7.0 删除 fallback | 给用户完整缓冲期 |

### 5.2 关键保险措施

1. **磁盘空间检测**：剩余空间必须 > 当前 userData 的 2 倍，否则拒绝迁移
2. **DB 打开前完成**：迁移必须在应用启动、DB 打开前执行，避免并发写
3. **失败不半迁移**：marker 未写成功 → 下次启动继续用旧路径
4. **Windows 特殊测试**：antivirus / OneDrive 锁定文件导致 `rename` 失败的场景
5. **用户弹窗确认**：不做静默自动迁移（v0.5.3 教训：动用户文件必须知情）

### 5.3 路径函数双读兼容

```typescript
// 示例：getPromptsDir()
function getPromptsDir(): string {
  const newPath = path.join(userData, "data", "prompts");
  const oldPath = path.join(userData, "workspace", "prompts");

  if (fs.existsSync(newPath)) return newPath;
  if (fs.existsSync(oldPath)) return oldPath;
  return newPath; // 默认创建新路径
}
```

### 5.4 多库检测与选择策略

v0.5.5 目录迁移前，必须先解决一个现实问题：**同一台机器上可能同时存在多个 PromptHub 数据根目录**。例如：

- Electron 默认目录（如 `%APPDATA%/PromptHub` 或 `~/Library/Application Support/PromptHub`）
- 用户在设置中手动切换过的自定义目录
- Windows 安装目录旁的 `data/`
- 升级事故后遗留的旧目录、恢复目录、半迁移目录

如果不先统一选择“当前活跃数据根目录”，后续 `data/` 分层迁移就可能对错目录执行，造成：

- 新目录被当成空库初始化，旧数据变成“看不见”
- 预迁移备份备份了错误目录
- 恢复对话框、升级快照、正式迁移三套机制分别操作不同位置

因此 v0.5.5 的策略不是“扫描到数据就自动迁移”，而是分两层决策：

| 层级 | 目标 | 输出 |
| --- | --- | --- |
| **数据根选择** | 先确定本次启动真正绑定的 `userData` | 唯一活跃根目录 |
| **目录布局迁移** | 再判断该根目录是否仍是旧布局，并进入 `workspace/ → data/` 迁移 | 迁移执行 / 跳过 |

#### 5.4.1 候选根目录来源

启动时按以下优先级构造候选：

1. `data-path.json` 中用户显式配置的目录
2. Electron 默认 `userData`
3. Windows 非受保护安装目录旁的 `data/`
4. 历史恢复逻辑已知的旧目录候选（仅用于检测，不自动切换）

#### 5.4.2 根目录选择优先级

| 优先级 | 条件 | 动作 |
| --- | --- | --- |
| 1 | 用户显式配置目录存在 | 直接采用，不再猜测 |
| 2 | 默认 `userData` 已包含 PromptHub 数据标记 | 采用默认目录 |
| 3 | 安装目录旁 `data/` 已存在且确有数据 | 采用该目录 |
| 4 | 以上都不满足 | 回退到默认 `userData`，按新安装处理 |

这里的核心原则是：**显式配置优先于自动推断，已存在的数据优先于空目录，自动检测只用于避免把旧数据“藏起来”，不用于悄悄改用户决定。**

#### 5.4.3 何谓“存在 PromptHub 数据”

候选根目录必须命中至少一个数据标记，才可视为有效：

- `prompthub.db`
- `workspace/`
- `skills/`
- `images/`
- `videos/`
- `IndexedDB/`、`Local Storage/`、`Session Storage/`
- `shortcuts.json`、`shortcut-mode.json`

后续引入新布局后，检测器还必须补充识别：

- `data/`
- `config/`
- `backups/`
- `logs/`

目的不是要求目录完整，而是识别“这里曾真实承载过 PromptHub 数据”。

#### 5.4.4 多候选并存时的处理

若检测到多个候选目录都有数据，不做静默自动合并，也不直接挑“最新修改时间”获胜。原因：

- 不同目录可能分别代表不同历史阶段，自动合并风险极高
- 修改时间不能可靠表达“哪份是用户想保留的真相源”
- 目录迁移与恢复都属于高风险文件操作，必须要求用户知情

处理策略如下：

1. 启动阶段只选择一个**当前活跃根目录**用于本次运行
2. 其余目录作为**可恢复 / 可提示候选**保留
3. 若当前 DB 为空而其他候选存在有效数据，进入现有的数据恢复提示链路
4. 若当前根目录存在旧布局数据，则只对**当前活跃根目录**发起 v0.5.5 迁移确认

#### 5.4.5 与恢复、预升级备份、正式迁移的关系

三套机制必须围绕同一个活跃根目录运作：

| 机制 | 操作对象 | 说明 |
| --- | --- | --- |
| **数据恢复** | 非当前目录的候选根 | 用于把旧数据重新导回当前根 |
| **预升级备份** | 当前活跃根目录 | 在版本跳变时创建完整快照 |
| **目录布局迁移** | 当前活跃根目录 | 把旧布局重组为 `data/` / `config/` / `backups/` / `logs/` |

换句话说：**恢复负责“选对库”，迁移负责“改对结构”，预备份负责“先留后路”。**

#### 5.4.6 用户交互原则

多库检测本身可以静默完成，但以下情况必须显式提示用户：

1. 当前目录为空、其他候选有数据：提示可恢复来源
2. 当前目录仍是旧布局、即将执行迁移：提示迁移动作、风险和重启要求
3. 检测到多个都有数据的目录且无法安全推断：要求用户明确选择，不自动覆盖

这保证 v0.5.3 的事故不会以另一种形式重演：**任何会改变用户文件状态的动作，都必须先让用户知道系统准备操作的是哪一个目录。**

---

## 6. 与现有系统的兼容性

### 6.1 WebDAV 同步

- 协议层：**零影响**。WebDAV 依然传输 `DatabaseBackup` 对象 / `manifest.json + data.json`
- 落地层：接收端写入新结构 `data/`
- 历史远端文件（`prompthub-backup.json`）：继续读兼容

### 6.2 Self-hosted Sync

- **零影响**。`self-hosted-sync.ts` 操作 `DatabaseBackup` 内存对象，不依赖磁盘布局

### 6.3 历史导入文件兼容

必须兼容以下旧格式（基于实际 fixture 测试）：

- v0.4.7 / v0.4.8 产出的 `.phub.gz` 压缩备份
- v0.5.1 产出的 `.phub.gz` 压缩备份 / `prompthub-export.phub.gz` 选择性导出
- 所有历史版本的 legacy `.json` 原始备份

### 6.4 Skill 系统

- 已有 `skills/` 顶层目录 → 迁移到 `data/skills/`
- SKILL.md + frontmatter 机制**保持不变**
- `skill-repo-sync.ts` 的 DB↔FS 同步机制作为 prompt 文件化的参考实现

---

## 7. 实施边界（v0.5.5 范围）

### 7.1 In Scope

- [x] 定义最终目录布局
- [ ] `data/` + `config/` + `cache/` + `backups/` + `logs/` 分层落地（其中 `cache/` 仍待后续补齐）
- [x] Prompt 层级文件夹 + frontmatter + `_folder.json`
- [x] 迁移器（含预备份、弹窗确认、路径双读 fallback）
- [ ] 导出改为 `.zip`（标准格式，布局 = `data/`）
- [ ] 导入入口兼容 `.zip` / `.phub.gz` / legacy `.json`
- [ ] 压缩备份保持 `.phub.gz`，但打包内容对齐新布局
- [x] "数据库信息"UI 文案同步更新

### 7.2 Out of Scope（留给后续版本）

- [ ] **FS Watcher**（用户在 Finder 直改文件自动感知）→ v0.5.6 或 v0.6.0
- [ ] **Agents / Snippets / Workflows 业务类型实现** → 各自独立版本
- [ ] **删除旧路径 fallback** → v0.7.0
- [ ] **DB 完全可选**（仅靠 FS 运行）→ 长期目标

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 迁移中断导致数据半状态 | 中 | 高 | marker 机制 + 预备份 |
| Windows 文件锁定导致 rename 失败 | 高 | 中 | 重试 + 降级为 copy+delete |
| 特殊字符文件名在跨平台复制时损坏 | 中 | 中 | slugify + frontmatter 存原标题 |
| 用户手动编辑 FS 产生冲突 | 低 | 低 | FS watcher（下一版本） |
| DB 与 FS 不一致 | 中 | 中 | 启动扫描 + 协调逻辑 |
| 旧版本导入文件格式未覆盖 | 中 | 高 | 用实际 v0.4.7/v0.4.8/v0.5.1 产出的文件做 fixture 测试 |

---

## 9. 发版节奏

```
v0.5.3  ← 已发：升级事故紧急修复（恢复链路 + 导入安全加固）
v0.5.4  ← 待发：修复当前用户升级后数据丢失的遗留问题
v0.5.5  ← 本文档目标版本：
          - 新目录布局 + 迁移器
          - Prompt 文件化结构
          - .zip 导出 + 导入格式兼容
          - UI 文案更新
v0.5.6+ ← FS Watcher / Agents / 其他业务类型
v0.7.0  ← 删除旧路径 fallback
```

---

## 10. 决策记录

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 导出格式 | `.zip`（标准可解压） |
| 2 | 压缩备份格式 | `.phub.gz`（PromptHub 专有） |
| 3 | 导出选项合并 | 内容 / 媒体 / 技能（高级可展开） |
| 4 | AI 配置 / 设置默认导出 | 否（安全优先） |
| 5 | 旧文件兼容范围 | v0.4.7 / v0.4.8 / v0.5.1 |
| 6 | `data/assets/` 细分 | 是（`images/ videos/ attachments/`） |
| 7 | `config/` 与 `data/` 分开 | 是 |
| 8 | 文件夹元数据文件名 | `_folder.json`（用户可见，非隐藏） |
| 9 | FS vs DB 真相源 | FS 是内容真相，DB 是索引 |
| 10 | 迁移方式 | 弹窗确认 + 预备份，非静默 |

---

**文档维护者**：凌小添
**最近更新**：2026-04-17
