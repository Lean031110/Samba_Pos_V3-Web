// =====================================================================
// TicketService.js — Application service that orchestrates repos + domain
// =====================================================================
// Mirrors: Samba.Presentation.Services/Implementations/TicketModule/TicketService.cs
//
// The Express routes call this service, never the repos directly.
// =====================================================================

const { db, withTransaction } = require('../../infrastructure/db/db');
const { TicketRepository } = require('../../infrastructure/repositories/TicketRepository');
const { ProductRepository } = require('../../infrastructure/repositories/ProductRepository');
const { TableRepository } = require('../../infrastructure/repositories/TableRepository');
const { Ticket } = require('../../domain/Ticket');
const { TicketBuilder } = require('../../domain/TicketBuilder');
const { OrderBuilder } = require('../../domain/OrderBuilder');
const engine = require('../../domain/CalculationEngine');
const { recalculateTicket } = require('../../domain/TicketRecalculator');
const { NotFoundError, ConflictError, ValidationError } = require('../middleware/errorHandler');
const { publish, EventTopicNames } = require('../../application/eventBus');

const ticketRepo = new TicketRepository();
const productRepo = new ProductRepository();
const tableRepo = new TableRepository();

class TicketService {
  /**
   * Get all open tickets (IsClosed=0).
   * @returns {Promise<Array>}
   */
  async getOpenTickets() {
    return ticketRepo.getOpenTickets();
  }

  /**
   * Get a single ticket by ID, fully hydrated.
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async getTicketById(id) {
    const ticket = await ticketRepo.getTicketById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
    return ticket;
  }

  /**
   * Create a new ticket.
   * @param {{departmentId?: number, ticketTypeId?: number, tableId?: number}} data
   * @returns {Promise<Object>} the new ticket
   */
  async createTicket(data = {}) {
    const departmentId = data.departmentId || 1;  // default: Restaurant
    const ticketTypeId = data.ticketTypeId || 1;  // default: Ticket
    const tableId = data.tableId || null;

    // Look up reference data
    const department = await db('Departments').where({ Id: departmentId }).first();
    if (!department) throw new ValidationError(`Department ${departmentId} not found`);

    const ticketType = await db('TicketTypes').where({ Id: ticketTypeId }).first();
    if (!ticketType) throw new ValidationError(`TicketType ${ticketTypeId} not found`);

    // If a table is specified, check it's not already occupied
    if (tableId) {
      const openTickets = await ticketRepo.getOpenTicketIds(tableId);
      if (openTickets.length > 0) {
        throw new ConflictError(
          `Table ${tableId} already has an open ticket (id=${openTickets[0]})`,
          { openTicketIds: openTickets }
        );
      }
    }

    // Look up the SALE AccountTransactionType
    const saleTxnType = await db('AccountTransactionTypes')
      .where({ Id: ticketType.SaleTransactionTypeId }).first();

    // Build the ticket via fluent builder
    const ticket = TicketBuilder.create(
      { ...ticketType, TaxIncluded: ticketType.TaxIncluded ? true : false },
      department
    ).withExchangeRate(1).build();

    // Link table if specified
    if (tableId) {
      const table = await db('Entities').where({ Id: tableId }).first();
      if (table) {
        const entityType = await db('EntityTypes').where({ Id: table.EntityTypeId }).first();
        ticket.TicketEntities.push({
          EntityTypeId: table.EntityTypeId,
          EntityId: table.Id,
          AccountId: table.AccountId || 0,
          AccountTypeId: entityType?.AccountTypeId || 0,
          EntityName: table.Name,
          EntityCustomData: null,
        });
        // Update table state to "New Orders"
        await tableRepo.updateEntityState(tableId, 'Status', 'New Orders', '');
      }
    }

    // Persist
    const ticketId = await ticketRepo.saveTicket(ticket);
    const saved = await ticketRepo.getTicketById(ticketId);

    // Publish event
    publish(EventTopicNames.TicketCreated, { Ticket: saved });

    return saved;
  }

