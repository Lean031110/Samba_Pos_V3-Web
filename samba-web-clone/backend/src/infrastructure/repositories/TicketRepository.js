// =====================================================================
// TicketRepository.js
// =====================================================================
// Mirrors: Samba.Persistance/Implementations/TicketDao.cs
//
// Methods implemented:
//   - getOpenTickets()                          (TicketDao.GetOpenTickets)
//   - getTicketById(id)                         (TicketDao.GetTicketById)
//   - getOpenTicketIds(entityId)                (TicketDao.GetOpenTicketIds)
//   - getOpenTicketCount(entityId)              (TicketDao.GetOpenTicketCount)
//   - saveTicket(ticket)                        (TicketDao.Save)
//   - updateTicketNumber(ticket, numeratorId)   (TicketDao.UpdateTicketNumber)
//
// All writes use a transaction with PRAGMA defer_foreign_keys = ON.
// =====================================================================

const { db, withTransaction } = require('../db/db');

/**
 * @typedef {Object} OrderRow
 * @property {number} Id
 * @property {number} TicketId
 * @property {number} MenuItemId
 * @property {string} MenuItemName
 * @property {string} PortionName
 * @property {string} Price           - decimal as string (Knex returns NUMERIC as string by default)
 * @property {string} Quantity        - decimal as string
 * @property {number} CalculatePrice  - 0 or 1
 * @property {number} OrderNumber
 * @property {string} Taxes           - JSON: List<TaxValue>
 * @property {string} OrderTags       - JSON: List<OrderTagValue>
 * @property {string} OrderStates     - JSON: List<OrderStateValue>
 * @property {string} CreatedDateTime - ISO8601
 * @property {string} CreatingUserName
 * @property {number} Locked
 * @property {number} AccountTransactionTypeId
 * @property {number} WarehouseId
 * @property {number} DepartmentId
 * @property {number} PortionCount
 * @property {number} DecreaseInventory
 * @property {number} IncreaseInventory
 * @property {string} PriceTag
 * @property {string} Tag
 * @property {number|null} ProductTimerValueId
 */

/**
 * @typedef {Object} TicketRow
 * @property {number} Id
 * @property {string} TicketNumber
 * @property {string} Date
 * @property {string} LastOrderDate
 * @property {string} LastPaymentDate
 * @property {number} IsClosed
 * @property {number} IsLocked
 * @property {string} RemainingAmount
 * @property {string} TotalAmount
 * @property {number} DepartmentId
 * @property {number} TicketTypeId
 * @property {string} Note
 * @property {string} LastModifiedUserName
 * @property {string} TicketTags       - JSON
 * @property {string} TicketStates     - JSON
 * @property {string} TicketLogs       - JSON
 * @property {string} ExchangeRate
 * @property {number} TaxIncluded
 * @property {number} TransactionDocumentId
 * @property {string} LastUpdateTime
 * @property {OrderRow[]} Orders
 * @property {any[]}    Payments
 * @property {any[]}    ChangePayments
 * @property {any[]}    Calculations
 * @property {any[]}    PaidItems
 * @property {any[]}    TicketEntities
 */

class TicketRepository {
  /**
   * Get all open tickets (IsClosed = 0).
   * Source: TicketDao.GetOpenTickets
   *
   * @returns {Promise<TicketRow[]>}
   */
  async getOpenTickets() {
    const tickets = await db('Tickets')
      .where({ IsClosed: 0 })
      .orderBy('LastPaymentDate', 'desc');

    if (tickets.length === 0) return [];

    const ticketIds = tickets.map(t => t.Id);
    const orders = await db('Orders').whereIn('TicketId', ticketIds);

    // Group orders by TicketId
    const ordersByTicket = {};
    for (const o of orders) {
      if (!ordersByTicket[o.TicketId]) ordersByTicket[o.TicketId] = [];
      ordersByTicket[o.TicketId].push(o);
    }

    return tickets.map(t => ({
      ...t,
      Orders: ordersByTicket[t.Id] || [],
    }));
  }

