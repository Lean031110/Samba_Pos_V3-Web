// =====================================================================
// TicketServiceExtended.js — Sprint 5 advanced operations
// =====================================================================
// Adds: note, gift, void, tags, split, refund, merge
// All operations use the existing CalculationEngine + TicketRecalculator
// so monetary math stays consistent.
// =====================================================================

const { db, withTransaction } = require('../../infrastructure/db/db');
const { TicketRepository } = require('../../infrastructure/repositories/TicketRepository');
const { Ticket } = require('../../domain/Ticket');
const { TicketBuilder } = require('../../domain/TicketBuilder');
const { OrderBuilder } = require('../../domain/OrderBuilder');
const engine = require('../../domain/CalculationEngine');
const { recalculateTicket } = require('../../domain/TicketRecalculator');
const { AccountTransaction } = require('../../domain/AccountTransaction');
const { NotFoundError, ConflictError, ValidationError } = require('../middleware/errorHandler');
const { publish, EventTopicNames } = require('../../application/eventBus');

const ticketRepo = new TicketRepository();

class TicketServiceExtended {
  // ===================================================================
  // NOTE — POST /api/tickets/:id/note
  // ===================================================================
  async setNote(ticketId, note) {
    if (typeof note !== 'string') throw new ValidationError('note must be a string');
    const ticket = await ticketRepo.getTicketById(ticketId);
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticket.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    await db('Tickets').where({ Id: ticketId }).update({
      Note: note || null,
      LastUpdateTime: new Date().toISOString(),
    });
    return ticketRepo.getTicketById(ticketId);
  }

  // ===================================================================
  // GIFT — POST /api/tickets/:id/gift
  // Marks an order as Gift (CalculatePrice=false) — excludes from totals.
  // Body: { orderId: number } or { orderIds: number[] }
  // ===================================================================
  async giftOrders(ticketId, orderIds) {
    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    if (ids.length === 0) throw new ValidationError('orderId(s) required');

    // Set CalculatePrice=0 on the specified orders + update OrderStates JSON
    const now = new Date().toISOString();
    for (const orderId of ids) {
      const order = await db('Orders').where({ Id: orderId, TicketId: ticketId }).first();
      if (!order) throw new NotFoundError(`Order ${orderId} not found on ticket ${ticketId}`);
      let states = [];
      try { states = JSON.parse(order.OrderStates || '[]'); } catch {}
      const idx = states.findIndex(s => s.StateName === 'Status');
      if (idx >= 0) { states[idx].State = 'Gift'; states[idx].LastUpdateTime = now; }
      else states.push({ StateName: 'Status', State: 'Gift', LastUpdateTime: now });
      await db('Orders').where({ Id: orderId }).update({
        CalculatePrice: 0,
        OrderStates: JSON.stringify(states),
      });
    }

    // Reload ticket and recalculate
    const ticket = new Ticket(await ticketRepo.getTicketById(ticketId));
    recalculateTicket(ticket);
    await ticketRepo.saveTicket(ticket);
    return ticketRepo.getTicketById(ticketId);
  }

  // ===================================================================
  // VOID — POST /api/tickets/:id/void
  // Marks the entire ticket as voided: IsClosed=1, TicketStates=Void,
  // reverses all AccountTransactions.
  // ===================================================================
  async voidTicket(ticketId) {
    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    // Reverse all payments by calling AccountTransaction.Reverse() on each
    const ticket = new Ticket(ticketRow);
    if (ticket.TransactionDocument) {
      for (const txn of ticket.TransactionDocument.AccountTransactions) {
        if (txn instanceof AccountTransaction && txn.canReverse()) {
          txn.reverse();
        }
      }
    }

    // Mark all orders as Void
    for (const order of ticket.Orders) {
      let states = [];
      try { states = JSON.parse(order.OrderStates || '[]'); } catch {}
      const idx = states.findIndex(s => s.StateName === 'Status');
      if (idx >= 0) states[idx].State = 'Void';
      else states.push({ StateName: 'Status', State: 'Void' });
      order.OrderStates = JSON.stringify(states);
      order.CalculatePrice = false;
    }

    // Mark ticket state
    let ticketStates = [];
    try { ticketStates = JSON.parse(ticket.TicketStates || '[]'); } catch {}
    const tsIdx = ticketStates.findIndex(s => s.StateName === 'Status');
    if (tsIdx >= 0) ticketStates[tsIdx].State = 'Void';
    else ticketStates.push({ StateName: 'Status', State: 'Void' });
    ticket.TicketStates = JSON.stringify(ticketStates);

    ticket.IsClosed = true;
    ticket.RemainingAmount = 0;
    ticket.TotalAmount = 0;

    await ticketRepo.saveTicket(ticket);
    publish(EventTopicNames.TicketClosed, { Ticket: ticket, reason: 'voided' });
    return ticketRepo.getTicketById(ticketId);
  }

