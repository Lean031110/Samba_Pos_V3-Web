// =====================================================================
// ProductRepository.js
// =====================================================================
// Mirrors: Samba.Persistance/Implementations/CacheDao.cs (menu-related)
//          Samba.Services/Implementations/CacheService.cs (GetMenuItem,
//           GetMenuItemPortion, GetTaxTemplates, etc.)
//
// Methods implemented:
//   - getMenuItems()                            (CacheDao.GetMenuItems)
//   - getMenuItemById(id)                       (CacheService.GetMenuItem)
//   - getMenuItemByBarcode(barcode)             (CacheService.FindMenuItemByBarcode)
//   - getMenuItemsByGroupCode(groupCode)        (CacheService.GetMenuItemsByGroupCode)
//   - getMenuItemPortion(menuItemId, name)      (CacheService.GetMenuItemPortion)
//   - getMenuItemGroupCodes()                   (MenuService.GetMenuItemGroupCodes)
//   - getScreenMenu(id)                         (MenuService.GetScreenMenu)
//   - getScreenMenuCategories(screenMenuId)     (MenuService.GetScreenMenuCategories)
//   - getScreenMenuItems(categoryId, pageNo)    (ScreenMenuCategory.GetScreenMenuItems)
//   - getTaxTemplates(menuItemId)               (ApplicationState.GetTaxTemplates)
// =====================================================================

const { db } = require('../db/db');

class ProductRepository {
  /**
   * Get all menu items (with portions + prices preloaded).
   * @returns {Promise<Array>}
   */
  async getMenuItems() {
    const items = await db('MenuItems').orderBy('Name');
    if (items.length === 0) return [];

    const itemIds = items.map(i => i.Id);
    const portions = await db('MenuItemPortions').whereIn('MenuItemId', itemIds);
    const portionIds = portions.map(p => p.Id);
    const prices = portionIds.length > 0
      ? await db('MenuItemPrices').whereIn('MenuItemPortionId', portionIds)
      : [];

    const pricesByPortion = {};
    for (const p of prices) {
      if (!pricesByPortion[p.MenuItemPortionId]) pricesByPortion[p.MenuItemPortionId] = [];
      pricesByPortion[p.MenuItemPortionId].push(p);
    }
    const portionsByItem = {};
    for (const p of portions) {
      if (!portionsByItem[p.MenuItemId]) portionsByItem[p.MenuItemId] = [];
      p.Prices = pricesByPortion[p.Id] || [];
      portionsByItem[p.MenuItemId].push(p);
    }

    return items.map(i => ({
      ...i,
      Portions: portionsByItem[i.Id] || [],
    }));
  }

  /**
   * Get a single menu item by Id, with portions + prices preloaded.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getMenuItemById(id) {
    const item = await db('MenuItems').where({ Id: id }).first();
    if (!item) return null;

    const portions = await db('MenuItemPortions').where({ MenuItemId: id });
    const portionIds = portions.map(p => p.Id);
    const prices = portionIds.length > 0
      ? await db('MenuItemPrices').whereIn('MenuItemPortionId', portionIds)
      : [];

    const pricesByPortion = {};
    for (const p of prices) {
      if (!pricesByPortion[p.MenuItemPortionId]) pricesByPortion[p.MenuItemPortionId] = [];
      pricesByPortion[p.MenuItemPortionId].push(p);
    }

    item.Portions = portions.map(p => ({
      ...p,
      Prices: pricesByPortion[p.Id] || [],
    }));

    return item;
  }

  /**
   * Find a menu item by barcode.
   * @param {string} barcode
   * @returns {Promise<Object|null>}
   */
  async getMenuItemByBarcode(barcode) {
    const item = await db('MenuItems').where({ Barcode: barcode }).first();
    return item ? this.getMenuItemById(item.Id) : null;
  }

  /**
   * Get all menu items in a given group code.
   * @param {string} groupCode
   * @returns {Promise<Array>}
   */
  async getMenuItemsByGroupCode(groupCode) {
    const items = await db('MenuItems').where({ GroupCode: groupCode }).orderBy('Name');
    if (items.length === 0) return [];
    const itemIds = items.map(i => i.Id);
    const portions = await db('MenuItemPortions').whereIn('MenuItemId', itemIds);
    const portionsByItem = {};
    for (const p of portions) {
      if (!portionsByItem[p.MenuItemId]) portionsByItem[p.MenuItemId] = [];
      portionsByItem[p.MenuItemId].push(p);
    }
    return items.map(i => ({ ...i, Portions: portionsByItem[i.Id] || [] }));
  }

