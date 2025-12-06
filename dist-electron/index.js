"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const node_crypto = require("node:crypto");
const SCHEMA = `
-- Prompts 表
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  user_prompt TEXT NOT NULL,
  variables TEXT,
  tags TEXT,
  folder_id TEXT,
  images TEXT,
  is_favorite INTEGER DEFAULT 0,
  current_version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

-- 版本表
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT,
  user_prompt TEXT NOT NULL,
  variables TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  UNIQUE(prompt_id, version)
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_prompts_folder ON prompts(folder_id);
CREATE INDEX IF NOT EXISTS idx_prompts_updated ON prompts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(is_favorite);
CREATE INDEX IF NOT EXISTS idx_versions_prompt ON prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- 全文搜索 (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  title, description, system_prompt, user_prompt, tags,
  content='prompts', content_rowid='rowid'
);

-- FTS 触发器：插入
CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO prompts_fts(rowid, title, description, system_prompt, user_prompt, tags)
  VALUES (NEW.rowid, NEW.title, NEW.description, NEW.system_prompt, NEW.user_prompt, NEW.tags);
END;

-- FTS 触发器：删除
CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, title, description, system_prompt, user_prompt, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.system_prompt, OLD.user_prompt, OLD.tags);
END;

-- FTS 触发器：更新
CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, title, description, system_prompt, user_prompt, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.system_prompt, OLD.user_prompt, OLD.tags);
  INSERT INTO prompts_fts(rowid, title, description, system_prompt, user_prompt, tags)
  VALUES (NEW.rowid, NEW.title, NEW.description, NEW.system_prompt, NEW.user_prompt, NEW.tags);
END;
`;
const Database = require("better-sqlite3");
let db = null;
function getDbPath() {
  const userDataPath = electron.app.getPath("userData");
  return path.join(userDataPath, "prompthub.db");
}
function initDatabase() {
  if (db) return db;
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  try {
    const tableInfo = db.pragma("table_info(prompts)");
    const hasImages = tableInfo.some((col) => col.name === "images");
    if (!hasImages) {
      console.log("Migrating: Adding images column to prompts table");
      db.prepare("ALTER TABLE prompts ADD COLUMN images TEXT").run();
    }
  } catch (error) {
    console.error("Migration failed:", error);
  }
  console.log(`Database initialized at: ${dbPath}`);
  return db;
}
const IPC_CHANNELS = {
  // Prompt
  PROMPT_CREATE: "prompt:create",
  PROMPT_GET: "prompt:get",
  PROMPT_GET_ALL: "prompt:getAll",
  PROMPT_UPDATE: "prompt:update",
  PROMPT_DELETE: "prompt:delete",
  PROMPT_SEARCH: "prompt:search",
  PROMPT_COPY: "prompt:copy",
  // Version
  VERSION_GET_ALL: "version:getAll",
  VERSION_CREATE: "version:create",
  VERSION_ROLLBACK: "version:rollback",
  // Folder
  FOLDER_CREATE: "folder:create",
  FOLDER_GET_ALL: "folder:getAll",
  FOLDER_UPDATE: "folder:update",
  FOLDER_DELETE: "folder:delete",
  FOLDER_REORDER: "folder:reorder",
  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set"
};
function registerPromptIPC(db2) {
  electron.ipcMain.handle(IPC_CHANNELS.PROMPT_CREATE, async (_, data) => {
    return db2.create(data);
  });
  electron.ipcMain.handle(IPC_CHANNELS.PROMPT_GET, async (_, id) => {
    return db2.getById(id);
  });
  electron.ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL, async () => {
    return db2.getAll();
  });
  electron.ipcMain.handle(IPC_CHANNELS.PROMPT_UPDATE, async (_, id, data) => {
    return db2.update(id, data);
  });
  electron.ipcMain.handle(IPC_CHANNELS.PROMPT_DELETE, async (_, id) => {
    return db2.delete(id);
  });
  electron.ipcMain.handle(IPC_CHANNELS.PROMPT_SEARCH, async (_, query) => {
    return db2.search(query);
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.PROMPT_COPY,
    async (_, id, variables) => {
      const prompt = db2.getById(id);
      if (!prompt) return null;
      let content = prompt.userPrompt;
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }
      db2.incrementUsage(id);
      return content;
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.VERSION_GET_ALL, async (_, promptId) => {
    return db2.getVersions(promptId);
  });
  electron.ipcMain.handle(IPC_CHANNELS.VERSION_CREATE, async (_, promptId, note) => {
    return db2.createVersion(promptId, note);
  });
  electron.ipcMain.handle(IPC_CHANNELS.VERSION_ROLLBACK, async (_, promptId, version) => {
    return db2.rollback(promptId, version);
  });
}
function registerFolderIPC(db2) {
  electron.ipcMain.handle(IPC_CHANNELS.FOLDER_CREATE, async (_event, data) => {
    return db2.create(data);
  });
  electron.ipcMain.handle(IPC_CHANNELS.FOLDER_GET_ALL, async () => {
    return db2.getAll();
  });
  electron.ipcMain.handle(IPC_CHANNELS.FOLDER_UPDATE, async (_event, id, data) => {
    return db2.update(id, data);
  });
  electron.ipcMain.handle(IPC_CHANNELS.FOLDER_DELETE, async (_event, id) => {
    return db2.delete(id);
  });
  electron.ipcMain.handle(IPC_CHANNELS.FOLDER_REORDER, async (_event, ids) => {
    db2.reorder(ids);
    return true;
  });
}
const DEFAULT_SETTINGS = {
  theme: "system",
  language: "zh",
  autoSave: true
};
function registerSettingsIPC(db2) {
  electron.ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    const settings = { ...DEFAULT_SETTINGS };
    const stmt = db2.prepare("SELECT key, value FROM settings");
    const rows = stmt.all();
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings;
  });
  electron.ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, newSettings) => {
    const stmt = db2.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);
    const transaction = db2.transaction(() => {
      for (const [key, value] of Object.entries(newSettings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });
    transaction();
    return true;
  });
}
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
const rnds8Pool = new Uint8Array(256);
let poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    node_crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
const native = { randomUUID: node_crypto.randomUUID };
function _v4(options, buf, offset) {
  var _a;
  options = options || {};
  const rnds = options.random ?? ((_a = options.rng) == null ? void 0 : _a.call(options)) ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  return unsafeStringify(rnds);
}
function v4(options, buf, offset) {
  if (native.randomUUID && true && !options) {
    return native.randomUUID();
  }
  return _v4(options);
}
function registerImageIPC() {
  electron.ipcMain.handle("dialog:selectImage", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["jpg", "png", "gif", "jpeg", "webp"] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;
    }
    return [];
  });
  electron.ipcMain.handle("image:save", async (_event, filePaths) => {
    const userDataPath = electron.app.getPath("userData");
    const imagesDir = path.join(userDataPath, "images");
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const savedImages = [];
    for (const filePath of filePaths) {
      try {
        const ext = path.extname(filePath);
        const fileName = `${v4()}${ext}`;
        const destPath = path.join(imagesDir, fileName);
        fs.copyFileSync(filePath, destPath);
        savedImages.push(fileName);
      } catch (error) {
        console.error(`Failed to save image ${filePath}:`, error);
      }
    }
    return savedImages;
  });
  electron.ipcMain.handle("image:open", async (_event, fileName) => {
    const userDataPath = electron.app.getPath("userData");
    const imagePath = path.join(userDataPath, "images", fileName);
    try {
      await electron.shell.openPath(imagePath);
      return true;
    } catch (error) {
      console.error(`Failed to open image ${imagePath}:`, error);
      return false;
    }
  });
}
class PromptDB {
  constructor(db2) {
    this.db = db2;
  }
  /**
   * 创建 Prompt
   */
  create(data) {
    const id = v4();
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO prompts (
        id, title, description, system_prompt, user_prompt,
        variables, tags, folder_id, images, is_favorite, current_version,
        usage_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.title,
      data.description || null,
      data.systemPrompt || null,
      data.userPrompt,
      JSON.stringify(data.variables || []),
      JSON.stringify(data.tags || []),
      data.folderId || null,
      JSON.stringify(data.images || []),
      now,
      now
    );
    this.createVersion(id, "初始版本");
    return this.getById(id);
  }
  /**
   * 根据 ID 获取 Prompt
   */
  getById(id) {
    const stmt = this.db.prepare("SELECT * FROM prompts WHERE id = ?");
    const row = stmt.get(id);
    return row ? this.rowToPrompt(row) : null;
  }
  /**
   * 获取所有 Prompt
   */
  getAll() {
    const stmt = this.db.prepare("SELECT * FROM prompts ORDER BY updated_at DESC");
    const rows = stmt.all();
    return rows.map((row) => this.rowToPrompt(row));
  }
  /**
   * 更新 Prompt
   */
  update(id, data) {
    const prompt = this.getById(id);
    if (!prompt) return null;
    const now = Date.now();
    const updates = ["updated_at = ?"];
    const values = [now];
    if (data.title !== void 0) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.description !== void 0) {
      updates.push("description = ?");
      values.push(data.description);
    }
    if (data.systemPrompt !== void 0) {
      updates.push("system_prompt = ?");
      values.push(data.systemPrompt);
    }
    if (data.userPrompt !== void 0) {
      updates.push("user_prompt = ?");
      values.push(data.userPrompt);
    }
    if (data.variables !== void 0) {
      updates.push("variables = ?");
      values.push(JSON.stringify(data.variables));
    }
    if (data.tags !== void 0) {
      updates.push("tags = ?");
      values.push(JSON.stringify(data.tags));
    }
    if (data.folderId !== void 0) {
      updates.push("folder_id = ?");
      values.push(data.folderId);
    }
    if (data.images !== void 0) {
      updates.push("images = ?");
      values.push(JSON.stringify(data.images));
    }
    if (data.isFavorite !== void 0) {
      updates.push("is_favorite = ?");
      values.push(data.isFavorite ? 1 : 0);
    }
    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE prompts SET ${updates.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);
    if (data.systemPrompt !== void 0 || data.userPrompt !== void 0 || data.variables !== void 0) {
      this.createVersion(id);
    }
    return this.getById(id);
  }
  /**
   * 删除 Prompt
   */
  delete(id) {
    const stmt = this.db.prepare("DELETE FROM prompts WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
  /**
   * 搜索 Prompt
   */
  search(query) {
    let sql = "SELECT * FROM prompts WHERE 1=1";
    const params = [];
    if (query.keyword) {
      sql += " AND id IN (SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH ?)";
      params.push(query.keyword);
    }
    if (query.folderId) {
      sql += " AND folder_id = ?";
      params.push(query.folderId);
    }
    if (query.isFavorite !== void 0) {
      sql += " AND is_favorite = ?";
      params.push(query.isFavorite ? 1 : 0);
    }
    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(() => "tags LIKE ?").join(" OR ");
      sql += ` AND (${tagConditions})`;
      params.push(...query.tags.map((tag) => `%"${tag}"%`));
    }
    const sortBy = query.sortBy || "updatedAt";
    const sortOrder = query.sortOrder || "desc";
    const sortColumn = {
      title: "title",
      createdAt: "created_at",
      updatedAt: "updated_at",
      usageCount: "usage_count"
    }[sortBy];
    sql += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;
    if (query.limit) {
      sql += " LIMIT ?";
      params.push(query.limit);
      if (query.offset) {
        sql += " OFFSET ?";
        params.push(query.offset);
      }
    }
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map((row) => this.rowToPrompt(row));
  }
  /**
   * 增加使用次数
   */
  incrementUsage(id) {
    const stmt = this.db.prepare(
      "UPDATE prompts SET usage_count = usage_count + 1 WHERE id = ?"
    );
    stmt.run(id);
  }
  /**
   * 创建版本
   */
  createVersion(promptId, note) {
    const prompt = this.getById(promptId);
    if (!prompt) return null;
    const id = v4();
    const version = prompt.currentVersion;
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO prompt_versions (
        id, prompt_id, version, system_prompt, user_prompt, variables, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      promptId,
      version,
      prompt.systemPrompt || null,
      prompt.userPrompt,
      JSON.stringify(prompt.variables),
      note || null,
      now
    );
    this.db.prepare("UPDATE prompts SET current_version = current_version + 1 WHERE id = ?").run(promptId);
    return {
      id,
      promptId,
      version,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      variables: prompt.variables,
      note,
      createdAt: new Date(now).toISOString()
    };
  }
  /**
   * 获取所有版本
   */
  getVersions(promptId) {
    const stmt = this.db.prepare(
      "SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC"
    );
    const rows = stmt.all(promptId);
    return rows.map((row) => this.rowToVersion(row));
  }
  /**
   * 回滚到指定版本
   */
  rollback(promptId, version) {
    const stmt = this.db.prepare(
      "SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?"
    );
    const row = stmt.get(promptId, version);
    if (!row) return null;
    const versionData = this.rowToVersion(row);
    return this.update(promptId, {
      systemPrompt: versionData.systemPrompt,
      userPrompt: versionData.userPrompt,
      variables: versionData.variables
    });
  }
  /**
   * 数据库行转 Prompt 对象
   */
  rowToPrompt(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt,
      variables: JSON.parse(row.variables || "[]"),
      tags: JSON.parse(row.tags || "[]"),
      folderId: row.folder_id,
      images: JSON.parse(row.images || "[]"),
      isFavorite: row.is_favorite === 1,
      version: row.current_version,
      currentVersion: row.current_version,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  /**
   * 数据库行转 PromptVersion 对象
   */
  rowToVersion(row) {
    return {
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt,
      variables: JSON.parse(row.variables || "[]"),
      note: row.note,
      createdAt: row.created_at
    };
  }
}
class FolderDB {
  constructor(db2) {
    this.db = db2;
  }
  /**
   * 创建文件夹
   */
  create(data) {
    const id = v4();
    const now = Date.now();
    const maxOrder = this.db.prepare("SELECT MAX(sort_order) as max FROM folders WHERE parent_id IS ?").get(data.parentId || null);
    const order = ((maxOrder == null ? void 0 : maxOrder.max) ?? -1) + 1;
    const stmt = this.db.prepare(`
      INSERT INTO folders (id, name, icon, parent_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.name, data.icon || null, data.parentId || null, order, now);
    return this.getById(id);
  }
  /**
   * 根据 ID 获取文件夹
   */
  getById(id) {
    const stmt = this.db.prepare("SELECT * FROM folders WHERE id = ?");
    const row = stmt.get(id);
    return row ? this.rowToFolder(row) : null;
  }
  /**
   * 获取所有文件夹
   */
  getAll() {
    const stmt = this.db.prepare("SELECT * FROM folders ORDER BY sort_order ASC");
    const rows = stmt.all();
    return rows.map((row) => this.rowToFolder(row));
  }
  /**
   * 更新文件夹
   */
  update(id, data) {
    const folder = this.getById(id);
    if (!folder) return null;
    const updates = [];
    const values = [];
    if (data.name !== void 0) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.icon !== void 0) {
      updates.push("icon = ?");
      values.push(data.icon);
    }
    if (data.parentId !== void 0) {
      updates.push("parent_id = ?");
      values.push(data.parentId);
    }
    if (data.order !== void 0) {
      updates.push("sort_order = ?");
      values.push(data.order);
    }
    if (updates.length === 0) return folder;
    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE folders SET ${updates.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);
    return this.getById(id);
  }
  /**
   * 删除文件夹
   */
  delete(id) {
    const stmt = this.db.prepare("DELETE FROM folders WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
  /**
   * 重新排序文件夹
   */
  reorder(ids) {
    const stmt = this.db.prepare("UPDATE folders SET sort_order = ? WHERE id = ?");
    const transaction = this.db.transaction(() => {
      ids.forEach((id, index) => {
        stmt.run(index, id);
      });
    });
    transaction();
  }
  /**
   * 数据库行转 Folder 对象
   */
  rowToFolder(row) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      parentId: row.parent_id,
      order: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    };
  }
}
function registerAllIPC(db2) {
  const promptDB = new PromptDB(db2);
  const folderDB = new FolderDB(db2);
  registerPromptIPC(promptDB);
  registerFolderIPC(folderDB);
  registerSettingsIPC(db2);
  registerImageIPC();
}
function createMenu() {
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  if (isWin) {
    electron.Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    // 应用菜单（macOS）
    ...isMac ? [
      {
        label: electron.app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    // 文件菜单
    {
      label: "文件",
      submenu: [
        {
          label: "新建 Prompt",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            var _a;
            (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.webContents.send("menu:new-prompt");
          }
        },
        { type: "separator" },
        {
          label: "导入",
          accelerator: "CmdOrCtrl+I",
          click: () => {
            var _a;
            (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.webContents.send("menu:import");
          }
        },
        {
          label: "导出",
          accelerator: "CmdOrCtrl+E",
          click: () => {
            var _a;
            (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.webContents.send("menu:export");
          }
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    // 编辑菜单
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    // 视图菜单
    {
      label: "视图",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    // 帮助菜单
    {
      label: "帮助",
      submenu: [
        {
          label: "文档",
          click: () => {
            electron.shell.openExternal("https://github.com/xxx/PromptHub");
          }
        },
        {
          label: "报告问题",
          click: () => {
            electron.shell.openExternal("https://github.com/xxx/PromptHub/issues");
          }
        }
      ]
    }
  ];
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
function htmlToPlainText(html) {
  return html.replace(/<br\s*\/?>(?=\s*)/gi, "\n").replace(/<\/(p|div|h[1-6]|li|ul|ol|table|thead|tbody|tr)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<(p|div|h[1-6]|ul|ol|table|thead|tbody|tr)[^>]*>/gi, "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
function toSimpleInfo(info) {
  let releaseNotes = "";
  if (typeof info.releaseNotes === "string") {
    releaseNotes = htmlToPlainText(info.releaseNotes);
  } else if (Array.isArray(info.releaseNotes)) {
    releaseNotes = info.releaseNotes.map((n) => n.note ? htmlToPlainText(n.note) : "").filter(Boolean).join("\n\n");
  }
  if (releaseNotes.length > 1e3) {
    releaseNotes = releaseNotes.slice(0, 1e3) + "...";
  }
  return {
    version: info.version,
    releaseNotes,
    releaseDate: info.releaseDate
  };
}
let mainWindow$1 = null;
let autoUpdater = null;
async function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  const module2 = await import("electron-updater");
  autoUpdater = module2.autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  return autoUpdater;
}
async function initUpdater(win) {
  mainWindow$1 = win;
  const updater = await getAutoUpdater();
  updater.on("error", (error) => {
    console.error("Update error:", error);
    let message = error && error.message || String(error);
    if (message.includes("ZIP file not provided")) {
      message = "自动更新需要 ZIP 安装包，但当前版本的 Release 中没有对应的 ZIP 文件。请前往 GitHub Releases 页面手动下载安装，或等待下一个版本修复自动更新。";
    }
    sendStatusToWindow({
      status: "error",
      error: message
    });
  });
  updater.on("checking-for-update", () => {
    console.info("Checking for update...");
    sendStatusToWindow({ status: "checking" });
  });
  updater.on("update-available", (info) => {
    console.info("Update available:", info.version);
    sendStatusToWindow({
      status: "available",
      info: toSimpleInfo(info)
    });
  });
  updater.on("update-not-available", (info) => {
    console.info("Update not available, current version is latest");
    sendStatusToWindow({
      status: "not-available",
      info: toSimpleInfo(info)
    });
  });
  updater.on("download-progress", (progress) => {
    console.info(`Download progress: ${progress.percent.toFixed(2)}%`);
    sendStatusToWindow({
      status: "downloading",
      progress
    });
  });
  updater.on("update-downloaded", (info) => {
    console.info("Update downloaded:", info.version);
    sendStatusToWindow({
      status: "downloaded",
      info: toSimpleInfo(info)
    });
  });
}
function sendStatusToWindow(status) {
  if (mainWindow$1 && !mainWindow$1.isDestroyed()) {
    mainWindow$1.webContents.send("updater:status", status);
  }
}
function registerUpdaterIPC() {
  const isDev2 = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
  electron.ipcMain.handle("updater:version", () => {
    return electron.app.getVersion();
  });
  electron.ipcMain.handle("updater:check", async () => {
    if (isDev2) {
      return { success: false, error: "Update check disabled in development mode" };
    }
    try {
      const updater = await getAutoUpdater();
      const result = await updater.checkForUpdates();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("updater:download", async () => {
    if (isDev2) {
      return { success: false, error: "Download disabled in development mode" };
    }
    try {
      const updater = await getAutoUpdater();
      await updater.downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("updater:install", async () => {
    if (!isDev2) {
      const updater = await getAutoUpdater();
      updater.quitAndInstall(false, true);
    }
  });
}
let mainWindow = null;
let tray = null;
let minimizeToTray = false;
let isQuitting = false;
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-image",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);
const isDev = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
async function createWindow() {
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true
    },
    // Windows 使用无边框窗口，macOS 使用原生标题栏
    frame: isWin ? false : true,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 16, y: 16 } : void 0,
    // Windows 深色标题栏
    backgroundColor: "#1a1d23",
    show: true
  });
  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    console.log("Loading dev server:", devServerUrl);
    try {
      await mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools();
    } catch (error) {
      console.error("Failed to load dev server:", error);
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" || input.control && input.shift && input.key.toLowerCase() === "i" || input.meta && input.alt && input.key.toLowerCase() === "i") {
        event.preventDefault();
      }
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow == null ? void 0 : mainWindow.hide();
      return false;
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.ipcMain.on("window:minimize", () => {
  mainWindow == null ? void 0 : mainWindow.minimize();
});
electron.ipcMain.on("window:maximize", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow == null ? void 0 : mainWindow.maximize();
  }
});
electron.ipcMain.on("window:close", () => {
  mainWindow == null ? void 0 : mainWindow.close();
});
electron.ipcMain.on("app:setAutoLaunch", (_event, enabled) => {
  electron.app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false
  });
});
electron.ipcMain.on("app:setMinimizeToTray", (_event, enabled) => {
  minimizeToTray = enabled;
  if (enabled) {
    createTray();
  } else {
    destroyTray();
  }
});
function createMacTrayIcon() {
  let iconPath;
  if (isDev) {
    iconPath = path.join(__dirname, "../../resources/icon.iconset/icon_16x16@2x.png");
  } else {
    iconPath = path.join(process.resourcesPath, "icon.iconset/icon_16x16@2x.png");
  }
  const icon = electron.nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.error("Failed to load tray icon from:", iconPath);
    const altPath = isDev ? path.join(__dirname, "../../resources/icon.iconset/icon_32x32.png") : path.join(process.resourcesPath, "icon.iconset/icon_32x32.png");
    const altIcon = electron.nativeImage.createFromPath(altPath);
    altIcon.setTemplateImage(true);
    return altIcon.resize({ width: 18, height: 18 });
  }
  icon.setTemplateImage(true);
  return icon.resize({ width: 18, height: 18 });
}
function createTray() {
  if (tray) return;
  const isMac = process.platform === "darwin";
  try {
    let icon;
    if (isMac) {
      icon = createMacTrayIcon();
    } else {
      let iconPath;
      if (isDev) {
        iconPath = path.join(__dirname, "../../resources/icon.ico");
      } else {
        iconPath = path.join(process.resourcesPath, "icon.ico");
      }
      icon = electron.nativeImage.createFromPath(iconPath);
      icon = icon.resize({ width: 16, height: 16 });
    }
    tray = new electron.Tray(icon);
  } catch (e) {
    console.error("Failed to load tray icon:", e);
    let iconPath;
    if (isDev) {
      iconPath = path.join(__dirname, "../../resources/icon.iconset/icon_16x16@2x.png");
    } else {
      iconPath = path.join(process.resourcesPath, "icon.iconset/icon_16x16@2x.png");
    }
    const fallbackIcon = electron.nativeImage.createFromPath(iconPath);
    tray = new electron.Tray(fallbackIcon.resize({ width: 18, height: 18 }));
  }
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        mainWindow == null ? void 0 : mainWindow.show();
        mainWindow == null ? void 0 : mainWindow.focus();
      }
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        electron.app.quit();
      }
    }
  ]);
  tray.setToolTip("PromptHub");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow == null ? void 0 : mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow == null ? void 0 : mainWindow.show();
      mainWindow == null ? void 0 : mainWindow.focus();
    }
  });
}
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
electron.ipcMain.handle("dialog:selectFolder", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "选择数据目录"
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});
electron.ipcMain.handle("shell:openPath", async (_event, folderPath) => {
  let realPath = folderPath;
  if (folderPath.startsWith("~")) {
    realPath = folderPath.replace("~", electron.app.getPath("home"));
  } else if (folderPath.includes("%APPDATA%")) {
    realPath = folderPath.replace("%APPDATA%", electron.app.getPath("appData"));
  }
  try {
    await electron.shell.openPath(realPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
electron.ipcMain.handle("notification:show", async (_event, options) => {
  if (electron.Notification.isSupported()) {
    let iconPath;
    if (isDev) {
      iconPath = path.join(__dirname, "../../resources/icon.png");
    } else {
      iconPath = path.join(process.resourcesPath, "icon.png");
    }
    const notification = new electron.Notification({
      title: options.title,
      body: options.body,
      icon: iconPath
    });
    notification.show();
    return true;
  }
  return false;
});
electron.app.whenReady().then(async () => {
  electron.session.defaultSession.protocol.registerFileProtocol("local-image", (request, callback) => {
    let url = request.url.replace("local-image://", "");
    url = url.replace(/^\/+/, "");
    url = url.replace(/\/+$/, "");
    try {
      const decodedUrl = decodeURIComponent(url);
      const imagePath = path.join(electron.app.getPath("userData"), "images", decodedUrl);
      callback({ path: imagePath });
    } catch (error) {
      console.error("Failed to register protocol", error);
    }
  });
  const db2 = initDatabase();
  registerAllIPC(db2);
  createMenu();
  registerUpdaterIPC();
  await createWindow();
  if (!isDev && mainWindow) {
    initUpdater(mainWindow);
  }
  electron.app.on("activate", async () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  isQuitting = true;
});
function getMainWindow() {
  return mainWindow;
}
exports.getMainWindow = getMainWindow;
