// =====================================================================
// Migration: 20260909000001_extend_printer_templates.js
// =====================================================================
// BLOQUE F — Fase 6: Printer Gateway (P2 — template editor)
//
// The original PrinterTemplates table (from 20240904000001_create_schema.js)
// only has: Name, Template, MergeLines. We extend it with:
//   - TemplateType — RECEIPT | KITCHEN_ORDER | TEST | CUSTOM
//   - Description — human-readable
//   - IsActive — soft delete
//   - CreatedAt / UpdatedAt — audit
//   - PrinterId — optional link (template for a specific printer)
//
// We also seed 2 default templates (Receipt + Kitchen Order) so the
// admin UI has something to show on first load.
// =====================================================================

exports.up = async function (knex) {
  // Add columns (additive — SQLite supports ADD COLUMN)
  const cols = await knex.raw('PRAGMA table_info(PrinterTemplates)');
  const colNames = cols.map(c => c.name);

  if (!colNames.includes('TemplateType')) {
    await knex.schema.table('PrinterTemplates', (t) => {
      t.text('TemplateType').notNullable().defaultTo('RECEIPT');
    });
  }
  if (!colNames.includes('Description')) {
    await knex.schema.table('PrinterTemplates', (t) => {
      t.text('Description');
    });
  }
  if (!colNames.includes('IsActive')) {
    await knex.schema.table('PrinterTemplates', (t) => {
      t.boolean('IsActive').notNullable().defaultTo(true);
    });
  }
  if (!colNames.includes('CreatedAt')) {
    await knex.schema.table('PrinterTemplates', (t) => {
      t.timestamp('CreatedAt').nullable();
    });
    // Backfill existing rows with current timestamp
    await knex('PrinterTemplates').whereNull('CreatedAt').update({ CreatedAt: new Date().toISOString() });
  }
  if (!colNames.includes('UpdatedAt')) {
    await knex.schema.table('PrinterTemplates', (t) => {
      t.timestamp('UpdatedAt').nullable();
    });
    await knex('PrinterTemplates').whereNull('UpdatedAt').update({ UpdatedAt: new Date().toISOString() });
  }
  if (!colNames.includes('PrinterId')) {
    await knex.schema.table('PrinterTemplates', (t) => {
      t.integer('PrinterId').nullable();
    });
  }

  // Index for TemplateType lookup
  try {
    await knex.schema.alterTable('PrinterTemplates', (t) => {
      t.index(['TemplateType'], 'IX_PrinterTemplates_Type');
    });
  } catch (e) {
    // Index may already exist
  }

  // Seed default templates IF the table is empty
  const existing = await knex('PrinterTemplates').count('* as c').first();
  if (Number(existing.c) === 0) {
    await knex('PrinterTemplates').insert([
      {
        Name: 'Receipt (default)',
        TemplateType: 'RECEIPT',
        Description: 'Plantilla de recibo para cliente — incluye ticket, órdenes, pagos y totales.',
        Template: '{header}\n{ticket_number}\n{date}\n{separator}\n{orders}\n{separator}\n{totals}\n{footer}',
        MergeLines: 0,
        IsActive: 1,
      },
      {
        Name: 'Kitchen Order (default)',
        TemplateType: 'KITCHEN_ORDER',
        Description: 'Plantilla de comanda de cocina — incluye mesa, items y notas.',
        Template: '{header}\nKITCHEN ORDER\n{ticket_number}\n{table}\n{time}\n{separator}\n{items}\n{separator}\n{state}',
        MergeLines: 0,
        IsActive: 1,
      },
      {
        Name: 'Test Print (default)',
        TemplateType: 'TEST',
        Description: 'Plantilla de prueba de impresora — verifica conectividad y formato.',
        Template: 'TEST PRINT\n{printer_name}\n{time}\n{chars_per_line}',
        MergeLines: 0,
        IsActive: 1,
      },
    ]);
    console.log('[migration] Bloque F: seeded 3 default printer templates');
  } else {
    console.log('[migration] Bloque F: PrinterTemplates already has data, skipping seed');
  }
};

exports.down = async function (knex) {
  // We cannot easily drop columns in SQLite, so we just leave them.
  // The columns are nullable / have defaults, so they won't break anything.
  console.log('[migration] Bloque F: rollback not supported (additive columns remain)');
};
