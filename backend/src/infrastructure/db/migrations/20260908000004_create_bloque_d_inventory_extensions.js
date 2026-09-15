// =====================================================================
// Migration: 20260908000004_create_bloque_d_inventory_extensions.js
// =====================================================================
// BLOQUE D — Fase 4: Inventario + Recetas
//
// The existing schema already has:
//   - PeriodicConsumptions (Name, WorkPeriodId, StartDate, EndDate, LastUpdateTime)
//   - WarehouseConsumptions (PeriodicConsumptionId, WarehouseId)
//   - PeriodicConsumptionItems (PhysicalInventory, InStock, Added, Removed, Consumption, Cost)
//   - WarehouseConsumptions → PeriodicConsumptionItems
//
// We ADD:
//   1. RecipeVersions — historial versionado de recetas (auditable)
//      - Recipes.ActiveVersionId → RecipeVersions.Id (nullable, backward compat)
//      - RecipeItems.VersionId → RecipeVersions.Id (nullable, backward compat)
//   2. Combos — combo definition (links a MenuItem "container" with sub-items)
//   3. ComboItems — sub-items inside a combo (with optional override price)
//   4. WarehouseTransfers — traspasos entre almacenes (cabecera)
//   5. WarehouseTransferItems — líneas del traspaso
//   6. PhysicalCountSessions — wrapper around PeriodicConsumptions for our UX
//      (gives us a clear "physical count" workflow with Status + WarehouseId
//       direct lookup, decoupled from WorkPeriod lifecycle)
//
// New permissions already added by 20260908000003:
//   - inventory.transfer
//   - inventory.adjust
//
// Design notes:
//   - RecipeItems.VersionId is nullable so pre-existing recipes (no version)
//     continue working. The service treats null as "v1 — the live RecipeItems".
//   - We use ALTER TABLE (additive) — SQLite supports ADD COLUMN.
//   - We do NOT modify PeriodicConsumptions / WarehouseConsumptions because
//     the original SambaPOS V3 schema is already correct and rich enough
//     for our physical-count workflow. We just add PhysicalCountSessions
//     as a thin wrapper for our admin UI (since PeriodicConsumptions is
//     tied to WorkPeriod in V3, which we don't always want).
// =====================================================================