  // ===================================================================
  // TAGS — POST /api/tickets/:id/tags
  // Body: { tags: [{ name, value }] }
  // Updates TicketTags JSON field.
  // ===================================================================
  async setTags(ticketId, tags) {
    if (!Array.isArray(tags)) throw new ValidationError('tags must be an array');
    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const tagValues = tags.map(t => ({
      TagName: t.name || '',
      TagValue: t.value || '',
      TagNameShort: (t.name || '').slice(0, 3),
    }));

    await db('Tickets').where({ Id: ticketId }).update({
      TicketTags: JSON.stringify(tagValues),
      LastUpdateTime: new Date().toISOString(),
    });
    return ticketRepo.getTicketById(ticketId);
  }

  // ===================================================================
  // SPLIT — POST /api/tickets/:id/split
  // Body: { orderIds: number[] }
  // Creates a new ticket, moves the specified orders to it, recalculates both.
  // ===================================================================
  async splitTicket(sourceTicketId, orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new ValidationError('orderIds array is required');
    }

    const sourceRow = await ticketRepo.getTicketById(sourceTicketId);
    if (!sourceRow) throw new NotFoundError(`Ticket ${sourceTicketId} not found`);
    if (sourceRow.IsClosed) throw new ConflictError(`Ticket ${sourceTicketId} is closed`);

    // Validate all orderIds belong to this ticket
    const sourceOrders = sourceRow.Orders || [];
    const movingOrders = orderIds.map(id => {
      const o = sourceOrders.find(o => o.Id === id);
      if (!o) throw new NotFoundError(`Order ${id} not found on ticket ${sourceTicketId}`);
      return o;
    });

    // Step 1: Create the new ticket (uses its own transaction internally)
    const department = await db('Departments').where({ Id: sourceRow.DepartmentId }).first();
    const ticketType = await db('TicketTypes').where({ Id: sourceRow.TicketTypeId }).first();
    const newTicket = TicketBuilder.create(
      { ...ticketType, TaxIncluded: ticketType.TaxIncluded ? true : false },
      department
    ).withExchangeRate(sourceRow.ExchangeRate).build();
    newTicket.TicketEntities = sourceRow.TicketEntities.map(te => ({ ...te, Id: 0 }));

    const newTicketId = await ticketRepo.saveTicket(newTicket);

    // Step 2: Move orders (separate simple transaction — no nested saveTicket)
    await withTransaction(async (trx) => {
      await trx.raw('PRAGMA defer_foreign_keys = ON');
      for (const order of movingOrders) {
        await trx('Orders').where({ Id: order.Id, TicketId: sourceTicketId })
          .update({ TicketId: newTicketId });
      }
    });

    // Step 3: Recalculate source (now has fewer orders)
    const sourceTicket = new Ticket(await ticketRepo.getTicketById(sourceTicketId));
    recalculateTicket(sourceTicket);
    await ticketRepo.saveTicket(sourceTicket);

    // Step 4: Recalculate new ticket
    const newTicketReloaded = new Ticket(await ticketRepo.getTicketById(newTicketId));
    recalculateTicket(newTicketReloaded);
    await ticketRepo.saveTicket(newTicketReloaded);

    publish(EventTopicNames.TicketCreated, { Ticket: newTicketReloaded, reason: 'split' });

