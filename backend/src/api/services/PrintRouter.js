// =====================================================================
// PrintRouter.js — Routes orders to the correct printer(s)
// =====================================================================
// FASE 7 — Real printing architecture.
//
// The PrintRouter decides, for a given Order or Ticket, which printer(s)
// should receive the print job. It uses the PrintRoutingRules table.
//
// Matching priority (highest first):
//   1. RuleType='MENU_ITEM' + MenuItemId match  (most specific)
//   2. RuleType='TAG' + tag value match
//   3. RuleType='GROUP_CODE' + GroupCode match
//   4. RuleType='DEFAULT'  (catch-all)
//
// For kitchen orders: one PrintJob per matched rule (an order can go to
// multiple stations — e.g., a "Hamburger + Fries" combo might go to
// both Kitchen and Fries station).
//
// For receipts: one PrintJob to the cashier printer.
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { NotFoundError } = require('../middleware/errorHandler');

class PrintRouter {
  /**
   * Resolve which printer(s) should receive a kitchen order for the
   * given menu item. Returns an array of printerIds (usually 1, but
   * can be more if multiple stations need the order).
   *
   * @param {Object} menuItem — { Id, GroupCode, Tag, Name }
   * @returns {Promise<Array<{printerId, printAreaId, areaName}>>}
   */
  async resolveKitchenPrinters(menuItem) {
    if (!menuItem) return [];
    const rules = await db('PrintRoutingRules')
      .where({ IsActive: 1 })
      .orderBy('Priority', 'desc');

    const matched = new Map(); // printerId → {printerId, printAreaId, areaName}

    for (const rule of rules) {
      let isMatch = false;
      if (rule.RuleType === 'MENU_ITEM' && rule.MenuItemId === menuItem.Id) {
        isMatch = true;
      } else if (rule.RuleType === 'GROUP_CODE'
                 && rule.MatchValue
                 && rule.MatchValue === menuItem.GroupCode) {
        isMatch = true;
      } else if (rule.RuleType === 'TAG'
                 && rule.MatchValue
                 && menuItem.Tag
                 && menuItem.Tag.includes(rule.MatchValue)) {
        isMatch = true;
      } else if (rule.RuleType === 'DEFAULT') {
        // Only match default if no previous match
        if (matched.size === 0) isMatch = true;
      }

      if (isMatch) {
        // Get the printer
        let printerId = rule.PrinterId;
        let printAreaId = rule.PrintAreaId;
        let areaName = null;
        if (!printerId && printAreaId) {
          // Find the first active printer in this area
          const printer = await db('Printers')
            .where({ PrintAreaId: printAreaId, IsActive: 1 })
            .orderBy('SortOrder')
            .first();
          if (printer) printerId = printer.Id;
        }
        if (printAreaId) {
          const area = await db('PrintAreas').where({ Id: printAreaId }).first();
          if (area) areaName = area.DisplayName || area.Name;
        }
        if (printerId && !matched.has(printerId)) {
          matched.set(printerId, { printerId, printAreaId, areaName });
        }
      }
    }

    return Array.from(matched.values());
  }

  /**
   * Resolve which printer should print a receipt (cashier printer).
   * Returns a single printerId (the first active cashier printer).
   *
   * @returns {Promise<{printerId, printAreaId, areaName}|null>}
   */
  async resolveReceiptPrinter() {
    // Look for a DEFAULT rule first
    const rule = await db('PrintRoutingRules')
      .where({ RuleType: 'DEFAULT', IsActive: 1 })
      .orderBy('Priority', 'desc')
      .first();
    if (rule) {
      let printerId = rule.PrinterId;
      if (!printerId) {
        const printer = await db('Printers')
          .where({ PrintAreaId: rule.PrintAreaId, IsActive: 1 })
          .orderBy('SortOrder')
          .first();
        if (printer) printerId = printer.Id;
      }
      const area = await db('PrintAreas').where({ Id: rule.PrintAreaId }).first();
      if (printerId) {
        return {
          printerId,
          printAreaId: rule.PrintAreaId,
          areaName: area?.DisplayName || area?.Name,
        };
      }
    }
    // Fallback: any active printer
    const anyPrinter = await db('Printers').where({ IsActive: 1 }).orderBy('SortOrder').first();
    if (anyPrinter) {
      return { printerId: anyPrinter.Id, printAreaId: null, areaName: null };
    }
    return null;
  }

  /**
   * Group orders by their target printer. Used when sending a ticket to
   * kitchen: each printer receives only the orders routed to it.
   *
   * @param {Array} orders — ticket.Orders, each with MenuItemId, MenuItemName, etc.
   * @returns {Promise<Array<{printerId, printAreaId, areaName, orders:[]}>>}
   */
  async groupOrdersByPrinter(orders) {
    const groups = new Map();
    for (const order of orders) {
      const menuItem = await db('MenuItems').where({ Id: order.MenuItemId }).first();
      if (!menuItem) continue;
      const targets = await this.resolveKitchenPrinters(menuItem);
      for (const t of targets) {
        if (!groups.has(t.printerId)) {
          groups.set(t.printerId, { ...t, orders: [] });
        }
        groups.get(t.printerId).orders.push(order);
      }
    }
    return Array.from(groups.values());
  }
}

module.exports = { PrintRouter };