  /**
   * Get a specific portion by name for a menu item.
   * Source: CacheService.GetMenuItemPortion — returns FIRST portion if name not found.
   *
   * @param {number} menuItemId
   * @param {string|null} portionName
   * @returns {Promise<Object|null>}
   */
  async getMenuItemPortion(menuItemId, portionName) {
    const portions = await db('MenuItemPortions').where({ MenuItemId: menuItemId });
    if (portions.length === 0) return null;
    if (!portionName) return portions[0];
    const exact = portions.find(p => p.Name === portionName);
    if (exact) {
      const prices = await db('MenuItemPrices').where({ MenuItemPortionId: exact.Id });
      exact.Prices = prices;
    }
    return exact || portions[0];
  }

  /**
   * Get all distinct group codes used by menu items.
   * @returns {Promise<string[]>}
   */
  async getMenuItemGroupCodes() {
    const rows = await db('MenuItems').distinct('GroupCode').whereNotNull('GroupCode');
    return rows.map(r => r.GroupCode);
  }

  /**
   * Get a ScreenMenu with all its categories + items.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getScreenMenu(id) {
    const menu = await db('ScreenMenus').where({ Id: id }).first();
    if (!menu) return null;
    const categories = await db('ScreenMenuCategories')
      .where({ ScreenMenuId: id }).orderBy('SortOrder');
    const categoryIds = categories.map(c => c.Id);
    const items = categoryIds.length > 0
      ? await db('ScreenMenuItems').whereIn('ScreenMenuCategoryId', categoryIds).orderBy('SortOrder')
      : [];
    const itemsByCategory = {};
    for (const it of items) {
      if (!itemsByCategory[it.ScreenMenuCategoryId]) itemsByCategory[it.ScreenMenuCategoryId] = [];
      itemsByCategory[it.ScreenMenuCategoryId].push(it);
    }
    menu.Categories = categories.map(c => ({
      ...c,
      Items: itemsByCategory[c.Id] || [],
    }));
    return menu;
  }

  /**
   * Get screen menu items for a given category + page.
   * Source: ScreenMenuCategory.GetScreenMenuItems(pageNo, tag)
   *
   * @param {number} categoryId
   * @param {number} pageNo  1-indexed
   * @returns {Promise<Array>}
   */
  async getScreenMenuItems(categoryId, pageNo = 1) {
    const category = await db('ScreenMenuCategories').where({ Id: categoryId }).first();
    if (!category) return [];
    // MaxItems per page is set on the category; if 0, no paging
    const maxItems = category.MaxItems || 0;
    let query = db('ScreenMenuItems')
      .where({ ScreenMenuCategoryId: categoryId })
      .orderBy('SortOrder');
    if (maxItems > 0) {
      const offset = (pageNo - 1) * maxItems;
      query = query.limit(maxItems).offset(offset);
    }
    return query;
  }

  /**
   * Get all tax templates that apply to a given menu item.
   * Source: ApplicationState.GetTaxTemplates(menuItemId)
   *
   * A TaxTemplate applies to a MenuItem if any TaxTemplateMap has:
   *   - MenuItemId == menuItemId (specific)
   *   - OR MenuItemId == 0 AND MenuItemGroupCode matches item's GroupCode (wildcard by group)
   *   - OR MenuItemId == 0 AND MenuItemGroupCode is NULL (universal wildcard)
   *
   * @param {number} menuItemId
   * @returns {Promise<Array>}
   */
  async getTaxTemplates(menuItemId) {
    const item = await db('MenuItems').where({ Id: menuItemId }).first();
    if (!item) return [];

    // Find TaxTemplateMaps that apply to this item
    const maps = await db('TaxTemplateMaps')
      .where(function() {
        this.where({ MenuItemId: menuItemId })
            .orWhere(function() {
              this.where({ MenuItemId: 0 })
                  .andWhere('MenuItemGroupCode', item.GroupCode || '');
            })
            .orWhere(function() {
              this.where({ MenuItemId: 0 })
                  .whereNull('MenuItemGroupCode');
            });
      });

    const templateIds = [...new Set(maps.map(m => m.TaxTemplateId))];
    if (templateIds.length === 0) return [];

    return db('TaxTemplates').whereIn('Id', templateIds).orderBy('SortOrder');
  }
}

module.exports = { ProductRepository };
