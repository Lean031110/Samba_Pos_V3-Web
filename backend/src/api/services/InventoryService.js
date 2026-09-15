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
  // Unit conversion
  // ===================================================================

  /**
   * Convert a quantity from one unit to another using the UnitConversions
   * table. If no conversion exists, throws ValidationError (incompatible
   * units). If the units are the same, returns the quantity unchanged.
   *
   * The conversion is looked up by (FromUnitId, ToUnitId) and the
   * quantity is multiplied by Factor. Both directions are seeded
   * (kg→gr and gr→kg) so callers don't need to worry about direction.
   *
   * @param {number} quantity — quantity in fromUnitId
   * @param {number} fromUnitId — source unit
   * @param {number} toUnitId — target unit (ingredient's BaseUnitId)
   * @param {trx} [trx]
   * @returns {Promise<number>} quantity in toUnitId
   */
  async convertQuantity(quantity, fromUnitId, toUnitId, trx = null) {
    if (fromUnitId === toUnitId) return Number(quantity);
    const conn = this._conn(trx);
    const conv = await conn('UnitConversions')
      .where({ FromUnitId: fromUnitId, ToUnitId: toUnitId })
      .first();
    if (!conv) {
      throw new ValidationError(
        `No unit conversion from unitId=${fromUnitId} to unitId=${toUnitId}. ` +
        `Add a row to UnitConversions table.`,
        { fromUnitId, toUnitId }
      );
    }
    return Number(quantity) * Number(conv.Factor);
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

    // Check if stock fell below minimum after this movement
    const updatedBalance = await this.getStockBalance(ingredientId, warehouseId, trx);
    if (updatedBalance) {
      const ingredient = await conn('Ingredients').where({ Id: ingredientId }).first();
      if (ingredient && Number(updatedBalance.Quantity) <= Number(ingredient.MinimumStock) && ingredient.MinimumStock > 0) {
        // Publish InventoryLow event — will be bridged to WebSocket for admin notifications
        publish('InventoryLow', {
          ingredientId,
          ingredientName: ingredient.Name,
          warehouseId,
          currentStock: Number(updatedBalance.Quantity),
          minimumStock: Number(ingredient.MinimumStock),
          unitId: updatedBalance.UnitId,
        });
      }
    }

    return { movementId, newBalance: updatedBalance };
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

        // Convert recipe quantity from RecipeItem.UnitId to ingredient.BaseUnitId.
        // This is CRITICAL: if a recipe says "200 gr of beef" but the ingredient
        // is stored in kg, we must convert 200 gr → 0.2 kg before deducting.
        // Without this, we'd deduct 200 kg (1000× wrong).
        const convertedQty = await this.convertQuantity(
          Number(item.Quantity),
          item.UnitId,
          ingredient.BaseUnitId,
          trx
        );

        // Calculate quantity to deduct (recipe quantity × order quantity)
        // in the ingredient's base unit.
        const deductQty = -(convertedQty * Number(order.Quantity));

        const result = await this.recordMovement({
          ingredientId: item.IngredientId,
          warehouseId,
          unitId: ingredient.BaseUnitId,  // ← record movement in BASE unit
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
   * IDEMPOTENT: before inserting a REVERSAL for a SALE movement, checks
   * if a REVERSAL already exists for (TicketId, OrderId, IngredientId,
   * WarehouseId). If so, skips that movement. This prevents double-
   * reversal if reverseForTicket is called twice (e.g., by a bug or
   * concurrent retry that bypassed the IsRefunded guard).
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

    // Find existing REVERSAL movements for this ticket (idempotency check)
    const existingReversals = await conn('StockMovements')
      .where({ TicketId: ticket.Id, MovementType: MOVEMENT_TYPES.REVERSAL });
    const reversedKeys = new Set(
      existingReversals.map(r => `${r.OrderId || 0}|${r.IngredientId}|${r.WarehouseId}`)
    );

    const reversals = [];
    for (const movement of saleMovements) {
      // Check if this SALE movement was already reversed
      const key = `${movement.OrderId || 0}|${movement.IngredientId}|${movement.WarehouseId}`;
      if (reversedKeys.has(key)) {
        // Already reversed — skip (idempotency)
        continue;
      }

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

  // ===================================================================
  // BLOQUE D — Traspasos / Inventario físico / Kardex
  // ===================================================================

  /**
   * Transfer stock between two warehouses.
   *
   * Records two movements atomically:
   *   - TRANSFER_OUT (negative) at the source warehouse
   *   - TRANSFER_IN  (positive) at the target warehouse
   *
   * Validates:
   *   - source != target
   *   - source has enough stock
   *   - ingredient exists in both warehouses' system
   *
   * @param {Object} params
   * @param {number} params.fromWarehouseId
   * @param {number} params.toWarehouseId
   * @param {Array<{ingredientId, quantity, unitId}>} params.items
   * @param {string} [params.transferNumber]  — optional WT-xxxx code
   * @param {string} [params.notes]
   * @param {number} [params.userId]
   * @param {trx} [trx]
   * @returns {Promise<{transferId, transferNumber, itemCount, movements: Array}>}
   */
  async transferStock(params, trx = null) {
    const conn = this._conn(trx);
    const {
      fromWarehouseId, toWarehouseId, items,
      transferNumber = null, notes = null, userId = 0,
    } = params;

    if (!fromWarehouseId || !toWarehouseId) {
      throw new ValidationError('fromWarehouseId and toWarehouseId are required');
    }
    if (fromWarehouseId === toWarehouseId) {
      throw new ValidationError('Source and target warehouses must be different');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('items must be a non-empty array');
    }

    // Validate each item and check source stock
    const validatedItems = [];
    for (const item of items) {
      if (!item.ingredientId) throw new ValidationError('each item must have ingredientId');
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new ValidationError('each item quantity must be a positive number');
      }
      if (!item.unitId) throw new ValidationError('each item must have unitId');

      const ingredient = await conn('Ingredients').where({ Id: item.ingredientId }).first();
      if (!ingredient) throw new NotFoundError(`Ingredient ${item.ingredientId} not found`);

      // Convert quantity from item.UnitId to ingredient.BaseUnitId
      const convertedQty = await this.convertQuantity(
        Number(item.quantity),
        item.unitId,
        ingredient.BaseUnitId,
        trx
      );

      // Check source stock
      const sourceBalance = await this.getStockBalance(item.ingredientId, fromWarehouseId, trx);
      const sourceQty = Number(sourceBalance?.Quantity || 0);
      if (sourceQty < convertedQty) {
        throw new ConflictError(
          `Insufficient stock at source warehouse for ingredient ${ingredient.Name}: ` +
          `available ${sourceQty} ${ingredient.BaseUnitId === item.unitId ? '' : '(base)'} ` +
          `required ${convertedQty}`
        );
      }

      validatedItems.push({
        ingredientId: item.ingredientId,
        quantityInItemUnit: Number(item.quantity),
        convertedQty,
        unitId: ingredient.BaseUnitId,
        unitCost: Number(sourceBalance?.AverageCost || ingredient.CostPerUnit || 0),
        ingredient,
      });
    }

    // Generate transfer number if not provided
    let finalTransferNumber = transferNumber;
    if (!finalTransferNumber) {
      const count = await conn('WarehouseTransfers').count('* as c').first();
      const next = (Number(count?.c || 0)) + 1;
      finalTransferNumber = `WT-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;
    }

    // Create the WarehouseTransfers header
    const [transferId] = await conn('WarehouseTransfers').insert({
      TransferNumber: finalTransferNumber,
      FromWarehouseId: fromWarehouseId,
      ToWarehouseId: toWarehouseId,
      Status: 'COMPLETED',  // atomic — we apply movements immediately
      Notes: notes,
      CreatedBy: userId,
      CompletedAt: new Date().toISOString(),
    });

    // Record items + movements (atomic with the same trx)
    const movements = [];
    for (const v of validatedItems) {
      // Save line
      await conn('WarehouseTransferItems').insert({
        TransferId: transferId,
        IngredientId: v.ingredientId,
        UnitId: v.unitId,
        Quantity: v.convertedQty,
        UnitCost: v.unitCost,
      });

      // TRANSFER_OUT (negative at source)
      const outResult = await this.recordMovement({
        ingredientId: v.ingredientId,
        warehouseId: fromWarehouseId,
        unitId: v.unitId,
        movementType: MOVEMENT_TYPES.TRANSFER_OUT,
        quantity: -v.convertedQty,
        unitCost: v.unitCost,
        reference: `Transfer ${finalTransferNumber} → WH${toWarehouseId}`,
        notes: notes || 'Stock transfer OUT',
        userId,
      }, trx);

      // TRANSFER_IN (positive at target)
      const inResult = await this.recordMovement({
        ingredientId: v.ingredientId,
        warehouseId: toWarehouseId,
        unitId: v.unitId,
        movementType: MOVEMENT_TYPES.TRANSFER_IN,
        quantity: v.convertedQty,
        unitCost: v.unitCost,
        reference: `Transfer ${finalTransferNumber} ← WH${fromWarehouseId}`,
        notes: notes || 'Stock transfer IN',
        userId,
      }, trx);

      movements.push({ out: outResult, in: inResult });
    }

    publish('InventoryTransferred', {
      transferId,
      transferNumber: finalTransferNumber,
      fromWarehouseId,
      toWarehouseId,
      itemCount: validatedItems.length,
      userId,
    });

    return {
      transferId,
      transferNumber: finalTransferNumber,
      itemCount: validatedItems.length,
      movements,
    };
  }

  /**
   * Get a transfer by ID (with items).
   */
  async getTransfer(transferId, trx = null) {
    const conn = this._conn(trx);
    const transfer = await conn('WarehouseTransfers').where({ Id: transferId }).first();
    if (!transfer) throw new NotFoundError(`Transfer ${transferId} not found`);
    const items = await conn('WarehouseTransferItems')
      .where({ TransferId: transferId })
      .join('Ingredients', 'WarehouseTransferItems.IngredientId', 'Ingredients.Id')
      .join('IngredientUnits', 'WarehouseTransferItems.UnitId', 'IngredientUnits.Id')
      .select(
        'WarehouseTransferItems.*',
        'Ingredients.Name as IngredientName', 'Ingredients.Code as IngredientCode',
        'IngredientUnits.Code as UnitCode', 'IngredientUnits.Name as UnitName'
      )
      .orderBy('Ingredients.Name');
    return { transfer, items };
  }

  /**
   * List transfers (filter by status, from, to).
   */
  async listTransfers(filter = {}, limit = 100, trx = null) {
    const conn = this._conn(trx);
    let query = conn('WarehouseTransfers')
      .join('Warehouses as FromWh', 'WarehouseTransfers.FromWarehouseId', 'FromWh.Id')
      .join('Warehouses as ToWh', 'WarehouseTransfers.ToWarehouseId', 'ToWh.Id')
      .select(
        'WarehouseTransfers.*',
        'FromWh.Name as FromWarehouseName',
        'ToWh.Name as ToWarehouseName'
      )
      .orderBy('WarehouseTransfers.CreatedAt', 'desc')
      .limit(limit);
    if (filter.status) query = query.where({ 'WarehouseTransfers.Status': filter.status });
    if (filter.fromWarehouseId) query = query.where({ 'WarehouseTransfers.FromWarehouseId': filter.fromWarehouseId });
    if (filter.toWarehouseId) query = query.where({ 'WarehouseTransfers.ToWarehouseId': filter.toWarehouseId });
    return query;
  }

  /**
   * Record waste (merma) — wrapper around recordMovement with WASTE type.
   * Validates negative quantity and produces a clear audit reference.
   *
   * @param {Object} params
   * @param {number} params.ingredientId
   * @param {number} params.warehouseId
   * @param {number} params.unitId
   * @param {number} params.quantity — POSITIVE number (we negate internally)
   * @param {string} [params.reason] — required short reason
   * @param {string} [params.notes]
   * @param {number} [params.userId]
   * @param {trx} [trx]
   */
  async recordWaste(params, trx = null) {
    const {
      ingredientId, warehouseId, unitId,
      quantity, reason, notes, userId = 0,
    } = params;

    if (!ingredientId) throw new ValidationError('ingredientId is required');
    if (!warehouseId) throw new ValidationError('warehouseId is required');
    if (!unitId) throw new ValidationError('unitId is required');
    if (typeof quantity !== 'number' || quantity <= 0) {
      throw new ValidationError('quantity must be a positive number (it will be negated internally)');
    }
    if (!reason || !reason.trim()) {
      throw new ValidationError('reason is required (short description of waste cause)');
    }

    const ingredient = await this._conn(trx)('Ingredients').where({ Id: ingredientId }).first();
    if (!ingredient) throw new NotFoundError(`Ingredient ${ingredientId} not found`);

    const balance = await this.getStockBalance(ingredientId, warehouseId, trx);
    const available = Number(balance?.Quantity || 0);
    if (available < quantity) {
      throw new ConflictError(
        `Insufficient stock for waste: available ${available}, requested ${quantity}`
      );
    }

    return this.recordMovement({
      ingredientId, warehouseId, unitId,
      movementType: MOVEMENT_TYPES.WASTE,
      quantity: -quantity,  // negative
      unitCost: Number(ingredient.CostPerUnit || 0),
      reference: `WASTE: ${reason}`,
      notes: notes || `Waste recorded: ${reason}`,
      userId,
    }, trx);
  }

  /**
   * Create a physical count session for a warehouse.
   * Seeds the items with current expected quantities from StockBalances.
   *
   * @param {Object} params
   * @param {number} params.warehouseId
   * @param {string} params.name
   * @param {number} [params.userId]
   * @param {trx} [trx]
   */
  async createPhysicalCountSession(params, trx = null) {
    const conn = this._conn(trx);
    const { warehouseId, name, userId = 0 } = params;
    if (!warehouseId) throw new ValidationError('warehouseId is required');
    if (!name || !name.trim()) throw new ValidationError('name is required');

    const wh = await conn('Warehouses').where({ Id: warehouseId }).first();
    if (!wh) throw new NotFoundError(`Warehouse ${warehouseId} not found`);

    const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD

    const [sessionId] = await conn('PhysicalCountSessions').insert({
      Name: name,
      WarehouseId: warehouseId,
      StartDate: today,
      Status: 'OPEN',
      CreatedBy: userId,
    });

    // Seed items with current balances (expected quantity)
    const balances = await conn('StockBalances')
      .where({ WarehouseId: warehouseId })
      .join('Ingredients', 'StockBalances.IngredientId', 'Ingredients.Id')
      .select(
        'StockBalances.IngredientId', 'StockBalances.UnitId',
        'StockBalances.Quantity', 'StockBalances.AverageCost',
        'Ingredients.Name', 'Ingredients.MinimumStock'
      )
      .orderBy('Ingredients.Name');

    let itemCount = 0;
    for (const b of balances) {
      await conn('PhysicalCountItems').insert({
        SessionId: sessionId,
        IngredientId: b.IngredientId,
        UnitId: b.UnitId,
        ExpectedQuantity: Number(b.Quantity),
        CountedQuantity: Number(b.Quantity),  // default: same as expected
        Difference: 0,
        UnitCost: Number(b.AverageCost || 0),
        Adjusted: 0,
      });
      itemCount++;
    }

    return { sessionId, itemCount, name, warehouseId };
  }

  /**
   * Update the counted quantity for an item in a physical count session.
   * Recomputes Difference = Counted - Expected.
   *
   * Idempotent: can be called multiple times — last write wins.
   *
   * @param {number} sessionId
   * @param {number} ingredientId
   * @param {number} countedQuantity
   * @param {string} [notes]
   * @param {trx} [trx]
   */
  async setCountedQuantity(sessionId, ingredientId, countedQuantity, notes = null, trx = null) {
    const conn = this._conn(trx);
    const session = await conn('PhysicalCountSessions').where({ Id: sessionId }).first();
    if (!session) throw new NotFoundError(`Physical count session ${sessionId} not found`);
    if (session.Status !== 'OPEN') {
      throw new ConflictError(`Session ${sessionId} is not OPEN (status: ${session.Status})`);
    }

    const item = await conn('PhysicalCountItems')
      .where({ SessionId: sessionId, IngredientId: ingredientId })
      .first();
    if (!item) {
      throw new NotFoundError(`Ingredient ${ingredientId} not in session ${sessionId}`);
    }

    const expected = Number(item.ExpectedQuantity);
    const counted = Number(countedQuantity);
    const difference = counted - expected;

    await conn('PhysicalCountItems')
      .where({ Id: item.Id })
      .update({
        CountedQuantity: counted,
        Difference: difference,
        Notes: notes || item.Notes,
      });

    return { itemId: item.Id, expected, counted, difference };
  }

  /**
   * Finalize a physical count session.
   *
   * For each item with Difference != 0:
   *   - Record an ADJUSTMENT movement (positive or negative) to align
   *     the stock balance with the counted quantity.
   *   - Mark item as Adjusted=1.
   *
   * Sets session.Status = 'FINALIZED' + FinalizedAt.
   *
   * @param {number} sessionId
   * @param {number} [userId]
   * @param {trx} [trx]
   */
  async finalizePhysicalCountSession(sessionId, userId = 0, trx = null) {
    const conn = this._conn(trx);
    const session = await conn('PhysicalCountSessions').where({ Id: sessionId }).first();
    if (!session) throw new NotFoundError(`Session ${sessionId} not found`);
    if (session.Status !== 'OPEN') {
      throw new ConflictError(`Session ${sessionId} is not OPEN`);
    }

    const items = await conn('PhysicalCountItems').where({ SessionId: sessionId });

    let adjustedCount = 0;
    for (const item of items) {
      const diff = Number(item.Difference);
      if (diff === 0) continue;  // no adjustment needed

      await this.recordMovement({
        ingredientId: item.IngredientId,
        warehouseId: session.WarehouseId,
        unitId: item.UnitId,
        movementType: MOVEMENT_TYPES.ADJUSTMENT,
        quantity: diff,  // positive or negative
        unitCost: Number(item.UnitCost || 0),
        reference: `Physical count session #${sessionId}: ${session.Name}`,
        notes: `Adjustment from physical count: expected ${item.ExpectedQuantity}, counted ${item.CountedQuantity}, diff ${diff}`,
        userId,
      }, trx);

      await conn('PhysicalCountItems').where({ Id: item.Id }).update({ Adjusted: 1 });
      adjustedCount++;
    }

    await conn('PhysicalCountSessions').where({ Id: sessionId }).update({
      Status: 'FINALIZED',
      FinalizedAt: new Date().toISOString(),
      EndDate: new Date().toISOString().slice(0, 10),
    });

    publish('PhysicalCountFinalized', {
      sessionId,
      warehouseId: session.WarehouseId,
      adjustedItems: adjustedCount,
      totalItems: items.length,
      userId,
    });

    return { sessionId, adjustedItems: adjustedCount, totalItems: items.length };
  }

  /**
   * Get a physical count session (with items).
   */
  async getPhysicalCountSession(sessionId, trx = null) {
    const conn = this._conn(trx);
    const session = await conn('PhysicalCountSessions').where({ Id: sessionId }).first();
    if (!session) throw new NotFoundError(`Session ${sessionId} not found`);

    const items = await conn('PhysicalCountItems')
      .where({ SessionId: sessionId })
      .join('Ingredients', 'PhysicalCountItems.IngredientId', 'Ingredients.Id')
      .join('IngredientUnits', 'PhysicalCountItems.UnitId', 'IngredientUnits.Id')
      .select(
        'PhysicalCountItems.*',
        'Ingredients.Name as IngredientName', 'Ingredients.Code as IngredientCode',
        'Ingredients.MinimumStock',
        'IngredientUnits.Code as UnitCode', 'IngredientUnits.Name as UnitName'
      )
      .orderBy('Ingredients.Name');

    return { session, items };
  }

  /**
   * List physical count sessions (filter by warehouseId / status).
   */
  async listPhysicalCountSessions(filter = {}, limit = 100, trx = null) {
    const conn = this._conn(trx);
    let query = conn('PhysicalCountSessions')
      .join('Warehouses', 'PhysicalCountSessions.WarehouseId', 'Warehouses.Id')
      .select(
        'PhysicalCountSessions.*',
        'Warehouses.Name as WarehouseName'
      )
      .orderBy('PhysicalCountSessions.CreatedAt', 'desc')
      .limit(limit);
    if (filter.warehouseId) query = query.where({ 'PhysicalCountSessions.WarehouseId': filter.warehouseId });
    if (filter.status) query = query.where({ 'PhysicalCountSessions.Status': filter.status });
    return query;
  }

  /**
   * Get the kardex (inventory movement ledger) for an ingredient at a warehouse.
   *
   * Returns a chronological list of movements with running balance, plus
   * a summary section with totals by type.
   *
   * This is the canonical "kardex" report used in Latin American POS systems
   * (required by tax authorities in many countries — PE/CO/MX).
   *
   * @param {Object} params
   * @param {number} params.ingredientId
   * @param {number} [params.warehouseId]  — null = all warehouses (consolidated)
   * @param {string} [params.from]          — ISO date (YYYY-MM-DD)
   * @param {string} [params.to]            — ISO date (YYYY-MM-DD)
   * @param {trx} [trx]
   */
  async getKardex(params, trx = null) {
    const conn = this._conn(trx);
    const { ingredientId, warehouseId = null, from = null, to = null } = params;
    if (!ingredientId) throw new ValidationError('ingredientId is required');

    const ingredient = await conn('Ingredients')
      .where({ 'Ingredients.Id': ingredientId })
      .join('IngredientUnits', 'Ingredients.BaseUnitId', 'IngredientUnits.Id')
      .select('Ingredients.*', 'IngredientUnits.Code as BaseUnitCode', 'IngredientUnits.Name as BaseUnitName')
      .first();
    if (!ingredient) throw new NotFoundError(`Ingredient ${ingredientId} not found`);

    let query = conn('StockMovements')
      .where({ IngredientId: ingredientId })
      .join('IngredientUnits', 'StockMovements.UnitId', 'IngredientUnits.Id')
      .leftJoin('Warehouses', 'StockMovements.WarehouseId', 'Warehouses.Id')
      .select(
        'StockMovements.Id', 'StockMovements.MovementType', 'StockMovements.Quantity',
        'StockMovements.UnitCost', 'StockMovements.TotalCost',
        'StockMovements.Reference', 'StockMovements.Notes',
        'StockMovements.CreatedAt', 'StockMovements.TicketId', 'StockMovements.OrderId',
        'StockMovements.WarehouseId',
        'Warehouses.Name as WarehouseName',
        'IngredientUnits.Code as UnitCode'
      )
      .orderBy('StockMovements.CreatedAt', 'asc');

    if (warehouseId) query = query.where({ 'StockMovements.WarehouseId': warehouseId });
    if (from) query = query.whereRaw("date(StockMovements.CreatedAt) >= date(?)", [from]);
    if (to)   query = query.whereRaw("date(StockMovements.CreatedAt) <= date(?)", [to]);

    const movements = await query;

    // Compute running balance
    let running = 0;
    const entries = movements.map(m => {
      running += Number(m.Quantity);
      return {
        id: m.Id,
        date: m.CreatedAt,
        movementType: m.MovementType,
        quantity: Number(m.Quantity),
        unitCost: Number(m.UnitCost || 0),
        totalCost: Number(m.TotalCost || 0),
        reference: m.Reference,
        notes: m.Notes,
        ticketId: m.TicketId,
        orderId: m.OrderId,
        warehouseId: m.WarehouseId,
        warehouseName: m.WarehouseName,
        unitCode: m.UnitCode,
        runningBalance: Math.round(running * 10000) / 10000,
      };
    });

    // Summary by movement type
    const summary = {};
    for (const e of entries) {
      if (!summary[e.movementType]) {
        summary[e.movementType] = { count: 0, totalQuantity: 0, totalCost: 0 };
      }
      summary[e.movementType].count++;
      summary[e.movementType].totalQuantity += e.quantity;
      summary[e.movementType].totalCost += e.totalCost;
    }
    // Round summary
    for (const k of Object.keys(summary)) {
      summary[k].totalQuantity = Math.round(summary[k].totalQuantity * 10000) / 10000;
      summary[k].totalCost = Math.round(summary[k].totalCost * 100) / 100;
    }

    return {
      ingredient: {
        id: ingredient.Id,
        name: ingredient.Name,
        code: ingredient.Code,
        baseUnitCode: ingredient.BaseUnitCode,
        baseUnitName: ingredient.BaseUnitName,
        minimumStock: Number(ingredient.MinimumStock || 0),
        costPerUnit: Number(ingredient.CostPerUnit || 0),
      },
      warehouseId,
      from,
      to,
      currentBalance: Math.round(running * 10000) / 10000,
      movementCount: entries.length,
      entries,
      summary,
    };
  }
}

module.exports = { InventoryService, MOVEMENT_TYPES };
