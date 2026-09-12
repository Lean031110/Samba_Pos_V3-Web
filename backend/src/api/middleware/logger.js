// =====================================================================
// logger.js — Request/response logger middleware with request IDs
// =====================================================================
// Mirrors Samba.Services/Implementations/LogService.cs behavior:
//   - Logs every HTTP request with method, path, status, duration
//   - Logs errors with stack trace
//   - Generates request IDs for tracing (Fase 18)
//   - Exposes /metrics endpoint data (in-memory counters)
// =====================================================================

const crypto = require('crypto');

const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG' };

// In-memory metrics counters (reset on restart)
const metrics = {
  requests: { total: 0, byStatus: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 } },
  errors: { total: 0, byType: {} },
  startTime: Date.now(),
};

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
  const reqId = meta.requestId ? `[${meta.requestId}] ` : '';
  console.log(`${colors[level]}[${ts}] [${level}]${reset} ${reqId}${message}${metaStr}`);
}

function requestLogger(req, res, next) {
  const start = Date.now();
  // Generate request ID for tracing
  req.requestId = crypto.randomBytes(8).toString('hex');
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? LEVELS.ERROR
                : res.statusCode >= 400 ? LEVELS.WARN
                : LEVELS.INFO;

    // Update metrics
    metrics.requests.total++;
    const statusClass = Math.floor(res.statusCode / 100) + 'xx';
    if (metrics.requests.byStatus[statusClass] !== undefined) {
      metrics.requests.byStatus[statusClass]++;
    }
    if (res.statusCode >= 500) {
      metrics.errors.total++;
      const errType = res.statusCode === 500 ? 'internal' : 'server';
      metrics.errors.byType[errType] = (metrics.errors.byType[errType] || 0) + 1;
    }

    log(level, `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`, {
      requestId: req.requestId,
    });
  });
  next();
}

function errorLogger(err, req, res, next) {
  log(LEVELS.ERROR, `Unhandled error on ${req.method} ${req.originalUrl}`, {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId || null,
  });
  next(err);
}

function getMetrics() {
  const uptime = Date.now() - metrics.startTime;
  return {
    uptimeSeconds: Math.floor(uptime / 1000),
    uptimeHuman: formatUptime(uptime),
    requests: metrics.requests,
    errors: metrics.errors,
    startTime: new Date(metrics.startTime).toISOString(),
  };
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

module.exports = { log, requestLogger, errorLogger, LEVELS, getMetrics };
