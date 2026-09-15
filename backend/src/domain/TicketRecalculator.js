// =====================================================================
// TicketRecalculator.js — Ticket.Recalculate() full port
// =====================================================================
// Mirrors: Samba.Domain/Models/Tickets/Ticket.cs:656-689
//
// Responsibilities:
//   1. Recalculate the SALE AccountTransaction amount for each order group
//      (grouped by AccountTransactionTypeId).
//   2. Recalculate each TAX AccountTransaction amount (one per TaxTemplate).
//   3. Recalculate each CALCULATION AccountTransaction amount (discounts/services/
//      rounding) — these are updated as part of CalculateServices.
//   4. Set Ticket.TotalAmount and Ticket.RemainingAmount.
//
// Per Architect's directive: ALL monetary math goes through CalculationEngine.
// This module orchestrates calls to CalculationEngine and updates the
// AccountTransactionDocument's singletons accordingly.
// =====================================================================

const { Decimal } = require('decimal.js');
const engine = require('./CalculationEngine');

/**
 * Compute GetTaxExcludedSum for a single order.
 * Source: Ticket.GetTaxExcludedSum  [Ticket.cs:328]
 *
 * If TaxIncluded=true:
 *   taxExcluded = order.GetTotal() - order.GetTotalTaxAmount(true, plainSum, preTaxServices)
 * If TaxIncluded=false:
 *   taxExcluded = order.GetTotal()  (tax is already separate)
 *
 * @param {Object} order
 * @param {boolean} taxIncluded
 * @param {Decimal} plainSum
 * @param {Decimal} preTaxServices
 * @returns {Decimal}
 */
function getTaxExcludedSum(order, taxIncluded, plainSum, preTaxServices) {
  const total = engine.orderGetTotal(order);
  if (!taxIncluded) return total;
  const taxAmount = engine.orderGetTotalTaxAmount(order, true, plainSum, preTaxServices);
  return total.minus(taxAmount);
}

/**
 * Get the list of unique TaxTemplate AccountTransactionType IDs across all orders.
 * Source: Ticket.GetTaxIds()  [Ticket.cs:648]
 *
 * @param {Object} ticket
 * @returns {number[]}
 */
function getTaxIds(ticket) {
  const ids = new Set();
  for (const order of (ticket.Orders || [])) {
    const taxes = order._parsedTaxes || [];
    for (const tv of taxes) {
      if (tv.TaxTempleteAccountTransactionTypeId) {
        ids.add(tv.TaxTempleteAccountTransactionTypeId);
      }
    }
  }
  return [...ids];
}

/**
 * Compute the total tax for a specific TaxTemplate (by AccountTransactionTypeId).
 * Source: Ticket.GetTaxTotal(taxId, preTaxServices, plainSum)  [Ticket.cs:691]
 *
 * CRITICAL: Uses MidpointRounding.AwayFromZero (NOT banker's).
 * This is the inconsistency we preserve.
 *
 * @param {Object} ticket
 * @param {number} taxId
 * @param {Decimal} plainSum
 * @param {Decimal} preTaxServices
 * @returns {Decimal}
 */
function getTaxTotalForTemplate(ticket, taxId, plainSum, preTaxServices) {
  let result = new Decimal(0);
  for (const order of (ticket.Orders || [])) {
    const orderTax = engine.orderGetTotalTaxAmount(
      order, ticket.TaxIncluded, plainSum, preTaxServices, taxId
    );
    result = result.plus(orderTax);
  }
  return engine.roundAway(result, 2);   // AWAY FROM ZERO (intentional inconsistency)
}