  /**
   * Add an order to an existing ticket.
   * @param {number} ticketId
   * @param {{menuItemId: number, quantity?: number, portionName?: string}} data
   */
  async addOrder(ticketId, data) {
    if (!data.menuItemId) throw new ValidationError('menuItemId is required');

    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const menuItem = await productRepo.getMenuItemById(data.menuItemId);
    if (!menuItem) throw new NotFoundError(`MenuItem ${data.menuItemId} not found`);

    const taxTemplates = await productRepo.getTaxTemplates(data.menuItemId);

    const department = await db('Departments').where({ Id: ticketRow.DepartmentId }).first();
    const ticketType = await db('TicketTypes').where({ Id: ticketRow.TicketTypeId }).first();
    const saleTxnType = await db('AccountTransactionTypes')
      .where({ Id: ticketType.SaleTransactionTypeId }).first();

    // Build the Ticket domain object from DB row
    const ticket = new Ticket(ticketRow);

    // Build the Order via OrderBuilder
    const order = OrderBuilder.create()
      .forMenuItem(menuItem)
      .withPortion(menuItem.Portions.find(p => p.Name === data.portionName) || menuItem.Portions[0])
      .withUserName('Administrator')
      .withTaxTemplates(taxTemplates)
      .withAccountTransactionType(saleTxnType)
      .withDepartment(department)
      .withQuantity(data.quantity || 1)
      .build();

    // Add the order to the ticket (this triggers recalc + eventBus)
    ticket.addOrder(order, taxTemplates, saleTxnType, 'Administrator');

    // Persist
    ticket.Id = ticketId;
    await ticketRepo.saveTicket(ticket);
    const saved = await ticketRepo.getTicketById(ticketId);
    return saved;
  }

  /**
   * Add a calculation (discount/service/rounding) to a ticket.
   * @param {number} ticketId
   * @param {{calculationTypeId: number, amount: number}} data
   */
  async addCalculation(ticketId, data) {
    if (!data.calculationTypeId) throw new ValidationError('calculationTypeId is required');
    if (typeof data.amount !== 'number') throw new ValidationError('amount must be a number');

    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const calcType = await db('CalculationTypes').where({ Id: data.calculationTypeId }).first();
    if (!calcType) throw new NotFoundError(`CalculationType ${data.calculationTypeId} not found`);

    const accountTxnType = calcType.AccountTransactionTypeId
      ? await db('AccountTransactionTypes').where({ Id: calcType.AccountTransactionTypeId }).first()
      : null;

    const ticket = new Ticket(ticketRow);
    ticket.addCalculation(calcType, data.amount, accountTxnType);

    ticket.Id = ticketId;
    await ticketRepo.saveTicket(ticket);
    return await ticketRepo.getTicketById(ticketId);
  }

  /**
   * Process a payment on a ticket.
   * @param {number} ticketId
   * @param {{paymentTypeId: number, amount: number, tenderedAmount?: number}} data
   */
  async addPayment(ticketId, data) {
    if (!data.paymentTypeId) throw new ValidationError('paymentTypeId is required');
    if (typeof data.amount !== 'number' || data.amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const paymentType = await db('PaymentTypes').where({ Id: data.paymentTypeId }).first();
    if (!paymentType) throw new NotFoundError(`PaymentType ${data.paymentTypeId} not found`);

    const accountTxnType = await db('AccountTransactionTypes')
      .where({ Id: paymentType.AccountTransactionTypeId }).first();
    const account = paymentType.AccountId
      ? await db('Accounts').where({ Id: paymentType.AccountId }).first()
      : null;

    const ticket = new Ticket(ticketRow);
    ticket.addPayment(
      { ...paymentType, AccountTransactionType: accountTxnType },
      account,
      data.amount,
      ticketRow.ExchangeRate || 1,
      1  // userId=1 (admin) — TODO: read from auth context
    );

    ticket.Id = ticketId;
    await ticketRepo.saveTicket(ticket);
    return await ticketRepo.getTicketById(ticketId);
  }

  /**
   * Close a ticket.
   * @param {number} ticketId
   */
  async closeTicket(ticketId) {
    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const ticket = new Ticket(ticketRow);

    // Verify the ticket can be closed
    if (!ticket.canCloseTicket()) {
      throw new ConflictError(
        `Ticket ${ticketId} cannot be closed: remaining amount ${ticket.RemainingAmount} > 0`,
        { remainingAmount: ticket.RemainingAmount }
      );
    }

    // Assign ticket number if not yet assigned
    if (!ticket.TicketNumber) {
      const ticketType = await db('TicketTypes').where({ Id: ticketRow.TicketTypeId }).first();
      const ticketNumber = await ticketRepo.getNextNumeratorString(ticketType.TicketNumeratorId);
      ticket.TicketNumber = ticketNumber;
    }

    // Lock + close
    ticket.lockTicket();
    ticket.close();

    ticket.Id = ticketId;
    await ticketRepo.saveTicket(ticket);

    // Release any linked tables
    for (const te of ticket.TicketEntities) {
      await tableRepo.updateEntityState(te.EntityId, 'Status', 'Available', '');
    }

    const saved = await ticketRepo.getTicketById(ticketId);

    // Publish TicketClosed event
    publish(EventTopicNames.TicketClosed, { Ticket: saved });

    return saved;
  }

  /**
   * Generate a print preview (mock ESC/POS in base64).
   * @param {number} ticketId
   * @returns {Promise<{ticket: Object, escposBase64: string, formatted: string}>}
   */
  async printTicket(ticketId) {
    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);

    // Load orders, payments, etc. are already included in ticketRow
    const lines = this._formatTicketForPrint(ticketRow);
    const escposBytes = this._generateEscPosBytes(lines);
    const escposBase64 = Buffer.from(escposBytes).toString('base64');

    return {
      ticket: ticketRow,
      formatted: lines.join('\n'),
      escposBase64,
      escposBytesCount: escposBytes.length,
    };
  }

