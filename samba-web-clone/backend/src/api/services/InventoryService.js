// =====================================================================
// InventoryService.js — Real inventory management
// =====================================================================
// Features:
//   - Recipe explosion: MenuItemPortion → Recipe → RecipeItems → Ingredients
//   - Stock deduction on ticket close (transaccional)
//   - Stock reversal on void/refund
//   - Stock movements ledger (PURCHASE, SALE, WASTE, ADJUSTMENT, TRANSFER)
//   - Current stock from StockBalances (and reconstructable from movements)
//   - Minimum stock alerts
//   - Unit conversions
//
// All methods are transaction-aware (accept optional trx).
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { NotFoundError, ConflictError, ValidationError } = require('../middleware/errorHandler');
const { publish } = require('../../application/eventBus');

const MOVEMENT_TYPES = {
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  WASTE: 'WASTE',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  RETURN: 'RETURN',
  REVERSAL: 'REVERSAL',
};

class InventoryService {
  _conn(trx) { return trx || db; }

  // ===================================================================
  // Recipe management
  // ===================================================================

  /**
   * Get the recipe for a menu item portion.
   * @param {number} menuItemPortionId
   * @param {trx} [trx]
   * @returns {Promise<{recipe: Object, items: Array}>}
   */
  async getRecipe(menuItemPortionId, trx = null) {
    const conn = this._conn(trx);
    const recipe = await conn('Recipes').where({ MenuItemPortionId: menuItemPortionId, IsActive: 1 }).first();
    if (!recipe) return { recipe: null, items: [] };

    const items = await conn('RecipeItems')
      .where({ RecipeId: recipe.Id })
      .join('Ingredients', 'RecipeItems.IngredientId', 'Ingredients.Id')
      .join('IngredientUnits', 'RecipeItems.UnitId', 'IngredientUnits.Id')
      .select(
        'RecipeItems.Id', 'RecipeItems.Quantity', 'RecipeItems.UnitId',
        'Ingredients.Id as IngredientId', 'Ingredients.Name as IngredientName',
        'Ingredients.Code as IngredientCode', 'Ingredients.BaseUnitId',
        'IngredientUnits.Code as UnitCode', 'IngredientUnits.Name as UnitName'
      );

    return { recipe, items };
  }

  /**
   * Create or update a recipe for a menu item portion.
   * @param {number} menuItemPortionId
   * @param {Array<{ingredientId, quantity, unitId}>} items
   * @param {number} fixedCost
   * @param {trx} [trx]
   */
  async saveRecipe(menuItemPortionId, items, fixedCost = 0, trx = null) {
    const conn = this._conn(trx);
    // Delete existing recipe
    const existing = await conn('Recipes').where({ MenuItemPortionId: menuItemPortionId }).first();
    if (existing) {
      await conn('RecipeItems').where({ RecipeId: existing.Id }).del();
      await conn('Recipes').where({ Id: existing.Id }).del();
    }

    // Create new recipe
    const [recipeId] = await conn('Recipes').insert({
      MenuItemPortionId: menuItemPortionId, FixedCost: fixedCost, IsActive: 1,
    });

    // Insert recipe items
    for (const item of items) {
      await conn('RecipeItems').insert({
        RecipeId: recipeId,
        IngredientId: item.ingredientId,
        Quantity: item.quantity,
        UnitId: item.unitId,
      });
    }

    return { recipeId, itemCount: items.length };
  }

  // ===================================================================
  // Stock operations
  // ===================================================================

  /**
   * Get current stock for an ingredient at a warehouse.
   */
  async getStockBalance(ingredientId, warehouseId, trx = null) {
    const conn = this._conn(trx);
    return conn('StockBalances')
      .where({ IngredientId: ingredientId, WarehouseId: warehouseId })
      .first();
  }

  /**
   * Get all stock balances for a warehouse.
   */
  async getStockBalances(warehouseId, trx = null) {
    const conn = this._conn(trx);
    return conn('StockBalances')
      .where({ WarehouseId: warehouseId })
      .join('Ingredients', 'StockBalances.IngredientId', 'Ingredients.Id')
      .join('IngredientUnits', 'StockBalances.UnitId', 'IngredientUnits.Id')
      .select(
        'StockBalances.Id', 'StockBalances.Quantity', 'StockBalances.AverageCost',
        'StockBalances.LastUpdated',
        'Ingredients.Id as IngredientId', 'Ingredients.Name as IngredientName',
        'Ingredients.Code as IngredientCode', 'Ingredients.MinimumStock',
        'IngredientUnits.Code as UnitCode', 'IngredientUnits.Name as UnitName'
      )
      .orderBy('Ingredients.Name');
  }

