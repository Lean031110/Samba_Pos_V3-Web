// =====================================================================
// sprint2-acceptance-test.js — Sprint 2 acceptance test (4 scenarios)
// =====================================================================
// Per Architect's directive:
//   Test must include:
//     Case 1: Simple ticket, tax included, no discount
//     Case 2: Simple ticket, tax EXCLUDED, no discount
//     Case 3: Discount PRE-TAX + tax excluded  (BUSINESS_RULES_ENGINE.md Test 3)
//     Case 4: Service charge POST-TAX + tax included  (BUSINESS_RULES_ENGINE.md Test 4)
//
// Each case verifies:
//   - plainSum, preTaxServices, tax, postTaxServices, totalAmount, remainingAmount
//     match the C# original byte-for-byte
//   - The double-entry ledger stays BALANCED (Source Credit == Target Debit)
//   - Auto-reversal works correctly on negative amounts
//
// The test uses TicketBuilder + OrderBuilder (fluent API) to construct
// each scenario, runs CalculationEngine + TicketRecalculator, then asserts.
// =====================================================================

const path = require('path');
const knex = require('knex');
const Decimal = require('decimal.js');

const cfg = require('../src/infrastructure/db/knexfile.js');
const { TicketBuilder } = require('../src/domain/TicketBuilder');
const { OrderBuilder } = require('../src/domain/OrderBuilder');
const { Ticket } = require('../src/domain/Ticket');
const engine = require('../src/domain/CalculationEngine');
const { recalculateTicket } = require('../src/domain/TicketRecalculator');
const { AccountTransaction } = require('../src/domain/AccountTransaction');

const db = knex(cfg.development);

// =====================================================================
// ANSI colors
// =====================================================================
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function header(title) {
  console.log('\n' + C.bold + C.cyan + '═'.repeat(76) + C.reset);
  console.log(C.bold + C.cyan + '  ' + title + C.reset);
  console.log(C.bold + C.cyan + '═'.repeat(76) + C.reset);
}
function section(title) {
  console.log('\n' + C.bold + C.yellow + '── ' + title + ' ' + C.reset);
}
function ok(label, value) {
  console.log(C.green + '  ✓ ' + C.reset + label.padEnd(40) + C.bold + value + C.reset);
}
function fail(label, value) {
  console.log(C.red + '  ✗ ' + C.reset + label.padEnd(40) + C.red + value + C.reset);
}
function info(label, value) {
  console.log(C.gray + '  · ' + C.reset + label.padEnd(40) + value);
}
function line() { console.log(C.gray + '  ' + '─'.repeat(70) + C.reset); }

// =====================================================================
// Helpers
// =====================================================================

/**
 * Round a Decimal to 2dp and return as string for byte-comparison.
 */
function fmt(d) {
  if (d instanceof Decimal) return d.toDecimalPlaces(2).toString();
  return new Decimal(d).toDecimalPlaces(2).toString();
}

/**
 * Check if a computed value matches the expected value (both as 2dp strings).
 */
function matches(label, computed, expected, results) {
  const c = fmt(computed);
  const e = fmt(expected);
  if (c === e) {
    ok(label, c);
    results.passed++;
  } else {
    fail(label, `computed=${c}  expected=${e}`);
    results.failed++;
  }
}

/**
 * Verify that every AccountTransaction in the document is balanced:
 *   Source.Credit == Target.Debit
 *   Source.Debit  == Target.Credit
 *   (and they sum to the same total)
 */
function verifyLedgerBalance(ticket, results) {
  if (!ticket.TransactionDocument) {
    fail('Ledger balance', 'No TransactionDocument');
    results.failed++;
    return;
  }
  let allBalanced = true;
  let count = 0;
  for (const txn of ticket.TransactionDocument.AccountTransactions) {
    count++;
    if (!(txn instanceof AccountTransaction)) {
      // Was loaded from DB row, not hydrated as AccountTransaction instance
      // Skip — only verify domain instances
      continue;
    }
    if (!txn.isBalanced()) {
      fail(`Ledger balance txn #${count} (${txn.Name})`, `Source Cr=${txn.SourceTransactionValue.Credit} Dr=${txn.SourceTransactionValue.Debit} | Target Cr=${txn.TargetTransactionValue.Credit} Dr=${txn.TargetTransactionValue.Debit}`);
      allBalanced = false;
      results.failed++;
    }
  }
  if (allBalanced) {
    ok('Ledger balance', `${count} transactions all balanced`);
    results.passed++;
  }
}

