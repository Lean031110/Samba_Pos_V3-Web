// =====================================================================
// PrinterManager.js — Real printer management with TCP transport
// =====================================================================
// Architecture:
//   PrinterManager
//     → PrinterProfile (from DB: Printers table)
//     → PrinterTemplate (from DB: PrinterTemplates table)
//     → EscPosRenderer (formats ticket → ESC/POS bytes)
//     → PrinterTransport (TCP, USB, Windows spooler)
//
// The PrinterManager:
//   1. Loads printer profiles from DB
//   2. Renders tickets to ESC/POS using templates
//   3. Sends bytes via the configured transport
//   4. Reports status (online/offline, errors)
//   5. Supports test prints
//   6. Supports routing: product → station → printer
// =====================================================================

const net = require('net');
const { db } = require('../../infrastructure/db/db');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

// =====================================================================
// EscPosRenderer — formats ticket data into ESC/POS bytes
// =====================================================================
class EscPosRenderer {
  constructor(options = {}) {
    this.charsPerLine = options.charsPerLine || 42;
    this.codePage = options.codePage || 857;
  }

  /**
   * Render a ticket into ESC/POS bytes.
   * @param {Object} ticket — full ticket with Orders, Payments, etc.
   * @param {Object} template — PrinterTemplate row (with Template text)
   * @returns {Buffer} ESC/POS bytes
   */
  render(ticket, template = null) {
    const bytes = [];
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;

    // Initialize printer
    bytes.push(ESC, 0x40);

    // Set code page
    bytes.push(ESC, 0x74, this.codePage);

    // Header
    this._addLine(bytes, `<L00>${ticket.TicketNumber || `#${ticket.Id}`}`, ESC, GS, LF);
    this._addLine(bytes, `<L00>${new Date(ticket.Date).toLocaleString()}`, ESC, GS, LF);
    if (ticket.LastModifiedUserName) {
      this._addLine(bytes, `<L00>Cashier: ${ticket.LastModifiedUserName}`, ESC, GS, LF);
    }
    if (ticket.TicketEntities?.length > 0) {
      const tableName = ticket.TicketEntities.map(e => e.EntityName).join(', ');
      this._addLine(bytes, `<L00>Table: ${tableName}`, ESC, GS, LF);
    }
    this._addSeparator(bytes, ESC, GS, LF);

    // Orders
    for (const order of (ticket.Orders || [])) {
      if (!order.CalculatePrice) continue;  // Skip voided/gifted
      const qty = Number(order.Quantity || 0);
      const price = Number(order.Price || 0);
      const lineTotal = (price * qty).toFixed(2);
      const portion = order.PortionName ? ` (${order.PortionName})` : '';
      const line = `${order.MenuItemName}${portion} x${qty}`;
      const priceStr = `$${lineTotal}`;
      this._addJustifiedLine(bytes, line, priceStr, ESC, GS, LF);

      // Order notes/tags
      if (order.Tag) {
        this._addLine(bytes, `<L00>  → ${order.Tag}`, ESC, GS, LF);
      }
    }

    this._addSeparator(bytes, ESC, GS, LF);

    // Totals
    const subtotal = Number(ticket.TotalAmount || 0);
    const remaining = Number(ticket.RemainingAmount || 0);
    const paid = subtotal - remaining;

    this._addLine(bytes, `<L00>Subtotal:  $${subtotal.toFixed(2)}`, ESC, GS, LF);

    // Payments
    for (const payment of (ticket.Payments || [])) {
      this._addLine(bytes, `<L00>Paid:      $${Number(payment.Amount || 0).toFixed(2)} (${payment.Name || ''})`, ESC, GS, LF);
    }

    if (remaining > 0) {
      this._addLine(bytes, `<L00>Remaining: $${remaining.toFixed(2)}`, ESC, GS, LF);
    } else {
      this._addLine(bytes, `<L00>Change:    $0.00`, ESC, GS, LF);
    }

    this._addSeparator(bytes, ESC, GS, LF);
    this._addLine(bytes, `<C00>Thank you!`, ESC, GS, LF);
    this._addLine(bytes, `<C00>${new Date().getFullYear()}`, ESC, GS, LF);

    // Feed + cut
    bytes.push(ESC, 0x64, 0x03);  // Feed 3 lines
    bytes.push(GS, 0x56, 0x42, 0x00);  // Full cut

    // Open cash drawer (always at the end)
    bytes.push(ESC, 0x70, 0x00, 0x19, 0xFA);  // ESC p 0 25 250

    return Buffer.from(bytes);
  }

  /**
   * Render a kitchen order for the kitchen printer.
   * @param {Object} kitchenOrder — KitchenOrder with Items
   * @returns {Buffer} ESC/POS bytes
   */
  renderKitchenOrder(kitchenOrder) {
    const bytes = [];
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;

    bytes.push(ESC, 0x40);  // Init

    // Header — kitchen order
    bytes.push(ESC, 0x61, 0x01);  // Center
    bytes.push(ESC, 0x21, 0x30);  // Double size
    this._pushString(bytes, `KITCHEN ORDER`);
    bytes.push(LF);
    bytes.push(ESC, 0x21, 0x00);  // Normal size

    this._addLine(bytes, `<L00>Ticket: #${kitchenOrder.TicketNumber || kitchenOrder.TicketId}`, ESC, GS, LF);
    if (kitchenOrder.TableName) {
      this._addLine(bytes, `<L00>Table: ${kitchenOrder.TableName}`, ESC, GS, LF);
    }
    this._addLine(bytes, `<L00>Time: ${new Date(kitchenOrder.CreatedAt).toLocaleTimeString()}`, ESC, GS, LF);
    this._addSeparator(bytes, ESC, GS, LF);

    // Items
    for (const item of (kitchenOrder.Items || [])) {
      bytes.push(ESC, 0x21, 0x10);  // Emphasized
      this._pushString(bytes, `${item.Quantity}x ${item.MenuItemName}`);
      bytes.push(LF);
      bytes.push(ESC, 0x21, 0x00);  // Normal
      if (item.PortionName) {
        this._addLine(bytes, `<L00>  Portion: ${item.PortionName}`, ESC, GS, LF);
      }
      if (item.Notes) {
        this._addLine(bytes, `<L00>  Notes: ${item.Notes}`, ESC, GS, LF);
      }
    }

    this._addSeparator(bytes, ESC, GS, LF);
    this._addLine(bytes, `<C00>*** ${kitchenOrder.State} ***`, ESC, GS, LF);

    // Cut
    bytes.push(ESC, 0x64, 0x02);
    bytes.push(GS, 0x56, 0x42, 0x00);

    return Buffer.from(bytes);
  }

  /**
   * Render a test print.
   * @returns {Buffer} ESC/POS bytes for a test print
   */
  renderTestPrint(printerName) {
    const bytes = [];
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;

    bytes.push(ESC, 0x40);  // Init
    bytes.push(ESC, 0x61, 0x01);  // Center
    bytes.push(ESC, 0x21, 0x30);  // Double size
    this._pushString(bytes, 'TEST PRINT');
    bytes.push(LF);
    bytes.push(ESC, 0x21, 0x00);  // Normal
    this._addLine(bytes, `<L00>Printer: ${printerName}`, ESC, GS, LF);
    this._addLine(bytes, `<L00>Time: ${new Date().toISOString()}`, ESC, GS, LF);
    this._addLine(bytes, `<L00>Chars/Line: ${this.charsPerLine}`, ESC, GS, LF);
    this._addSeparator(bytes, ESC, GS, LF);
    this._addLine(bytes, `<C00>If you can read this,`, ESC, GS, LF);
    this._addLine(bytes, `<C00>the printer is working!`, ESC, GS, LF);
    this._addSeparator(bytes, ESC, GS, LF);

    // Cash drawer test
    bytes.push(ESC, 0x70, 0x00, 0x19, 0xFA);

    // Cut
    bytes.push(ESC, 0x64, 0x02);
    bytes.push(GS, 0x56, 0x42, 0x00);

    return Buffer.from(bytes);
  }

  // === Private helpers ===

  _addLine(bytes, line, ESC, GS, LF) {
    // Parse tag prefix
    const match = line.match(/^<(\w+)>(.*)$/);
    if (match) {
      const tag = match[1];
      const content = match[2] || '';
      switch (tag) {
        case 'L00': case 'L': bytes.push(ESC, 0x61, 0x00); break;
        case 'C00': case 'C': bytes.push(ESC, 0x61, 0x01); break;
        case 'R00': case 'R': bytes.push(ESC, 0x61, 0x02); break;
        case 'F': this._addSeparator(bytes, ESC, GS, LF); return;
      }
      this._pushString(bytes, content);
      bytes.push(LF);
    } else {
      this._pushString(bytes, line);
      bytes.push(LF);
    }
  }

  _addJustifiedLine(bytes, left, right, ESC, GS, LF) {
    bytes.push(ESC, 0x61, 0x00);  // Left align
    const totalWidth = this.charsPerLine;
    const padding = Math.max(1, totalWidth - left.length - right.length);
    this._pushString(bytes, left + ' '.repeat(padding) + right);
    bytes.push(LF);
  }

  _addSeparator(bytes, ESC, GS, LF) {
    bytes.push(ESC, 0x61, 0x01);  // Center
    for (let i = 0; i < this.charsPerLine; i++) {
      bytes.push(0x2D);  // '-'
    }
    bytes.push(LF);
  }

  _pushString(bytes, str) {
    for (const ch of str) {
      bytes.push(ch.charCodeAt(0));
    }
  }
}

// =====================================================================
// TcpTransport — sends bytes via TCP to a network printer
// =====================================================================
class TcpTransport {
  constructor(host, port = 9100, timeout = 5000) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  /**
   * Send bytes to the printer via TCP.
   * @param {Buffer} data
   * @returns {Promise<{success: boolean, bytesSent: number, error?: string}>}
   */
  send(data) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let bytesSent = 0;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve({ success: false, bytesSent, error: `Timeout after ${this.timeout}ms` });
        }
      }, this.timeout);

      socket.connect(this.port, this.host, () => {
        socket.write(data, () => {
          bytesSent = data.length;
        });
      });

      socket.on('data', () => {
        // Some printers send ACK — we can close after receiving
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve({ success: true, bytesSent: data.length });
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve({ success: false, bytesSent, error: err.message });
        }
      });

      // Close after sending
      socket.end();
    });
  }

  /**
   * Test connectivity to the printer.
   * @returns {Promise<boolean>}
   */
  async test() {
    const result = await this.send(Buffer.from([0x1B, 0x40]));  // ESC @ — init
    return result.success;
  }
}

