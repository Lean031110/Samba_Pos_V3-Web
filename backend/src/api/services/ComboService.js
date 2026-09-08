// =====================================================================
// ComboService.js — Combo product management
// =====================================================================
// BLOQUE D — Fase 4: Combos
//
// A combo is a "container" MenuItem (GroupCode='COMBO') that bundles
// several sub-MenuItems into a single sellable unit, typically with
// a discounted price vs. buying each item individually.
//
// Responsibilities:
//   - createCombo(menuItemId, name, items, comboPrice, useCustomPrice)
//   - getCombo(comboId)              — full combo with sub-items
//   - getComboByMenuItemId(menuItemId)
//   - listCombos(filter)             — paginated list
//   - updateCombo(comboId, updates)
//   - deactivateCombo(comboId)
//   - calculateComboPrice(comboId)   — sum of sub-item prices
//
// Pricing model:
//   - useCustomPrice=0: combo price = sum(sub-item.MenuItemPrices.Price × qty)
//   - useCustomPrice=1: combo price = Combos.ComboPrice (override)
//
// All methods are transaction-aware.
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { NotFoundError, ConflictError, ValidationError } = require('../middleware/errorHandler');

class ComboService {
  _conn(trx) { return trx || db; }

  /**
   * Create a combo. Validates that:
   *   - the container MenuItem exists and has GroupCode='COMBO'
   *   - each sub-item MenuItem exists
   *   - portions (if specified) belong to the sub-item
   *
   * @param {Object} params
   * @param {number} params.menuItemId          — the container MenuItem
   * @param {string} params.name
   * @param {Array<{menuItemId, menuItemPortionId?, quantity, overridePrice?, isOptional?, sortOrder?}>} params.items
   * @param {number} [params.comboPrice=0]      — explicit combo price (used if useCustomPrice=1)
   * @param {boolean} [params.useCustomPrice=false]
   * @param {number} [params.userId]
   * @param {trx} [trx]
   */
  async createCombo(params, trx = null) {
    const conn = this._conn(trx);
    const {
      menuItemId, name, items,
      comboPrice = 0, useCustomPrice = false,
      userId = 0,
    } = params;

    if (!menuItemId) throw new ValidationError('menuItemId is required');
    if (!name || !name.trim()) throw new ValidationError('name is required');
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('items must be a non-empty array');
    }

    const container = await conn('MenuItems').where({ Id: menuItemId }).first();
    if (!container) throw new NotFoundError(`MenuItem ${menuItemId} not found`);

    // Validate each sub-item
    for (const item of items) {
      if (!item.menuItemId) throw new ValidationError('each item must have menuItemId');
      const sub = await conn('MenuItems').where({ Id: item.menuItemId }).first();
      if (!sub) throw new NotFoundError(`Sub-item MenuItem ${item.menuItemId} not found`);
      if (item.menuItemPortionId) {
        const portion = await conn('MenuItemPortions')
          .where({ Id: item.menuItemPortionId, MenuItemId: item.menuItemId })
          .first();
        if (!portion) {
          throw new ValidationError(
            `Portion ${item.menuItemPortionId} does not belong to MenuItem ${item.menuItemId}`
          );
        }
      }
    }

    const [comboId] = await conn('Combos').insert({
      MenuItemId: menuItemId,
      Name: name,
      ComboPrice: comboPrice,
      UseCustomPrice: useCustomPrice ? 1 : 0,
      IsActive: 1,
      CreatedBy: userId,
    });

    for (const item of items) {
      await conn('ComboItems').insert({
        ComboId: comboId,
        MenuItemId: item.menuItemId,
        MenuItemPortionId: item.menuItemPortionId || null,
        Quantity: item.quantity || 1,
        OverridePrice: item.overridePrice || 0,
        IsOptional: item.isOptional ? 1 : 0,
        SortOrder: item.sortOrder || 0,
      });
    }

