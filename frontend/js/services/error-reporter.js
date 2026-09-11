// =====================================================================
// error-reporter.js — Frontend error capture + reporting
// =====================================================================
// Bloque 7 — Captures:
//   - window.onerror (uncaught errors)
//   - unhandledrejection (Promise rejections)
//   - console.error override (with stack)
//   - Custom reportError() API for app code
//
// Reporting:
//   - POST /api/errors  (debounced, batched, fire-and-forget)
//   - LocalStorage queue (max 50 events) if offline
//   - On next successful sync, flush the queue
//
// Each event includes:
//   { type, message, stack, url, line, col, userId, view, timestamp,
//     shell: { platform, formFactor, orientation }, userAgent, session }
// =====================================================================

(function () {
  'use strict';

  const ERROR_REPORTER = {
    endpoint: '/api/errors',
    queueKey: 'samba:errors:queue',
    maxQueue: 50,
    flushIntervalMs: 30000,    // flush every 30s
    batchSize: 10,             // max 10 per request
    _buffer: [],
    _flushTimer: null,
    _userId: null,
    _view: null,
    _session: null,
    _enabled: true,
    _initialized: false,
  };

  // -----------------------------------------------------------------
  // Init — installs global handlers
  // -----------------------------------------------------------------
  ERROR_REPORTER.init = function (opts) {
    if (this._initialized) return;
    this._initialized = true;
    opts = opts || {};
    if (opts.endpoint) this.endpoint = opts.endpoint;
    if (opts.disabled) { this._enabled = false; return; }

    // Persisted session id
    this._session = sessionStorage.getItem('samba:errors:session') ||
                    ('sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    sessionStorage.setItem('samba:errors:session', this._session);

    // Restore queued errors from localStorage
    this._restoreQueue();

    // 1. window.onerror — uncaught sync errors
    const prevOnerror = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      this.capture({
        type: 'uncaught',
        message: String(message),
        stack: error && error.stack ? error.stack : null,
        url: source || location.href,
        line: lineno || 0,
        col: colno || 0,
      });
      if (typeof prevOnerror === 'function') {
        return prevOnerror.apply(this, arguments);
      }
      return false; // don't suppress default browser logging
    };

    // 2. unhandledrejection — async errors
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.capture({
        type: 'unhandledrejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : null,
        url: location.href,
      });
    });

    // 3. console.error override — capture but keep original behavior
    const origError = console.error;
    console.error = (...args) => {
      // Capture but only as a low-priority event (no stack if primitive)
      const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
      const errArg = args.find(a => a instanceof Error);
      this.capture({
        type: 'console.error',
        message: msg,
        stack: errArg ? errArg.stack : null,
        url: location.href,
      });
      origError.apply(console, args);
    };

    // Start periodic flush
    this._flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);

    // Flush on page hide (mobile/tab switching)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('beforeunload', () => {
      this.flush();
    });

    console.log('[ErrorReporter] initialized — session:', this._session);
  };

  // -----------------------------------------------------------------
  // Set context — userId / current view
  // -----------------------------------------------------------------
  ERROR_REPORTER.setUserId = function (userId) {
    this._userId = userId;
  };

  ERROR_REPORTER.setView = function (viewName) {
    this._view = viewName;
  };

  // -----------------------------------------------------------------
  // Public API — capture any custom error/event
  // -----------------------------------------------------------------
  ERROR_REPORTER.reportError = function (errorOrMessage, context) {
    const err = errorOrMessage instanceof Error ? errorOrMessage : new Error(String(errorOrMessage));
    this.capture(Object.assign({
      type: 'manual',
      message: err.message,
      stack: err.stack,
      url: location.href,
    }, context || {}));
  };

  ERROR_REPORTER.capture = function (eventObj) {
    if (!this._enabled) return;
    const event = {
      id: 'err-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      userId: this._userId || null,
      view: this._view || null,
      session: this._session,
      shell: window.ANDROID_SHELL ? {
        platform: window.ANDROID_SHELL.platform,
        formFactor: window.ANDROID_SHELL.formFactor,
        orientation: window.ANDROID_SHELL.orientation,
      } : null,
      userAgent: navigator.userAgent,
      href: location.href,
      ...eventObj,
    };
    this._buffer.push(event);

    // Trim to last N
    if (this._buffer.length > this.maxQueue) {
      this._buffer = this._buffer.slice(-this.maxQueue);
    }

    // Persist immediately
    this._persistQueue();

    // Attempt immediate flush if online and buffer has items
    if (navigator.onLine && this._buffer.length >= 1) {
      // Debounced flush (don't fire 100 requests/sec)
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this.flush(), 1000);
    }
  };

  // -----------------------------------------------------------------
  // Flush — send batched errors to server
  // -----------------------------------------------------------------
  ERROR_REPORTER.flush = async function () {
    if (!this._enabled) return;
    if (this._buffer.length === 0) return;
    if (!navigator.onLine) return; // wait for next online

    const batch = this._buffer.slice(0, this.batchSize);
    try {
      const r = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        credentials: 'include',
      });
      if (r.ok) {
        // Remove flushed batch from buffer
        const flushedIds = new Set(batch.map(e => e.id));
        this._buffer = this._buffer.filter(e => !flushedIds.has(e.id));
        this._persistQueue();
      }
    } catch (e) {
      // Network error — keep in buffer, try later
      // (silent fail to avoid recursive error reporting)
    }
  };

  // -----------------------------------------------------------------
  // LocalStorage queue persistence
  // -----------------------------------------------------------------
  ERROR_REPORTER._persistQueue = function () {
    try {
      localStorage.setItem(this.queueKey, JSON.stringify(this._buffer));
    } catch (e) { /* quota exceeded — drop oldest */ }
  };

  ERROR_REPORTER._restoreQueue = function () {
    try {
      const raw = localStorage.getItem(this.queueKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this._buffer = arr.slice(-this.maxQueue);
        }
      }
    } catch (e) { /* corrupted — start fresh */ }
  };

  // Expose globally
  window.ErrorReporter = ERROR_REPORTER;

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ERROR_REPORTER.init());
  } else {
    ERROR_REPORTER.init();
  }
})();
