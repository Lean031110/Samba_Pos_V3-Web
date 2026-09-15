// =====================================================================
// Migration 20240905000001_add_optimistic_locking.js
// =====================================================================
// Adds a Version column to Tickets for optimistic concurrency control.
// Per FASE 7: multi-terminal safety requires version checks.
//
// How it works:
//   1. Every saveTicket reads the current Version from the DB
//   2. The UPDATE includes WHERE Version = $expected
//   3. If 0 rows affected → another terminal modified the ticket → 409 Conflict
//   4. On successful update, Version is incremented
// =====================================================================

exports.up = async function(knex) {
  // Add Version column to Tickets (defaults to 1 for existing rows)
  await knex.schema.alterTable('Tickets', (table) => {
    table.integer('Version').notNullable().defaultTo(1);
  });

  // Add index for IsClosed (frequently queried: "list open tickets")
  await knex.schema.alterTable('Tickets', (table) => {
    table.index(['IsClosed'], 'IX_Tickets_IsClosed');
  });

  // Add index on Users.Name (every login queries by name)
  await knex.schema.alterTable('Users', (table) => {
    table.index(['Name'], 'IX_Users_Name');
  });

  // Add AuditLogs table (FASE 18)
  await knex.schema.createTable('AuditLogs', (table) => {
    table.increments('Id').primary();
    table.timestamp('Timestamp').notNullable().defaultTo(knex.fn.now());
    table.integer('UserId').notNullable();
    table.string('Username', 128);
    table.string('Action', 100).notNullable();     // e.g. 'ticket.close', 'payment.process'
    table.string('EntityType', 50);                 // e.g. 'Ticket', 'Payment'
    table.integer('EntityId');
    table.text('Before');                           // JSON snapshot of entity before
    table.text('After');                            // JSON snapshot of entity after
    table.string('TerminalId', 64);                 // which terminal made the change
    table.string('IpAddress', 45);                  // IPv4 or IPv6
    table.text('Details');                          // additional context (JSON)
  });

  await knex.schema.alterTable('AuditLogs', (table) => {
    table.index(['UserId'], 'IX_AuditLogs_UserId');
    table.index(['Action'], 'IX_AuditLogs_Action');
    table.index(['EntityType', 'EntityId'], 'IX_AuditLogs_Entity');
    table.index(['Timestamp'], 'IX_AuditLogs_Timestamp');
  });

  // Add IdempotencyKeys table (FASE 4 — payment dedup)
  await knex.schema.createTable('IdempotencyKeys', (table) => {
    table.increments('Id').primary();
    table.string('Key', 128).notNullable().unique();
    table.integer('UserId').notNullable();
    table.string('Endpoint', 200).notNullable();    // e.g. 'POST /api/tickets/1/payments'
    table.text('RequestBody');                      // JSON of the original request
    table.integer('ResponseStatus');
    table.text('ResponseBody');                     // JSON of the response sent
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ExpiresAt').notNullable();     // when this key can be purged
  });

  await knex.schema.alterTable('IdempotencyKeys', (table) => {
    table.index(['Key'], 'IX_IdempotencyKeys_Key');
    table.index(['ExpiresAt'], 'IX_IdempotencyKeys_ExpiresAt');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('IdempotencyKeys');
  await knex.schema.dropTableIfExists('AuditLogs');
  await knex.schema.alterTable('Tickets', (table) => {
    table.dropColumn('Version');
  });
  await knex.schema.alterTable('Tickets', (table) => {
    table.dropIndex(['IsClosed'], 'IX_Tickets_IsClosed');
  });
  await knex.schema.alterTable('Users', (table) => {
    table.dropIndex(['Name'], 'IX_Users_Name');
  });
};