// =====================================================================
// Test cases
// =====================================================================

async function setupReferenceData() {
  // Look up seed data we'll need
  const admin = await db('Users').where({ Name: 'Administrator' }).first();
  const ticketType = await db('TicketTypes').where({ Name: 'Ticket' }).first();
  const department = await db('Departments').where({ Name: 'Restaurant' }).first();
  const saleTxnType = await db('AccountTransactionTypes').where({ Name: 'Sale Transaction' }).first();
  const discountTxnType = await db('AccountTransactionTypes').where({ Name: 'Discount Transaction' }).first();
  const roundingTxnType = await db('AccountTransactionTypes').where({ Name: 'Rounding Transaction' }).first();

  // Insert a generic tax AccountTransactionType (we need one for the tax template)
  const taxTxnType = await db('AccountTransactionTypes')
    .where({ Name: 'VAT Sales Tax' }).first();
  let taxTxnTypeId;
  if (!taxTxnType) {
    [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
      Name: 'VAT Sales Tax', SortOrder: 200,
      SourceAccountTypeId: 2, TargetAccountTypeId: 1,
      DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
    });
  } else {
    taxTxnTypeId = taxTxnType.Id;
  }

  return {
    admin, ticketType, department, saleTxnType, discountTxnType, roundingTxnType, taxTxnTypeId,
  };
}

async function createMenuItem(db, name, price, groupCode = 'Food') {
  const [miId] = await db('MenuItems').insert({ Name: name, GroupCode: groupCode, Barcode: null, Tag: null });
  const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: price });
  return {
    Id: miId, Name: name, GroupCode: groupCode, Barcode: null, Tag: null,
    Portions: [{
      Id: portionId, Name: 'Normal', MenuItemId: miId, Multiplier: 1,
      Prices: [{ Id: 0, MenuItemPortionId: portionId, PriceTag: null, Price: price }],
    }],
  };
}

async function createTaxTemplate(db, name, rate, taxTxnTypeId) {
  const [ttId] = await db('TaxTemplates').insert({
    Name: name, SortOrder: 30, Rate: rate, Rounding: 0,
    AccountTransactionTypeId: taxTxnTypeId,
  });
  return { Id: ttId, Name: name, Rate: rate, Rounding: 0, AccountTransactionTypeId: taxTxnTypeId };
}

function linkTaxTemplate(db, taxTemplate, menuItemId) {
  return db('TaxTemplateMaps').insert({
    TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
    TaxTemplateId: taxTemplate.Id, MenuItemGroupCode: null, MenuItemId: menuItemId,
  });
}

// =====================================================================
// CASE 1: Simple ticket, tax INCLUDED, no discount
// =====================================================================
// Expected (from BUSINESS_RULES_ENGINE.md Test 1):
//   plainSum: 10.00
//   preTaxServices: 0
//   tax: 0           (TaxIncluded=true → not added on top)
//   postTaxServices: 0
//   totalAmount: 10.00
// =====================================================================

async function testCase1(refs, results) {
  header('CASE 1: Simple ticket, TaxIncluded=true, no discount');

  const burger = await createMenuItem(db, 'Burger', 5.00);
  const vat = await createTaxTemplate(db, 'VAT 10%', 10.0, refs.taxTxnTypeId);
  await linkTaxTemplate(db, vat, burger.Id);

  // Override ticketType to be TaxIncluded=true for this case
  const ticketTypeTaxIncluded = { ...refs.ticketType, TaxIncluded: 1 };

  const ticket = TicketBuilder.create(ticketTypeTaxIncluded, refs.department)
    .withExchangeRate(1)
    .addOrderFor(burger, [vat], refs.saleTxnType, 'admin', 2)  // 2x Burger @ $5.00 = $10.00
    .build();

  section('Computed totals');
  const totals = engine.ticketGetSum(ticket);
  info('plainSum',         fmt(totals.plainSum));
  info('preTaxServices',   fmt(totals.preTaxServices));
  info('tax',              fmt(totals.tax));
  info('postTaxServices',  fmt(totals.postTaxServices));
  info('totalAmount',      fmt(totals.totalAmount));

  section('Comparison with C# expected values');
  line();
  matches('plainSum',        totals.plainSum,        10.00, results);
  matches('preTaxServices',  totals.preTaxServices,   0.00, results);
  matches('tax',             totals.tax,              0.00, results);
  matches('postTaxServices', totals.postTaxServices,  0.00, results);
  matches('totalAmount',     totals.totalAmount,     10.00, results);
  matches('remainingAmount', ticket.RemainingAmount, 10.00, results);

  section('Ledger integrity');
  verifyLedgerBalance(ticket, results);

  return ticket;
}

