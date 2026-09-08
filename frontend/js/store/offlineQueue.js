// =====================================================================
// offlineQueue.js — Offline operation outbox with IndexedDB
// =====================================================================
// FASE 11 — Offline outbox + synchronization.
//
// When the POS loses connection to the server, operations that would
// normally go to the API are stored in an IndexedDB outbox. When the
// connection is restored, the outbox is replayed to the server.
//
// Each operation has:
//   - UUID (idempotency key — server deduplicates)
//   - Method + Path + Body (the HTTP request)
//   - Status: PENDING, SYNCING, SYNCED, FAILED, CONFLICT
//   - CreatedAt, SyncedAt
//   - Retry count + last error
//
// Conflict policy: server-wins. If the server returns 409 (conflict),
// the operation is marked as CONFLICT and the user is notified.
//
// Usage:
//   OfflineQueue.init();
//   const result = await OfflineQueue.enqueue('POST', '/api/tickets', body);
//   // If online: sends immediately. If offline: stores in outbox.
//   // Returns { synced: true/false, data?: ..., error?: ... }
// =====================================================================

const OfflineQueue = {
  _db: null,
  _DB_NAME: 'sambapos_offline',
  _DB_VERSION: 1,
  _STORE_NAME: 'outbox',

  async init() {
    if (!('indexedDB' in window)) {
      console.warn('[offline] IndexedDB not available — offline queue disabled');
      return false;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._DB_NAME, this._DB_VERSION);

      request.onerror = () => {
        console.error('[offline] IndexedDB open error:', request.error);
        resolve(false);
      };

      request.onsuccess = () => {
        this._db = request.result;
        console.log('[offline] IndexedDB ready');
        // Start sync loop if online
        if (navigator.onLine) {
          this.syncAll();
        }
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this._STORE_NAME)) {
          const store = db.createObjectStore(this._STORE_NAME, { keyPath: 'uuid' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  },

  /**
   * Enqueue an operation. If online, sends immediately. If offline, stores.
   * @param {string} method — HTTP method (POST, PUT, PATCH, DELETE)
   * @param {string} path — API path (e.g., '/api/tickets')
   * @param {Object} [body] — Request body
   * @param {Object} [options] — { idempotencyKey, timeout }
   * @returns {Promise<{synced: boolean, data?: *, error?: string, uuid: string}>}
   */
  async enqueue(method, path, body = null, options = {}) {
    const uuid = options.idempotencyKey || this._generateUUID();
    const operation = {
      uuid,
      method,
      path,
      body: body ? JSON.stringify(body) : null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      syncedAt: null,
      retryCount: 0,
      lastError: null,
    };

    // If online, try to send immediately
    if (navigator.onLine) {
      try {
        const result = await this._sendOperation(operation);
        return { synced: true, data: result, uuid };
      } catch (err) {
        // Failed — store in outbox for retry
        operation.status = 'PENDING';
        operation.lastError = err.message;
        await this._store(operation);
        return { synced: false, error: err.message, uuid };
      }
    }

    // Offline — store in outbox
    await this._store(operation);
    console.log('[offline] Operation queued:', uuid, method, path);
    return { synced: false, uuid };
  },

  /**
   * Sync all pending operations. Called when connection is restored.
   */
  async syncAll() {
    if (!this._db) return;
    if (!navigator.onLine) return;

    const operations = await this._getAllByStatus('PENDING');
    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    for (const op of operations) {
      try {
        op.status = 'SYNCING';
        await this._update(op);

        const result = await this._sendOperation(op);
        op.status = 'SYNCED';
        op.syncedAt = new Date().toISOString();
        op.result = JSON.stringify(result).slice(0, 5000);
        await this._update(op);
        synced++;

        // Notify the app that this operation was synced
        window.dispatchEvent(new CustomEvent('offline:synced', {
          detail: { uuid: op.uuid, method: op.method, path: op.path, data: result },
        }));
      } catch (err) {
        op.retryCount++;
        op.lastError = err.message;

        if (err.status === 409) {
          op.status = 'CONFLICT';
          conflicts++;
          window.dispatchEvent(new CustomEvent('offline:conflict', {
            detail: { uuid: op.uuid, error: err.message },
          }));
        } else if (op.retryCount >= 5) {
          op.status = 'FAILED';
          failed++;
          window.dispatchEvent(new CustomEvent('offline:failed', {
            detail: { uuid: op.uuid, error: err.message },
          }));
        } else {
          op.status = 'PENDING';
          failed++;
        }
        await this._update(op);
      }
    }

    // Clean up old SYNCED operations (older than 1 hour)
    await this._cleanupSynced();

    if (synced > 0 || failed > 0 || conflicts > 0) {
      console.log(`[offline] Sync complete: ${synced} synced, ${failed} failed, ${conflicts} conflicts`);
      window.dispatchEvent(new CustomEvent('offline:sync-complete', {
        detail: { synced, failed, conflicts, total: operations.length },
      }));
    }

    return { synced, failed, conflicts, total: operations.length };
  },

  /**
   * Get all pending operations (for UI display).
   */
  async getPending() {
    return this._getAllByStatus('PENDING');
  },

  /**
   * Get all failed operations.
   */
  async getFailed() {
    return this._getAllByStatus('FAILED');
  },

  /**
   * Cancel a pending operation (remove from outbox).
   */
  async cancel(uuid) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction([this._STORE_NAME], 'readwrite');
      tx.objectStore(this._STORE_NAME).delete(uuid);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  // === Private methods ===

  async _sendOperation(op) {
    const headers = {
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('samba_jwt');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Add idempotency key header
    headers['X-Idempotency-Key'] = op.uuid;

    const res = await fetch(op.path, {
      method: op.method,
      headers,
      body: op.body || undefined,
    });

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
      err.status = res.status;
      try {
        const json = await res.json();
        err.message = json.message || err.message;
      } catch {}
      throw err;
    }

    return res.json();
  },

  _generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  _store(operation) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction([this._STORE_NAME], 'readwrite');
      tx.objectStore(this._STORE_NAME).put(operation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  _update(operation) {
    return this._store(operation);
  },

  _getAllByStatus(status) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction([this._STORE_NAME], 'readonly');
      const index = tx.objectStore(this._STORE_NAME).index('status');
      const request = index.getAll(status);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async _cleanupSynced() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const allSynced = await new Promise((resolve, reject) => {
      const tx = this._db.transaction([this._STORE_NAME], 'readonly');
      const index = tx.objectStore(this._STORE_NAME).index('status');
      const request = index.getAll('SYNCED');
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    for (const op of allSynced) {
      if (op.syncedAt && op.syncedAt < oneHourAgo) {
        await new Promise((resolve) => {
          const tx = this._db.transaction([this._STORE_NAME], 'readwrite');
          tx.objectStore(this._STORE_NAME).delete(op.uuid);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      }
    }
  },
};

window.OfflineQueue = OfflineQueue;

// Auto-sync when connection is restored
window.addEventListener('online', () => {
  console.log('[offline] Connection restored — syncing outbox');
  OfflineQueue.syncAll();
});
