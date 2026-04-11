/**
 * Re-export schema from @prompthub/db for backward compatibility.
 * Consumers that import from `./database/schema` will continue to work.
 */
export { SCHEMA_TABLES, SCHEMA_INDEXES, SCHEMA } from "@prompthub/db";