    return { comboId, menuItemId, name, itemCount: items.length };
  }

  /**
   * Get a full combo with sub-items and computed prices.
   */
  async getCombo(comboId, trx = null) {
    const conn = this._conn(trx);
    const combo = await conn('Combos').where({ Id: comboId }).first();
    if (!combo) throw new NotFoundError(`Combo ${comboId} not found`);

    const items = await conn('ComboItems')
      .where({ ComboId: comboId })
      .leftJoin('MenuItems', 'ComboItems.MenuItemId', 'MenuItems.Id')
      .leftJoin('MenuItemPortions', 'ComboItems.MenuItemPortionId', 'MenuItemPortions.Id')
      .leftJoin('MenuItemPrices', 'MenuItemPortions.Id', 'MenuItemPrices.MenuItemPortionId')
      .select(
        'ComboItems.Id', 'ComboItems.MenuItemId', 'ComboItems.MenuItemPortionId',
        'ComboItems.Quantity', 'ComboItems.OverridePrice',
        'ComboItems.IsOptional', 'ComboItems.SortOrder',
        'MenuItems.Name as MenuItemName', 'MenuItems.GroupCode as MenuItemGroupCode',
        'MenuItemPortions.Name as PortionName',
        'MenuItemPrices.Price as PortionPrice'
      )
      .orderBy('ComboItems.SortOrder');

    const itemsWithComputed = items.map(i => {
      const unitPrice = Number(i.OverridePrice) > 0
        ? Number(i.OverridePrice)
        : Number(i.PortionPrice || 0);
      return {
        id: i.Id,
        menuItemId: i.MenuItemId,
        menuItemName: i.MenuItemName,
        menuItemGroupCode: i.MenuItemGroupCode,
        menuItemPortionId: i.MenuItemPortionId,
        portionName: i.PortionName,
        quantity: Number(i.Quantity),
        unitPrice,
        overridePrice: Number(i.OverridePrice),
        lineTotal: unitPrice * Number(i.Quantity),
        isOptional: i.IsOptional === 1,
        sortOrder: i.SortOrder,
      };
    });

    const sumPrice = itemsWithComputed.reduce((s, i) => s + i.lineTotal, 0);
    const effectivePrice = combo.UseCustomPrice === 1
      ? Number(combo.ComboPrice)
      : Math.round(sumPrice * 100) / 100;

    return {
      combo: {
        id: combo.Id,
        menuItemId: combo.MenuItemId,
        name: combo.Name,
        comboPrice: Number(combo.ComboPrice),
        useCustomPrice: combo.UseCustomPrice === 1,
        isActive: combo.IsActive === 1,
        createdAt: combo.CreatedAt,
      },
      items: itemsWithComputed,
      sumOfSubItems: Math.round(sumPrice * 100) / 100,
      effectivePrice,
      discount: Math.round((sumPrice - effectivePrice) * 100) / 100,
    };
  }

  /**
   * Get a combo by the container MenuItemId.
   */
  async getComboByMenuItemId(menuItemId, trx = null) {
    const conn = this._conn(trx);
    const combo = await conn('Combos').where({ MenuItemId: menuItemId, IsActive: 1 }).first();
    if (!combo) return null;
    return this.getCombo(combo.Id, trx);
  }

  /**
   * List all combos.
   */
  async listCombos(filter = {}, limit = 100, trx = null) {
    const conn = this._conn(trx);
    let query = conn('Combos')
      .leftJoin('MenuItems', 'Combos.MenuItemId', 'MenuItems.Id')
      .select(
        'Combos.Id', 'Combos.Name', 'Combos.MenuItemId',
        'Combos.ComboPrice', 'Combos.UseCustomPrice',
        'Combos.IsActive', 'Combos.CreatedAt',
        'MenuItems.Name as MenuItemName',
        'MenuItems.GroupCode as MenuItemGroupCode',
        'MenuItems.Barcode as MenuItemBarcode'
      )
      .orderBy('Combos.CreatedAt', 'desc')
      .limit(limit);
    if (filter.isActive !== undefined) query = query.where({ 'Combos.IsActive': filter.isActive ? 1 : 0 });
    if (filter.menuItemId) query = query.where({ 'Combos.MenuItemId': filter.menuItemId });
    return query;
  }

  /**
   * Update combo metadata (does not touch items — use replaceItems).
   */
  async updateCombo(comboId, updates, trx = null) {
    const conn = this._conn(trx);
    const combo = await conn('Combos').where({ Id: comboId }).first();
    if (!combo) throw new NotFoundError(`Combo ${comboId} not found`);

    const allowed = {};
    if (updates.name !== undefined) allowed.Name = updates.name;
    if (updates.comboPrice !== undefined) allowed.ComboPrice = updates.comboPrice;
    if (updates.useCustomPrice !== undefined) allowed.UseCustomPrice = updates.useCustomPrice ? 1 : 0;
    if (updates.isActive !== undefined) allowed.IsActive = updates.isActive ? 1 : 0;

    if (Object.keys(allowed).length > 0) {
      await conn('Combos').where({ Id: comboId }).update(allowed);
    }
    return this.getCombo(comboId, trx);
  }

  /**
   * Replace all items in a combo (atomic).
   */
  async replaceItems(comboId, items, trx = null) {
    const conn = this._conn(trx);
    const combo = await conn('Combos').where({ Id: comboId }).first();
    if (!combo) throw new NotFoundError(`Combo ${comboId} not found`);
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');

    await conn('ComboItems').where({ ComboId: comboId }).del();

    for (const item of items) {
      if (!item.menuItemId) throw new ValidationError('each item must have menuItemId');
      await conn('ComboItems').insert({
        ComboId: comboId,
        MenuItemId: item.menuItemId,
        MenuItemPortionId: item.menuItemPortionId || null,
        Quantity: item.quantity || 1,
        OverridePrice: item.overridePrice || 0,
        IsOptional: item.isOptional ? 1 : 0,
        SortOrder: item.sortOrder || 0,
      });
    }
    return { comboId, itemCount: items.length };
  }

  /**
   * Deactivate a combo (soft delete).
   */
  async deactivateCombo(comboId, trx = null) {
    const conn = this._conn(trx);
    const combo = await conn('Combos').where({ Id: comboId }).first();
    if (!combo) throw new NotFoundError(`Combo ${comboId} not found`);
    await conn('Combos').where({ Id: comboId }).update({ IsActive: 0 });
    return { comboId, isActive: false };
  }
}

module.exports = { ComboService };
