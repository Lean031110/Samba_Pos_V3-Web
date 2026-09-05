// =====================================================================
// KitchenService.js — Kitchen Display System (KDS) service
// =====================================================================
// Handles:
//   - Routing orders to kitchen stations based on product group code
//   - Creating KitchenOrders when a ticket order is added
//   - State transitions: NEW → ACCEPTED → PREPARING → READY → SERVED → VOIDED
//   - Publishing realtime events to kitchen terminals
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

class KitchenService {
  /**
   * Get all kitchen stations.
   */
  async getStations() {
    return db('KitchenStations').where({ IsActive: 1 }).orderBy('SortOrder');
  }

  /**
   * Get all active kitchen orders (not SERVED or VOIDED).
   * Optionally filter by station.
   * @param {number} [stationId]
   */
  async getActiveOrders(stationId = null) {
    let query = db('KitchenOrders')
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

    const items = await db('KitchenOrderItems').whereIn('KitchenOrderId', orderIds);
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
   * Route an order to the appropriate kitchen station(s) based on the
   * menu item's GroupCode. Creates KitchenOrders for each station.
   * Called when a new order is added to a ticket.
   *
   * @param {Object} order — the Order row from DB
   * @param {Object} ticket — the parent Ticket row
   * @param {number} userId — who created the order
   */
  async routeOrderToKitchen(order, ticket, userId = 0) {
    // Get the menu item to find its GroupCode
    const menuItem = await db('MenuItems').where({ Id: order.MenuItemId }).first();
    if (!menuItem) return;  // Can't route without a menu item

    const groupCode = menuItem.GroupCode;

    // Find routing rules for this item
    let routingRules = await db('KitchenStationRouting')
      .where({ MenuItemId: order.MenuItemId });

    if (routingRules.length === 0) {
      // Fall back to group code routing
      routingRules = await db('KitchenStationRouting')
        .where({ MenuItemGroupCode: groupCode });
    }

    if (routingRules.length === 0) {
      // No routing rule found — default to first active station (kitchen)
      const defaultStation = await db('KitchenStations')
        .where({ Name: 'kitchen', IsActive: 1 }).first();
      if (defaultStation) {
        routingRules = [{ KitchenStationId: defaultStation.Id }];
      }
    }

    if (routingRules.length === 0) return;  // No stations configured

    // Get table name from ticket entities
    let tableName = '';
    if (ticket?.Id) {
      const entities = await db('TicketEntities').where({ TicketId: ticket.Id });
      tableName = entities.map(e => e.EntityName).join(', ');
    }

    // Create a KitchenOrder for each station
    for (const rule of routingRules) {
      const [kitchenOrderId] = await db('KitchenOrders').insert({
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
      });

      // Create the kitchen order item
      await db('KitchenOrderItems').insert({
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
   * Update kitchen order state.
   * @param {number} kitchenOrderId
   * @param {string} newState — NEW, ACCEPTED, PREPARING, READY, SERVED, VOIDED
   * @param {number} userId
   */
  async updateOrderState(kitchenOrderId, newState, userId = 0) {
    const validStates = Object.values(KITCHEN_STATES);
    if (!validStates.includes(newState)) {
      throw new ValidationError(`Invalid state: ${newState}. Must be one of: ${validStates.join(', ')}`);
    }

    const order = await db('KitchenOrders').where({ Id: kitchenOrderId }).first();
    if (!order) throw new NotFoundError(`Kitchen order ${kitchenOrderId} not found`);

    const now = new Date().toISOString();
    const update = { State: newState };

    // Set timestamps based on state
    if (newState === KITCHEN_STATES.ACCEPTED) update.AcceptedAt = now;
    if (newState === KITCHEN_STATES.READY) update.ReadyAt = now;
    if (newState === KITCHEN_STATES.SERVED) update.ServedAt = now;

    await db('KitchenOrders').where({ Id: kitchenOrderId }).update(update);

    // Update item states too
    await db('KitchenOrderItems').where({ KitchenOrderId: kitchenOrderId }).update({ State: newState });

    // Publish realtime event
    publish('KitchenOrderUpdated', {
      kitchenOrderId,
      orderId: order.OrderId,
      ticketId: order.TicketId,
      newState,
      userId,
    });

    // Return the updated order with items
    const updated = await db('KitchenOrders').where({ Id: kitchenOrderId }).first();
    const items = await db('KitchenOrderItems').where({ KitchenOrderId: kitchenOrderId });
    return { ...updated, Items: items };
  }

  /**
   * Bump (mark as READY) a kitchen order.
   */
  async bumpOrder(kitchenOrderId, userId = 0) {
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.READY, userId);
  }

  /**
   * Mark as SERVED (delivered to customer).
   */
  async serveOrder(kitchenOrderId, userId = 0) {
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.SERVED, userId);
  }

  /**
   * Void a kitchen order (item was cancelled).
   */
  async voidOrder(kitchenOrderId, userId = 0) {
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.VOIDED, userId);
  }

  /**
   * Recall (reopen) a SERVED order — set back to READY.
   */
  async recallOrder(kitchenOrderId, userId = 0) {
    const order = await db('KitchenOrders').where({ Id: kitchenOrderId }).first();
    if (!order) throw new NotFoundError(`Kitchen order ${kitchenOrderId} not found`);
    if (order.State !== KITCHEN_STATES.SERVED) {
      throw new ConflictError(`Can only recall SERVED orders (current: ${order.State})`);
    }
    return this.updateOrderState(kitchenOrderId, KITCHEN_STATES.READY, userId);
  }

  /**
   * Get kitchen statistics for a station.
   */
  async getStationStats(stationId) {
    const stats = await db('KitchenOrders')
      .where({ KitchenStationId: stationId })
      .select('State')
      .count('* as count')
      .groupBy('State');
    return stats;
  }
}

module.exports = { KitchenService, KITCHEN_STATES };
