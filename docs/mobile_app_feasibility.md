# 移动端 App 可行性分析报告 (Mobile App Feasibility Report)

## 1. 结论 Conclusion

**完全可行，且无需重写技术栈。**
**Yes, completely feasible without rewriting the tech stack.**

通过引入 **[Capacitor](https://capacitorjs.com/)**，我们可以将现有的 React (Vite) 前端代码直接打包为 Android 和 iOS 原生应用。这比重写为 React Native 或 Flutter 成本低得多，同时能复用 95% 以上的现有业务逻辑和 UI 代码。

## 2. 核心优势 Key Advantages

1.  **代码复用**：现有的 `src/renderer` 代码可以直接运行在手机上。
2.  **数据层兼容**：经过代码审计，发现核心数据服务 `src/renderer/services/database.ts` 使用的是 **IndexedDB**。IndexedDB 是浏览器原生标准，完美支持 Android (WebView) 和 iOS (WKWebView)，**无需** 改用 SQLite 插件即可运行核心功能。
3.  **开发效率**：保持单仓库 (Monorepo) 模式，一次修改，三端（Win/Mac/Mobile）生效。

## 3. 需要改造的模块 Required Refactoring

虽然核心逻辑通用，但涉及操作系统的部分需要抽象为**适配器模式 (Adapter Pattern)**：

| 功能模块                | 桌面端 (Electron)               | 移动端 (Capacitor)      | 改造方案                                               |
| :---------------------- | :------------------------------ | :---------------------- | :----------------------------------------------------- |
| **文件系统** (图片存储) | `src/main` IPC (Node.js `fs`)   | `@capacitor/filesystem` | 创建 `IFileSystem` 接口，分别实现 PC 和 Mobile 版本    |
| **网络请求** (WebDAV)   | `src/main` IPC (Node.js `http`) | `@capacitor/http`       | 创建 `INetworkService`，Mobile 端使用原生插件绕过 CORS |
| **数据库**              | IndexedDB (现有)                | IndexedDB (原生支持)    | **无需修改**                                           |
| **应用更新**            | electron-updater                | App Store / Play Store  | 移除移动端更新检查逻辑                                 |
| **窗口控制**            | `ipcMain` (最小化/关闭)         | N/A                     | 隐藏移动端的窗口控制按钮                               |
| **UI 适配**             | 桌面宽屏布局                    | 移动端窄屏              | 增加 CSS Media Queries，调整 Sidebar 为抽屉式 (Drawer) |

## 4. 实施路线图 Implementation Roadmap

### 阶段一：环境搭建与基础运行

1.  安装 Capacitor: `npm install @capacitor/core @capacitor/cli`
2.  初始化: `npx cap init`
3.  构建前端: `npm run build`
4.  添加平台: `npx cap add android`, `npx cap add ios`
5.  **验证**: 在模拟器中运行，确认 IndexedDB 数据读写正常，界面可显示。

### 阶段二：平台服务抽象 (Platform Abstraction)

创建 `src/renderer/services/platform/` 目录，通过检测 `window.electron` 是否存在来切换实现：

```typescript
// 伪代码示例
import { Filesystem, Directory } from "@capacitor/filesystem";

export const saveImage = async (path: string, data: string) => {
  if (window.electron) {
    // Desktop: Call IPC
    return await window.electron.saveImageBase64(path, data);
  } else {
    // Mobile: Use Capacitor
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
    });
    return true;
  }
};
```

### 阶段三：WebDAV 移动端适配

修改 `webdav.ts`，在没有 `window.electron` 时，使用 `@capacitor/http` 发送请求。这对于绕过 WebView 的 CORS 限制至关重要。

### 阶段四：UI 响应式优化

1.  **Sidebar**: 在移动端改为点击汉堡菜单弹出（使用 Ant Design Vue 的 Drawer 或类似组件）。
2.  **列表项**: 增加行高，适配手指点击。
3.  **布局**: 隐藏不必要的快捷键提示和窗口拖拽区域。

## 5. 风险与注意事项

1.  **性能**: WebView 性能略低于原生，但在 Prompt 管理这种文本密集型应用中差异不明显。
2.  **iOS Store 审核**: 需要确保应用符合 App Store 审核指南（如不包含违规的 AI 生成内容等）。
3.  **FTS (全文搜索)**: 如果目前搜索依赖主进程的 SQLite FTS5，在移动端需改为前端纯 JS 搜索库（如 `Fuse.js`）或使用 `@capacitor-community/sqlite`。鉴于目前的架构看似是混合的，建议移动端优先使用轻量级 JS 搜索。

## 6. 总结

**非常有价值且低成本的改进。**
只需引入 Capacitor 并做少量的服务层抽象，即可复用现有 PromptHub 的强大功能，满足用户 "查看、复制、同步" 的核心移动端需求。
