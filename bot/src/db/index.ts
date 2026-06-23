import { config } from "../config";
import { db } from "./client";

/**
 * Bring up the data layer. Importing this module already opens the database and
 * runs migrations (via ./client); `initDb()` just makes that explicit at boot
 * and logs where the database lives.
 */
export function initDb() {
  console.log(`[scribe] SQLite ready at ${config.dbPath}`);
  return db;
}

export { db, createDb, q } from "./client";
export { SCHEMA_SQL, migrate } from "./schema";
export * from "./repos";