  /**
   * Record a stock movement and update the balance.
   * This is the core ledger operation — all stock changes go through this.
   *
   * @param {Object} params
   * @param {trx} [trx]
   */
  async recordMovement(params, trx = null) {
    const conn = this._conn(trx);
    const {
      ingredientId, warehouseId, unitId,
      movementType, quantity, unitCost = 0,
      ticketId = null, orderId = null, supplierId = null,
      reference = null, notes = null, userId = 0,
    } = params;

    // Validate movement type
    if (!Object.values(MOVEMENT_TYPES).includes(movementType)) {
      throw new ValidationError(`Invalid movement type: ${movementType}`);
    }

    const totalCost = quantity * unitCost;

    // Insert movement record (append-only ledger)
    const [movementId] = await conn('StockMovements').insert({
      IngredientId: ingredientId,
      WarehouseId: warehouseId,
      UnitId: unitId,
      MovementType: movementType,
      Quantity: quantity,
      UnitCost: unitCost,
      TotalCost: totalCost,
      TicketId: ticketId,
      OrderId: orderId,
      SupplierId: supplierId,
      Reference: reference,
      Notes: notes,
      UserId: userId,
      CreatedAt: new Date().toISOString(),
    });

    // Update stock balance (upsert)
    const existing = await conn('StockBalances')
      .where({ IngredientId: ingredientId, WarehouseId: warehouseId })
      .first();

    if (existing) {
      const newQty = Number(existing.Quantity) + Number(quantity);
      // Recalculate average cost for incoming stock (PURCHASE, TRANSFER_IN, RETURN)
      if (quantity > 0 && unitCost > 0) {
        const oldTotal = Number(existing.Quantity) * Number(existing.AverageCost);
        const newTotal = oldTotal + (quantity * unitCost);
        const newAvgCost = newQty > 0 ? newTotal / newQty : 0;
        await conn('StockBalances').where({ Id: existing.Id }).update({
          Quantity: newQty,
          AverageCost: newAvgCost,
          LastUpdated: new Date().toISOString(),
        });
      } else {
        await conn('StockBalances').where({ Id: existing.Id }).update({
          Quantity: newQty,
          LastUpdated: new Date().toISOString(),
        });
      }
    } else {
      // Create new balance
      await conn('StockBalances').insert({
        IngredientId: ingredientId,
        WarehouseId: warehouseId,
        Quantity: quantity,
        UnitId: unitId,
        AverageCost: quantity > 0 ? unitCost : 0,
        LastUpdated: new Date().toISOString(),
      });
    }

    return { movementId, newBalance: await this.getStockBalance(ingredientId, warehouseId, trx) };
  }

  /**
   * Deduct ingredients for a ticket's orders (recipe explosion).
   * Called during ticket close — MUST be in the same transaction.
   *
   * Flow:
   *   For each order:
   *     → find recipe for order's MenuItemPortion
   *     → for each RecipeItem:
   *        → record SALE movement (negative quantity)
   *        → update StockBalance
   *
   * @param {Object} ticket — full ticket with Orders loaded
   * @param {number} warehouseId
   * @param {number} userId
   * @param {trx} [trx]
   */
  async deductForTicketSale(ticket, warehouseId, userId = 0, trx = null) {
    const conn = this._conn(trx);
    const movements = [];

    for (const order of (ticket.Orders || [])) {
      // Skip orders that don't affect inventory (CalculatePrice=false = voided/gifted)
      if (!order.CalculatePrice) continue;

      // Find the portion for this order
      const menuItem = await conn('MenuItems').where({ Id: order.MenuItemId }).first();
      if (!menuItem) continue;

      const portion = await conn('MenuItemPortions')
        .where({ MenuItemId: menuItem.Id, Name: order.PortionName })
        .first() || await conn('MenuItemPortions').where({ MenuItemId: menuItem.Id }).first();
      if (!portion) continue;

      // Get recipe for this portion
      const recipe = await conn('Recipes')
        .where({ MenuItemPortionId: portion.Id, IsActive: 1 }).first();
      if (!recipe) continue;  // No recipe = no inventory deduction

      // Get recipe items
      const recipeItems = await conn('RecipeItems').where({ RecipeId: recipe.Id });

      for (const item of recipeItems) {
        const ingredient = await conn('Ingredients').where({ Id: item.IngredientId }).first();
        if (!ingredient) continue;

        // Calculate quantity to deduct (recipe quantity × order quantity)
        const deductQty = -(Number(item.Quantity) * Number(order.Quantity));

        const result = await this.recordMovement({
          ingredientId: item.IngredientId,
          warehouseId,
          unitId: item.UnitId,
          movementType: MOVEMENT_TYPES.SALE,
          quantity: deductQty,
          unitCost: ingredient.CostPerUnit,
          ticketId: ticket.Id,
          orderId: order.Id,
          reference: `Ticket #${ticket.TicketNumber || ticket.Id}`,
          notes: `${order.MenuItemName} x${order.Quantity}`,
          userId,
        }, trx);

        movements.push(result);
      }
    }

    // Publish inventory event
    publish('InventoryUpdated', {
      ticketId: ticket.Id,
      warehouseId,
      movementCount: movements.length,
      action: 'sale_deduction',
    });

    return movements;
  }

