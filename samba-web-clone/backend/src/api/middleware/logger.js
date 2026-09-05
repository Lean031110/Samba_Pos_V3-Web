// =====================================================================
// logger.js — Request/response logger middleware
// =====================================================================
// Mirrors Samba.Services/Implementations/LogService.cs behavior:
//   - Logs every HTTP request with method, path, status, duration
//   - Logs errors with stack trace
// =====================================================================

const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG' };

function log(level, message, meta = {}) {
  const ts = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  const colors = {
    INFO: '\x1b[36m',   // cyan
    WARN: '\x1b[33m',   // yellow
    ERROR: '\x1b[31m',  // red
    DEBUG: '\x1b[90m',  // gray
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level]}[${ts}] [${level}]${reset} ${message}${metaStr}`);
}

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? LEVELS.ERROR
                : res.statusCode >= 400 ? LEVELS.WARN
                : LEVELS.INFO;
    log(level, `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
}

function errorLogger(err, req, res, next) {
  log(LEVELS.ERROR, `Unhandled error on ${req.method} ${req.originalUrl}`, {
    error: err.message,
    stack: err.stack,
  });
  next(err);
}

module.exports = { log, requestLogger, errorLogger, LEVELS };