  /**
   * Get a single ticket by Id, fully loaded with all child collections.
   * Source: TicketDao.OpenTicket / GetTicketById (EF Load with Includes)
   *
   * @param {number} id
   * @returns {Promise<TicketRow|null>}
   */
  async getTicketById(id) {
    const ticket = await db('Tickets').where({ Id: id }).first();
    if (!ticket) return null;

    const [orders, payments, changePayments, calculations, paidItems, ticketEntities] =
      await Promise.all([
        db('Orders').where({ TicketId: id }),
        db('Payments').where({ TicketId: id }),
        db('ChangePayments').where({ TicketId: id }),
        db('Calculations').where({ TicketId: id }),
        db('PaidItems').where({ TicketId: id }),
        db('TicketEntities').where({ TicketId: id }),
      ]);

    return {
      ...ticket,
      Orders: orders,
      Payments: payments,
      ChangePayments: changePayments,
      Calculations: calculations,
      PaidItems: paidItems,
      TicketEntities: ticketEntities,
    };
  }

  /**
   * Get the IDs of all open tickets linked to a given entity (table/customer).
   * Source: TicketDao.GetOpenTicketIds(entityId)
   *
   * @param {number} entityId
   * @returns {Promise<number[]>}
   */
  async getOpenTicketIds(entityId) {
    const rows = await db('TicketEntities')
      .join('Tickets', 'TicketEntities.TicketId', 'Tickets.Id')
      .where({
        'TicketEntities.EntityId': entityId,
        'Tickets.IsClosed': 0,
      })
      .pluck('Tickets.Id');
    return rows;
  }

  /**
   * Count of open tickets linked to an entity.
   * Source: TicketDao.GetOpenTicketCount
   *
   * @param {number} entityId
   * @returns {Promise<number>}
   */
  async getOpenTicketCount(entityId) {
    const result = await db('TicketEntities')
      .join('Tickets', 'TicketEntities.TicketId', 'Tickets.Id')
      .where({
        'TicketEntities.EntityId': entityId,
        'Tickets.IsClosed': 0,
      })
      .count('* as n')
      .first();
    return result.n;
  }

