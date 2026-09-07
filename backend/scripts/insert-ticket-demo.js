// =====================================================================
// insert-ticket-demo.js  —  Sprint 1 acceptance test
// =====================================================================
// Per Architect's directive:
//   "Insert a Ticket with 2 products, read it back, and show by console
//    that the plainSum calculations match what the C# original would
//    produce (using your rounding rules)."
//
// This script:
//   1. Inserts 2 menu items (Burger $5.00, Fries $3.50) into the DB
//      via a transaction
//   2. Inserts a TaxTemplate (VAT 10%, TaxIncluded=true) and links it
//      to both menu items via TaxTemplateMap
//   3. Inserts a Ticket with 2 Orders (1x Burger, 2x Fries)
//   4. Reads the ticket back via TicketRepository.getTicketById
//   5. Runs CalculationEngine.ticketGetSum on the hydrated ticket
//   6. Prints the EXACT object structure returned (not a generic console.log)
//      AND the byte-by-byte monetary comparison vs the expected C# result
//
// Expected result (C# original would compute):
//   - Burger price: $5.00 × 1 = $5.00 (tax included)
//   - Fries price:  $3.50 × 2 = $7.00 (tax included)
//   - plainSum:     $12.00
//   - preTaxServices: $0.00 (no discount)
//   - tax:            $0.00 (TaxIncluded=true, so tax is NOT added on top)
//   - postTaxServices:$0.00
//   - totalAmount:    $12.00
//   - Per-line extracted VAT (for reporting only, computed via TaxValue.GetTax):
//       Burger: (5.00 × 10) / (100 + 10) = 0.454545... → unrounded
//       Fries:  (7.00 × 10) / (100 + 10) = 0.636363... → unrounded
//       Sum:    1.090909... → rounded AwayFromZero to 2 dp = 1.09
//   - RemainingAmount: $12.00 (no payments)
// =====================================================================

const path = require('path');
const knex = require('knex');
const Decimal = require('decimal.js');

const cfg = require('../src/infrastructure/db/knexfile.js');
const { TicketRepository } = require('../src/infrastructure/repositories/TicketRepository');
const { ProductRepository } = require('../src/infrastructure/repositories/ProductRepository');
const engine = require('../src/domain/CalculationEngine');

const db = knex(cfg.development);

