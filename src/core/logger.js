import { config } from '../config.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, component, message, data) {
  if ((LEVELS[level] ?? 0) < currentLevel) return;
  const ts = new Date().toISOString();
  const line = `${ts} [${level.toUpperCase()}] [${component}] ${message}`;
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (data !== undefined) {
    consoleFn(line, data);
  } else {
    consoleFn(line);
  }
}

export const logger = {
  debug: (component, message, data) => log('debug', component, message, data),
  info:  (component, message, data) => log('info',  component, message, data),
  warn:  (component, message, data) => log('warn',  component, message, data),
  error: (component, message, data) => log('error', component, message, data),
};
