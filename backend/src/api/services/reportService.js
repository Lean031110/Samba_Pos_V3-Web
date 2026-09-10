// =====================================================================
// reportService.js — Sales and operational reports (corrected)
// =====================================================================
// FASE 14 — Reportes.
//
// Fixes from audit:
//   - getSalesSummary: does NOT filter IsVoided in the initial query
//     so we can count voided tickets separately.
//   - getVoidRefundSummary: uses Payments table for refund amounts
//     (not Tickets.TotalAmount) to support partial refunds.
// =====================================================================

const { db } = require('../../infrastructure/db/db');

class ReportService {

  /**
   * Get sales summary for a date range.
   * Fetches ALL tickets in range, then separates by status.
   */
  async getSalesSummary(startDate, endDate) {
    // Fetch ALL tickets in range (including voided/refunded)
    const allTickets = await db('Tickets')
      .whereBetween('Date', [startDate + 'T00:00:00', endDate + 'T23:59:59']);

    const closedTickets = allTickets.filter(t => t.IsClosed && !t.IsVoided && !t.IsRefunded);
    const voidedTickets = allTickets.filter(t => t.IsVoided);
    const refundedTickets = allTickets.filter(t => t.IsRefunded);

    const totalSales = closedTickets.reduce((sum, t) => sum + Number(t.TotalAmount || 0), 0);
    const totalTickets = closedTickets.length;

    // P0 FIX — refundedAmount must be the ACTUAL amount refunded (from Payments table),
    // NOT the ticket's TotalAmount. A partial refund of $20 on a $100 ticket
    // should report refundedAmount=$20, not $100.
    let refundedAmount = 0;
    if (refundedTickets.length > 0) {
      const refundedTicketIds = refundedTickets.map(t => t.Id);
      const refundPayments = await db('Payments')
        .whereIn('TicketId', refundedTicketIds)
        .where('Amount', '<', 0);  // refund payments are negative
      refundedAmount = refundPayments.reduce((sum, p) => sum + Math.abs(Number(p.Amount || 0)), 0);
    }

    return {
      period: { startDate, endDate },
      totalSales: Math.round(totalSales * 100) / 100,
      totalTickets,
      avgTicket: totalTickets > 0 ? Math.round((totalSales / totalTickets) * 100) / 100 : 0,
      totalVoided: voidedTickets.length,
      voidedAmount: Math.round(voidedTickets.reduce((s, t) => s + Number(t.TotalAmount || 0), 0) * 100) / 100,
      totalRefunded: refundedTickets.length,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
    };
  }

  /**
   * Get top-selling products by quantity in a date range.
   */
  async getTopProducts(startDate, endDate, limit = 20) {
    const rows = await db('Orders')
      .join('Tickets', 'Orders.TicketId', 'Tickets.Id')
      .join('MenuItems', 'Orders.MenuItemId', 'MenuItems.Id')
      .where('Orders.CalculatePrice', 1)
      .whereBetween('Tickets.Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('Tickets.IsVoided', 0)
      .where('Tickets.IsRefunded', 0)
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
      .where('Tickets.IsRefunded', 0)
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
      .where('Tickets.IsRefunded', 0)
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
   * FIX: Uses Payments table for actual refund amounts (not Tickets.TotalAmount)
   * to support partial refunds correctly.
   */
  async getVoidRefundSummary(startDate, endDate) {
    // Voided tickets (entire ticket cancelled)
    const voidedTickets = await db('Tickets')
      .whereBetween('Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('IsVoided', 1);

    // Refunded tickets — get actual refund amount from negative payments
    const refundedTickets = await db('Tickets')
      .whereBetween('Date', [startDate + 'T00:00:00', endDate + 'T23:59:59'])
      .where('IsRefunded', 1);

    // Get actual refund amounts from Payments (negative amounts = refunds)
    const refundPayments = refundedTickets.length > 0
      ? await db('Payments')
          .whereIn('TicketId', refundedTickets.map(t => t.Id))
          .where('Amount', '<', 0)
      : [];

    const totalRefundAmount = refundPayments.reduce((sum, p) => sum + Math.abs(Number(p.Amount || 0)), 0);

    return {
      voids: {
        count: voidedTickets.length,
        totalAmount: Math.round(voidedTickets.reduce((s, t) => s + Number(t.TotalAmount || 0), 0) * 100) / 100,
      },
      refunds: {
        count: refundedTickets.length,
        totalAmount: Math.round(totalRefundAmount * 100) / 100, // actual refund amount from negative payments
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
