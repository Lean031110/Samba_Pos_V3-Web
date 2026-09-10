// =====================================================================
// RecipeService.js — Recipe cost, margin, and suggested price calculation
// =====================================================================
// FASE 5 (Batch 3) — Real recipe administration.
//
// Responsibilities:
//   - getRecipeForPortion(portionId)  — full recipe with ingredients + units
//   - getRecipeForMenuItem(menuItemId) — aggregate across all portions
//   - calculateRecipeCost(recipe)    — sum of (quantity × unit cost) per ingredient
//   - calculateMargin(cost, price)   — gross margin + margin percentage
//   - suggestPrice(cost, margin%)    — what price should we charge?
//   - listRecipes(filter)            — paginated list with cost summary
//   - saveRecipeWithCost(portionId, items, fixedCost) — atomic save + recompute
//
// Cost model:
//   recipeCost = sum over RecipeItems of (item.Quantity × ingredient.CostPerUnit)
   //             + recipe.FixedCost (labor/packaging fixed cost)
//   portionPrice = MenuItemPrices.Price for that portion
//   margin = portionPrice - recipeCost
//   marginPct = margin / portionPrice × 100
//
// All methods are transaction-aware.
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { InventoryService } = require('./InventoryService');

const inventoryService = new InventoryService();

class RecipeService {
  _conn(trx) { return trx || db; }

  /**
   * Get the full recipe for a menu item portion, including ingredient
   * details and unit info for display.
   *
   * @param {number} menuItemPortionId
   * @param {trx} [trx]
   * @returns {Promise<{recipe, items, portion, menuItem, price}>}
   */
  async getRecipeForPortion(menuItemPortionId, trx = null) {
    const conn = this._conn(trx);
    const portion = await conn('MenuItemPortions')
      .where({ Id: menuItemPortionId })
      .first();
    if (!portion) throw new NotFoundError(`MenuItemPortion ${menuItemPortionId} not found`);

    const menuItem = await conn('MenuItems')
      .where({ Id: portion.MenuItemId })
      .first();
    if (!menuItem) throw new NotFoundError(`MenuItem ${portion.MenuItemId} not found`);

    const priceRow = await conn('MenuItemPrices')
      .where({ MenuItemPortionId: menuItemPortionId })
      .first();
    const price = priceRow ? Number(priceRow.Price) : 0;

    const { recipe, items } = await inventoryService.getRecipe(menuItemPortionId, trx);

    return { recipe, items, portion, menuItem, price };
  }

  /**
   * Get all recipes for a menu item (across all its portions).
   * Each portion can have its own recipe.
   *
   * @param {number} menuItemId
   * @param {trx} [trx]
   * @returns {Promise<Array<{portion, recipe, items, price, cost, margin, marginPct}>>}
   */
  async getRecipesForMenuItem(menuItemId, trx = null) {
    const conn = this._conn(trx);
    const menuItem = await conn('MenuItems').where({ Id: menuItemId }).first();
    if (!menuItem) throw new NotFoundError(`MenuItem ${menuItemId} not found`);

    const portions = await conn('MenuItemPortions')
      .where({ MenuItemId: menuItemId })
      .orderBy('Name');

    const result = [];
    for (const portion of portions) {
      const priceRow = await conn('MenuItemPrices')
        .where({ MenuItemPortionId: portion.Id })
        .first();
      const price = priceRow ? Number(priceRow.Price) : 0;
      const { recipe, items } = await inventoryService.getRecipe(portion.Id, trx);
      const cost = recipe ? await this.calculateRecipeCost(recipe.Id, trx) : 0;
      const margin = price - cost;
      const marginPct = price > 0 ? (margin / price) * 100 : 0;
      result.push({
        portion: { Id: portion.Id, Name: portion.Name, Multiplier: Number(portion.Multiplier || 1) },
        recipe: recipe ? { Id: recipe.Id, FixedCost: Number(recipe.FixedCost || 0), IsActive: recipe.IsActive } : null,
        items,
        price,
        cost,
        margin,
        marginPct: Math.round(marginPct * 100) / 100,
        hasRecipe: !!recipe,
      });
    }
    return { menuItem, portions: result };
  }

