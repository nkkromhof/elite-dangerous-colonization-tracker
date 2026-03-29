import { join } from 'path';
import { homedir } from 'os';

const defaults = {
  journalDir: join(homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous'),
  dbPath: './data/colonisation.db',
  port: 3000,
  spanshApiBase: 'https://spansh.co.uk/api',
  stationCacheTtlMs: 3_600_000,
  transport: 'sse',
  logLevel: 'info',
};

export const config = {
  journalDir: process.env.ED_JOURNAL_DIR ?? defaults.journalDir,
  dbPath:     process.env.DB_PATH         ?? defaults.dbPath,
  port:       Number(process.env.PORT     ?? defaults.port),
  spanshApiBase:     process.env.SPANSH_API_BASE    ?? defaults.spanshApiBase,
  stationCacheTtlMs: Number(process.env.CACHE_TTL   ?? defaults.stationCacheTtlMs),
  transport:  process.env.TRANSPORT       ?? defaults.transport,
  logLevel:   process.env.LOG_LEVEL       ?? defaults.logLevel,
};
