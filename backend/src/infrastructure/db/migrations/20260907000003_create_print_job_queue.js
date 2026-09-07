// =====================================================================
// Migration: 20260907000003_create_print_job_queue.js
// =====================================================================
// Creates the persistent print job queue tables for FASE 7 (real printing).
//
// Tables created:
//   - PrintJobInstances: persistent queue of print jobs with idempotency,
//     retry, fallback, checksum, status state machine. The domain class
//     PrintJob (already exists in src/domain/PrintJob.js) maps to this.
//   - PrintAreas: configurable areas (kitchen, bar, cashier, etc.) that
//     group printers by purpose.
//   - PrintRoutingRules: maps a (MenuItemGroupCode OR MenuItemId OR Tag)
//     to a PrintArea, so the PrintRouter can decide which printer(s) to
//     send a given order to.
//
// NOTE: The legacy `PrintJobs` table (created in 20240904000001) stores
// SambaPOS-3 *configuration* of named print jobs ("Print Bill",
// "Print Orders to Kitchen Printer"). It is NOT the same concept as
// our new PrintJobInstance (which is a single queued print operation).
// We keep both for backward compatibility — the legacy table is now
// renamed in code references as "PrintJobConfigs" semantically.
// =====================================================================

const PRINT_JOB_TYPES = [
  'KITCHEN_ORDER', 'RECEIPT', 'REFUND_RECEIPT', 'REPRINT', 'REPORT',
];

const PRINT_JOB_STATUS = [
  'PENDING', 'PRINTING', 'PRINTED', 'FAILED', 'RETRYING', 'CANCELLED',
];

const PRINT_AREA_TYPES = [
  'KITCHEN', 'BAR', 'CAFE', 'PIZZA', 'CASHIER', 'REPORT', 'OTHER',
];