  /**
   * Calculate the total cost of a recipe.
   *
   * For each RecipeItem, the quantity is converted from RecipeItem.UnitId
   * to the ingredient's BaseUnitId using the UnitConversions table.
   * Only after conversion do we multiply by CostPerUnit (which is in
   * base-unit currency).
   *
   * cost = Σ (convertedQty × ingredient.CostPerUnit) + recipe.FixedCost
   *
   * @param {number} recipeId
   * @param {trx} [trx]
   * @returns {Promise<number>} total cost (rounded to 4 decimal places)
   */
  async calculateRecipeCost(recipeId, trx = null) {
    const conn = this._conn(trx);
    const recipe = await conn('Recipes').where({ Id: recipeId }).first();
    if (!recipe) throw new NotFoundError(`Recipe ${recipeId} not found`);

    const items = await conn('RecipeItems')
      .where({ RecipeId: recipeId })
      .join('Ingredients', 'RecipeItems.IngredientId', 'Ingredients.Id')
      .select(
        'RecipeItems.Quantity',
        'RecipeItems.UnitId as RecipeUnitId',
        'Ingredients.CostPerUnit',
        'Ingredients.BaseUnitId',
        'Ingredients.Name as IngredientName'
      );

    let totalCost = 0;
    for (const item of items) {
      const qty = Number(item.Quantity || 0);
      const cost = Number(item.CostPerUnit || 0);
      // Convert the recipe quantity from RecipeUnitId to BaseUnitId.
      // If units are the same, this is a no-op.
      const convertedQty = await inventoryService.convertQuantity(
        qty,
        item.RecipeUnitId,
        item.BaseUnitId,
        trx
      );
      totalCost += convertedQty * cost;
    }
    totalCost += Number(recipe.FixedCost || 0);
    return Math.round(totalCost * 10000) / 10000;  // 4 decimal places
  }

  /**
   * Calculate margin given cost and price.
   * @param {number} cost
   * @param {number} price
   * @returns {{margin: number, marginPct: number, markupPct: number}}
   */
  calculateMargin(cost, price) {
    const c = Number(cost || 0);
    const p = Number(price || 0);
    const margin = p - c;
    const marginPct = p > 0 ? (margin / p) * 100 : 0;
    const markupPct = c > 0 ? (margin / c) * 100 : 0;
    return {
      margin: Math.round(margin * 100) / 100,
      marginPct: Math.round(marginPct * 100) / 100,
      markupPct: Math.round(markupPct * 100) / 100,
    };
  }

  /**
   * Suggest a price given target margin percentage.
   *
   * price = cost / (1 - marginPct/100)
   *
   * @param {number} cost
   * @param {number} targetMarginPct — e.g., 65 for 65% margin
   * @returns {number} suggested price (rounded to 2 decimal places)
   */
  suggestPrice(cost, targetMarginPct) {
    const c = Number(cost || 0);
    const m = Number(targetMarginPct || 0);
    if (m >= 100) throw new ValidationError('targetMarginPct must be less than 100');
    if (m < 0) throw new ValidationError('targetMarginPct must be >= 0');
    const price = c / (1 - m / 100);
    return Math.round(price * 100) / 100;
  }

  /**
   * Save a recipe with explicit cost data. Wraps the inventoryService.saveRecipe
   * and returns the freshly-computed cost summary.
   *
   * @param {number} menuItemPortionId
   * @param {Array<{ingredientId, quantity, unitId}>} items
   * @param {number} fixedCost
   * @param {trx} [trx]
   * @returns {Promise<{recipeId, itemCount, totalCost, fixedCost}>}
   */
  async saveRecipeWithCost(menuItemPortionId, items, fixedCost = 0, trx = null) {
    const conn = this._conn(trx);
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    if (items.length === 0 && fixedCost === 0) {
      throw new ValidationError('Recipe must have at least one item or a non-zero fixedCost');
    }

    // Validate each item
    for (const item of items) {
      if (!item.ingredientId) throw new ValidationError('each item must have ingredientId');
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new ValidationError('each item quantity must be a positive number');
      }
      if (!item.unitId) throw new ValidationError('each item must have unitId');
    }

    const { recipeId, itemCount } = await inventoryService.saveRecipe(
      menuItemPortionId, items, fixedCost, trx
    );

    const totalCost = await this.calculateRecipeCost(recipeId, trx);

