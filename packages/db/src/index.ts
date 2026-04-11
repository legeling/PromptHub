// Database adapter
export { default as DatabaseAdapter } from "./adapter";
export type { default as Database } from "./adapter";

// Schema
export { SCHEMA_TABLES, SCHEMA_INDEXES, SCHEMA } from "./schema";

// Initialization
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseEmpty,
  db,
} from "./init";
export type { InitDatabaseHooks } from "./init";

// DB classes
export { PromptDB } from "./prompt";
export { FolderDB } from "./folder";
export { SkillDB } from "./skill";