exports.up = async function (knex) {
  // === PrintAreas ===
  // Groups printers by purpose (kitchen station, bar, cashier, etc.)
  await knex.schema.createTable('PrintAreas', (t) => {
    t.increments('Id').primary();
    t.text('Name').notNullable();
    t.text('DisplayName');
    t.text('Description');
    t.text('AreaType').notNullable().defaultTo('OTHER');  // see PRINT_AREA_TYPES
    t.text('Color').defaultTo('#2196F3');  // UI color hint
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.boolean('IsActive').notNullable().defaultTo(true);
    t.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    t.timestamp('UpdatedAt').notNullable().defaultTo(knex.fn.now());
  });

  // === PrintJobInstances ===
  // The persistent queue. Each row is a single print operation with full
  // idempotency, retry, fallback and audit semantics.
  await knex.schema.createTable('PrintJobInstances', (t) => {
    t.increments('Id').primary();
    t.text('Uuid').notNullable().unique();  // public UUID for idempotency
    t.integer('TicketId').nullable();      // FK to Tickets (nullable for reports)
    t.integer('OrderId').nullable();       // FK to Orders (for per-order kitchen prints)
    t.integer('PrinterId').notNullable();   // FK to Printers (the target printer)
    t.integer('FallbackPrinterId').nullable(); // FK to Printers (fallback if primary fails)
    t.integer('PrintAreaId').nullable();   // FK to PrintAreas (for routing)
    t.text('JobType').notNullable();        // see PRINT_JOB_TYPES
    t.text('Status').notNullable().defaultTo('PENDING'); // see PRINT_JOB_STATUS
    t.integer('Attempts').notNullable().defaultTo(0);
    t.integer('MaxAttempts').notNullable().defaultTo(5);
    t.text('IdempotencyKey').nullable();   // client-supplied dedup key
    t.binary('Payload').nullable();        // ESC/POS bytes
    t.integer('PayloadSize').nullable();
    t.text('Checksum').nullable();         // sha256 of Payload (golden-fixture check)
    t.text('Error').nullable();             // last error message (truncated to 5000 chars)
    t.timestamp('QueuedAt').notNullable().defaultTo(knex.fn.now());
    t.timestamp('PrintedAt').nullable();
    t.timestamp('LastAttemptAt').nullable();
    t.timestamp('NextAttemptAt').nullable();  // for RETRYING state with backoff
    t.integer('UserId').nullable();        // who queued the job
    t.integer('Version').notNullable().defaultTo(1);  // optimistic locking

    // Indexes for queue processing
    t.index(['Status', 'NextAttemptAt'], 'idx_print_jobs_status_next');
    t.index(['IdempotencyKey'], 'idx_print_jobs_idem');
    t.index(['TicketId'], 'idx_print_jobs_ticket');
    t.index(['PrinterId'], 'idx_print_jobs_printer');
    t.index(['Uuid'], 'idx_print_jobs_uuid');
  });

  // === PrintRoutingRules ===
  // Maps menu items / group codes / tags → PrintArea, so the PrintRouter
  // can decide which printer(s) to send a given order to.
  await knex.schema.createTable('PrintRoutingRules', (t) => {
    t.increments('Id').primary();
    t.text('RuleType').notNullable();  // 'GROUP_CODE' | 'MENU_ITEM' | 'TAG' | 'DEFAULT'
    t.text('MatchValue').nullable();    // the group code, menu item name, or tag value
    t.integer('MenuItemId').nullable(); // direct FK when RuleType='MENU_ITEM'
    t.integer('PrintAreaId').notNullable(); // FK to PrintAreas
    t.integer('PrinterId').nullable();  // specific printer (override PrintArea default)
    t.integer('Priority').notNullable().defaultTo(0); // higher = checked first
    t.boolean('IsActive').notNullable().defaultTo(true);
    t.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());

    t.foreign('PrintAreaId').references('PrintAreas.Id').onDelete('CASCADE');
    t.foreign('PrinterId').references('Printers.Id').onDelete('SET NULL');
    t.index(['RuleType', 'MatchValue'], 'idx_routing_rule_match');
    t.index(['Priority'], 'idx_routing_rule_priority');
  });

  // === Add FallbackPrinterId FK to Printers (already exists in PrintJobInstances) ===
  // Note: Printers table already exists with its own schema. We just
  // add a few columns for SambaPos_LBA-specific features.

  // Add columns to Printers (if they don't already exist)
  const printerCols = await knex.raw('PRAGMA table_info(Printers)');
  const printerColNames = printerCols.map(c => c.name);
  if (!printerColNames.includes('PrintAreaId')) {
    await knex.schema.table('Printers', (t) => {
      t.integer('PrintAreaId').nullable();
      t.boolean('IsActive').notNullable().defaultTo(true);
      t.integer('SortOrder').notNullable().defaultTo(0);
    });
  }

  // === Seed default print areas ===
  const now = knex.fn.now();
  await knex('PrintAreas').insert([
    { Name: 'kitchen',  DisplayName: 'Cocina',   AreaType: 'KITCHEN', Color: '#2196F3', SortOrder: 1 },
    { Name: 'bar',      DisplayName: 'Barra',    AreaType: 'BAR',     Color: '#9C27B0', SortOrder: 2 },
    { Name: 'cafe',     DisplayName: 'Café',     AreaType: 'CAFE',    Color: '#795548', SortOrder: 3 },
    { Name: 'pizza',    DisplayName: 'Pizzería', AreaType: 'PIZZA',   Color: '#FF9800', SortOrder: 4 },
    { Name: 'cashier',  DisplayName: 'Caja',     AreaType: 'CASHIER', Color: '#4CAF50', SortOrder: 5 },
    { Name: 'report',   DisplayName: 'Reportes', AreaType: 'REPORT',  Color: '#607D8B', SortOrder: 99 },
  ]);

  // === Seed default routing rule: DEFAULT → cashier area ===
  const cashierArea = await knex('PrintAreas').where({ Name: 'cashier' }).first();
  if (cashierArea) {
    await knex('PrintRoutingRules').insert({
      RuleType: 'DEFAULT',
      MatchValue: null,
      PrintAreaId: cashierArea.Id,
      Priority: 0,
      IsActive: true,
    });
  }
};

exports.down = async function (knex) {
  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('PrintRoutingRules');
  await knex.schema.dropTableIfExists('PrintJobInstances');
  await knex.schema.dropTableIfExists('PrintAreas');

  // Remove columns added to Printers
  try {
    await knex.schema.table('Printers', (t) => {
      t.dropColumn('PrintAreaId');
      t.dropColumn('IsActive');
      t.dropColumn('SortOrder');
    });
  } catch (e) {
    // OK if columns don't exist
  }
};