exports.up = async function (knex) {
  // ---------------------------------------------------------------
  // 1. RecipeVersions — versionado de recetas
  // ---------------------------------------------------------------
  await knex.schema.createTable('RecipeVersions', (table) => {
    table.increments('Id').primary();
    table.integer('RecipeId').notNullable();
    table.integer('VersionNumber').notNullable();          // 1, 2, 3…
    table.string('Label', 100);                              // 'v2 — sin cebolla'
    table.text('Snapshot');                                  // JSON snapshot of items at this version
    table.integer('CreatedBy').notNullable().defaultTo(0);  // UserId
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.foreign('RecipeId').references('Recipes.Id').onDelete('CASCADE');
    table.unique(['RecipeId', 'VersionNumber'], 'UX_RecipeVersions_Recipe_Version');
  });

  // Add ActiveVersionId column to Recipes (nullable for backward compat)
  await knex.schema.alterTable('Recipes', (table) => {
    table.integer('ActiveVersionId').nullable();
  });

  // Add VersionId column to RecipeItems (nullable for backward compat)
  await knex.schema.alterTable('RecipeItems', (table) => {
    table.integer('VersionId').nullable();
  });

  // ---------------------------------------------------------------
  // 2. Combos — cabecera de combos
  // ---------------------------------------------------------------
  // A combo is a MenuItem with GroupCode='COMBO' as the combo product itself.
  // This table links the container MenuItem to its sub-MenuItems.
  await knex.schema.createTable('Combos', (table) => {
    table.increments('Id').primary();
    table.integer('MenuItemId').notNullable();               // the combo product (container)
    table.string('Name', 200).notNullable();
    table.decimal('ComboPrice', 16, 2).notNullable().defaultTo(0);  // explicit combo price
    table.boolean('UseCustomPrice').notNullable().defaultTo(false);      // 1 = use ComboPrice, 0 = sum sub-items
    table.boolean('IsActive').notNullable().defaultTo(1);
    table.integer('CreatedBy').notNullable().defaultTo(0);
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.foreign('MenuItemId').references('MenuItems.Id').onDelete('CASCADE');
  });

  // ---------------------------------------------------------------
  // 3. ComboItems — sub-items de un combo
  // ---------------------------------------------------------------
  await knex.schema.createTable('ComboItems', (table) => {
    table.increments('Id').primary();
    table.integer('ComboId').notNullable();
    table.integer('MenuItemId').notNullable();               // the sub-product
    table.integer('MenuItemPortionId').nullable();           // optional portion selection
    table.decimal('Quantity', 16, 4).notNullable().defaultTo(1);
    table.decimal('OverridePrice', 16, 2).notNullable().defaultTo(0);  // 0 = use menu price, >0 = override
    table.boolean('IsOptional').notNullable().defaultTo(false);             // 1 = user can opt-out
    table.integer('SortOrder').notNullable().defaultTo(0);
    table.foreign('ComboId').references('Combos.Id').onDelete('CASCADE');
    table.foreign('MenuItemId').references('MenuItems.Id');
    table.foreign('MenuItemPortionId').references('MenuItemPortions.Id');
  });

  // ---------------------------------------------------------------
  // 4. WarehouseTransfers — traspasos entre almacenes (cabecera)
  // ---------------------------------------------------------------
  await knex.schema.createTable('WarehouseTransfers', (table) => {
    table.increments('Id').primary();
    table.string('TransferNumber', 50).unique();             // WT-2026-0001
    table.integer('FromWarehouseId').notNullable();
    table.integer('ToWarehouseId').notNullable();
    table.string('Status', 20).notNullable().defaultTo('PENDING');  // PENDING | COMPLETED | CANCELLED
    table.string('Notes');
    table.integer('CreatedBy').notNullable().defaultTo(0);
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('CompletedAt');
    table.foreign('FromWarehouseId').references('Warehouses.Id');
    table.foreign('ToWarehouseId').references('Warehouses.Id');
  });

  // ---------------------------------------------------------------
  // 5. WarehouseTransferItems — líneas del traspaso
  // ---------------------------------------------------------------
  await knex.schema.createTable('WarehouseTransferItems', (table) => {
    table.increments('Id').primary();
    table.integer('TransferId').notNullable();
    table.integer('IngredientId').notNullable();
    table.integer('UnitId').notNullable();
    table.decimal('Quantity', 16, 4).notNullable();
    table.decimal('UnitCost', 16, 2).notNullable().defaultTo(0);
    table.foreign('TransferId').references('WarehouseTransfers.Id').onDelete('CASCADE');
    table.foreign('IngredientId').references('Ingredients.Id');
    table.foreign('UnitId').references('IngredientUnits.Id');
  });

  // ---------------------------------------------------------------
  // 6. PhysicalCountSessions — our UX wrapper for inventory physical counts
  // ---------------------------------------------------------------
  // The original PeriodicConsumptions table is tied to WorkPeriod in V3.
  // We add this thin table to model a clean "physical count" workflow
  // independent of WorkPeriod, with explicit WarehouseId + Status + CreatedBy.
  await knex.schema.createTable('PhysicalCountSessions', (table) => {
    table.increments('Id').primary();
    table.string('Name', 200).notNullable();                // 'Conteo Septiembre 2026'
    table.integer('WarehouseId').notNullable();
    table.date('StartDate').notNullable();
    table.date('EndDate').nullable();                       // null until finalized
    table.string('Status', 20).notNullable().defaultTo('OPEN');  // OPEN | FINALIZED | CANCELLED
    table.integer('CreatedBy').notNullable().defaultTo(0);
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('FinalizedAt');
    table.foreign('WarehouseId').references('Warehouses.Id');
  });

  // ---------------------------------------------------------------
  // 7. PhysicalCountItems — líneas del conteo físico
  // ---------------------------------------------------------------
  await knex.schema.createTable('PhysicalCountItems', (table) => {
    table.increments('Id').primary();
    table.integer('SessionId').notNullable();
    table.integer('IngredientId').notNullable();
    table.integer('UnitId').notNullable();
    table.decimal('ExpectedQuantity', 16, 4).notNullable().defaultTo(0);   // computed from movements
    table.decimal('CountedQuantity', 16, 4).notNullable().defaultTo(0);    // entered by user
    table.decimal('Difference', 16, 4).notNullable().defaultTo(0);          // counted - expected (auto)
    table.decimal('UnitCost', 16, 2).notNullable().defaultTo(0);
    table.boolean('Adjusted').notNullable().defaultTo(false);                   // 1 = adjustment was applied
    table.string('Notes');
    table.foreign('SessionId').references('PhysicalCountSessions.Id').onDelete('CASCADE');
    table.foreign('IngredientId').references('Ingredients.Id');
    table.foreign('UnitId').references('IngredientUnits.Id');
    table.unique(['SessionId', 'IngredientId'], 'UX_PhysicalCountItems_Session_Ingredient');
  });

  // Indexes
  await knex.schema.alterTable('RecipeVersions', (table) => {
    table.index(['RecipeId'], 'IX_RecipeVersions_RecipeId');
  });
  await knex.schema.alterTable('Combos', (table) => {
    table.index(['MenuItemId'], 'IX_Combos_MenuItemId');
  });
  await knex.schema.alterTable('ComboItems', (table) => {
    table.index(['ComboId'], 'IX_ComboItems_ComboId');
  });
  await knex.schema.alterTable('WarehouseTransfers', (table) => {
    table.index(['FromWarehouseId'], 'IX_WarehouseTransfers_From');
    table.index(['ToWarehouseId'], 'IX_WarehouseTransfers_To');
    table.index(['Status'], 'IX_WarehouseTransfers_Status');
  });
  await knex.schema.alterTable('WarehouseTransferItems', (table) => {
    table.index(['TransferId'], 'IX_WarehouseTransferItems_TransferId');
  });
  await knex.schema.alterTable('PhysicalCountSessions', (table) => {
    table.index(['WarehouseId'], 'IX_PhysicalCountSessions_WarehouseId');
    table.index(['Status'], 'IX_PhysicalCountSessions_Status');
  });

  console.log('[migration] Bloque D schema created: RecipeVersions, Combos, ComboItems, WarehouseTransfers(+Items), PhysicalCountSessions(+Items)');
};

exports.down = async function (knex) {
  // Drop in reverse FK order
  await knex.schema.dropTableIfExists('PhysicalCountItems');
  await knex.schema.dropTableIfExists('PhysicalCountSessions');
  await knex.schema.dropTableIfExists('WarehouseTransferItems');
  await knex.schema.dropTableIfExists('WarehouseTransfers');
  await knex.schema.dropTableIfExists('ComboItems');
  await knex.schema.dropTableIfExists('Combos');

  // Remove VersionId column from RecipeItems
  await knex.schema.alterTable('RecipeItems', (table) => {
    table.dropColumn('VersionId');
  });
  // Remove ActiveVersionId column from Recipes
  await knex.schema.alterTable('Recipes', (table) => {
    table.dropColumn('ActiveVersionId');
  });

  await knex.schema.dropTableIfExists('RecipeVersions');
};
