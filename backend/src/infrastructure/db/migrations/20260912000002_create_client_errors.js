// =====================================================================
// Migration 20260912000002_create_client_errors.js
// =====================================================================
// Bloque 7 — Client-side error log table
// Stores errors captured by frontend error-reporter.js
// =====================================================================

async function up(knex) {
  const isSQLite = knex.client.config.client === 'sqlite3';
  const hasTable = await knex.schema.hasTable('ClientErrors');
  if (hasTable) return;

  await knex.schema.createTable('ClientErrors', (t) => {
    t.increments('Id').primary();
    t.string('EventId', 60).notNullable();          // err-<ts>-<rand>
    t.timestamp('EventTimestamp').notNullable();      // when it happened (client)
    t.timestamp('ServerTimestamp').notNullable();     // when received (server)
    t.string('Type', 40).notNullable();                // uncaught | unhandledrejection | console.error | manual
    t.text('Message');
    t.text('Stack');
    t.text('Url');
    t.integer('Line');
    t.integer('Col');
    t.integer('UserId');
    t.string('View', 50);
    t.string('Session', 60);
    t.string('Platform', 20);                          // android | ios | web
    t.string('FormFactor', 20);                       // phone | tablet | desktop
    t.string('Orientation', 20);                      // portrait | landscape
    t.text('UserAgent');
    t.text('Href');
  });

  // Indexes
  if (isSQLite) {
    await knex.raw('CREATE INDEX IX_ClientErrors_Timestamp ON "ClientErrors" ("EventTimestamp")');
    await knex.raw('CREATE INDEX IX_ClientErrors_UserId ON "ClientErrors" ("UserId")');
    await knex.raw('CREATE INDEX IX_ClientErrors_Type ON "ClientErrors" ("Type")');
  } else {
    await knex.raw('CREATE INDEX "IX_ClientErrors_Timestamp" ON "ClientErrors" ("EventTimestamp")');
    await knex.raw('CREATE INDEX "IX_ClientErrors_UserId" ON "ClientErrors" ("UserId")');
    await knex.raw('CREATE INDEX "IX_ClientErrors_Type" ON "ClientErrors" ("Type")');
  }
}

async function down(knex) {
  await knex.schema.dropTableIfExists('ClientErrors');
}

module.exports = { up, down };