// =====================================================================
// PrinterManager — orchestrates rendering + transport
// =====================================================================
class PrinterManager {
  constructor() {
    this.transports = new Map();  // printerId → transport instance
  }

  /**
   * Get a printer profile from DB.
   * @param {number} printerId
   * @returns {Promise<Object>}
   */
  async getPrinter(printerId) {
    const printer = await db('Printers').where({ Id: printerId }).first();
    if (!printer) throw new NotFoundError(`Printer ${printerId} not found`);
    return printer;
  }

  /**
   * Get or create a transport for a printer.
   * @param {Object} printer — Printer row from DB
   * @returns {TcpTransport}
   */
  _getTransport(printer) {
    const key = printer.Id;
    if (!this.transports.has(key)) {
      // Parse ShareName as host:port (e.g., "192.168.1.100:9100")
      let host = printer.ShareName;
      let port = 9100;
      if (printer.ShareName?.includes(':')) {
        const parts = printer.ShareName.split(':');
        host = parts[0];
        port = parseInt(parts[1], 10) || 9100;
      }
      this.transports.set(key, new TcpTransport(host, port, 5000));
    }
    return this.transports.get(key);
  }

  /**
   * Print a ticket to a specific printer.
   * @param {number} printerId
   * @param {Object} ticket — full ticket with Orders, Payments
   * @returns {Promise<{success, bytesSent, error?}>}
   */
  async printTicket(printerId, ticket) {
    const printer = await this.getPrinter(printerId);
    const renderer = new EscPosRenderer({
      charsPerLine: printer.CharsPerLine || 42,
      codePage: printer.CodePage || 857,
    });

    // Load template if available
    let template = null;
    if (printer.PrinterTemplateId) {
      template = await db('PrinterTemplates').where({ Id: printer.PrinterTemplateId }).first();
    }

    const bytes = renderer.render(ticket, template);
    const transport = this._getTransport(printer);
    const result = await transport.send(bytes);

    return {
      ...result,
      printerId,
      printerName: printer.Name,
      bytesGenerated: bytes.length,
    };
  }

