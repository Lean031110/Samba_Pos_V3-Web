// =====================================================================
// CalculationEngine.js
// =====================================================================
// Direct JS port of SambaPOS V3's Ticket math.
//
// Source files mirrored:
//   - Samba.Domain/Models/Tickets/Ticket.cs:308-746  (GetSum, CalculateServices,
//     CalculateTax, Recalculate, GetRemainingAmount)
//   - Samba.Domain/Models/Tickets/Order.cs:466-510    (GetPrice, GetTaxablePrice,
//     GetVisiblePrice, GetValue, GetTotal)
//   - Samba.Domain/Models/Tickets/Calculation.cs:22-55 (Update — 5 calculation types)
//   - Samba.Domain/Models/Tickets/TaxValue.cs:41-65   (GetTax, GetTaxAmount)
//
// CRITICAL: SambaPOS mixes MidpointRounding.ToEven (banker's) and
// MidpointRounding.AwayFromZero (schoolbook) in different code paths.
// This file preserves that inconsistency for byte-perfect monetary parity.
//
// Per Architect's directive: use decimal.js (not big.js / bignumber.js)
// because only decimal.js exposes both rounding modes explicitly.
// =====================================================================

const Decimal = require('decimal.js');

// Configure decimal.js for high precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,  // default; we override per-call
});

// =====================================================================
// Constants (mirror Samba.Infrastructure/Settings/LocalSettings.cs:78)
// =====================================================================
const DECIMALS = 2;

// =====================================================================
// Rounding helpers (preserve SambaPOS's inconsistency)
// =====================================================================

/**
 * Banker's rounding (MidpointRounding.ToEven — C# decimal.Round default).
 * Used by: Ticket.CalculateTax, Ticket.CalculateServices, ProductTimerValue.GetPrice
 */
function roundBankers(value, decimals = DECIMALS) {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN);
}

/**
 * Away-from-zero rounding (MidpointRounding.AwayFromZero).
 * Used by: Ticket.GetTaxTotal, AccountTransaction.UpdateAmount,
 *          TaxValue.GetTax (when Rounding > 0), Calculation.Update type 4
 */
