# Spec Delta: 媒体入口可见性（desktop-ui 域）

### FR-MEDIA-001 第一层级入口
媒体区的信息层级沿用 [桌面稳定规范第 7 节](../../../../../knowledge/behavior/desktop.md#7-prompt-modal-information-hierarchy)：新建 Prompt 的参考媒体收纳在 More Settings，编辑场景按类型组织。此前“不依赖 More Settings”的要求与稳定规范冲突，不再作为本主题的现行要求。

### FR-MEDIA-003 本地选择与组件生命周期
新建/编辑 Prompt 共用的媒体管理器在 React StrictMode 的 effect 清理与重新建立后仍须接受当前打开弹窗的选择结果。选择有效图片后显示预览，提交 Prompt 时携带托管图片名；复制失败显示本地化错误，允许重试并保留已有媒体。弹窗实际关闭或组件卸载后，迟到的选择结果不得再追加或提示成功。

所有权保持不变：`apps/desktop` renderer 管理表单临时媒体列表，preload/图片 IPC 将所选文件复制到现有托管媒体目录，Prompt 记录保存文件名。无需 schema、IPC 或目录迁移。

### FR-MEDIA-002 约束提示
媒体区显示一行静态提示：支持常见图片格式，本地添加单文件 ≤20MB，URL 下载 ≤10MB（与主进程 IMAGE_DOWNLOAD_MAX_BYTES / MEDIA_SAVE_MAX_BYTES 实际常量一致，测试锁定数值同步）。
