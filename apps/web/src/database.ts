import { getDatabase, initDatabase } from '@prompthub/db';
import { getDatabasePath } from './runtime-paths.js';

let initialized = false;

export function getServerDatabase() {
  if (!initialized) {
    initDatabase(getDatabasePath());
    initialized = true;
  }

  return getDatabase();
}
