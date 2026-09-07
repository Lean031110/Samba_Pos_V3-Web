// =====================================================================
// recipes.js — Recipe management routes
// =====================================================================
// Endpoints:
//   GET    /api/recipes                          — list all recipes with cost summary
//   GET    /api/recipes/by-portion/:portionId    — get recipe for a portion
//   GET    /api/recipes/by-menu-item/:menuItemId — get recipes for all portions of a menu item
//   POST   /api/recipes/by-portion/:portionId    — save recipe for a portion
//   GET    /api/recipes/:recipeId/cost           — calculate recipe cost
//   POST   /api/recipes/calc-margin              — calculate margin given cost + price
//   POST   /api/recipes/suggest-price            — suggest price for a target margin
//   DELETE /api/recipes/:recipeId                — deactivate recipe (soft delete)
//   GET    /api/recipes/cost-summary             — cost summary for all menu items
// =====================================================================

const express = require('express');
const { RecipeService } = require('../services/RecipeService');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { withTransaction } = require('../../infrastructure/db/db');

const router = express.Router();
const recipeService = new RecipeService();

// Static routes FIRST (to avoid shadowing by /:recipeId)

// GET /api/recipes — list all recipes with cost summary
router.get('/', requirePermission('manage.inventory'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.menuItemId) filter.menuItemId = parseInt(req.query.menuItemId, 10);
    if (req.query.includeInactive === 'true') filter.includeInactive = true;
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
    const recipes = await recipeService.listRecipes(filter, limit);
    res.json({ data: recipes, count: recipes.length });
  } catch (err) { next(err); }
});

// GET /api/recipes/cost-summary — cost summary for ALL menu items
router.get('/cost-summary', requirePermission('manage.inventory'), async (req, res, next) => {
  try {
    const summary = await recipeService.getCostSummary();
    res.json({ data: summary, count: summary.length });
  } catch (err) { next(err); }
});

// POST /api/recipes/calc-margin — calculate margin given cost + price (requires pos.login)
// Body: { cost: number, price: number }
router.post('/calc-margin', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const { cost, price } = req.body || {};
    if (typeof cost !== 'number') throw new ValidationError('cost must be a number');
    if (typeof price !== 'number') throw new ValidationError('price must be a number');
    const result = recipeService.calculateMargin(cost, price);
    res.json({ data: { cost, price, ...result } });
  } catch (err) { next(err); }
});

// POST /api/recipes/suggest-price — suggest price for a target margin (requires pos.login)
// Body: { cost: number, targetMarginPct: number }
router.post('/suggest-price', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const { cost, targetMarginPct } = req.body || {};
    if (typeof cost !== 'number') throw new ValidationError('cost must be a number');
    if (typeof targetMarginPct !== 'number') throw new ValidationError('targetMarginPct must be a number');
    const suggestedPrice = recipeService.suggestPrice(cost, targetMarginPct);
    res.json({ data: { cost, targetMarginPct, suggestedPrice } });
  } catch (err) { next(err); }
});

// GET /api/recipes/by-portion/:portionId — get full recipe for a portion (requires pos.login)
router.get('/by-portion/:portionId', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const portionId = parseInt(req.params.portionId, 10);
    if (isNaN(portionId)) throw new ValidationError('portionId must be a number');
    const result = await recipeService.getRecipeForPortion(portionId);
    // Add cost calculation if a recipe exists
    if (result.recipe) {
      result.cost = await recipeService.calculateRecipeCost(result.recipe.Id);
      const marginInfo = recipeService.calculateMargin(result.cost, result.price);
      result.margin = marginInfo.margin;
      result.marginPct = marginInfo.marginPct;
      result.markupPct = marginInfo.markupPct;
    } else {
      result.cost = 0;
      result.margin = result.price;
      result.marginPct = result.price > 0 ? 100 : 0;
      result.markupPct = 0;
    }
    res.json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/recipes/by-menu-item/:menuItemId — get recipes for all portions of a menu item (requires pos.login)
router.get('/by-menu-item/:menuItemId', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const menuItemId = parseInt(req.params.menuItemId, 10);
    if (isNaN(menuItemId)) throw new ValidationError('menuItemId must be a number');
    const result = await recipeService.getRecipesForMenuItem(menuItemId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/recipes/by-portion/:portionId — save recipe for a portion
router.post('/by-portion/:portionId',
  requirePermission('manage.inventory'),
  auditLog('recipe.save', 'Recipe'),
  async (req, res, next) => {
    try {
      const portionId = parseInt(req.params.portionId, 10);
      if (isNaN(portionId)) throw new ValidationError('portionId must be a number');
      const { items, fixedCost } = req.body || {};
      const result = await withTransaction(async (trx) => {
        return recipeService.saveRecipeWithCost(portionId, items || [], fixedCost || 0, trx);
      });
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  });

// GET /api/recipes/:recipeId/cost — calculate cost for a specific recipe (requires pos.login)
router.get('/:recipeId/cost', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.recipeId, 10);
    if (isNaN(recipeId)) throw new ValidationError('recipeId must be a number');
    const cost = await recipeService.calculateRecipeCost(recipeId);
    res.json({ data: { recipeId, totalCost: cost } });
  } catch (err) { next(err); }
});

// DELETE /api/recipes/:recipeId — deactivate recipe (soft delete)
router.delete('/:recipeId',
  requirePermission('manage.inventory'),
  auditLog('recipe.deactivate', 'Recipe'),
  async (req, res, next) => {
    try {
      const recipeId = parseInt(req.params.recipeId, 10);
      if (isNaN(recipeId)) throw new ValidationError('recipeId must be a number');
      const result = await recipeService.deactivateRecipe(recipeId);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

module.exports = router;