  /**
   * Print a kitchen order to a kitchen printer.
   * @param {number} printerId
   * @param {Object} kitchenOrder
   * @returns {Promise<{success, bytesSent, error?}>}
   */
  async printKitchenOrder(printerId, kitchenOrder) {
    const printer = await this.getPrinter(printerId);
    const renderer = new EscPosRenderer({
      charsPerLine: printer.CharsPerLine || 42,
      codePage: printer.CodePage || 857,
    });

    const bytes = renderer.renderKitchenOrder(kitchenOrder);
    const transport = this._getTransport(printer);
    const result = await transport.send(bytes);

    return {
      ...result,
      printerId,
      printerName: printer.Name,
      bytesGenerated: bytes.length,
    };
  }

  /**
   * Send a test print to a printer.
   * @param {number} printerId
   * @returns {Promise<{success, bytesSent, error?}>}
   */
  async testPrint(printerId) {
    const printer = await this.getPrinter(printerId);
    const renderer = new EscPosRenderer({
      charsPerLine: printer.CharsPerLine || 42,
      codePage: printer.CodePage || 857,
    });

    const bytes = renderer.renderTestPrint(printer.Name);
    const transport = this._getTransport(printer);
    const result = await transport.send(bytes);

    return {
      ...result,
      printerId,
      printerName: printer.Name,
    };
  }

