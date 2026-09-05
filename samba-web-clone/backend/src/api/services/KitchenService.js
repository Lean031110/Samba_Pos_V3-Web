// =====================================================================
// KitchenService.js — Kitchen Display System (KDS) service
// =====================================================================
// Transaction-aware: all methods accept an optional `trx` parameter.
// When trx is provided, operations execute within that transaction.
// When trx is null, operations use the global db connection.
//
// State machine:
//   NEW → ACCEPTED → PREPARING → READY → SERVED
//   SERVED → READY (only via RECALL)
//   NEW/ACCEPTED/PREPARING/READY → VOIDED (terminal, except admin recall)
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { NotFoundError, ConflictError, ValidationError } = require('../middleware/errorHandler');
const { publish } = require('../../application/eventBus');

const KITCHEN_STATES = {
  NEW: 'NEW',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  VOIDED: 'VOIDED',
};

// State machine: valid transitions
const VALID_TRANSITIONS = {
  NEW:       ['ACCEPTED', 'VOIDED'],
  ACCEPTED:  ['PREPARING', 'READY', 'VOIDED'],
  PREPARING: ['READY', 'VOIDED'],
  READY:     ['SERVED', 'VOIDED'],
  SERVED:    ['READY'],  // only via RECALL
  VOIDED:    [],         // terminal
};

class KitchenService {
  /**
   * Get the connection to use: external trx if provided, global db otherwise.
   */
  _conn(trx) {
    return trx || db;
  }

  /**
   * Get all kitchen stations.
   */
  async getStations(trx = null) {
    return this._conn(trx)('KitchenStations').where({ IsActive: 1 }).orderBy('SortOrder');
  }

  /**
   * Get all active kitchen orders (not SERVED or VOIDED).
   * @param {number} [stationId]
   * @param {trx} [trx]
   */
  async getActiveOrders(stationId = null, trx = null) {
    let query = this._conn(trx)('KitchenOrders')
      .whereNotIn('State', ['SERVED', 'VOIDED'])
      .orderBy('Priority', 'desc')
      .orderBy('CreatedAt', 'asc');

    if (stationId) {
      query = query.where({ KitchenStationId: stationId });
    }

    const orders = await query;

    // Load items for each order
    const orderIds = orders.map(o => o.Id);
    if (orderIds.length === 0) return [];

    const items = await this._conn(trx)('KitchenOrderItems').whereIn('KitchenOrderId', orderIds);
    const itemsByOrder = {};
    for (const item of items) {
      if (!itemsByOrder[item.KitchenOrderId]) itemsByOrder[item.KitchenOrderId] = [];
      itemsByOrder[item.KitchenOrderId].push(item);
    }

    return orders.map(o => ({
      ...o,
      Items: itemsByOrder[o.Id] || [],
    }));
  }

  /**
   * Route an order to the appropriate kitchen station(s).
   * IDEMPOTENT: uses UNIQUE(OrderId, KitchenStationId) constraint to
   * prevent duplicate kitchen orders from retries/double-clicks.
   *
   * Routing priority:
   *   1. Specific MenuItemId routing
   *   2. MenuItemGroupCode routing
   *   3. Default station (Code='KITCHEN', IsDefault=1)
   *
   * @param {Object} order — the Order row from DB
   * @param {Object} ticket — the parent Ticket row
   * @param {number} userId
   * @param {trx} [trx] — external transaction
   */
  async routeOrderToKitchen(order, ticket, userId = 0, trx = null) {
    const conn = this._conn(trx);

    // Get the menu item to find its GroupCode
    const menuItem = await conn('MenuItems').where({ Id: order.MenuItemId }).first();
    if (!menuItem) return;

    const groupCode = menuItem.GroupCode;

    // Priority 1: routing by specific MenuItemId
    let routingRules = await conn('KitchenStationRouting')
      .where({ MenuItemId: order.MenuItemId });

    // Priority 2: routing by GroupCode
    if (routingRules.length === 0 && groupCode) {
      routingRules = await conn('KitchenStationRouting')
        .where({ MenuItemGroupCode: groupCode });
    }

    // Priority 3: default station (IsDefault=1)
    if (routingRules.length === 0) {
      const defaultStation = await conn('KitchenStations')
        .where({ IsDefault: 1, IsActive: 1 }).first();
      if (defaultStation) {
        routingRules = [{ KitchenStationId: defaultStation.Id }];
      }
    }

    if (routingRules.length === 0) return;

    // Get table name from ticket entities
    let tableName = '';
    if (ticket?.Id) {
      const entities = await conn('TicketEntities').where({ TicketId: ticket.Id });
      tableName = entities.map(e => e.EntityName).join(', ');
    }

    // Create a KitchenOrder for each station (idempotent via UNIQUE constraint)
    for (const rule of routingRules) {
      // Check if a KitchenOrder already exists for this OrderId + StationId
      const existing = await conn('KitchenOrders')
        .where({ OrderId: order.Id, KitchenStationId: rule.KitchenStationId })
        .first();
      if (existing) continue;  // Idempotent: skip if already routed

      const [kitchenOrderId] = await conn('KitchenOrders').insert({
        TicketId: ticket?.Id || 0,
        OrderId: order.Id,
        KitchenStationId: rule.KitchenStationId,
        State: KITCHEN_STATES.NEW,
        CreatedAt: new Date().toISOString(),
        Priority: 0,
        TicketNumber: ticket?.TicketNumber || '',
        TableName: tableName,
        OrderNumber: order.OrderNumber || 0,
        Notes: order.Tag || '',
        CreatedByUserId: userId,
        Version: 1,
      });

      // Create the kitchen order item
      await conn('KitchenOrderItems').insert({
        KitchenOrderId: kitchenOrderId,
        MenuItemName: order.MenuItemName,
        Quantity: order.Quantity,
        PortionName: order.PortionName || '',
        Notes: order.Tag || '',
        Modifiers: order.OrderTags || '[]',
        State: KITCHEN_STATES.NEW,
      });

      // Publish realtime event to kitchen terminals
      publish('KitchenOrderAdded', {
        kitchenOrderId,
        orderId: order.Id,
        ticketId: ticket?.Id,
        stationId: rule.KitchenStationId,
        menuItemName: order.MenuItemName,
        quantity: order.Quantity,
        tableName,
        ticketNumber: ticket?.TicketNumber || '',
      });
    }
  }