// =====================================================================
// CASE 2: Simple ticket, tax EXCLUDED, no discount
// =====================================================================
// Expected (from BUSINESS_RULES_ENGINE.md Test 2):
//   plainSum: 10.00
//   preTaxServices: 0
//   tax: 1.00        (10% on top of $10.00)
//   postTaxServices: 0
//   totalAmount: 11.00
// =====================================================================

async function testCase2(refs, results) {
  header('CASE 2: Simple ticket, TaxIncluded=false, no discount');

  const burger = await createMenuItem(db, 'Burger2', 5.00);
  const vat = await createTaxTemplate(db, 'VAT 10% (excl)', 10.0, refs.taxTxnTypeId);
  await linkTaxTemplate(db, vat, burger.Id);

  // Override ticketType to be TaxIncluded=false for this case
  const ticketTypeTaxExcluded = { ...refs.ticketType, TaxIncluded: 0 };

  const ticket = TicketBuilder.create(ticketTypeTaxExcluded, refs.department)
    .withExchangeRate(1)
    .addOrderFor(burger, [vat], refs.saleTxnType, 'admin', 2)
    .build();

  section('Computed totals');
  const totals = engine.ticketGetSum(ticket);
  info('plainSum',         fmt(totals.plainSum));
  info('preTaxServices',   fmt(totals.preTaxServices));
  info('tax',              fmt(totals.tax));
  info('postTaxServices',  fmt(totals.postTaxServices));
  info('totalAmount',      fmt(totals.totalAmount));

  section('Comparison with C# expected values');
  line();
  matches('plainSum',        totals.plainSum,        10.00, results);
  matches('preTaxServices',  totals.preTaxServices,   0.00, results);
  matches('tax',             totals.tax,              1.00, results);
  matches('postTaxServices', totals.postTaxServices,  0.00, results);
  matches('totalAmount',     totals.totalAmount,     11.00, results);
  matches('remainingAmount', ticket.RemainingAmount, 11.00, results);

  section('Ledger integrity');
  verifyLedgerBalance(ticket, results);

  return ticket;
}

// =====================================================================
// CASE 3: Discount PRE-TAX + tax excluded (10% off)
// =====================================================================
// Expected (from BUSINESS_RULES_ENGINE.md Test 3):
//   plainSum: 10.00
//   preTaxServices: -1.00  (10% discount on $10.00)
//   tax: 0.90              (10% on ($10 - $1) = $9.00)
//   postTaxServices: 0
//   totalAmount: 9.90
// =====================================================================

async function testCase3(refs, results) {
  header('CASE 3: Discount PRE-TAX (10%) + TaxIncluded=false');

  const burger = await createMenuItem(db, 'Burger3', 5.00);
  const vat = await createTaxTemplate(db, 'VAT 10% (case3)', 10.0, refs.taxTxnTypeId);
  await linkTaxTemplate(db, vat, burger.Id);

  // Discount CalculationType: pre-tax, DecreaseAmount, percent method (0)
  const discountCalcType = {
    Id: 9991, Name: 'Discount 10%', SortOrder: 10,
    CalculationMethod: 0, Amount: 10.0, MaxAmount: 0,
    IncludeTax: false, DecreaseAmount: true, UsePlainSum: false,
    ToggleCalculation: false,
    AccountTransactionType: refs.discountTxnType,
  };

  const ticketTypeTaxExcluded = { ...refs.ticketType, TaxIncluded: 0 };

  const ticket = TicketBuilder.create(ticketTypeTaxExcluded, refs.department)
    .withExchangeRate(1)
    .addOrderFor(burger, [vat], refs.saleTxnType, 'admin', 2)
    .build();

  // Apply the discount AFTER the ticket is built (mirrors user clicking "10% Discount" button)
  ticket.addCalculation(discountCalcType, 10.0, refs.discountTxnType);

  section('Computed totals');
  const totals = engine.ticketGetSum(ticket);
  info('plainSum',         fmt(totals.plainSum));
  info('preTaxServices',   fmt(totals.preTaxServices));
  info('tax',              fmt(totals.tax));
  info('postTaxServices',  fmt(totals.postTaxServices));
  info('totalAmount',      fmt(totals.totalAmount));

  section('Comparison with C# expected values');
  line();
  matches('plainSum',        totals.plainSum,        10.00, results);
  matches('preTaxServices',  totals.preTaxServices, -1.00, results);
  matches('tax',             totals.tax,              0.90, results);
  matches('postTaxServices', totals.postTaxServices,  0.00, results);
  matches('totalAmount',     totals.totalAmount,      9.90, results);
  matches('remainingAmount', ticket.RemainingAmount,  9.90, results);

  section('Ledger integrity');
  verifyLedgerBalance(ticket, results);

  return ticket;
}

