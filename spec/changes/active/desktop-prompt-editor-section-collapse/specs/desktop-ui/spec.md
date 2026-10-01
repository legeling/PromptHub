# Spec Delta: 编辑 Prompt 弹窗折叠（desktop-ui 域）

## 新增的需求

### FR-EDIT-001 次要信息分组折叠
编辑/新建 Prompt 弹窗中，非核心字段（来源 source、关联/关系、备注 notes、补充元数据等既有次要区块，具体组成为实现时按现存渲染结构划定）收入带标题的折叠区；折叠状态不卸载内容（display 隐藏），保证 React 表单状态存续与保存结果不受影响。

### FR-EDIT-002 交互与可达性
折叠控件为可键盘操作的 button（aria-expanded/aria-controls）；折叠状态仅内存记忆（关闭弹窗后回到默认态），不持久化。

### FR-EDIT-003 核心编辑区优先
默认折叠态下，系统/用户提示词编辑区可见面积显著增加（实现后附前后对比如可行）；"弹出专属编辑窗口"复用既有全屏编辑能力（`usePromptNativeFullscreen` 链路），不新建弹窗。
