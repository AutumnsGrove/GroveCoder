/**
 * Logging utilities for GroveCoder
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const level = process.env['GROVECODER_LOG_LEVEL']?.toLowerCase();
  if (level && level in LOG_LEVELS) {
    return level as LogLevel;
  }
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (context && Object.keys(context).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, context));
    }
  },

  info(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, context));
    }
  },

  warn(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, context));
    }
  },

  error(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, context));
    }
  },
};
