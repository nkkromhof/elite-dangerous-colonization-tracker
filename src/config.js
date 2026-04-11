import { join } from 'path';
import { homedir } from 'os';

const env = globalThis.Bun?.env ?? process.env;

const defaults = {
  journalDir: join(homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous'),
  dbPath: './data/colonisation.db',
  port: 3000,
  transport: 'sse',
  logLevel: 'info',
  spanshEnabled: true,
  spanshApiUrl: 'https://api.spansh.co.uk',
  spanshRequestDelayMs: 1000,
  spanshRetryDelayMs: 5000,
  spanshMaxRetries: 3,
  spanshSearchRangeLy: 500,
};

export const config = {
  journalDir:      env.ED_JOURNAL_DIR    ?? defaults.journalDir,
  dbPath:          env.DB_PATH           ?? defaults.dbPath,
  port:            Number(env.PORT       ?? defaults.port),
  transport:       env.TRANSPORT         ?? defaults.transport,
  logLevel:        env.LOG_LEVEL         ?? defaults.logLevel,
  spanshEnabled:   env.SPANSH_ENABLED    ?? defaults.spanshEnabled,
  spanshApiUrl:    env.SPANSH_API_URL    ?? defaults.spanshApiUrl,
  spanshRequestDelayMs: Number(env.SPANSH_REQUEST_DELAY_MS ?? defaults.spanshRequestDelayMs),
  spanshRetryDelayMs:   Number(env.SPANSH_RETRY_DELAY_MS   ?? defaults.spanshRetryDelayMs),
  spanshMaxRetries:     Number(env.SPANSH_MAX_RETRIES      ?? defaults.spanshMaxRetries),
  spanshSearchRangeLy:  Number(env.SPANSH_SEARCH_RANGE_LY  ?? defaults.spanshSearchRangeLy),
  // Optional: value of __Host-InaraUser cookie copied from your browser.
  // Inara grants higher rate limits and more reliable access to authenticated sessions.
  // Copy from DevTools → Application → Cookies → inara.cz → __Host-InaraUser
  inaraUserCookie: env.INARA_USER_COOKIE ?? null,
};
