// =====================================================================
// Migration 20260907000002_add_ticket_state_flags.js
// =====================================================================
// FASE 2 — adds explicit state flags to Tickets that the
// TicketStateMachine needs to derive current state.
//
//   - IsVoided   (0/1) — ticket was voided (cancellation)
//   - IsRefunded (0/1) — ticket was fully refunded
//   - VoidReason (text) — why it was voided/refunded
//   - VoidedAt   (timestamp)
//   - VoidedBy   (UserId)
//
// Existing tickets get IsVoided=0, IsRefunded=0 (default).
// =====================================================================

exports.up = async function(knex) {
  await knex.schema.alterTable('Tickets', (table) => {
    table.integer('IsVoided').notNullable().defaultTo(0);
    table.integer('IsRefunded').notNullable().defaultTo(0);
    table.text('VoidReason').nullable();
    table.timestamp('VoidedAt').nullable();
    table.integer('VoidedBy').nullable();
  });
  await knex.schema.alterTable('Tickets', (table) => {
    table.index(['IsVoided'], 'IX_Tickets_IsVoided');
    table.index(['IsRefunded'], 'IX_Tickets_IsRefunded');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('Tickets', (table) => {
    table.dropIndex(['IsVoided'], 'IX_Tickets_IsVoided');
    table.dropIndex(['IsRefunded'], 'IX_Tickets_IsRefunded');
    table.dropColumn('IsVoided');
    table.dropColumn('IsRefunded');
    table.dropColumn('VoidReason');
    table.dropColumn('VoidedAt');
    table.dropColumn('VoidedBy');
  });
};