  /**
   * Validate state transition per state machine.
   * @param {string} currentState
   * @param {string} newState
   * @throws ConflictError if transition is invalid
   */
  _validateTransition(currentState, newState) {
    const allowed = VALID_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(newState)) {
      throw new ConflictError(
        `Invalid state transition: ${currentState} → ${newState}. ` +
        `Valid transitions from ${currentState}: ${(allowed || []).join(', ') || 'none (terminal)'}`
      );
    }
  }

  /**
   * Update kitchen order state (with optimistic locking).
   * @param {number} kitchenOrderId
   * @param {string} newState
   * @param {number} userId
   * @param {number} expectedVersion — for optimistic locking
   * @param {trx} [trx]
   */
  async updateOrderState(kitchenOrderId, newState, userId = 0, expectedVersion = null, trx = null) {
    const validStates = Object.values(KITCHEN_STATES);
    if (!validStates.includes(newState)) {
      throw new ValidationError(`Invalid state: ${newState}. Must be one of: ${validStates.join(', ')}`);
    }

    const conn = this._conn(trx);
    const order = await conn('KitchenOrders').where({ Id: kitchenOrderId }).first();
    if (!order) throw new NotFoundError(`Kitchen order ${kitchenOrderId} not found`);

    // Validate state transition
    this._validateTransition(order.State, newState);

    const now = new Date().toISOString();
    const update = { State: newState };

    // Set timestamps based on state
    if (newState === KITCHEN_STATES.ACCEPTED) update.AcceptedAt = now;
    if (newState === KITCHEN_STATES.READY) update.ReadyAt = now;
    if (newState === KITCHEN_STATES.SERVED) update.ServedAt = now;

    // Optimistic locking
    if (expectedVersion !== null) {
      update.Version = expectedVersion + 1;
      const updated = await conn('KitchenOrders')
        .where({ Id: kitchenOrderId, Version: expectedVersion })
        .update(update);
      if (updated === 0) {
        throw new ConflictError(`OPTIMISTIC_LOCK_CONFLICT: Kitchen order ${kitchenOrderId} was modified by another terminal`);
      }
    } else {
      await conn('KitchenOrders').where({ Id: kitchenOrderId }).update(update);
    }

    // Update item states too
    await conn('KitchenOrderItems').where({ KitchenOrderId: kitchenOrderId }).update({ State: newState });

    // Publish realtime event
    publish('KitchenOrderUpdated', {
      kitchenOrderId,
      orderId: order.OrderId,
      ticketId: order.TicketId,
      newState,
      userId,
    });

    // Return the updated order with items
    const updated = await conn('KitchenOrders').where({ Id: kitchenOrderId }).first();
    const items = await conn('KitchenOrderItems').where({ KitchenOrderId: kitchenOrderId });
    return { ...updated, Items: items };
  }

  /**
   * Bump (mark as READY).
   */
  async bumpOrder(kitchenOrderId, userId = 0, expectedVersion = null, trx = null) {
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.READY, userId, expectedVersion, trx);
  }

  /**
   * Mark as SERVED.
   */
  async serveOrder(kitchenOrderId, userId = 0, expectedVersion = null, trx = null) {
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.SERVED, userId, expectedVersion, trx);
  }

  /**
   * Void a kitchen order.
   */
  async voidOrder(kitchenOrderId, userId = 0, expectedVersion = null, trx = null) {
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.VOIDED, userId, expectedVersion, trx);
  }

  /**
   * Recall (reopen) a SERVED order — set back to READY.
   */
  async recallOrder(kitchenOrderId, userId = 0, expectedVersion = null, trx = null) {
    const order = await this._conn(trx)('KitchenOrders').where({ Id: kitchenOrderId }).first();
    if (!order) throw new NotFoundError(`Kitchen order ${kitchenOrderId} not found`);
    if (order.State !== KITCHEN_STATES.SERVED) {
      throw new ConflictError(`Can only recall SERVED orders (current: ${order.State})`);
    }
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.READY, userId, expectedVersion, trx);
  }

  /**
   * Void all kitchen orders for a given POS OrderId.
   * Called when a POS order is voided — propagates to kitchen.
   */
  async voidOrdersForPosOrder(orderId, userId = 0, trx = null) {
    const conn = this._conn(trx);
    const kitchenOrders = await conn('KitchenOrders').where({ OrderId: orderId });
    for (const ko of kitchenOrders) {
      if (ko.State !== KITCHEN_STATES.VOIDED && ko.State !== KITCHEN_STATES.SERVED) {
        await this.updateOrderState(ko.Id, KITCHEN_STATES.VOIDED, userId, null, trx);
      }
    }
  }

  /**
   * Get kitchen statistics for a station.
   */
  async getStationStats(stationId, trx = null) {
    return this._conn(trx)('KitchenOrders')
      .where({ KitchenStationId: stationId })
      .select('State')
      .count('* as count')
      .groupBy('State');
  }
}

module.exports = { KitchenService, KITCHEN_STATES, VALID_TRANSITIONS };
