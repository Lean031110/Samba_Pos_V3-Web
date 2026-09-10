// =====================================================================
// MockTcpServer.js — Printer hardware simulation for CI/testing
// =====================================================================
// BLOQUE F — Fase 6: Printer Gateway (P0 gate)
//
// The P0 gate in docs/PRODUCTION_GAP_MATRIX.md requires "probar con impresora
// térmica física (o driver real)". Since we don't have a physical printer in
// CI, this mock TCP server emulates a real ESC/POS printer.
//
// How it works:
//   - Listens on a configurable TCP port (default 9100, same as real printers)
//   - Accepts incoming connections from PrinterManager.TcpTransport
//   - Receives ESC/POS bytes and stores them in an in-memory buffer
//   - Exposes receivedBytes() / clearReceivedBytes() for tests to assert
//   - Emits 'data' events for real-time inspection
//   - Optionally simulates offline behavior (reject connections)
//   - Optionally simulates slow printer (delayed ACK)
//
// Usage in tests:
//   const mock = new MockTcpServer({ port: 9101 });
//   await mock.start();
//   // ... trigger a print job that targets host:9101 ...
//   const received = mock.receivedBytes();
//   assert.ok(received.includes(0x1B));  // ESC byte present
//   mock.stop();
//
// This is the closest we can get to "real hardware testing" in CI without
// a physical printer. The same ESC/POS bytes that would be sent to a
// real printer are sent to this mock, and we can assert on them.
// =====================================================================

const net = require('net');
const { EventEmitter } = require('events');

class MockTcpServer extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.port=9100] — TCP port to listen on
   * @param {string} [options.host='127.0.0.1'] — bind address
   * @param {boolean} [options.simulateOffline=false] — reject all connections
   * @param {number} [options.ackDelayMs=0] — delay before closing connection (simulates slow printer)
   * @param {boolean} [options.sendAck=false] — send an ACK byte (0x06) before closing
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 9100;
    this.host = options.host || '127.0.0.1';
    this.simulateOffline = options.simulateOffline || false;
    this.ackDelayMs = options.ackDelayMs || 0;
    this.sendAck = options.sendAck || false;
    this._server = null;
    this._connections = new Set();
    this._receivedChunks = [];
    this._totalBytesReceived = 0;
    this._connectionCount = 0;
  }

  /**
   * Start listening for TCP connections.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this._server = net.createServer((socket) => {
        this._connectionCount++;
        this._connections.add(socket);

        if (this.simulateOffline) {
          // Reject the connection immediately
          socket.destroy();
          return;
        }

        socket.on('data', (chunk) => {
          this._receivedChunks.push(Buffer.from(chunk));
          this._totalBytesReceived += chunk.length;
          this.emit('data', chunk);
        });

        socket.on('end', () => {
          if (this.ackDelayMs > 0) {
            setTimeout(() => {
              if (this.sendAck) socket.write(Buffer.from([0x06]));  // ACK
              socket.end();
            }, this.ackDelayMs);
          } else {
            if (this.sendAck) socket.write(Buffer.from([0x06]));
            socket.end();
          }
        });

        socket.on('error', (err) => {
          this.emit('socketError', err);
        });
      });

      this._server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use. Use a different port for the mock server.`));
        } else {
          reject(err);
        }
      });

      this._server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the server and close all connections.
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      if (!this._server) {
        resolve();
        return;
      }
      // Close all active connections
      for (const socket of this._connections) {
        try { socket.destroy(); } catch {}
      }
      this._connections.clear();
      this._server.close(() => {
        this._server = null;
        resolve();
      });
    });
  }

  /**
   * Get all bytes received since the server started (or since last clear).
   * @returns {Buffer}
   */
  receivedBytes() {
    return Buffer.concat(this._receivedChunks);
  }

  /**
   * Get the number of separate data chunks received (each TCP write = 1 chunk).
   * Useful for asserting that a print job was sent in a single write.
   * @returns {number}
   */
  chunkCount() {
    return this._receivedChunks.length;
  }

  /**
   * Get the total number of bytes received.
   * @returns {number}
   */
  totalBytesReceived() {
    return this._totalBytesReceived;
  }

  /**
   * Get the number of TCP connections that were established.
   * @returns {number}
   */
  connectionCount() {
    return this._connectionCount;
  }

  /**
   * Clear the received bytes buffer (does not reset connection count).
   */
  clearReceivedBytes() {
    this._receivedChunks = [];
    this._totalBytesReceived = 0;
  }

  /**
   * Reset all counters (received bytes + connection count).
   */
  reset() {
    this.clearReceivedBytes();
    this._connectionCount = 0;
  }

  /**
   * Check if a specific ESC/POS command sequence is present in the received bytes.
   * @param {number[]} sequence — e.g., [0x1B, 0x40] for ESC @ (init)
   * @returns {boolean}
   */
  containsSequence(sequence) {
    const buf = this.receivedBytes();
    const needle = Buffer.from(sequence);
    return buf.includes(needle);
  }

  /**
   * Get the address that this mock server is listening on, in host:port format
   * (compatible with Printer.ShareName field).
   * @returns {string}
   */
  address() {
    return `${this.host}:${this.port}`;
  }
}

module.exports = { MockTcpServer };
