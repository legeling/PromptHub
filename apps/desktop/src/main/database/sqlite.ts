/**
 * Re-export DatabaseAdapter from @prompthub/db for backward compatibility.
 * Consumers that `import Database from './database/sqlite'` will continue to work.
 *
 * We re-export the default from the actual adapter module (not the barrel) so that
 * the merged namespace (`DatabaseAdapter.Database`) is fully preserved.
 */
export { default } from "@prompthub/db/adapter";