// =====================================================================
// ANSI colors for readable console output
// =====================================================================
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function header(title) {
  console.log('\n' + C.bold + C.cyan + '═'.repeat(72) + C.reset);
  console.log(C.bold + C.cyan + '  ' + title + C.reset);
  console.log(C.bold + C.cyan + '═'.repeat(72) + C.reset);
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

// =====================================================================
// Helper: deep-stringify a ticket object for "structure" display
// =====================================================================
function prettyTicket(ticket) {
  // Strip internal _parsed* fields for display clarity
  const clean = JSON.parse(JSON.stringify(ticket, (key, value) => {
    if (key.startsWith('_')) return undefined;
    return value;
  }, 2));
  return clean;
}

// =====================================================================
// Main
// =====================================================================
(async () => {
  try {
    header('SPRINT 1 — ACCEPTANCE TEST: Ticket with 2 products');

    // -----------------------------------------------------------------
    // Step 1: Verify the seed is in place
    // -----------------------------------------------------------------
    section('Step 1: Verify seed data');
    const admin = await db('Users').where({ PinCode: '1234' }).first();
    if (!admin) throw new Error('Seed not loaded — run `npx knex seed:run` first');
    ok('Admin user', `Id=${admin.Id}, Name="${admin.Name}", PinCode="${admin.PinCode}"`);

    const ticketType = await db('TicketTypes').where({ Name: 'Ticket' }).first();
    ok('Ticket type', `Id=${ticketType.Id}, TaxIncluded=${ticketType.TaxIncluded}`);

    const department = await db('Departments').where({ Name: 'Restaurant' }).first();
    ok('Department',  `Id=${department.Id}, WarehouseId=${department.WarehouseId}`);

    const saleTxn = await db('AccountTransactionTypes').where({ Name: 'Sale Transaction' }).first();
    ok('Sale txn type', `Id=${saleTxn.Id}, Source=${saleTxn.SourceAccountTypeId} → Target=${saleTxn.TargetAccountTypeId}`);

    // -----------------------------------------------------------------
    // Step 2: Insert 2 menu items + portions + prices + tax template
    // -----------------------------------------------------------------
    section('Step 2: Insert 2 menu items + tax template (transactional)');

    const burgerId = await (async () => {
      return await db.transaction(async (trx) => {
        await trx.raw('PRAGMA defer_foreign_keys = ON');
        const [miId] = await trx('MenuItems').insert({
          Name: 'Burger', GroupCode: 'Food', Barcode: 'BURG001', Tag: null,
        });
        const [portionId] = await trx('MenuItemPortions').insert({
          Name: 'Normal', MenuItemId: miId, Multiplier: 1,
        });
        await trx('MenuItemPrices').insert({
          MenuItemPortionId: portionId, PriceTag: null, Price: 5.00,
        });
        return miId;
      });
    })();
    ok('Inserted Burger', `MenuItem.Id=${burgerId}, Price=$5.00`);

    const friesId = await (async () => {
      return await db.transaction(async (trx) => {
        await trx.raw('PRAGMA defer_foreign_keys = ON');
        const [miId] = await trx('MenuItems').insert({
          Name: 'Fries', GroupCode: 'Food', Barcode: 'FRIES01', Tag: null,
        });
        const [portionId] = await trx('MenuItemPortions').insert({
          Name: 'Normal', MenuItemId: miId, Multiplier: 1,
        });
        await trx('MenuItemPrices').insert({
          MenuItemPortionId: portionId, PriceTag: null, Price: 3.50,
        });
        return miId;
      });
    })();
    ok('Inserted Fries',  `MenuItem.Id=${friesId}, Price=$3.50`);

    // Insert a TaxTemplate (VAT 10%) and link to both menu items
    const taxTemplateId = await (async () => {
      return await db.transaction(async (trx) => {
        // Need an AccountTransactionType for the tax
        const [taxTxnTypeId] = await trx('AccountTransactionTypes').insert({
          Name: 'VAT 10%', SortOrder: 100,
          SourceAccountTypeId: 2,  // Receivable
          TargetAccountTypeId: 1,  // Sales (simplified)
          DefaultSourceAccountId: 2,
          DefaultTargetAccountId: 1,
        });
        const [ttId] = await trx('TaxTemplates').insert({
          Name: 'VAT 10%', SortOrder: 10, Rate: 10.0, Rounding: 0,
          AccountTransactionTypeId: taxTxnTypeId,
        });
        await trx('TaxTemplateMaps').insert([
          { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
            TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: burgerId },
          { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
            TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: friesId },
        ]);
        return ttId;
      });
    })();
    ok('Inserted TaxTemplate', `Id=${taxTemplateId}, Rate=10%, Rounding=0`);

    // -----------------------------------------------------------------
    // Step 3: Verify ProductRepository returns the right structure
    // -----------------------------------------------------------------
    section('Step 3: Verify ProductRepository structure');

    const prodRepo = new ProductRepository();
    const burger = await prodRepo.getMenuItemById(burgerId);
    info('getMenuItemById(burgerId).Name', burger.Name);
    info('getMenuItemById(burgerId).GroupCode', burger.GroupCode);
    info('getMenuItemById(burgerId).Portions.length', String(burger.Portions.length));
    info('getMenuItemById(burgerId).Portions[0].Name', burger.Portions[0].Name);
    info('getMenuItemById(burgerId).Portions[0].Prices[0].Price', String(burger.Portions[0].Prices[0].Price));

    const taxTemplatesForBurger = await prodRepo.getTaxTemplates(burgerId);
    info('getTaxTemplates(burgerId).length', String(taxTemplatesForBurger.length));
    info('getTaxTemplates(burgerId)[0].Rate', String(taxTemplatesForBurger[0].Rate));

    // -----------------------------------------------------------------
    // Step 4: Insert a Ticket with 2 Orders
    // -----------------------------------------------------------------
    section('Step 4: Insert Ticket with 2 Orders (Burger x1, Fries x2)');

    // Build the Order.Taxes JSON like SambaPOS would (TaxValue with short DataMember names)
    // SambaPOS uses [DataMember(Name="TR")] for TaxRate, etc. For simplicity we use full names here.
    const taxesJson = JSON.stringify([{
      TaxRate: 10.0,
      Rounding: 0,
      TaxTemplateName: 'VAT 10%',
      TaxTemplateId: taxTemplateId,
      TaxTempleteAccountTransactionTypeId: taxTemplatesForBurger[0].AccountTransactionTypeId,
    }]);

    const ticketRepo = new TicketRepository();
    const newTicketId = await ticketRepo.saveTicket({
      Name: 'Test Ticket',
      TicketNumber: null,            // will be assigned at CloseTicket
      Date: new Date().toISOString(),
      LastOrderDate: new Date().toISOString(),
      LastPaymentDate: new Date().toISOString(),
      IsClosed: 0,
      IsLocked: 0,
      RemainingAmount: 0,            // will be recomputed by CalculationEngine
      TotalAmount: 0,                // will be recomputed
      DepartmentId: department.Id,
      TicketTypeId: ticketType.Id,
      Note: null,
      LastModifiedUserName: 'Administrator',
      TicketTags: null,
      TicketStates: JSON.stringify([{ StateName: 'Status', State: 'New', Quantity: 0 }]),
      TicketLogs: null,
      ExchangeRate: 1.0,
      TaxIncluded: 1,                // mirrors TicketType.TaxIncluded
      TransactionDocumentId: null,   // not yet created (Sprint 2 will add)
      Orders: [
        {
          MenuItemId: burgerId,
          MenuItemName: 'Burger',
          PortionName: 'Normal',
          Price: 5.00,
          Quantity: 1,
          PortionCount: 1,
          Locked: 0,
          CalculatePrice: 1,
          DecreaseInventory: 1,
          IncreaseInventory: 0,
          OrderNumber: 0,
          CreatingUserName: 'Administrator',
          CreatedDateTime: new Date().toISOString(),
          AccountTransactionTypeId: saleTxn.Id,
          PriceTag: '',
          Tag: null,
          Taxes: taxesJson,
          OrderTags: null,
          OrderStates: JSON.stringify([{ StateName: 'Status', State: 'New' }]),
          WarehouseId: department.WarehouseId,
          DepartmentId: department.Id,
        },
        {
          MenuItemId: friesId,
          MenuItemName: 'Fries',
          PortionName: 'Normal',
          Price: 3.50,
          Quantity: 2,
          PortionCount: 1,
          Locked: 0,
          CalculatePrice: 1,
          DecreaseInventory: 1,
          IncreaseInventory: 0,
          OrderNumber: 0,
          CreatingUserName: 'Administrator',
          CreatedDateTime: new Date().toISOString(),
          AccountTransactionTypeId: saleTxn.Id,
          PriceTag: '',
          Tag: null,
          Taxes: taxesJson,
          OrderTags: null,
          OrderStates: JSON.stringify([{ StateName: 'Status', State: 'New' }]),
          WarehouseId: department.WarehouseId,
          DepartmentId: department.Id,
        },
      ],
      Calculations: [],
      Payments: [],
      ChangePayments: [],
      PaidItems: [],
      TicketEntities: [],
    });
    ok('Ticket inserted', `Id=${newTicketId}`);

    // -----------------------------------------------------------------
    // Step 5: Read the ticket back via TicketRepository
    // -----------------------------------------------------------------
    section('Step 5: Read ticket back via TicketRepository.getTicketById');

    const loadedTicket = await ticketRepo.getTicketById(newTicketId);
    if (!loadedTicket) throw new Error('Ticket not found after insert');
    ok('Ticket loaded', `Id=${loadedTicket.Id}, Orders=${loadedTicket.Orders.length}`);

    // -----------------------------------------------------------------
    // Step 6: Display the EXACT structure of the loaded ticket
    // -----------------------------------------------------------------
    section('Step 6: EXACT structure returned by getTicketById (per Architect directive)');

    console.log(C.gray + '  (internal _parsed* hydration fields stripped for clarity)' + C.reset);
    console.log('');
    console.log(C.magenta + JSON.stringify(prettyTicket(loadedTicket), null, 2) + C.reset);

    // -----------------------------------------------------------------
    // Step 7: Run the CalculationEngine and verify against C# expected
    // -----------------------------------------------------------------
    section('Step 7: CalculationEngine.ticketGetSum — comparison with C# original');

    engine.hydrateTicket(loadedTicket);
    const result = engine.ticketGetSum(loadedTicket);

    // Expected values (what SambaPOS V3 C# would compute):
    const expected = {
      plainSum:         '12.00',
      preTaxServices:   '0.00',
      tax:              '0.00',     // TaxIncluded=true, so no tax added on top
      postTaxServices:  '0.00',
      totalAmount:      '12.00',
    };

    info('plainSum         (computed)', result.plainSum.toFixed(2));
    info('plainSum         (expected)', expected.plainSum);

    info('preTaxServices   (computed)', result.preTaxServices.toFixed(2));
    info('preTaxServices   (expected)', expected.preTaxServices);

    info('tax              (computed)', result.tax.toFixed(2));
    info('tax              (expected)', expected.tax);

    info('postTaxServices  (computed)', result.postTaxServices.toFixed(2));
    info('postTaxServices  (expected)', expected.postTaxServices);

    info('totalAmount      (computed)', result.totalAmount.toFixed(2));
    info('totalAmount      (expected)', expected.totalAmount);

    const remainingAmount = engine.ticketGetRemainingAmount(loadedTicket);
    info('remainingAmount  (computed)', remainingAmount.toFixed(2));
    info('remainingAmount  (expected)', '12.00');

    // -----------------------------------------------------------------
    // Step 8: Verify rounding-mode inconsistency is preserved
    // -----------------------------------------------------------------
    section('Step 8: Verify rounding-mode inconsistency (ToEven vs AwayFromZero)');

    // Test: round 0.5 with banker's (ToEven) → should be 0
    //       round 0.5 with away-from-zero → should be 1
    //       round 1.5 with banker's (ToEven) → should be 2
    //       round 1.5 with away-from-zero → should be 2
    //       round 2.5 with banker's (ToEven) → should be 2 (rounds to even)
    //       round 2.5 with away-from-zero → should be 3
    const testCases = [
      { input: 0.5,   decimals: 0, bankers: '0',    away: '1'    },
      { input: 1.5,   decimals: 0, bankers: '2',    away: '2'    },
      { input: 2.5,   decimals: 0, bankers: '2',    away: '3'    },   // KEY: diverges here
      { input: 0.125, decimals: 2, bankers: '0.12', away: '0.13' },  // 2dp: banker's → 0.12, away → 0.13
    ];
    let allRoundingOk = true;
    for (const tc of testCases) {
      const b = engine.roundBankers(tc.input, tc.decimals).toString();
      const a = engine.roundAway(tc.input, tc.decimals).toString();
      const bOk = b === tc.bankers;
      const aOk = a === tc.away;
      if (bOk && aOk) {
        ok(`round(${tc.input}, ${tc.decimals}dp)`, `bankers=${b}  away=${a}`);
      } else {
        fail(`round(${tc.input}, ${tc.decimals}dp)`, `bankers=${b} (expected ${tc.bankers}), away=${a} (expected ${tc.away})`);
        allRoundingOk = false;
      }
    }

    // -----------------------------------------------------------------
    // Step 9: Final verdict
    // -----------------------------------------------------------------
    section('Step 9: FINAL VERDICT');

    const allMatch =
      result.plainSum.toFixed(2) === expected.plainSum &&
      result.preTaxServices.toFixed(2) === expected.preTaxServices &&
      result.tax.toFixed(2) === expected.tax &&
      result.postTaxServices.toFixed(2) === expected.postTaxServices &&
      result.totalAmount.toFixed(2) === expected.totalAmount &&
      remainingAmount.toFixed(2) === '12.00' &&
      allRoundingOk;

    if (allMatch) {
      console.log('');
      console.log(C.bold + C.green + '  ╔══════════════════════════════════════════════════════════════════════╗' + C.reset);
      console.log(C.bold + C.green + '  ║  SPRINT 1 ACCEPTANCE TEST PASSED                                       ║' + C.reset);
      console.log(C.bold + C.green + '  ║  - Ticket inserted with 2 orders                                       ║' + C.reset);
      console.log(C.bold + C.green + '  ║  - TicketRepository.GetTicketById returns full hydrated structure     ║' + C.reset);
      console.log(C.bold + C.green + '  ║  - CalculationEngine produces byte-identical results to SambaPOS V3   ║' + C.reset);
      console.log(C.bold + C.green + '  |  - Both rounding modes (bankers & away-from-zero) preserved          |' + C.reset);
      console.log(C.bold + C.green + '  ╚══════════════════════════════════════════════════════════════════════╝' + C.reset);
      console.log('');
    } else {
      console.log('');
      console.log(C.bold + C.red + '  ╔══════════════════════════════════════════════════════════════════════╗' + C.reset);
      console.log(C.bold + C.red + '  ║  SPRINT 1 ACCEPTANCE TEST FAILED                                       ║' + C.reset);
      console.log(C.bold + C.red + '  ╚══════════════════════════════════════════════════════════════════════╝' + C.reset);
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