  /**
   * Check if a printer is online.
   * @param {number} printerId
   * @returns {Promise<{online: boolean, latency?: number, error?: string}>}
   */
  async checkStatus(printerId) {
    const printer = await this.getPrinter(printerId);
    const transport = this._getTransport(printer);
    const start = Date.now();
    const result = await transport.test();
    const latency = Date.now() - start;

    return {
      online: result.success,
      latency: result.success ? latency : null,
      error: result.error,
      printerId,
      printerName: printer.Name,
    };
  }

  /**
   * Route a ticket to the correct printer based on PrinterMaps.
   * Each order can be routed to a different printer based on its MenuItemGroupCode.
   *
   * @param {Object} ticket — full ticket with Orders
   * @param {string} printJobName — 'Print Bill' or 'Print Orders to Kitchen Printer'
   * @returns {Promise<Array>} — array of print results
   */
  async routePrint(ticket, printJobName = 'Print Bill') {
    // Find the PrintJob by name
    const printJob = await db('PrintJobs').where({ Name: printJobName }).first();
    if (!printJob) throw new NotFoundError(`Print job "${printJobName}" not found`);

    // Find PrinterMaps for this PrintJob
    const maps = await db('PrinterMaps').where({ PrintJobId: printJob.Id });

    if (maps.length === 0) {
      throw new NotFoundError(`No printer mappings for "${printJobName}"`);
    }

    const results = [];

    // For bill printing: print the whole ticket to the first matching printer
    if (printJobName === 'Print Bill') {
      const map = maps[0];  // Use the first map for bill
      const result = await this.printTicket(map.PrinterId, ticket);
      results.push(result);
    } else {
      // For kitchen printing: route each order to its station's printer
      // Group orders by their kitchen station's printer
      const orderGroups = {};

      for (const order of (ticket.Orders || [])) {
        if (!order.CalculatePrice) continue;

        // Find the kitchen station for this order
        const menuItem = await db('MenuItems').where({ Id: order.MenuItemId }).first();
        if (!menuItem) continue;

        let routing = await db('KitchenStationRouting').where({ MenuItemId: order.MenuItemId });
        if (routing.length === 0 && menuItem.GroupCode) {
          routing = await db('KitchenStationRouting').where({ MenuItemGroupCode: menuItem.GroupCode });
        }

        for (const rule of routing) {
          const station = await db('KitchenStations').where({ Id: rule.KitchenStationId }).first();
          if (station?.PrinterId) {
            if (!orderGroups[station.PrinterId]) {
              orderGroups[station.PrinterId] = [];
            }
            orderGroups[station.PrinterId].push(order);
          }
        }
      }

      // Print to each printer
      for (const [printerId, orders] of Object.entries(orderGroups)) {
        // Create a minimal kitchen order object for rendering
        const kitchenOrder = {
          TicketId: ticket.Id,
          TicketNumber: ticket.TicketNumber,
          TableName: ticket.TicketEntities?.[0]?.EntityName || '',
          CreatedAt: new Date().toISOString(),
          State: 'NEW',
          Items: orders.map(o => ({
            Quantity: o.Quantity,
            MenuItemName: o.MenuItemName,
            PortionName: o.PortionName,
            Notes: o.Tag,
          })),
        };
        const result = await this.printKitchenOrder(parseInt(printerId, 10), kitchenOrder);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Clear cached transports (for when printer config changes).
   */
  clearCache() {
    this.transports.clear();
  }
}

module.exports = { PrinterManager, EscPosRenderer, TcpTransport };
