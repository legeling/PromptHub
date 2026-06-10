import { Menu, app, shell, BrowserWindow } from 'electron';

const PROMPTHUB_REPOSITORY_URL = 'https://github.com/legeling/PromptHub';
const PROMPTHUB_ISSUES_URL = `${PROMPTHUB_REPOSITORY_URL}/issues`;

/**
 * Create application menu
 * 创建应用菜单
 */
export function createMenu(): void {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  // Do not show application menu on Windows
  // Windows 下不显示菜单栏
  if (isWin) {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    // Application menu (macOS)
    // 应用菜单（macOS）
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // File menu
    // 文件菜单
    {
      label: '文件',
      submenu: [
        {
          label: '新建 Prompt',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu:new-prompt');
          },
        },
        { type: 'separator' },
        {
          label: '导入',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu:import');
          },
        },
        {
          label: '导出',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu:export');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit menu
    // 编辑菜单
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // View menu
    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Help menu
    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '文档',
          click: () => {
            shell.openExternal(PROMPTHUB_REPOSITORY_URL);
          },
        },
        {
          label: '报告问题',
          click: () => {
            shell.openExternal(PROMPTHUB_ISSUES_URL);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
