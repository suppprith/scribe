/**
 * Typed, validated configuration for the bot.
 *
 * The environment is read once at import time. If anything required is missing
 * or invalid, the process exits with a single readable message listing every
 * problem at once — never a deep runtime crash later. Import `config` from here
 * instead of reading `process.env` directly.
 */

export interface GoogleDriveConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  folderId?: string;
}

export interface BotConfig {
  /** Discord bot token (required). */
  discordToken: string;
  /** Application id, used to register slash commands (Phase 1). */
  discordClientId?: string;
  /** Restrict command registration to one guild during dev (Phase 1). */
  discordDevGuildId?: string;
  /** Base URL of the Python NLP service (server/). */
  nlpServiceUrl: string;
  /** Port for the WebSocket server that streams live captions to the client. */
  wsPort: number;
  /** Optional shared token clients must present to connect to the WebSocket. */
  wsAuthToken?: string;
  /** Port for the HTTP API the client reads sessions/transcripts from. */
  httpPort: number;
  /** Path to the SQLite database file. */
  dbPath: string;
  /** Google Drive OAuth2 credentials (required only once Phase 6 lands). */
  googleDrive: GoogleDriveConfig;
}

/** Thrown when the environment is missing or has invalid required values. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

/**
 * Build a typed config from an environment map. Pure and throwing — used
 * directly in tests; the module-level `config` wraps it with a clean exit.
 */
export function loadConfig(env: Env = process.env): BotConfig {
  const errors: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      errors.push(`  - ${name} is required but not set`);
      return "";
    }
    return value;
  };

  const optional = (name: string): string | undefined => {
    const value = env[name]?.trim();
    return value ? value : undefined;
  };

  const port = (name: string, fallback: number): number => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      errors.push(`  - ${name} must be an integer between 1 and 65535 (got "${raw}")`);
      return fallback;
    }
    return n;
  };

  const config: BotConfig = {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: optional("DISCORD_CLIENT_ID"),
    discordDevGuildId: optional("DISCORD_DEV_GUILD_ID"),
    nlpServiceUrl: optional("NLP_SERVICE_URL") ?? "http://localhost:8000",
    wsPort: port("WS_PORT", 8080),
    wsAuthToken: optional("WS_AUTH_TOKEN"),
    httpPort: port("HTTP_PORT", 8081),
    dbPath: optional("DB_PATH") ?? "./data/scribe.db",
    googleDrive: {
      clientId: optional("GOOGLE_DRIVE_CLIENT_ID"),
      clientSecret: optional("GOOGLE_DRIVE_CLIENT_SECRET"),
      refreshToken: optional("GOOGLE_DRIVE_REFRESH_TOKEN"),
      folderId: optional("GOOGLE_DRIVE_FOLDER_ID"),
    },
  };

  if (errors.length > 0) {
    throw new ConfigError(
      `[scribe] Invalid bot configuration:\n${errors.join("\n")}\n\n` +
        `Copy bot/.env.example to bot/.env and fill in the required values.`,
    );
  }

  return config;
}

function loadOrExit(): BotConfig {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const config: BotConfig = loadOrExit();
