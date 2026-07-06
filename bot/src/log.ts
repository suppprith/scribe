/**
 * Structured, consistent logging for the bot — the TypeScript twin of the NLP
 * service's `app/logging.py`. Every line is `YYYY-MM-DD HH:MM:SS LEVEL [scope]
 * message`, so interleaved bot + service logs read as one stream and a failed
 * session is diagnosable from timestamps and scopes alone.
 *
 * Usage: `const log = createLogger("scribe.voice"); log.info("...")`.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function timestamp(): string {
  // Local time, matching Python's %Y-%m-%d %H:%M:%S.
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function emit(level: LogLevel, scope: string, message: string, args: unknown[]): void {
  const line = `${timestamp()} ${level.padEnd(7)} [${scope}] ${message}`;
  const sink = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
  sink(line, ...args);
}

/** Create a logger bound to a scope (e.g. "scribe.voice", "scribe.drive"). */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, ...args) => emit("DEBUG", scope, message, args),
    info: (message, ...args) => emit("INFO", scope, message, args),
    warn: (message, ...args) => emit("WARN", scope, message, args),
    error: (message, ...args) => emit("ERROR", scope, message, args),
  };
}
