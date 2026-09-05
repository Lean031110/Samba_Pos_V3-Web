// =====================================================================
// errorHandler.js — Centralized error handler
// =====================================================================
// Per Architect's directive:
//   - 400 for input validation failures
//   - 404 if resource not found
//   - 409 for state conflicts (e.g. table already occupied)
//   - 500 for internal server errors
//
// Usage:
//   throw new NotFoundError('Ticket 99 not found');
//   throw new ConflictError('Table 5 already has an open ticket');
//   throw new ValidationError('menuItemId is required');
// =====================================================================

class HttpError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
  }
}

class NotFoundError extends HttpError {
  constructor(message, details = null) { super(404, message, details); }
}

class ConflictError extends HttpError {
  constructor(message, details = null) { super(409, message, details); }
}

class ValidationError extends HttpError {
  constructor(message, details = null) { super(400, message, details); }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details = null) { super(401, message, details); }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) { super(403, message, details); }
}

/**
 * Convert any thrown error into a JSON HTTP response.
 * - HttpError subclasses: use their statusCode + message
 * - SQLITE_CONSTRAINT errors: 409 conflict
 * - Other Error: 500 internal server error
 */
function errorHandler(err, req, res, next) {
  // Skip if headers already sent (delegates to Express default handler)
  if (res.headersSent) return next(err);

  // Convert SQLite constraint violations to 409
  if (err.code === 'SQLITE_CONSTRAINT' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.errno === 19) {
    err = new ConflictError('Database constraint violation', {
      sqliteCode: err.code || 'SQLITE_CONSTRAINT',
    });
  }

  // Convert optimistic lock conflicts to 409
  if (err.message?.startsWith('OPTIMISTIC_LOCK_CONFLICT')) {
    err = new ConflictError(err.message, { type: 'optimistic_lock_conflict' });
  }

  const statusCode = err.statusCode || 500;
  const body = {
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
  };
  // Only expose details in non-production
  if (process.env.NODE_ENV !== 'production' && err.details) body.details = err.details;
  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = {
  HttpError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  errorHandler,
  notFoundHandler,
};
