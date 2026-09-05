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
  // reverses all AccountTransactions, recalculates (naturally zeros totals).
  // ===================================================================
  async voidTicket(ticketId) {
    const ticketRow = await ticketRepo.getTicketById(ticketId);
    if (!ticketRow) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticketRow.IsClosed) throw new ConflictError(`Ticket ${ticketId} is already closed`);

    const ticket = new Ticket(ticketRow);

    // Reverse all AccountTransactions
    if (ticket.TransactionDocument) {
      for (const txn of ticket.TransactionDocument.AccountTransactions) {
        if (txn instanceof AccountTransaction && txn.canReverse()) {
          txn.reverse();
        }
      }
    }

    // Mark all orders as Void (CalculatePrice=false → excluded from totals)
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

    // Recalculate — this will naturally zero out TotalAmount because
    // all orders have CalculatePrice=false. This also cleans up
    // zero-amount Calculations automatically (per SambaPOS behavior).
    recalculateTicket(ticket);

    ticket.IsClosed = true;

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
  // ATOMIC: all operations in a single transaction.
  // ===================================================================
  async splitTicket(sourceTicketId, orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new ValidationError('orderIds array is required');
    }

    return withTransaction(async (trx) => {
      const sourceRow = await trx('Tickets')
        .where({ Id: sourceTicketId })
        .select('*')
        .first();
      if (!sourceRow) throw new NotFoundError(`Ticket ${sourceTicketId} not found`);
      if (sourceRow.IsClosed) throw new ConflictError(`Ticket ${sourceTicketId} is closed`);

      // Load source orders
      const sourceOrders = await trx('Orders').where({ TicketId: sourceTicketId });
      const movingOrders = orderIds.map(id => {
        const o = sourceOrders.find(o => o.Id === id);
        if (!o) throw new NotFoundError(`Order ${id} not found on ticket ${sourceTicketId}`);
        return o;
      });

      // Create the new ticket in the same transaction
      const department = await trx('Departments').where({ Id: sourceRow.DepartmentId }).first();
      const ticketType = await trx('TicketTypes').where({ Id: sourceRow.TicketTypeId }).first();
      const newTicket = TicketBuilder.create(
        { ...ticketType, TaxIncluded: ticketType.TaxIncluded ? true : false },
        department
      ).withExchangeRate(sourceRow.ExchangeRate).build();

      // Save new ticket using the SAME transaction
      const newTicketId = await ticketRepo.saveTicket(newTicket, trx);

      // Move orders to new ticket
      for (const order of movingOrders) {
        await trx('Orders').where({ Id: order.Id, TicketId: sourceTicketId })
          .update({ TicketId: newTicketId });
      }

      // Recalculate source (now has fewer orders)
      const sourceTicketRow = await trx('Tickets').where({ Id: sourceTicketId }).first();
      const sourceOrdersRemaining = await trx('Orders').where({ TicketId: sourceTicketId });
      sourceTicketRow.Orders = sourceOrdersRemaining;
      const sourceTicket = new Ticket(sourceTicketRow);
      recalculateTicket(sourceTicket);
      await ticketRepo.saveTicket(sourceTicket, trx);

      // Recalculate new ticket
      const newTicketRow = await trx('Tickets').where({ Id: newTicketId }).first();
      const newOrdersLoaded = await trx('Orders').where({ TicketId: newTicketId });
      newTicketRow.Orders = newOrdersLoaded;
      const newTicketReloaded = new Ticket(newTicketRow);
      recalculateTicket(newTicketReloaded);
      await ticketRepo.saveTicket(newTicketReloaded, trx);

      publish(EventTopicNames.TicketCreated, { Ticket: newTicketReloaded, reason: 'split' });

      return {
        sourceTicketId,
        newTicketId,
      };
    }).then(async ({ sourceTicketId, newTicketId }) => {
      // Read outside the transaction (after commit) so we see the final state
      return {
        sourceTicket: await ticketRepo.getTicketById(sourceTicketId),
        newTicket: await ticketRepo.getTicketById(newTicketId),
      };
    });
  }

  // ===================================================================
  // REFUND — POST /api/tickets/:id/refund
  // Body: { amount: number, reason?: string }
  // Reverses the last payment on the original ticket (in-place, per SambaPOS).
  // Does NOT create a separate refund ticket.
  // ATOMIC: single transaction.
  // ===================================================================
  async refundTicket(originalTicketId, amount, reason = '') {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    return withTransaction(async (trx) => {
      const originalRow = await trx('Tickets').where({ Id: originalTicketId }).first();
      if (!originalRow) throw new NotFoundError(`Ticket ${originalTicketId} not found`);
      if (!originalRow.IsClosed) {
        throw new ConflictError(`Ticket ${originalTicketId} must be closed before refunding`);
      }

      // Check the ticket has payments to reverse
      const payments = await trx('Payments').where({ TicketId: originalTicketId }).orderBy('Id', 'desc');
      if (payments.length === 0) {
        throw new ConflictError(`Ticket ${originalTicketId} has no payments to refund`);
      }

      // Verify refund amount doesn't exceed total paid
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.Amount || 0), 0);
      if (amount > totalPaid) {
        throw new ValidationError(`Refund amount ${amount} exceeds total paid ${totalPaid}`);
      }

      // Load the full ticket with orders for recalculation
      const fullTicketRow = await ticketRepo.getTicketById(originalTicketId);
      const originalTicket = new Ticket(fullTicketRow);

      // Reopen the ticket (un-close it)
      originalTicket.IsClosed = false;

      // Add a negative payment (auto-reversal via AccountTransaction.updateAmount)
      const lastPayment = payments[0];
      const paymentType = await trx('PaymentTypes').where({ Id: lastPayment.PaymentTypeId }).first();
      const accountTxnType = paymentType?.AccountTransactionTypeId
        ? await trx('AccountTransactionTypes').where({ Id: paymentType.AccountTransactionTypeId }).first()
        : null;

      if (paymentType && accountTxnType) {
        originalTicket.addPayment(
          { ...paymentType, AccountTransactionType: accountTxnType },
          { Name: lastPayment.Name, Id: lastPayment.AccountTransactionId },
          -amount,   // negative amount triggers auto-reversal
          originalRow.ExchangeRate || 1,
          0   // system user for refund
        );
      }

      // Update ticket state to reflect refund
      let ticketStates = [];
      try { ticketStates = JSON.parse(originalTicket.TicketStates || '[]'); } catch {}
      const tsIdx = ticketStates.findIndex(s => s.StateName === 'Status');
      if (tsIdx >= 0) ticketStates[tsIdx].State = 'Refunded';
      else ticketStates.push({ StateName: 'Status', State: 'Refunded' });
      originalTicket.TicketStates = JSON.stringify(ticketStates);

      // Add note about the refund
      const refundNote = `Refund: $${amount.toFixed(2)} — ${reason || 'customer request'} — ${new Date().toISOString()}`;
      originalTicket.Note = (originalTicket.Note || '') + '\n' + refundNote;

      // Save using the same transaction
      await ticketRepo.saveTicket(originalTicket, trx);

      publish(EventTopicNames.PaymentProcessed, {
        Ticket: originalTicket,
        PaymentTypeName: 'Refund',
        ProcessedAmount: -amount,
        Reason: reason,
      });

      return {
        refundedTicketId: originalTicketId,
        refundAmount: amount,
        reason,
      };
    }).then(async ({ refundedTicketId, refundAmount, reason }) => {
      return {
        refundedTicket: await ticketRepo.getTicketById(refundedTicketId),
        refundAmount,
        reason,
      };
    });
  }

  // ===================================================================
  // MERGE — POST /api/tickets/merge
  // Body: { sourceTicketIds: number[] }
  // Clones orders/payments/calculations from source tickets into a new
  // merged ticket, then closes the sources (orders remain on sources for audit).
  // ATOMIC: single transaction.
  // ===================================================================
  async mergeTickets(sourceTicketIds) {
    if (!Array.isArray(sourceTicketIds) || sourceTicketIds.length < 2) {
      throw new ValidationError('At least 2 source ticket IDs required');
    }

    return withTransaction(async (trx) => {
      // Load all source tickets
      const sources = [];
      for (const id of sourceTicketIds) {
        const t = await ticketRepo.getTicketById(id);
        if (!t) throw new NotFoundError(`Ticket ${id} not found`);
        if (t.IsClosed) throw new ConflictError(`Ticket ${id} is closed`);
        sources.push(t);
      }

      const firstDept = sources[0].DepartmentId;
      const firstType = sources[0].TicketTypeId;
      for (const s of sources) {
        if (s.DepartmentId !== firstDept || s.TicketTypeId !== firstType) {
          throw new ValidationError('All tickets must share the same Department and TicketType');
        }
      }

      // Create the merged ticket
      const department = await trx('Departments').where({ Id: firstDept }).first();
      const ticketType = await trx('TicketTypes').where({ Id: firstType }).first();
      const merged = TicketBuilder.create(
        { ...ticketType, TaxIncluded: ticketType.TaxIncluded ? true : false },
        department
      ).withExchangeRate(sources[0].ExchangeRate).build();

      // Save merged ticket in the SAME transaction
      const mergedId = await ticketRepo.saveTicket(merged, trx);

      // Clone orders from each source into the merged ticket (keep originals for audit)
      for (const s of sources) {
        const orders = await trx('Orders').where({ TicketId: s.Id });
        for (const o of orders) {
          // Clone the order row with a new Id, pointing to the merged ticket
          const { Id, ...orderData } = o;
          await trx('Orders').insert({
            ...orderData,
            TicketId: mergedId,
            // Reset locked state for the new ticket
            Locked: 0,
          });
        }

        // Clone payments
        const payments = await trx('Payments').where({ TicketId: s.Id });
        for (const p of payments) {
          const { Id, ...paymentData } = p;
          await trx('Payments').insert({ ...paymentData, TicketId: mergedId });
        }

        // Clone calculations
        const calcs = await trx('Calculations').where({ TicketId: s.Id });
        for (const c of calcs) {
          const { Id, ...calcData } = c;
          await trx('Calculations').insert({ ...calcData, TicketId: mergedId });
        }

        // Clone ticket entities
        const entities = await trx('TicketEntities').where({ TicketId: s.Id });
        for (const e of entities) {
          const { Id, ...entityData } = e;
          await trx('TicketEntities').insert({ ...entityData, TicketId: mergedId });
        }

        // Mark source tickets as closed (merged) — orders remain for audit
        await trx('Tickets').where({ Id: s.Id }).update({
          IsClosed: 1,
          IsLocked: 1,
          TicketStates: JSON.stringify([
            { StateName: 'Status', State: 'Merged', Quantity: 0 },
            { StateName: 'MergedInto', State: String(mergedId), Quantity: 0 },
          ]),
          LastUpdateTime: new Date().toISOString(),
        });
      }

      // Recalculate merged ticket
      const mergedRow = await trx('Tickets').where({ Id: mergedId }).first();
      const mergedOrders = await trx('Orders').where({ TicketId: mergedId });
      mergedRow.Orders = mergedOrders;
      const mergedReloaded = new Ticket(mergedRow);
      recalculateTicket(mergedReloaded);
      await ticketRepo.saveTicket(mergedReloaded, trx);

      publish(EventTopicNames.TicketCreated, { Ticket: mergedReloaded, reason: 'merge' });

      return {
        mergedTicketId: mergedId,
        closedSourceTicketIds: sourceTicketIds,
      };
    }).then(async ({ mergedTicketId, closedSourceTicketIds }) => {
      return {
        mergedTicket: await ticketRepo.getTicketById(mergedTicketId),
        closedSourceTicketIds,
      };
    });
  }
}

module.exports = { TicketServiceExtended };