  /**
   * Format ticket as a list of text lines (mirrors PrinterTemplate output).
   */
  _formatTicketForPrint(ticket) {
    const lines = [];
    lines.push(`<L00>Ticket: ${ticket.TicketNumber || '(unnumbered)'}`);
    lines.push(`<L00>Date: ${ticket.Date}`);
    if (ticket.LastModifiedUserName) {
      lines.push(`<L00>Cashier: ${ticket.LastModifiedUserName}`);
    }
    lines.push(`<F>`);
    for (const order of (ticket.Orders || [])) {
      const price = Number(order.Price || 0).toFixed(2);
      const qty = Number(order.Quantity || 0);
      const lineTotal = (Number(order.Price) * qty).toFixed(2);
      lines.push(`<J00>${order.MenuItemName} x${qty} ${order.PortionName || ''}|${lineTotal}`);
    }
    lines.push(`<F>`);
    lines.push(`<J00>Subtotal|${Number(ticket.TotalAmount || 0).toFixed(2)}`);
    lines.push(`<J00>Remaining|${Number(ticket.RemainingAmount || 0).toFixed(2)}`);
    lines.push(`<F>`);
    lines.push(`<C00>Thank you!`);
    lines.push(`<cut>`);
    return lines;
  }

  /**
   * Generate mock ESC/POS bytes from formatted lines.
   * Mirrors: Samba.Services/Implementations/PrinterModule/Tools/LinePrinter.cs
   */
  _generateEscPosBytes(lines) {
    const bytes = [];
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;

    // Initialize printer
    bytes.push(ESC, 0x40);  // ESC @ — initialize

    for (const line of lines) {
      if (line.startsWith('<')) {
        // Parse tag
        const match = line.match(/^<(\w+)>(.*)$/);
        if (match) {
          const tag = match[1];
          const content = match[2] || '';
          switch (tag) {
            case 'L00':  // left-aligned
              bytes.push(ESC, 0x61, 0x00);  // ESC a 0
              break;
            case 'C00':  // centered
              bytes.push(ESC, 0x61, 0x01);  // ESC a 1
              break;
            case 'R00':  // right-aligned
              bytes.push(ESC, 0x61, 0x02);  // ESC a 2
              break;
            case 'J00':  // justified (we just left-align for the mock)
              bytes.push(ESC, 0x61, 0x00);
              break;
            case 'F':    // horizontal rule
              bytes.push(ESC, 0x61, 0x01);
              for (let i = 0; i < 42; i++) bytes.push(0x2D);  // 42 dashes
              bytes.push(LF);
              continue;
            case 'cut':
              bytes.push(ESC, 0x64, 0x01);  // ESC d 1 — feed 1 line
              bytes.push(GS, 0x56, 0x42, 0x00);  // GS V 66 0 — full cut
              continue;
            case 'beep':
              bytes.push(ESC, 0x42, 0x03, 0x05);  // ESC B 3 5
              continue;
            case 'drawer':
              bytes.push(ESC, 0x70, 0x00, 0x19, 0xFA);  // ESC p 0 25 250
              continue;
          }
          // Write content
          for (const ch of content) bytes.push(ch.charCodeAt(0));
          bytes.push(LF);
        }
      } else {
        // Plain line
        for (const ch of line) bytes.push(ch.charCodeAt(0));
        bytes.push(LF);
      }
    }
    return Buffer.from(bytes);
  }
}

module.exports = { TicketService };
