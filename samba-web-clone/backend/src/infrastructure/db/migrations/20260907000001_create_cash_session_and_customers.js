// =====================================================================
// Migration 20260907000001_create_cash_session_and_customers.js
// =====================================================================
// FASE 2 — Domain expansion:
//   1. Extend WorkPeriods with proper aggregate fields
//      (OpenedBy, ClosedBy, OpeningAmount, ClosingAmount, Expected, Actual,
//       Difference, Status, IsOpen, Version)
//   2. Create CashSessions table — per-terminal drawer management
//   3. Create Customers table — Customer aggregate (was missing entirely)
//   4. Create Notifications table — for FASE 9 push notifications + in-app
//   5. Create PrintJobs table — PrintJob aggregate (replaces ad-hoc PrinterManager state)
//   6. Add IdempotencyKey column to Tickets/Payments for FASE 2.5
//
// All new tables use Id INTEGER PRIMARY KEY AUTOINCREMENT and explicit FKs.
// =====================================================================

exports.up = async function(knex) {
  const isSQLite = knex.client.config.client === 'sqlite3';

  // -----------------------------------------------------------------
  // 1. Extend WorkPeriods (add aggregate-relevant columns)
  // -----------------------------------------------------------------
  await knex.schema.alterTable('WorkPeriods', (table) => {
    table.integer('OpenedBy').nullable();
    table.integer('ClosedBy').nullable();
    table.decimal('OpeningAmount', 16, 2).notNullable().defaultTo(0);
    table.decimal('ClosingAmount', 16, 2).nullable();
    table.decimal('ExpectedAmount', 16, 2).nullable();
    table.decimal('ActualAmount', 16, 2).nullable();
    table.decimal('Difference', 16, 2).nullable();
    table.text('Status').notNullable().defaultTo('OPEN');
    table.integer('IsOpen').notNullable().defaultTo(1);
    table.integer('Version').notNullable().defaultTo(1);
  });

  // -----------------------------------------------------------------
  // 2. CashSessions — per-terminal cash drawer lifecycle
  // -----------------------------------------------------------------
  await knex.schema.createTable('CashSessions', (table) => {
    table.increments('Id').primary();
    table.integer('WorkPeriodId').notNullable();
    table.integer('TerminalId').notNullable().defaultTo(0);
    table.integer('UserId').notNullable();           // who opened
    table.integer('ClosedByUserId').nullable();       // who closed
    table.timestamp('OpenedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ClosedAt').nullable();
    table.decimal('OpeningAmount', 16, 2).notNullable().defaultTo(0);
    table.decimal('CashSales', 16, 2).notNullable().defaultTo(0);     // sum of cash payments
    table.decimal('CardSales', 16, 2).notNullable().defaultTo(0);     // sum of card payments
    table.decimal('VoucherSales', 16, 2).notNullable().defaultTo(0);
    table.decimal('Payouts', 16, 2).notNullable().defaultTo(0);       // cash removed mid-session
    table.decimal('Transfers', 16, 2).notNullable().defaultTo(0);     // cash transfers in/out
    table.decimal('ExpectedAmount', 16, 2).notNullable().defaultTo(0); // computed
    table.decimal('CountedAmount', 16, 2).nullable();                  // user input on close
    table.decimal('Difference', 16, 2).nullable();
    table.string('Status', 20).notNullable().defaultTo('OPEN');   // OPEN | CLOSED | RECONCILING
    table.integer('Version').notNullable().defaultTo(1);
    table.text('Notes');

    table.foreign('WorkPeriodId').references('WorkPeriods.Id').onDelete('RESTRICT');
  });
  await knex.schema.alterTable('CashSessions', (table) => {
    table.index(['WorkPeriodId', 'Status'], 'IX_CashSessions_Open');
    table.index(['TerminalId'], 'IX_CashSessions_Terminal');
    table.index(['UserId'], 'IX_CashSessions_User');
  });

  // -----------------------------------------------------------------
  // 3. CashSessionEvents — ledger of events within a session
  // -----------------------------------------------------------------
  await knex.schema.createTable('CashSessionEvents', (table) => {
    table.increments('Id').primary();
    table.integer('CashSessionId').notNullable();
    table.timestamp('At').notNullable().defaultTo(knex.fn.now());
    table.string('EventType', 40).notNullable();   // OPEN | PAYOUT | TRANSFER | SALE | REFUND | CLOSE
    table.string('PaymentType', 40).nullable();    // Cash | Credit Card | Voucher | ...
    table.decimal('Amount', 16, 2).notNullable().defaultTo(0);
    table.integer('TicketId').nullable();
    table.integer('PaymentId').nullable();
    table.integer('UserId').notNullable();
    table.text('Note');
    table.string('IdempotencyKey', 128).nullable();

    table.foreign('CashSessionId').references('CashSessions.Id').onDelete('CASCADE');
  });
  await knex.schema.alterTable('CashSessionEvents', (table) => {
    table.index(['CashSessionId', 'At'], 'IX_CashSessionEvents_Session');
    table.index(['IdempotencyKey'], 'IX_CashSessionEvents_Idempotency');
  });

  // -----------------------------------------------------------------
  // 4. Customers — Customer aggregate (new)
  // -----------------------------------------------------------------
  await knex.schema.createTable('Customers', (table) => {
    table.increments('Id').primary();
    table.string('Name', 255).notNullable();
    table.string('Code', 64).nullable().unique();           // customer code / loyalty #
    table.string('Phone', 32).nullable();
    table.string('Email', 255).nullable();
    table.text('Address').nullable();
    table.string('TaxId', 64).nullable();                   // RFC / CIF / VAT #
    table.decimal('AccountBalance', 16, 2).notNullable().defaultTo(0);  // customer account (credit)
    table.integer('GroupId').nullable();                    // CustomerGroups (future)
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('UpdatedAt').notNullable().defaultTo(knex.fn.now());
    table.integer('IsActive').notNullable().defaultTo(1);
    table.text('Notes');
  });
  await knex.schema.alterTable('Customers', (table) => {
    table.index(['Name'], 'IX_Customers_Name');
    table.index(['Phone'], 'IX_Customers_Phone');
    table.index(['Code'], 'IX_Customers_Code');
    table.index(['IsActive'], 'IX_Customers_Active');
  });

  // -----------------------------------------------------------------
  // 5. Notifications — in-app + push registry (FASE 9 prep)
  // -----------------------------------------------------------------
  await knex.schema.createTable('Notifications', (table) => {
    table.increments('Id').primary();
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.string('Category', 40).notNullable();    // kitchen | printer | stock | system | ticket
    table.string('Severity', 20).notNullable().defaultTo('info');  // info | warn | error | critical
    table.string('Title', 200).notNullable();
    table.text('Body');
    table.string('Action', 100).nullable();        // e.g. 'open_ticket:42'
    table.integer('TargetUserId').nullable();      // null = broadcast
    table.string('TargetRole', 40).nullable();     // pos | kitchen | admin
    table.integer('EntityId').nullable();
    table.string('EntityType', 50).nullable();
    table.integer('IsRead').notNullable().defaultTo(0);
    table.integer('IsDelivered').notNullable().defaultTo(0);   // delivered via push
    table.timestamp('ReadAt').nullable();
    table.timestamp('DeliveredAt').nullable();
    table.string('IdempotencyKey', 128).nullable().unique();
  });
  await knex.schema.alterTable('Notifications', (table) => {
    table.index(['TargetUserId', 'IsRead'], 'IX_Notifications_UserUnread');
    table.index(['Category'], 'IX_Notifications_Category');
    table.index(['CreatedAt'], 'IX_Notifications_CreatedAt');
  });

  // -----------------------------------------------------------------
  // 6. PrintJobs — PrintJob aggregate (formal model for FASE 7)
  //    Note: an old PrintJobs table exists in 20240904000001_create_schema.js
  //    but it's the legacy SambaPOS schema. We rename it to PrintJobsLegacy
  //    and create a new PrintJobs table with the proper FASE 7 structure.
  // -----------------------------------------------------------------
  try {
    await knex.schema.renameTable('PrintJobs', 'PrintJobsLegacy');
  } catch (e) {
    // If it doesn't exist (e.g. fresh install), ignore
  }

  await knex.schema.createTable('PrintJobs', (table) => {
    table.increments('Id').primary();
    table.string('Uuid', 64).notNullable().unique();           // external UUID for idempotency
    table.integer('TicketId').nullable();
    table.integer('OrderId').nullable();
    table.integer('PrinterId').notNullable();
    table.string('JobType', 30).notNullable();    // KITCHEN_ORDER | RECEIPT | REFUND_RECEIPT | REPRINT | REPORT
    table.string('Status', 20).notNullable().defaultTo('PENDING');  // PENDING | PRINTING | PRINTED | FAILED | RETRYING | CANCELLED
    table.integer('Attempts').notNullable().defaultTo(0);
    table.integer('MaxAttempts').notNullable().defaultTo(5);
    table.string('IdempotencyKey', 128).nullable().unique();
    table.binary('Payload');                     // raw ESC/POS bytes
    table.integer('PayloadSize').nullable();
    table.string('Checksum', 64).nullable();     // sha256 of payload for golden fixture comparison
    table.text('Error');
    table.timestamp('QueuedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('PrintedAt').nullable();
    table.timestamp('LastAttemptAt').nullable();
    table.timestamp('NextAttemptAt').nullable();
    table.integer('UserId').nullable();
    table.integer('FallbackPrinterId').nullable();
  });
  await knex.schema.alterTable('PrintJobs', (table) => {
    table.index(['Status', 'NextAttemptAt'], 'IX_PrintJobs_Queue');
    table.index(['TicketId'], 'IX_PrintJobs_Ticket');
    table.index(['PrinterId', 'Status'], 'IX_PrintJobs_PrinterStatus');
    table.index(['IdempotencyKey'], 'IX_PrintJobs_Idempotency');
  });

  // -----------------------------------------------------------------
  // 7. Add IdempotencyKey + Version to Payments (FASE 2.5 prep)
  // -----------------------------------------------------------------
  await knex.schema.alterTable('Payments', (table) => {
    table.string('IdempotencyKey', 128).nullable().unique();
    table.integer('CashSessionId').nullable();
    table.integer('Version').notNullable().defaultTo(1);
  });
  await knex.schema.alterTable('Payments', (table) => {
    table.index(['IdempotencyKey'], 'IX_Payments_Idempotency');
    table.index(['CashSessionId'], 'IX_Payments_CashSession');
  });

  // -----------------------------------------------------------------
  // 8. Add IdempotencyKey + CustomerId to Tickets (FASE 2.4 + 2.5 prep)
  // -----------------------------------------------------------------
  await knex.schema.alterTable('Tickets', (table) => {
    table.string('IdempotencyKey', 128).nullable().unique();
    table.integer('CustomerId').nullable();
    table.integer('WorkPeriodId').nullable();
    table.integer('CashSessionId').nullable();
  });
  await knex.schema.alterTable('Tickets', (table) => {
    table.index(['IdempotencyKey'], 'IX_Tickets_Idempotency');
    table.index(['CustomerId'], 'IX_Tickets_Customer');
    table.index(['WorkPeriodId'], 'IX_Tickets_WorkPeriod');
    table.index(['CashSessionId'], 'IX_Tickets_CashSession');
  });
};

exports.down = async function(knex) {
  // Tickets
  await knex.schema.alterTable('Tickets', (table) => {
    table.dropColumn('IdempotencyKey');
    table.dropColumn('CustomerId');
    table.dropColumn('WorkPeriodId');
    table.dropColumn('CashSessionId');
  });

  // Payments
  await knex.schema.alterTable('Payments', (table) => {
    table.dropColumn('IdempotencyKey');
    table.dropColumn('CashSessionId');
    table.dropColumn('Version');
  });

  // PrintJobs (new) -> drop, restore legacy if renamed
  await knex.schema.dropTableIfExists('PrintJobs');
  try { await knex.schema.renameTable('PrintJobsLegacy', 'PrintJobs'); } catch (e) {}

  await knex.schema.dropTableIfExists('Notifications');
  await knex.schema.dropTableIfExists('Customers');
  await knex.schema.dropTableIfExists('CashSessionEvents');
  await knex.schema.dropTableIfExists('CashSessions');

  // WorkPeriods — drop the new columns
  await knex.schema.alterTable('WorkPeriods', (table) => {
    table.dropColumn('OpenedBy');
    table.dropColumn('ClosedBy');
    table.dropColumn('OpeningAmount');
    table.dropColumn('ClosingAmount');
    table.dropColumn('ExpectedAmount');
    table.dropColumn('ActualAmount');
    table.dropColumn('Difference');
    table.dropColumn('Status');
    table.dropColumn('IsOpen');
    table.dropColumn('Version');
  });
};