  /**
   * Persist a ticket (insert or update) and all its child collections.
   * Source: TicketDao.Save
   *
   * This is the heaviest method — it persists:
   *   - The ticket row
   *   - All Orders (insert new / update existing / delete removed)
   *   - All Payments, ChangePayments, Calculations, PaidItems, TicketEntities
   *
   * Uses a single transaction with PRAGMA defer_foreign_keys = ON.
   *
   * @param {TicketRow} ticket
   * @returns {Promise<number>} the ticket Id
   */
  async saveTicket(ticket) {
    return withTransaction(async (trx) => {
      const now = new Date().toISOString();
      const ticketRow = {
        Id: ticket.Id || undefined,
        Name: ticket.Name || null,
        LastUpdateTime: now,
        TicketNumber: ticket.TicketNumber || null,
        Date: ticket.Date || now,
        LastOrderDate: ticket.LastOrderDate || now,
        LastPaymentDate: ticket.LastPaymentDate || now,
        IsClosed: ticket.IsClosed ? 1 : 0,
        IsLocked: ticket.IsLocked ? 1 : 0,
        RemainingAmount: ticket.RemainingAmount ?? 0,
        TotalAmount: ticket.TotalAmount ?? 0,
        DepartmentId: ticket.DepartmentId ?? 0,
        TicketTypeId: ticket.TicketTypeId ?? 0,
        Note: ticket.Note || null,
        LastModifiedUserName: ticket.LastModifiedUserName || null,
        TicketTags: ticket.TicketTags || null,
        TicketStates: ticket.TicketStates || null,
        TicketLogs: ticket.TicketLogs || null,
        ExchangeRate: ticket.ExchangeRate ?? 1,
        TaxIncluded: ticket.TaxIncluded ? 1 : 0,
        TransactionDocumentId: ticket.TransactionDocumentId || null,
      };

      let ticketId;
      if (ticket.Id) {
        // Update existing
        await trx('Tickets').where({ Id: ticket.Id }).update(ticketRow);
        ticketId = ticket.Id;
        // Cascade delete existing children that are no longer in the array
        const currentOrderIds = (ticket.Orders || []).map(o => o.Id).filter(Boolean);
        if (currentOrderIds.length > 0) {
          await trx('Orders').where({ TicketId: ticketId })
            .whereNotIn('Id', currentOrderIds).del();
        } else {
          await trx('Orders').where({ TicketId: ticketId }).del();
        }
        // Same pattern for Payments, ChangePayments, Calculations, PaidItems, TicketEntities
        for (const childTable of ['Payments', 'ChangePayments', 'Calculations', 'PaidItems', 'TicketEntities']) {
          const currentIds = (ticket[childTable] || []).map(c => c.Id).filter(Boolean);
          if (currentIds.length > 0) {
            await trx(childTable).where({ TicketId: ticketId })
              .whereNotIn('Id', currentIds).del();
          } else {
            await trx(childTable).where({ TicketId: ticketId }).del();
          }
        }
      } else {
        // Insert new
        const [newId] = await trx('Tickets').insert(ticketRow);
        ticketId = newId;
      }

      // Upsert Orders
      for (const o of (ticket.Orders || [])) {
        const orderRow = {
          Id: o.Id || undefined,
          TicketId: ticketId,
          WarehouseId: o.WarehouseId ?? 0,
          DepartmentId: o.DepartmentId ?? 0,
          MenuItemId: o.MenuItemId ?? 0,
          MenuItemName: o.MenuItemName || null,
          PortionName: o.PortionName || null,
          Price: o.Price ?? 0,
          Quantity: o.Quantity ?? 0,
          PortionCount: o.PortionCount ?? 0,
          Locked: o.Locked ? 1 : 0,
          CalculatePrice: o.CalculatePrice ? 1 : 0,
          DecreaseInventory: o.DecreaseInventory ? 1 : 0,
          IncreaseInventory: o.IncreaseInventory ? 1 : 0,
          OrderNumber: o.OrderNumber ?? 0,
          CreatingUserName: o.CreatingUserName || null,
          CreatedDateTime: o.CreatedDateTime || now,
          AccountTransactionTypeId: o.AccountTransactionTypeId ?? 0,
          ProductTimerValueId: o.ProductTimerValueId ?? null,
          PriceTag: o.PriceTag || null,
          Tag: o.Tag || null,
          Taxes: o.Taxes || null,
          OrderTags: o.OrderTags || null,
          OrderStates: o.OrderStates || null,
        };
        if (o.Id) {
          await trx('Orders').where({ Id: o.Id, TicketId: ticketId }).update(orderRow);
        } else {
          await trx('Orders').insert(orderRow);
        }
      }

      // Upsert Payments / ChangePayments / Calculations / PaidItems / TicketEntities
      for (const childTable of ['Payments', 'ChangePayments', 'Calculations', 'PaidItems', 'TicketEntities']) {
        for (const c of (ticket[childTable] || [])) {
          const row = { ...c, TicketId: ticketId };
          if (c.Id) {
            await trx(childTable).where({ Id: c.Id, TicketId: ticketId }).update(row);
          } else {
            await trx(childTable).insert(row);
          }
        }
      }

      return ticketId;
    });
  }

  /**
   * Atomically increment a Numerator and return the next formatted number.
   * Source: SettingDao.GetNextString
   *
   * @param {number} numeratorId
   * @returns {Promise<string>}
   */
  async getNextNumeratorString(numeratorId) {
    return withTransaction(async (trx) => {
      // Optimistic concurrency retry (mirror SettingDao.cs pattern)
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const numerator = await trx('Numerators').where({ Id: numeratorId }).first();
          if (!numerator) throw new Error(`Numerator ${numeratorId} not found`);
          const nextNumber = numerator.Number + 1;
          await trx('Numerators').where({ Id: numeratorId, Number: numerator.Number })
            .update({ Number: nextNumber });
          // Format using NumberFormat (default "#")
          const fmt = numerator.NumberFormat || '#';
          return fmt === '#' ? String(nextNumber) : nextNumber.toString().padStart(fmt.length, '0');
        } catch (err) {
          if (attempt === 4) throw err;
          // retry on concurrency conflict
        }
      }
    });
  }
}

module.exports = { TicketRepository };