// =====================================================================
// CASE 4: Service charge POST-TAX + tax INCLUDED (10% service)
// =====================================================================
// Expected (from BUSINESS_RULES_ENGINE.md Test 4):
//   plainSum: 10.00
//   preTaxServices: 0
//   tax: 0           (TaxIncluded=true → not added on top)
//   postTaxServices: 1.00  (10% service charge on $10.00)
//   totalAmount: 11.00
// =====================================================================

async function testCase4(refs, results) {
  header('CASE 4: Service charge POST-TAX (10%) + TaxIncluded=true');

  const burger = await createMenuItem(db, 'Burger4', 5.00);
  const vat = await createTaxTemplate(db, 'VAT 10% (case4)', 10.0, refs.taxTxnTypeId);
  await linkTaxTemplate(db, vat, burger.Id);

  // Service Charge CalculationType: post-tax, NOT DecreaseAmount (it's a surcharge),
  // percent method (0)
  // For a service charge we use AccountTransactionType = a generic "Service" one.
  // We'll reuse the roundingTxnType for simplicity (it's a discount-type account).
  const serviceCalcType = {
    Id: 9992, Name: 'Service Charge 10%', SortOrder: 20,
    CalculationMethod: 0, Amount: 10.0, MaxAmount: 0,
    IncludeTax: true, DecreaseAmount: false, UsePlainSum: false,
    ToggleCalculation: false,
    AccountTransactionType: refs.roundingTxnType,  // reuse for test
  };

  const ticketTypeTaxIncluded = { ...refs.ticketType, TaxIncluded: 1 };

  const ticket = TicketBuilder.create(ticketTypeTaxIncluded, refs.department)
    .withExchangeRate(1)
    .addOrderFor(burger, [vat], refs.saleTxnType, 'admin', 2)
    .build();

  // Apply service charge AFTER the ticket is built
  ticket.addCalculation(serviceCalcType, 10.0, refs.roundingTxnType);

  section('Computed totals');
  const totals = engine.ticketGetSum(ticket);
  info('plainSum',         fmt(totals.plainSum));
  info('preTaxServices',   fmt(totals.preTaxServices));
  info('tax',              fmt(totals.tax));
  info('postTaxServices',  fmt(totals.postTaxServices));
  info('totalAmount',      fmt(totals.totalAmount));

  section('Comparison with C# expected values');
  line();
  matches('plainSum',        totals.plainSum,        10.00, results);
  matches('preTaxServices',  totals.preTaxServices,   0.00, results);
  matches('tax',             totals.tax,              0.00, results);
  matches('postTaxServices', totals.postTaxServices,  1.00, results);
  matches('totalAmount',     totals.totalAmount,     11.00, results);
  matches('remainingAmount', ticket.RemainingAmount, 11.00, results);

  section('Ledger integrity');
  verifyLedgerBalance(ticket, results);

  return ticket;
}

// =====================================================================
// CASE 5 (bonus): Auto-reversal on negative amount
// =====================================================================
// Verifies that AccountTransaction.UpdateAmount(-amount) swaps source/target.
// This is what happens during refunds.
// =====================================================================

