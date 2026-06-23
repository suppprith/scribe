import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { config } from "../config";
import { migrate } from "./schema";

/**
 * Open a SQLite database at `path`, apply pragmas, and run the (idempotent)
 * migration so the schema exists before any query is prepared. Pass ":memory:"
 * for an ephemeral database (used in tests).
 */
export function createDb(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

/** The application's shared connection, opened at the configured DB_PATH. */
export const db = createDb(config.dbPath);

/**
 * Prepare (and cache) a query against the shared connection with a typed row
 * result. Bindings stay positional; pass them to `.get()` / `.all()` / `.run()`.
 */
export function q<Row = unknown>(sql: string) {
  return db.query<Row, SQLQueryBindings[]>(sql);
}
