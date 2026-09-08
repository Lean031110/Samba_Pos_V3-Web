// =====================================================================
// reportService.js — Sales and operational reports
// =====================================================================
// FASE 14 — Reportes.
//
// Provides data for:
//   - Daily/monthly sales totals
//   - Top-selling products
//   - Sales by category
//   - Sales by user (cashier)
//   - Sales by terminal
//   - Payment method breakdown
//   - Tax summary
//   - Discount summary
//   - Void/refund summary
//   - Inventory movement summary
//   - Cash session summary
// =====================================================================

const { db } = require('../../infrastructure/db/db');

class ReportService {

  /**
   * Get sales summary for a date range.
   * @param {string} startDate — ISO date (e.g., '2026-09-01')
   * @param {string} endDate — ISO date (e.g., '2026-09-30')
   * @returns {Promise<Object>} { totalSales, totalTickets, avgTicket, totalTax, totalDiscounts, totalVoids, totalRefunds }
   */
  async getSalesSummary(startDate, endDate) {
    const tickets = await db('Tickets')
      .whereBetween('Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('IsVoided', 0);

    const closedTickets = tickets.filter(t => t.IsClosed && !t.IsRefunded);
    const voidedTickets = tickets.filter(t => t.IsVoided);
    const refundedTickets = tickets.filter(t => t.IsRefunded);

    const totalSales = closedTickets.reduce((sum, t) => sum + Number(t.TotalAmount || 0), 0);
    const totalTickets = closedTickets.length;

    return {
      period: { startDate, endDate },
      totalSales: Math.round(totalSales * 100) / 100,
      totalTickets,
      avgTicket: totalTickets > 0 ? Math.round((totalSales / totalTickets) * 100) / 100 : 0,
      totalVoided: voidedTickets.length,
      totalRefunded: refundedTickets.length,
    };
  }

  /**
   * Get top-selling products by quantity in a date range.
   * @param {string} startDate
   * @param {string} endDate
   * @param {number} [limit=20]
   */
  async getTopProducts(startDate, endDate, limit = 20) {
    const rows = await db('Orders')
      .join('Tickets', 'Orders.TicketId', 'Tickets.Id')
      .join('MenuItems', 'Orders.MenuItemId', 'MenuItems.Id')
      .where('Orders.CalculatePrice', 1)
      .whereBetween('Tickets.Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('Tickets.IsVoided', 0)
      .select(
        'MenuItems.Id as MenuItemId',
        'MenuItems.Name as MenuItemName',
        'MenuItems.GroupCode as Category',
        db.raw('SUM(Orders.Quantity) as TotalQuantity'),
        db.raw('SUM(Orders.Quantity * Orders.Price) as TotalRevenue')
      )
      .groupBy('MenuItems.Id', 'MenuItems.Name', 'MenuItems.GroupCode')
      .orderBy('TotalQuantity', 'desc')
      .limit(limit);

    return rows.map(r => ({
      menuItemId: r.MenuItemId,
      name: r.MenuItemName,
      category: r.Category || 'Sin categoría',
      quantity: Number(r.TotalQuantity),
      revenue: Math.round(Number(r.TotalRevenue) * 100) / 100,
    }));
  }

  /**
   * Get sales by category (group code).
   */
  async getSalesByCategory(startDate, endDate) {
    const rows = await db('Orders')
      .join('Tickets', 'Orders.TicketId', 'Tickets.Id')
      .join('MenuItems', 'Orders.MenuItemId', 'MenuItems.Id')
      .where('Orders.CalculatePrice', 1)
      .whereBetween('Tickets.Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('Tickets.IsVoided', 0)
      .select(
        'MenuItems.GroupCode as Category',
        db.raw('COUNT(*) as OrderCount'),
        db.raw('SUM(Orders.Quantity) as TotalQuantity'),
        db.raw('SUM(Orders.Quantity * Orders.Price) as TotalRevenue')
      )
      .groupBy('MenuItems.GroupCode')
      .orderBy('TotalRevenue', 'desc');

    return rows.map(r => ({
      category: r.Category || 'Sin categoría',
      orderCount: Number(r.OrderCount),
      quantity: Number(r.TotalQuantity),
      revenue: Math.round(Number(r.TotalRevenue) * 100) / 100,
    }));
  }

  /**
   * Get sales by user (cashier).
   */
  async getSalesByUser(startDate, endDate) {
    const rows = await db('Tickets')
      .leftJoin('Users', 'Tickets.LastModifiedUserId', 'Users.Id')
      .whereBetween('Tickets.Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('Tickets.IsClosed', 1)
      .where('Tickets.IsVoided', 0)
      .select(
        'Users.Id as UserId',
        'Users.Name as UserName',
        db.raw('COUNT(*) as TicketCount'),
        db.raw('SUM(Tickets.TotalAmount) as TotalSales')
      )
      .groupBy('Users.Id', 'Users.Name')
      .orderBy('TotalSales', 'desc');

    return rows.map(r => ({
      userId: r.UserId || 0,
      userName: r.UserName || 'Sistema',
      ticketCount: Number(r.TicketCount),
      totalSales: Math.round(Number(r.TotalSales) * 100) / 100,
    }));
  }

  /**
   * Get payment method breakdown.
   */
  async getPaymentSummary(startDate, endDate) {
    const rows = await db('Payments')
      .join('Tickets', 'Payments.TicketId', 'Tickets.Id')
      .leftJoin('PaymentTypes', 'Payments.PaymentTypeId', 'PaymentTypes.Id')
      .whereBetween('Tickets.Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('Tickets.IsVoided', 0)
      .select(
        'PaymentTypes.Id as PaymentTypeId',
        'PaymentTypes.Name as PaymentTypeName',
        db.raw('COUNT(*) as Count'),
        db.raw('SUM(Payments.Amount) as TotalAmount')
      )
      .groupBy('PaymentTypes.Id', 'PaymentTypes.Name')
      .orderBy('TotalAmount', 'desc');

    return rows.map(r => ({
      paymentTypeId: r.PaymentTypeId,
      paymentTypeName: r.PaymentTypeName || 'Desconocido',
      count: Number(r.Count),
      totalAmount: Math.round(Number(r.TotalAmount) * 100) / 100,
    }));
  }

  /**
   * Get void/refund summary.
   */
  async getVoidRefundSummary(startDate, endDate) {
    const voided = await db('Tickets')
      .whereBetween('Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('IsVoided', 1);

    const refunded = await db('Tickets')
      .whereBetween('Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('IsRefunded', 1);

    return {
      voids: {
        count: voided.length,
        totalAmount: voided.reduce((s, t) => s + Number(t.TotalAmount || 0), 0),
      },
      refunds: {
        count: refunded.length,
        totalAmount: refunded.reduce((s, t) => s + Number(t.TotalAmount || 0), 0),
      },
    };
  }

  /**
   * Get inventory movement summary.
   */
  async getInventoryMovementSummary(startDate, endDate) {
    const rows = await db('StockMovements')
      .join('Ingredients', 'StockMovements.IngredientId', 'Ingredients.Id')
      .whereBetween('StockMovements.CreatedAt', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .select(
        'StockMovements.MovementType',
        db.raw('COUNT(*) as Count'),
        db.raw('SUM(StockMovements.Quantity) as TotalQuantity'),
        db.raw('SUM(StockMovements.TotalCost) as TotalCost')
      )
      .groupBy('StockMovements.MovementType')
      .orderBy('MovementType');

    return rows.map(r => ({
      movementType: r.MovementType,
      count: Number(r.Count),
      totalQuantity: Math.round(Number(r.TotalQuantity) * 1000) / 1000,
      totalCost: Math.round(Number(r.TotalCost) * 100) / 100,
    }));
  }

  /**
   * Get cash session summary.
   */
  async getCashSessionSummary(startDate, endDate) {
    const sessions = await db('CashSessions')
      .whereBetween('OpenedAt', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .orderBy('OpenedAt', 'desc');

    return sessions.map(s => ({
      id: s.Id,
      terminalId: s.TerminalId,
      openedAt: s.OpenedAt,
      closedAt: s.ClosedAt,
      openingAmount: Number(s.OpeningAmount || 0),
      expectedAmount: Number(s.ExpectedAmount || 0),
      countedAmount: Number(s.CountedAmount || 0),
      difference: Number(s.Difference || 0),
      status: s.Status,
    }));
  }

  /**
   * Get a comprehensive dashboard report combining all summaries.
   */
  async getDashboardReport(startDate, endDate) {
    const [sales, products, categories, users, payments, voids, inventory, cash] = await Promise.all([
      this.getSalesSummary(startDate, endDate),
      this.getTopProducts(startDate, endDate, 10),
      this.getSalesByCategory(startDate, endDate),
      this.getSalesByUser(startDate, endDate),
      this.getPaymentSummary(startDate, endDate),
      this.getVoidRefundSummary(startDate, endDate),
      this.getInventoryMovementSummary(startDate, endDate),
      this.getCashSessionSummary(startDate, endDate),
    ]);

    return {
      period: { startDate, endDate },
      sales,
      topProducts: products,
      categories,
      users,
      payments,
      voidsRefunds: voids,
      inventory,
      cashSessions: cash,
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { ReportService };
