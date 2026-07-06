import { config } from "../config";
import { createLogger } from "../log";
import { db } from "./client";

const log = createLogger("scribe.db");

/**
 * Bring up the data layer. Importing this module already opens the database and
 * runs migrations (via ./client); `initDb()` just makes that explicit at boot
 * and logs where the database lives.
 */
export function initDb() {
  log.info(`SQLite ready at ${config.dbPath}`);
  return db;
}

export { db, createDb, q } from "./client";
export { SCHEMA_SQL, migrate } from "./schema";
export * from "./repos";