function roundAway(value, decimals = DECIMALS) {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

// =====================================================================
// Order math (mirrors Samba.Domain/Models/Tickets/Order.cs)
// =====================================================================

/**
 * Compute Order.GetPrice() — price without tax.
 * Source: Order.cs:466
 *   result = Price + Σ(OrderTagValues.Price * OrderTagValues.Quantity)
 *   if ProductTimerValue != null: result = ProductTimerValue.GetPrice(result)
 *
 * @param {Object} order
 * @returns {Decimal}
 */
function orderGetPrice(order) {
  let result = new Decimal(order.Price || 0);
  const orderTags = order._parsedOrderTags || [];
  for (const tag of orderTags) {
    result = result.plus(new Decimal(tag.Price || 0).times(tag.Quantity || 0));
  }
  // TODO: ProductTimer handling (omitted for Sprint 1 — no test exercises it yet)
  return result;
}

/**
 * Compute Order.GetTaxablePrice() — price without tax, but only tags
 * that are NOT TaxFree.
 * Source: Order.cs:475
 *
 * @param {Object} order
 * @returns {Decimal}
 */
function orderGetTaxablePrice(order) {
  let result = new Decimal(order.Price || 0);
  const orderTags = order._parsedOrderTags || [];
  for (const tag of orderTags) {
    if (!tag.TaxFree) {
      result = result.plus(new Decimal(tag.Price || 0).times(tag.Quantity || 0));
    }
  }
  return result;
}

/**
 * Compute Order.GetVisiblePrice() — price including only tags with
 * AddTagPriceToOrderPrice = true.
 * Source: Order.cs:484
 *
 * @param {Object} order
 * @returns {Decimal}
 */
function orderGetVisiblePrice(order) {
  let result = new Decimal(order.Price || 0);
  const orderTags = order._parsedOrderTags || [];
  for (const tag of orderTags) {
    if (tag.AddTagPriceToOrderPrice) {
      result = result.plus(new Decimal(tag.Price || 0).times(tag.Quantity || 0));
    }
  }
  return result;
}

/**
 * Compute Order.GetValue() = GetPrice() * Quantity.
 * Source: Order.cs:497
 */
function orderGetValue(order) {
  return orderGetPrice(order).times(order.Quantity || 0);
}

/**
 * Compute Order.GetVisibleValue() = GetVisiblePrice() * Quantity.
 * Source: Order.cs:499
 */
function orderGetVisibleValue(order) {
  return orderGetVisiblePrice(order).times(order.Quantity || 0);
}

/**
 * Compute Order.GetTotal() = CalculatePrice ? GetValue() : 0.
 * Source: Order.cs:507
 *
 * NOTE: When CalculatePrice = false (e.g. Gift/Void orders), the order
 * contributes 0 to totals.
 */
function orderGetTotal(order) {
  return order.CalculatePrice ? orderGetValue(order) : new Decimal(0);
}

/**
 * Compute Order.GetTotalTaxAmount(taxIncluded, plainSum, preTaxServices).
 * Source: Order.cs:378
 *
 * For each TaxValue on the order, computes taxAmount via TaxValue.GetTaxAmount
 * and sums, then multiplies by Quantity.
 *
 * @param {Object} order
 * @param {boolean} taxIncluded
 * @param {Decimal} plainSum
 * @param {Decimal} preTaxServices
 * @returns {Decimal}
 */
function orderGetTotalTaxAmount(order, taxIncluded, plainSum, preTaxServices) {
  if (!order.CalculatePrice) return new Decimal(0);
  const taxablePrice = orderGetTaxablePrice(order);
  const taxValues = order._parsedTaxes || [];
  if (taxValues.length === 0) return new Decimal(0);

  // totalRate = sum of all TaxRates (needed when taxIncluded=true, because the
  // price already includes all taxes and must distribute proportionally)
  const totalRate = taxValues.reduce(
    (sum, tv) => sum.plus(tv.TaxRate || 0), new Decimal(0)
  );

  let taxSum = new Decimal(0);
  for (const tv of taxValues) {
    let price = taxablePrice;
    if (!preTaxServices.isZero() && !plainSum.isZero()) {
      // Proportionally allocate pre-tax services to this order's taxable price
      // Source: TaxValue.cs:60-65
      price = price.plus(price.times(preTaxServices).div(plainSum));
    }
    // Source: TaxValue.GetTax  [TaxValue.cs:41]
    if (taxIncluded && totalRate.gt(0)) {
      let t = price.times(tv.TaxRate || 0).div(totalRate.plus(100));
      if ((tv.Rounding || 0) > 0) {
        // Per-line rounding with AwayFromZero
        t = roundAway(t, tv.Rounding);
      }
      taxSum = taxSum.plus(t);
    } else if ((tv.TaxRate || 0) > 0) {
      // Tax added on top — no per-line rounding
      taxSum = taxSum.plus(price.times(tv.TaxRate || 0).div(100));
    }
  }
  return taxSum.times(order.Quantity || 0);
}

// =====================================================================
// Ticket math (mirrors Samba.Domain/Models/Tickets/Ticket.cs)
// =====================================================================

/**
 * Compute Ticket.GetPlainSum() = Σ Orders.Where(CalculatePrice).GetTotal()
 * Source: Ticket.cs:413
 */
function ticketGetPlainSum(ticket) {
  const orders = ticket.Orders || [];
  if (orders.length === 0) return new Decimal(0);
  return orders.reduce(
    (sum, o) => sum.plus(orderGetTotal(o)),
    new Decimal(0)
  );
}

/**
 * Compute Calculation.Update(sum, currentSum, decimals).
 * Source: Calculation.cs:22-55
 *
 * CalculationType values:
 *   0 = Percent of plainSum
 *   1 = Percent of running sum (compounded)
 *   3 = Target amount (final total should equal `Amount`)
 *   4 = Rounding (to nearest multiple of `Amount`)
 *   2 / 5 = Manual fixed amount (Amount is pre-computed for type 5)
 *
 * @param {Object} calc
 * @param {Decimal} sum
 * @param {Decimal} currentSum
 * @returns {Decimal}  the CalculationAmount (before sign flip for DecreaseAmount)
 */
function calculationUpdate(calc, sum, currentSum) {
  const amount = new Decimal(calc.Amount || 0);
  let result;
  switch (calc.CalculationType) {
    case 0:
      // Percent of plain sum
      result = amount.gt(0) ? sum.times(amount).div(100) : new Decimal(0);
      break;
    case 1:
      // Percent of running sum (compounded)
      result = amount.gt(0) ? currentSum.times(amount).div(100) : new Decimal(0);
      break;
    case 3: {
      // Target amount
      if (amount.eq(currentSum)) {
        result = new Decimal(0);
      } else if (currentSum.gt(0) && calc.DecreaseAmount && amount.gt(currentSum)) {
        result = new Decimal(0);  // can't discount more than current
      } else if (currentSum.gt(0) && !calc.DecreaseAmount && amount.lt(currentSum)) {
        result = new Decimal(0);  // can't surcharge less than current
      } else {
        result = amount.minus(currentSum);
      }
      break;
    }
    case 4: {
      // Rounding
      if (amount.gt(0)) {
        // Round to nearest multiple (AwayFromZero for .5)
        const quotient = roundAway(currentSum.div(amount), 0);
        result = quotient.times(amount).minus(currentSum);
      } else {
        // amount < 0: truncate (always round down)
        const quotient = Decimal.trunc(currentSum.div(amount));
        result = quotient.times(amount).minus(currentSum);
      }
      if (calc.DecreaseAmount && result.gt(0)) result = new Decimal(0);
      if (!calc.DecreaseAmount && result.lt(0)) result = new Decimal(0);
      break;
    }
    default:
      // case 2 (unused) and case 5 (scripted — Amount is pre-computed)
      result = amount;
  }
  result = roundBankers(result, DECIMALS);
  if (calc.DecreaseAmount && result.gt(0)) {
    result = result.neg();
  }
  return result;
}

/**
 * Compute Ticket.CalculateServices(calculations, sum).
 * Source: Ticket.cs:354-377
 *
 * @param {Object} ticket
 * @param {Array} calculations  filtered list (e.g. IncludeTax=false OR IncludeTax=true)
 * @param {Decimal} sum
 * @returns {Decimal}  total services amount (rounded to 2dp, banker's)
 */
function ticketCalculateServices(ticket, calculations, sum) {
  let totalAmount = new Decimal(0);
  let currentSum = sum;
  for (const calc of calculations.slice().sort((a, b) => (a.Order || 0) - (b.Order || 0))) {
    let sumValue;
    if (calc.UsePlainSum) {
      const orders = (ticket.Orders || []).filter(o => o.DecreaseInventory || o.IncreaseInventory);
      sumValue = orders.reduce(
        (s, o) => s.plus(orderGetVisibleValue(o)),
        new Decimal(0)
      );
    } else {
      sumValue = sum;
    }
    const calcAmount = calculationUpdate(calc, sumValue, currentSum);
    calc._calculationAmount = calcAmount;  // store for later inspection
    totalAmount = totalAmount.plus(calcAmount);
    currentSum = currentSum.plus(calcAmount);
  }
  return roundBankers(totalAmount, DECIMALS);
}

/**
 * Compute Ticket.CalculateTax(plainSum, preTaxServices).
 * Source: Ticket.cs:348-352
 *
 * NOTE: Uses banker's rounding (MidpointRounding.ToEven) — DIFFERENT from
 * Ticket.GetTaxTotal which uses AwayFromZero. This is an intentional
 * inconsistency in SambaPOS V3 that we preserve here.
 *
 * @param {Object} ticket
 * @param {Decimal} plainSum
 * @param {Decimal} preTaxServices
 * @returns {Decimal}
 */
function ticketCalculateTax(ticket, plainSum, preTaxServices) {
  if (ticket.TaxIncluded) {
    // Tax is already embedded in the price — no tax added on top.
    return new Decimal(0);
  }
  const orders = (ticket.Orders || []).filter(o => o.CalculatePrice);
  let result = new Decimal(0);
  for (const order of orders) {
    result = result.plus(orderGetTotalTaxAmount(order, ticket.TaxIncluded, plainSum, preTaxServices));
  }
  return roundBankers(result, DECIMALS);
}

/**
 * Compute Ticket.GetSum() — THE MASTER ALGORITHM.
 * Source: Ticket.cs:308-316
 *
 * Order of operations:
 *   1. plainSum = Σ order.GetTotal()
 *   2. preTaxServices = CalculateServices(Calculations WHERE IncludeTax=false, plainSum)
 *   3. tax = TaxIncluded ? 0 : CalculateTax(plainSum, preTaxServices)
 *   4. newBase = plainSum + preTaxServices + tax
 *   5. postTaxServices = CalculateServices(Calculations WHERE IncludeTax=true, newBase)
 *   6. TotalAmount = newBase + postTaxServices
 *
 * @param {Object} ticket
 * @returns {{
 *   plainSum: Decimal,
 *   preTaxServices: Decimal,
 *   tax: Decimal,
 *   postTaxServices: Decimal,
 *   totalAmount: Decimal,
 * }}
 */
function ticketGetSum(ticket) {
  const plainSum = ticketGetPlainSum(ticket);

  const preTaxServices = ticketCalculateServices(
    ticket,
    (ticket.Calculations || []).filter(c => !c.IncludeTax),
    plainSum
  );

  const tax = ticketCalculateTax(ticket, plainSum, preTaxServices);

  const newBase = plainSum.plus(preTaxServices).plus(tax);

  const postTaxServices = ticketCalculateServices(
    ticket,
    (ticket.Calculations || []).filter(c => c.IncludeTax),
    newBase
  );

  return {
    plainSum,
    preTaxServices,
    tax,
    postTaxServices,
    totalAmount: newBase.plus(postTaxServices),
  };
}

/**
 * Compute Ticket.GetRemainingAmount().
 * Source: Ticket.cs:436-442
 *
 *   RemainingAmount = TotalAmount - Payments + ChangePayments
 *
 * @param {Object} ticket
 * @returns {Decimal}
 */
function ticketGetRemainingAmount(ticket) {
  const { totalAmount } = ticketGetSum(ticket);
  const payments = (ticket.Payments || []).reduce(
    (s, p) => s.plus(p.Amount || 0), new Decimal(0)
  );
  const changePayments = (ticket.ChangePayments || []).reduce(
    (s, c) => s.plus(c.Amount || 0), new Decimal(0)
  );
  return roundBankers(totalAmount.minus(payments).plus(changePayments), DECIMALS);
}

/**
 * Helper: hydrate an Order's JSON fields (Taxes, OrderTags, OrderStates)
 * into parsed arrays stored as _parsedTaxes / _parsedOrderTags.
 *
 * @param {Object} order
 */
function hydrateOrder(order) {
  if (order._hydrated) return;
  try {
    order._parsedTaxes = order.Taxes ? JSON.parse(order.Taxes) : [];
  } catch { order._parsedTaxes = []; }
  try {
    order._parsedOrderTags = order.OrderTags ? JSON.parse(order.OrderTags) : [];
  } catch { order._parsedOrderTags = []; }
  order._hydrated = true;
}

/**
 * Helper: hydrate a Ticket and all its Orders.
 */
function hydrateTicket(ticket) {
  if (!ticket.Orders) ticket.Orders = [];
  for (const o of ticket.Orders) hydrateOrder(o);
  if (!ticket.Calculations) ticket.Calculations = [];
  if (!ticket.Payments) ticket.Payments = [];
  if (!ticket.ChangePayments) ticket.ChangePayments = [];
}

module.exports = {
  // Constants
  DECIMALS,
  // Rounding helpers
  roundBankers,
  roundAway,
  // Order math
  orderGetPrice,
  orderGetTaxablePrice,
  orderGetVisiblePrice,
  orderGetValue,
  orderGetVisibleValue,
  orderGetTotal,
  orderGetTotalTaxAmount,
  // Ticket math
  ticketGetPlainSum,
  calculationUpdate,
  ticketCalculateServices,
  ticketCalculateTax,
  ticketGetSum,
  ticketGetRemainingAmount,
  // Hydration
  hydrateOrder,
  hydrateTicket,
};
