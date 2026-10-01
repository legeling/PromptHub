# Spec Delta: 媒体入口可见性（desktop-ui 域）

### FR-MEDIA-001 第一层级入口
文本类 prompt 的新建/编辑弹窗中，参考媒体区渲染在主流程内（不依赖 More Settings 展开即可见；编辑弹窗位于主区尾部即用户提示词流程之后，新建弹窗保持其原主区位置），More Settings 折叠逻辑对该区不再适用。图片类型位置不变。

### FR-MEDIA-002 约束提示
媒体区显示一行静态提示：支持常见图片格式，本地添加单文件 ≤20MB，URL 下载 ≤10MB（与主进程 IMAGE_DOWNLOAD_MAX_BYTES / MEDIA_SAVE_MAX_BYTES 实际常量一致，测试锁定数值同步）。