    return {
      recipeId,
      itemCount,
      fixedCost: Number(fixedCost),
      totalCost,
    };
  }

  /**
   * List all recipes with their cost summary. Used by the admin UI.
   *
   * @param {Object} [filter]
   * @param {number} [filter.menuItemId]
   * @param {number} [limit=100]
   * @param {trx} [trx]
   * @returns {Promise<Array>}
   */
  async listRecipes(filter = {}, limit = 100, trx = null) {
    const conn = this._conn(trx);
    let query = conn('Recipes')
      .join('MenuItemPortions', 'Recipes.MenuItemPortionId', 'MenuItemPortions.Id')
      .join('MenuItems', 'MenuItemPortions.MenuItemId', 'MenuItems.Id')
      .leftJoin('MenuItemPrices', 'MenuItemPortions.Id', 'MenuItemPrices.MenuItemPortionId')
      .select(
        'Recipes.Id as RecipeId',
        'Recipes.FixedCost',
        'Recipes.IsActive',
        'Recipes.MenuItemPortionId',
        'MenuItemPortions.Name as PortionName',
        'MenuItemPortions.Multiplier as PortionMultiplier',
        'MenuItems.Id as MenuItemId',
        'MenuItems.Name as MenuItemName',
        'MenuItems.GroupCode as MenuItemGroupCode',
        'MenuItemPrices.Price as PortionPrice'
      )
      .orderBy('MenuItems.Name')
      .orderBy('MenuItemPortions.Name')
      .limit(limit);

    if (filter.menuItemId) {
      query = query.where({ 'MenuItems.Id': filter.menuItemId });
    }
    if (filter.includeInactive !== true) {
      query = query.where({ 'Recipes.IsActive': 1 });
    }

    const rows = await query;
    const result = [];
    for (const row of rows) {
      const cost = await this.calculateRecipeCost(row.RecipeId, trx);
      const price = Number(row.PortionPrice || 0);
      const marginInfo = this.calculateMargin(cost, price);
      result.push({
        recipeId: row.RecipeId,
        menuItemPortionId: row.MenuItemPortionId,
        menuItemId: row.MenuItemId,
        menuItemName: row.MenuItemName,
        menuItemGroupCode: row.MenuItemGroupCode,
        portionName: row.PortionName,
        portionMultiplier: Number(row.PortionMultiplier || 1),
        fixedCost: Number(row.FixedCost || 0),
        isActive: row.IsActive,
        price,
        cost,
        margin: marginInfo.margin,
        marginPct: marginInfo.marginPct,
        markupPct: marginInfo.markupPct,
      });
    }
    return result;
  }

  /**
   * Deactivate a recipe (soft delete — keeps history for audit).
   * @param {number} recipeId
   * @param {trx} [trx]
   */
  async deactivateRecipe(recipeId, trx = null) {
    const conn = this._conn(trx);
    const recipe = await conn('Recipes').where({ Id: recipeId }).first();
    if (!recipe) throw new NotFoundError(`Recipe ${recipeId} not found`);
    await conn('Recipes').where({ Id: recipeId }).update({ IsActive: 0 });
    return { recipeId, isActive: false };
  }

  // ===================================================================
  // BLOQUE D — Versionado de recetas
  // ===================================================================

  /**
   * Save a new version of a recipe.
   *
   * Flow:
   *   1. Snapshot current RecipeItems as JSON (for audit)
   *   2. Create RecipeVersions row with next VersionNumber
   *   3. Update Recipes.ActiveVersionId to the new version
   *   4. Replace RecipeItems with the new ones (tagged with VersionId)
   *
   * This means each version's items are preserved as a snapshot in
   * RecipeVersions.Snapshot (JSON), and the live items in RecipeItems
   * always reflect the active version.
   *
   * @param {number} menuItemPortionId
   * @param {Array<{ingredientId, quantity, unitId}>} items
   * @param {number} fixedCost
   * @param {string} [label] — optional human-readable label 'v2 — sin cebolla'
   * @param {number} [userId]
   * @param {trx} [trx]
   */
  async saveRecipeVersion(menuItemPortionId, items, fixedCost = 0, label = null, userId = 0, trx = null) {
    const conn = this._conn(trx);
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    if (items.length === 0 && fixedCost === 0) {
      throw new ValidationError('Recipe must have at least one item or a non-zero fixedCost');
    }
    for (const item of items) {
      if (!item.ingredientId) throw new ValidationError('each item must have ingredientId');
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new ValidationError('each item quantity must be a positive number');
      }
      if (!item.unitId) throw new ValidationError('each item must have unitId');
    }

    // Find the recipe (or create one if missing)
    let recipe = await conn('Recipes').where({ MenuItemPortionId: menuItemPortionId, IsActive: 1 }).first();
    if (!recipe) {
      const [newRecipeId] = await conn('Recipes').insert({
        MenuItemPortionId: menuItemPortionId, FixedCost: fixedCost, IsActive: 1,
      });
      recipe = await conn('Recipes').where({ Id: newRecipeId }).first();
    }

    // Compute next version number
    const lastVersion = await conn('RecipeVersions')
      .where({ RecipeId: recipe.Id })
      .orderBy('VersionNumber', 'desc')
      .first();
    const nextVersionNumber = (lastVersion?.VersionNumber || 0) + 1;

    // Snapshot of current items (BEFORE we replace them) — only meaningful for v2+
    // For v1 there are no prior items, so the snapshot is just the new items.
    const snapshot = JSON.stringify({
      items: items.map(i => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity,
        unitId: i.unitId,
      })),
      fixedCost,
      label,
      userId,
    });

    // Create the version row
    const [versionId] = await conn('RecipeVersions').insert({
      RecipeId: recipe.Id,
      VersionNumber: nextVersionNumber,
      Label: label || `v${nextVersionNumber}`,
      Snapshot: snapshot,
      CreatedBy: userId,
    });

    // Delete existing RecipeItems (we replace with new version-tagged items)
    await conn('RecipeItems').where({ RecipeId: recipe.Id }).del();

    // Insert new items tagged with VersionId
    for (const item of items) {
      await conn('RecipeItems').insert({
        RecipeId: recipe.Id,
        IngredientId: item.ingredientId,
        Quantity: item.quantity,
        UnitId: item.unitId,
        VersionId: versionId,
      });
    }

    // Update recipe's active version + fixed cost
    await conn('Recipes').where({ Id: recipe.Id }).update({
      ActiveVersionId: versionId,
      FixedCost: fixedCost,
    });

    const totalCost = await this.calculateRecipeCost(recipe.Id, trx);

    return {
      recipeId: recipe.Id,
      versionId,
      versionNumber: nextVersionNumber,
      label: label || `v${nextVersionNumber}`,
      itemCount: items.length,
      fixedCost: Number(fixedCost),
      totalCost,
    };
  }

  /**
   * Get the full version history of a recipe.
   *
   * @param {number} menuItemPortionId
   * @param {trx} [trx]
   */
  async getRecipeVersions(menuItemPortionId, trx = null) {
    const conn = this._conn(trx);
    const recipe = await conn('Recipes').where({ MenuItemPortionId: menuItemPortionId, IsActive: 1 }).first();
    if (!recipe) return { recipe: null, versions: [] };

    const versions = await conn('RecipeVersions')
      .where({ RecipeId: recipe.Id })
      .leftJoin('Users', 'RecipeVersions.CreatedBy', 'Users.Id')
      .select(
        'RecipeVersions.Id', 'RecipeVersions.VersionNumber', 'RecipeVersions.Label',
        'RecipeVersions.Snapshot', 'RecipeVersions.CreatedAt',
        'Users.Name as CreatedByName'
      )
      .orderBy('RecipeVersions.VersionNumber', 'desc');

    return {
      recipe: { Id: recipe.Id, ActiveVersionId: recipe.ActiveVersionId, FixedCost: recipe.FixedCost },
      activeVersionId: recipe.ActiveVersionId,
      versions: versions.map(v => ({
        id: v.Id,
        versionNumber: v.VersionNumber,
        label: v.Label,
        snapshot: v.Snapshot ? JSON.parse(v.Snapshot) : null,
        createdAt: v.CreatedAt,
        createdByName: v.CreatedByName,
        isActive: v.Id === recipe.ActiveVersionId,
      })),
    };
  }

  /**
   * Restore a previous version: copies its snapshot into a NEW version
   * and makes that the active one. The original version is preserved
   * as-is (audit integrity — versions are immutable).
   *
   * @param {number} menuItemPortionId
   * @param {number} versionId
   * @param {string} [label]
   * @param {number} [userId]
   * @param {trx} [trx]
   */
  async restoreVersion(menuItemPortionId, versionId, label = null, userId = 0, trx = null) {
    const conn = this._conn(trx);
    const recipe = await conn('Recipes').where({ MenuItemPortionId: menuItemPortionId, IsActive: 1 }).first();
    if (!recipe) throw new NotFoundError(`Recipe for portion ${menuItemPortionId} not found`);
    const version = await conn('RecipeVersions').where({ Id: versionId, RecipeId: recipe.Id }).first();
    if (!version) throw new NotFoundError(`Version ${versionId} not found in recipe ${recipe.Id}`);

    const snapshot = JSON.parse(version.Snapshot || '{}');
    if (!Array.isArray(snapshot.items)) {
      throw new ValidationError('Version snapshot is malformed — cannot restore');
    }

    return this.saveRecipeVersion(
      menuItemPortionId,
      snapshot.items,
      snapshot.fixedCost || 0,
      label || `Restored from v${version.VersionNumber}`,
      userId,
      trx
    );
  }

  /**
   * Get a cost summary for ALL menu items — used by the admin dashboard
   * to surface high-level profitability.
   *
   * @param {trx} [trx]
   * @returns {Promise<Array<{menuItemId, menuItemName, groupCode, portions: [{portionName, price, cost, margin, marginPct}]}>>}
   */
  async getCostSummary(trx = null) {
    const conn = this._conn(trx);
    const menuItems = await conn('MenuItems').orderBy('GroupCode').orderBy('Name');
    const summary = [];
    for (const mi of menuItems) {
      const recipes = await this.getRecipesForMenuItem(mi.Id, trx);
      summary.push({
        menuItemId: mi.Id,
        menuItemName: mi.Name,
        groupCode: mi.GroupCode,
        portions: recipes.portions.map(p => ({
          portionName: p.portion.Name,
          price: p.price,
          cost: p.cost,
          margin: p.margin,
          marginPct: p.marginPct,
          hasRecipe: p.hasRecipe,
        })),
      });
    }
    return summary;
  }
}

module.exports = { RecipeService };