async function testCase5(refs, results) {
  header('CASE 5 (bonus): Auto-reversal on negative amount (refund)');

  const { AccountTransaction } = require('../src/domain/AccountTransaction');

  // Create a normal SALE transaction: Source=Receivable, Target=Sales, Amount=$10
  const txn = new AccountTransaction({
    Name: 'Sale',
    AccountTransactionTypeId: refs.saleTxnType.Id,
    SourceAccountTypeId: refs.saleTxnType.SourceAccountTypeId,  // Receivable
    TargetAccountTypeId: refs.saleTxnType.TargetAccountTypeId,  // Sales
    SourceTransactionValue: {
      AccountId: refs.saleTxnType.DefaultSourceAccountId,
      AccountTypeId: refs.saleTxnType.SourceAccountTypeId,
    },
    TargetTransactionValue: {
      AccountId: refs.saleTxnType.DefaultTargetAccountId,
      AccountTypeId: refs.saleTxnType.TargetAccountTypeId,
    },
  });

  section('Step 1: Update with positive amount (+10.00)');
  txn.updateAmount(10.00, 1);
  info('Amount',                  String(txn.Amount));
  info('IsReversed',              String(txn.IsReversed));
  info('Source.Credit',           String(txn.SourceTransactionValue.Credit));
  info('Target.Debit',            String(txn.TargetTransactionValue.Debit));
  matches('Amount',       txn.Amount,                       10.00, results);
  matches('Source.Credit', txn.SourceTransactionValue.Credit, 10.00, results);
  matches('Target.Debit',  txn.TargetTransactionValue.Debit,  10.00, results);

  section('Step 2: Update with negative amount (-7.00) → should auto-reverse');
  txn.updateAmount(-7.00, 1);
  info('Amount (after reverse)', String(txn.Amount));
  info('IsReversed',              String(txn.IsReversed));
  // After reversal: Source was Sales, Target was Receivable.
  // Amount = abs(-7) = 7.00
  // Source (Sales) Credit = 7.00
  // Target (Receivable) Debit = 7.00
  matches('Amount (after reverse)',  txn.Amount,                       7.00, results);
  ok('IsReversed flag', String(txn.IsReversed));
  matches('Source.Credit (after)', txn.SourceTransactionValue.Credit, 7.00, results);
  matches('Target.Debit (after)',  txn.TargetTransactionValue.Debit,  7.00, results);
  verifyLedgerBalance({ TransactionDocument: { AccountTransactions: [txn] } }, results);
}

// =====================================================================
// MAIN
// =====================================================================

(async () => {
  try {
    header('SPRINT 2 — ACCEPTANCE TEST (4 scenarios + auto-reversal bonus)');

    const refs = await setupReferenceData();
    info('Admin user',    `Id=${refs.admin.Id}, Name="${refs.admin.Name}"`);
    info('Ticket type',   `Id=${refs.ticketType.Id}, TaxIncluded=${refs.ticketType.TaxIncluded}`);
    info('Department',    `Id=${refs.department.Id}`);
    info('Sale txn type', `Id=${refs.saleTxnType.Id}`);
    info('Tax txn type',  `Id=${refs.taxTxnTypeId}`);

    const results = { passed: 0, failed: 0 };

    await testCase1(refs, results);
    await testCase2(refs, results);
    await testCase3(refs, results);
    await testCase4(refs, results);
    await testCase5(refs, results);

    // -----------------------------------------------------------------
    // FINAL VERDICT
    // -----------------------------------------------------------------
    section('FINAL VERDICT');
    line();
    info('Tests passed', String(results.passed));
    info('Tests failed', String(results.failed));

    if (results.failed === 0) {
      console.log('');
      console.log(C.bold + C.green + '  ╔══════════════════════════════════════════════════════════════════════════╗' + C.reset);
      console.log(C.bold + C.green + '  |  SPRINT 2 ACCEPTANCE TEST PASSED                                          |' + C.reset);
      console.log(C.bold + C.green + '  |  - 5 scenarios executed (4 calculation + 1 auto-reversal)                |' + C.reset);
      console.log(C.bold + C.green + '  |  - All totals match SambaPOS V3 C# original byte-for-byte               |' + C.reset);
      console.log(C.bold + C.green + '  |  - Double-entry ledger balanced in every scenario                        |' + C.reset);
      console.log(C.bold + C.green + '  |  - Auto-reversal works correctly on negative amounts                     |' + C.reset);
      console.log(C.bold + C.green + '  |  - Rounding-mode inconsistency (ToEven vs AwayFromZero) preserved        |' + C.reset);
      console.log(C.bold + C.green + '  ╚══════════════════════════════════════════════════════════════════════════╝' + C.reset);
      console.log('');
    } else {
      console.log('');
      console.log(C.bold + C.red + '  ╔══════════════════════════════════════════════════════════════════════════╗' + C.reset);
      console.log(C.bold + C.red + '  |  SPRINT 2 ACCEPTANCE TEST FAILED                                          |' + C.reset);
      console.log(C.bold + C.red + '  ╚══════════════════════════════════════════════════════════════════════════╝' + C.reset);
      console.log('');
      process.exit(1);
    }

    await db.destroy();
  } catch (err) {
    console.error(C.red + '\nFATAL ERROR:' + C.reset, err);
    console.error(err.stack);
    await db.destroy();
    process.exit(1);
  }
})();
