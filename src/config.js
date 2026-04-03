import { join } from 'path';
import { homedir } from 'os';

const env = globalThis.Bun?.env ?? process.env;

const defaults = {
  journalDir: join(homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous'),
  dbPath: './data/colonisation.db',
  port: 3000,
  transport: 'sse',
  logLevel: 'info',
};

export const config = {
  journalDir:      env.ED_JOURNAL_DIR    ?? defaults.journalDir,
  dbPath:          env.DB_PATH           ?? defaults.dbPath,
  port:            Number(env.PORT       ?? defaults.port),
  transport:       env.TRANSPORT         ?? defaults.transport,
  logLevel:        env.LOG_LEVEL         ?? defaults.logLevel,
  // Optional: value of __Host-InaraUser cookie copied from your browser.
  // Inara grants higher rate limits and more reliable access to authenticated sessions.
  // Copy from DevTools → Application → Cookies → inara.cz → __Host-InaraUser
  inaraUserCookie: env.INARA_USER_COOKIE ?? null,
};