/**
 * THE MASTER RECALCULATE FUNCTION.
 * Source: Ticket.Recalculate()  [Ticket.cs:656-689]
 *
 * Steps:
 *   1. Compute plainSum, preTaxServices, tax, postTaxServices via CalculationEngine.ticketGetSum
 *   2. For each order group by AccountTransactionTypeId:
 *      - Find the singleton AccountTransaction with that type
 *      - Update its amount to the sum of tax-excluded values of those orders
 *   3. For each TaxTemplate (TaxId):
 *      - Find the singleton AccountTransaction with that type
 *      - Update its amount to getTaxTotalForTemplate(...)
 *   4. Set Ticket.TotalAmount and Ticket.RemainingAmount
 *
 * @param {Object} ticket  - must be hydrated (Orders have _parsedTaxes)
 * @param {Object} [saleTransactionType]  - the SALE AccountTransactionType (optional, used if no singleton exists yet)
 * @param {Array} [accountDataList]  - ticket entities for account overrides
 */
function recalculateTicket(ticket, saleTransactionType = null, accountDataList = null) {
  // Make sure ticket is hydrated
  engine.hydrateTicket(ticket);

  // Step 1: Run the master calculation
  const totals = engine.ticketGetSum(ticket);
  const { plainSum, preTaxServices, tax, postTaxServices, totalAmount } = totals;

  // Get the pre-tax services total (used for tax base adjustment)
  const preTaxServicesTotal = getPreTaxServicesTotal(ticket);

  // Step 2: Update SALE AccountTransactions (one per order group)
  if ((ticket.Orders || []).length > 0 && ticket.TransactionDocument) {
    // Group orders by AccountTransactionTypeId
    const orderGroups = {};
    for (const order of ticket.Orders) {
      const key = order.AccountTransactionTypeId;
      if (!orderGroups[key]) orderGroups[key] = [];
      orderGroups[key].push(order);
    }

    for (const [txnTypeIdStr, orders] of Object.entries(orderGroups)) {
      const txnTypeId = parseInt(txnTypeIdStr, 10);
      const txn = ticket.TransactionDocument.AccountTransactions.find(
        t => t.AccountTransactionTypeId === txnTypeId
      );
      if (!txn) continue;

      // Sum the tax-excluded values of these orders
      let amount = new Decimal(0);
      for (const o of orders) {
        amount = amount.plus(getTaxExcludedSum(o, ticket.TaxIncluded, plainSum, preTaxServices));
      }

      // Update the transaction (auto-reversal handled internally)
      txn.updateAccounts(accountDataList || []);
      txn.updateAmount(amount.toNumber(), ticket.ExchangeRate || 1);
    }

    // Step 3: Update TAX AccountTransactions (one per TaxTemplate)
    const taxIds = getTaxIds(ticket);
    for (const taxId of taxIds) {
      const txn = ticket.TransactionDocument.AccountTransactions.find(
        t => t.AccountTransactionTypeId === taxId
      );
      if (!txn) continue;
      const taxAmount = getTaxTotalForTemplate(ticket, taxId, plainSum, preTaxServices);
      txn.updateAccounts(accountDataList || []);
      txn.updateAmount(taxAmount.toNumber(), ticket.ExchangeRate || 1);
    }
  }

  // Step 4: Persist totals on the ticket
  ticket.TotalAmount = totalAmount.toNumber();
  ticket.RemainingAmount = engine.ticketGetRemainingAmount(ticket).toNumber();

  return totals;
}

/**
 * Compute the sum of all pre-tax service calculations (discounts + services that
 * apply before tax). Used as the tax-base adjustment.
 * Source: Ticket.GetPreTaxServicesTotal()  [Ticket.cs:426-432]
 *
 * @param {Object} ticket
 * @returns {Decimal}
 */
function getPreTaxServicesTotal(ticket) {
  const calcs = (ticket.Calculations || []).filter(c => !c.IncludeTax);
  let sum = new Decimal(0);
  for (const c of calcs) {
    sum = sum.plus(c._calculationAmount || c.CalculationAmount || 0);
  }
  return sum;
}

module.exports = {
  getTaxExcludedSum,
  getTaxIds,
  getTaxTotalForTemplate,
  recalculateTicket,
  getPreTaxServicesTotal,
};
