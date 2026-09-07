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