    return {
      sourceTicket: await ticketRepo.getTicketById(sourceTicketId),
      newTicket: await ticketRepo.getTicketById(newTicketId),
    };
  }

  // ===================================================================
  // REFUND — POST /api/tickets/:id/refund
  // Body: { amount: number, reason?: string }
  // Creates a new "refund" ticket linked to the original, with negative
  // AccountTransaction amounts (auto-reversed).
  // ===================================================================
  async refundTicket(originalTicketId, amount, reason = '') {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    const originalRow = await ticketRepo.getTicketById(originalTicketId);
    if (!originalRow) throw new NotFoundError(`Ticket ${originalTicketId} not found`);
    if (!originalRow.IsClosed) {
      throw new ConflictError(`Ticket ${originalTicketId} must be closed before refunding`);
    }

    const department = await db('Departments').where({ Id: originalRow.DepartmentId }).first();
    const ticketType = await db('TicketTypes').where({ Id: originalRow.TicketTypeId }).first();

    // Create a new "refund" ticket with negative total
    const refundTicket = TicketBuilder.create(
      { ...ticketType, TaxIncluded: ticketType.TaxIncluded ? true : false },
      department
    ).withExchangeRate(originalRow.ExchangeRate).build();

    // Mark as refund in TicketStates
    refundTicket.TicketStates = JSON.stringify([
      { StateName: 'Status', State: 'Refunded', Quantity: 0 },
      { StateName: 'RefundOf', State: String(originalTicketId), Quantity: 0 },
    ]);
    refundTicket.Note = `Refund of ticket #${originalTicketId}. Reason: ${reason || 'customer request'}`;
    refundTicket.TotalAmount = -amount;
    refundTicket.RemainingAmount = -amount;

    const refundId = await ticketRepo.saveTicket(refundTicket);

    // Reverse a payment on the original ticket (auto-reversal via negative amount)
    const originalTicket = new Ticket(originalRow);
    if (originalTicket.Payments.length > 0) {
      const payment = originalTicket.Payments[0];
      // Load the full PaymentType with its AccountTransactionType for reversal
      const paymentTypeRow = await db('PaymentTypes').where({ Id: payment.PaymentTypeId }).first();
      const accountTxnType = paymentTypeRow?.AccountTransactionTypeId
        ? await db('AccountTransactionTypes').where({ Id: paymentTypeRow.AccountTransactionTypeId }).first()
        : null;
      if (paymentTypeRow && accountTxnType) {
        // Reversal: same AccountTransactionType, negative amount
        originalTicket.addPayment(
          { ...paymentTypeRow, AccountTransactionType: accountTxnType },
          { Name: payment.Name, Id: payment.AccountTransactionId },
          -amount,
          originalRow.ExchangeRate,
          1
        );
      }
    }

    await ticketRepo.saveTicket(originalTicket);

    publish(EventTopicNames.TicketCreated, { Ticket: refundTicket, reason: 'refund' });

    return {
      refundTicket: await ticketRepo.getTicketById(refundId),
      originalTicket: await ticketRepo.getTicketById(originalTicketId),
    };
  }

  // ===================================================================
  // MERGE — POST /api/tickets/merge
  // Body: { sourceTicketIds: number[] }
  // Combines multiple open tickets into a single new ticket.
  // ===================================================================
  async mergeTickets(sourceTicketIds) {
    if (!Array.isArray(sourceTicketIds) || sourceTicketIds.length < 2) {
      throw new ValidationError('At least 2 source ticket IDs required');
    }

    // Load all source tickets
    const sources = [];
    for (const id of sourceTicketIds) {
      const t = await ticketRepo.getTicketById(id);
      if (!t) throw new NotFoundError(`Ticket ${id} not found`);
      if (t.IsClosed) throw new ConflictError(`Ticket ${id} is closed`);
      sources.push(t);
    }

    // All sources must share the same Department + TicketType
    const firstDept = sources[0].DepartmentId;
    const firstType = sources[0].TicketTypeId;
    for (const s of sources) {
      if (s.DepartmentId !== firstDept || s.TicketTypeId !== firstType) {
        throw new ValidationError('All tickets must share the same Department and TicketType');
      }
    }

    // Step 1: Create the merged ticket (own transaction)
    const department = await db('Departments').where({ Id: firstDept }).first();
    const ticketType = await db('TicketTypes').where({ Id: firstType }).first();
    const merged = TicketBuilder.create(
      { ...ticketType, TaxIncluded: ticketType.TaxIncluded ? true : false },
      department
    ).withExchangeRate(sources[0].ExchangeRate).build();

    const mergedId = await ticketRepo.saveTicket(merged);

    // Step 2: Move all orders/payments/calculations/entities to merged ticket
    // (separate transaction, no nested saveTicket)
    await withTransaction(async (trx) => {
      await trx.raw('PRAGMA defer_foreign_keys = ON');
      for (const s of sources) {
        await trx('Orders').where({ TicketId: s.Id }).update({ TicketId: mergedId });
        await trx('Payments').where({ TicketId: s.Id }).update({ TicketId: mergedId });
        await trx('Calculations').where({ TicketId: s.Id }).update({ TicketId: mergedId });
        await trx('TicketEntities').where({ TicketId: s.Id }).update({ TicketId: mergedId });

        // Mark source tickets as closed (merged)
        await trx('Tickets').where({ Id: s.Id }).update({
          IsClosed: 1,
          TicketStates: JSON.stringify([
            { StateName: 'Status', State: 'Merged', Quantity: 0 },
            { StateName: 'MergedInto', State: String(mergedId), Quantity: 0 },
          ]),
          LastUpdateTime: new Date().toISOString(),
        });
      }
    });

    // Step 3: Recalculate merged ticket
    const mergedReloaded = new Ticket(await ticketRepo.getTicketById(mergedId));
    recalculateTicket(mergedReloaded);
    await ticketRepo.saveTicket(mergedReloaded);

    publish(EventTopicNames.TicketCreated, { Ticket: mergedReloaded, reason: 'merge' });

    return {
      mergedTicket: await ticketRepo.getTicketById(mergedId),
      closedSourceTicketIds: sourceTicketIds,
    };
  }
}

module.exports = { TicketServiceExtended };