  /**
   * Reverse inventory deductions for a ticket (void/refund).
   * Records REVERSAL movements with positive quantity.
   *
   * @param {Object} ticket
   * @param {number} warehouseId
   * @param {number} userId
   * @param {trx} [trx]
   */
  async reverseForTicket(ticket, warehouseId, userId = 0, trx = null) {
    const conn = this._conn(trx);

    // Find all SALE movements for this ticket
    const saleMovements = await conn('StockMovements')
      .where({ TicketId: ticket.Id, MovementType: MOVEMENT_TYPES.SALE });

    const reversals = [];
    for (const movement of saleMovements) {
      // Record reversal with opposite sign
      const result = await this.recordMovement({
        ingredientId: movement.IngredientId,
        warehouseId: movement.WarehouseId,
        unitId: movement.UnitId,
        movementType: MOVEMENT_TYPES.REVERSAL,
        quantity: -movement.Quantity,  // opposite of the original sale
        unitCost: movement.UnitCost,
        ticketId: ticket.Id,
        orderId: movement.OrderId,
        reference: `Reversal: Ticket #${ticket.TicketNumber || ticket.Id}`,
        notes: 'Void/Refund reversal',
        userId,
      }, trx);
      reversals.push(result);
    }

    publish('InventoryUpdated', {
      ticketId: ticket.Id,
      warehouseId,
      movementCount: reversals.length,
      action: 'reversal',
    });

    return reversals;
  }

  /**
   * Get ingredients below minimum stock.
   */
  async getLowStockAlerts(warehouseId, trx = null) {
    const conn = this._conn(trx);
    const balances = await conn('StockBalances')
      .where({ WarehouseId: warehouseId })
      .join('Ingredients', 'StockBalances.IngredientId', 'Ingredients.Id')
      .whereRaw('StockBalances.Quantity <= Ingredients.MinimumStock')
      .select(
        'Ingredients.Id', 'Ingredients.Name', 'Ingredients.Code',
        'StockBalances.Quantity', 'Ingredients.MinimumStock',
        'Ingredients.BaseUnitId'
      );
    return balances;
  }

  /**
   * Get stock movement history (ledger).
   */
  async getMovementHistory(ingredientId = null, warehouseId = null, limit = 100, trx = null) {
    const conn = this._conn(trx);
    let query = conn('StockMovements')
      .join('Ingredients', 'StockMovements.IngredientId', 'Ingredients.Id')
      .join('IngredientUnits', 'StockMovements.UnitId', 'IngredientUnits.Id')
      .select(
        'StockMovements.Id', 'StockMovements.MovementType', 'StockMovements.Quantity',
        'StockMovements.UnitCost', 'StockMovements.TotalCost', 'StockMovements.Reference',
        'StockMovements.Notes', 'StockMovements.CreatedAt', 'StockMovements.TicketId',
        'Ingredients.Name as IngredientName', 'Ingredients.Code as IngredientCode',
        'IngredientUnits.Code as UnitCode'
      )
      .orderBy('StockMovements.CreatedAt', 'desc')
      .limit(limit);

    if (ingredientId) query = query.where({ 'StockMovements.IngredientId': ingredientId });
    if (warehouseId) query = query.where({ 'StockMovements.WarehouseId': warehouseId });

    return query;
  }
}

module.exports = { InventoryService, MOVEMENT_TYPES };
