/**
 * Structured logging utility
 * Outputs JSON logs in production, human-readable in development.
 * Drop-in replacement for console.log/warn/error with structured fields.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatLog(level, component, message, data) {
  if (IS_PRODUCTION) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...data
    };
    return JSON.stringify(entry);
  }
  // Dev mode: human-readable
  const dataStr = data && Object.keys(data).length ? ' ' + JSON.stringify(data) : '';
  return `[${component}] ${message}${dataStr}`;
}

function createLogger(component) {
  return {
    info(message, data) {
      console.log(formatLog('info', component, message, data));
    },
    warn(message, data) {
      console.warn(formatLog('warn', component, message, data));
    },
    error(message, data) {
      console.error(formatLog('error', component, message, data));
    },
    debug(message, data) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(formatLog('debug', component, message, data));
      }
    }
  };
}

module.exports = { createLogger };
