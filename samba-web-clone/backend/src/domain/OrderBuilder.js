// =====================================================================
// OrderBuilder.js — Fluent builder for Order
// =====================================================================
// Mirrors: Samba.Domain/Builders/OrderBuilder.cs (192 lines)
//
// Usage:
//   const order = OrderBuilder.create()
//     .forMenuItem(menuItem)
//     .withPortion(portion)
//     .withUserName('Administrator')
//     .withTaxTemplates([taxTemplate])
//     .withAccountTransactionType(saleTxnType)
//     .withPriceTag('')
//     .withQuantity(2)
//     .build();
// =====================================================================

const engine = require('./CalculationEngine');

class OrderBuilder {
  constructor() {
    this._menuItem = null;
    this._portion = null;
    this._userName = null;
    this._taxTemplates = [];
    this._accountTransactionType = null;
    this._priceTag = '';
    this._quantity = 1;
    this._productTimer = null;
    this._calculatePrice = true;
    this._department = null;
    this._priceOverride = null;
    this._orderTags = [];
  }

  static create() { return new OrderBuilder(); }

  forMenuItem(menuItem) { this._menuItem = menuItem; return this; }
  withPortion(portion) { this._portion = portion; return this; }
  withUserName(name) { this._userName = name; return this; }
  withTaxTemplates(templates) { this._taxTemplates = templates || []; return this; }
  addTaxTemplate(t) { this._taxTemplates.push(t); return this; }
  withAccountTransactionType(t) { this._accountTransactionType = t; return this; }
  withPriceTag(tag) { this._priceTag = tag || ''; return this; }
  withQuantity(q) { this._quantity = q; return this; }
  withProductTimer(timer) { this._productTimer = timer; return this; }
  calculatePrice(flag) { this._calculatePrice = flag; return this; }
  withDepartment(dept) { this._department = dept; return this; }
  withPrice(price) { this._priceOverride = price; return this; }
  withOrderTags(tags) { this._orderTags = tags || []; return this; }

  /**
   * Build the Order entity.
   * Source: OrderBuilder.Build()  [OrderBuilder.cs:48]
   */
  build() {
    if (!this._menuItem) throw new Error('MenuItem is required');
    if (!this._portion) {
      // Use first portion if not specified
      this._portion = this._menuItem.Portions?.[0];
    }
    if (!this._portion) throw new Error(`MenuItem ${this._menuItem.Name} has no portions`);

    // Build the TaxValues list (mirrors Order.UpdateTaxTemplates  [Order.cs:360])
    const taxValues = this._taxTemplates.map(t => ({
      TaxRate: Number(t.Rate) || 0,
      Rounding: Number(t.Rounding) || 0,
      TaxTemplateName: t.Name,
      TaxTemplateId: t.Id,
      TaxTempleteAccountTransactionTypeId: t.AccountTransactionTypeId || 0,
    }));

    // Resolve the price (mirrors Order.UpdatePortion  [Order.cs:146])
    let price = this._priceOverride;
    if (price === null) {
      if (this._priceTag && this._portion.Prices) {
        const tagged = this._portion.Prices.find(p => p.PriceTag === this._priceTag);
        if (tagged && Number(tagged.Price) > 0) {
          price = Number(tagged.Price);
        } else {
          this._priceTag = '';
          price = Number(this._portion.Price || this._portion.Prices?.[0]?.Price || 0);
        }
      } else {
        price = Number(this._portion.Price || this._portion.Prices?.[0]?.Price || 0);
      }
    }

    const now = new Date().toISOString();
    const order = {
      Id: 0,
      TicketId: 0,
      WarehouseId: this._department?.WarehouseId || 0,
      DepartmentId: this._department?.Id || 0,
      MenuItemId: this._menuItem.Id,
      MenuItemName: this._menuItem.Name,
      PortionName: this._portion.Name,
      Price: price,
      Quantity: this._quantity,
      PortionCount: this._menuItem.Portions?.length || 1,
      Locked: false,
      CalculatePrice: this._calculatePrice,
      DecreaseInventory: true,    // default for food items
      IncreaseInventory: false,
      OrderNumber: 0,
      CreatingUserName: this._userName,
      CreatedDateTime: now,
      AccountTransactionTypeId: this._accountTransactionType?.Id || 0,
      ProductTimerValueId: null,
      PriceTag: this._priceTag,
      Tag: null,
      Taxes: JSON.stringify(taxValues),
      OrderTags: this._orderTags.length > 0 ? JSON.stringify(this._orderTags) : null,
      OrderStates: JSON.stringify([{ StateName: 'Status', State: 'New', LastUpdateTime: now, UserId: 0 }]),
    };

    // Hydrate the order so the engine can read _parsedTaxes etc.
    engine.hydrateOrder(order);
    return order;
  }
}

module.exports = { OrderBuilder };
