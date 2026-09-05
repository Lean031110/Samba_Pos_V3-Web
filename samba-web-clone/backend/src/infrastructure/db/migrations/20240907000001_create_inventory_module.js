// =====================================================================
// Migration 20240907000001_create_inventory_module.js
// =====================================================================
// Creates inventory tables for real stock management:
//   - Suppliers
//   - IngredientUnits (unit, ml, gr, kg, etc.)
//   - UnitConversions (1 kg = 1000 gr)
//   - Ingredients (bread, beef, cheese, etc.)
//   - Recipes (MenuItem → Ingredient list)
//   - RecipeItems (recipe lines with quantity + unit)
//   - StockBalances (current stock per warehouse per ingredient)
//   - StockMovements (ledger: PURCHASE, SALE, WASTE, ADJUSTMENT, TRANSFER)
// =====================================================================

exports.up = async function(knex) {
  // Drop the old Recipes table from the original SambaPOS migration
  // (it was empty and had a different schema — we replace it with our own)
  await knex.schema.dropTableIfExists('RecipeItems');
  await knex.schema.dropTableIfExists('Recipes');

  // Suppliers
  await knex.schema.createTable('Suppliers', (table) => {
    table.increments('Id').primary();
    table.string('Name', 200).notNullable();
    table.string('Code', 20).unique();
    table.string('Phone', 50);
    table.string('Email', 100);
    table.string('Address');
    table.boolean('IsActive').notNullable().defaultTo(1);
    table.timestamps(true, true);
  });

  // Ingredient Units
  await knex.schema.createTable('IngredientUnits', (table) => {
    table.increments('Id').primary();
    table.string('Code', 20).notNullable().unique();  // 'unit', 'ml', 'gr', 'kg', 'l'
    table.string('Name', 50).notNullable();            // 'Unit', 'Milliliter', 'Gram', etc.
    table.string('Type', 20).notNullable();            // 'count', 'weight', 'volume'
    table.integer('SortOrder').notNullable().defaultTo(0);
  });

  // Unit Conversions (e.g., 1 kg = 1000 gr)
  await knex.schema.createTable('UnitConversions', (table) => {
    table.increments('Id').primary();
    table.integer('FromUnitId').notNullable();
    table.integer('ToUnitId').notNullable();
    table.decimal('Factor', 16, 6).notNullable();  // multiply by this to convert
    table.foreign('FromUnitId').references('IngredientUnits.Id');
    table.foreign('ToUnitId').references('IngredientUnits.Id');
    table.unique(['FromUnitId', 'ToUnitId']);
  });

  // Ingredients (raw materials: bread, beef, cheese, etc.)
  await knex.schema.createTable('Ingredients', (table) => {
    table.increments('Id').primary();
    table.string('Name', 200).notNullable();
    table.string('Code', 20).unique();
    table.string('GroupCode', 50);                    // 'Bakery', 'Meat', 'Dairy', etc.
    table.integer('BaseUnitId').notNullable();        // default unit for this ingredient
    table.decimal('MinimumStock', 16, 3).notNullable().defaultTo(0);
    table.decimal('CostPerUnit', 16, 2).notNullable().defaultTo(0);
    table.boolean('IsActive').notNullable().defaultTo(1);
    table.foreign('BaseUnitId').references('IngredientUnits.Id');
    table.timestamps(true, true);
  });

  // Recipes (links a MenuItem portion to a list of ingredients)
  await knex.schema.createTable('Recipes', (table) => {
    table.increments('Id').primary();
    table.integer('MenuItemPortionId').notNullable();
    table.decimal('FixedCost', 16, 2).notNullable().defaultTo(0);
    table.boolean('IsActive').notNullable().defaultTo(1);
    table.foreign('MenuItemPortionId').references('MenuItemPortions.Id');
    table.timestamps(true, true);
  });

  // Recipe Items (individual ingredient lines in a recipe)
  await knex.schema.createTable('RecipeItems', (table) => {
    table.increments('Id').primary();
    table.integer('RecipeId').notNullable();
    table.integer('IngredientId').notNullable();
    table.decimal('Quantity', 16, 4).notNullable();
    table.integer('UnitId').notNullable();
    table.foreign('RecipeId').references('Recipes.Id').onDelete('CASCADE');
    table.foreign('IngredientId').references('Ingredients.Id');
    table.foreign('UnitId').references('IngredientUnits.Id');
  });

  // Stock Balances (current stock per ingredient per warehouse)
  await knex.schema.createTable('StockBalances', (table) => {
    table.increments('Id').primary();
    table.integer('IngredientId').notNullable();
    table.integer('WarehouseId').notNullable();
    table.decimal('Quantity', 16, 4).notNullable().defaultTo(0);
    table.integer('UnitId').notNullable();
    table.decimal('AverageCost', 16, 2).notNullable().defaultTo(0);
    table.timestamp('LastUpdated');
    table.foreign('IngredientId').references('Ingredients.Id');
    table.foreign('WarehouseId').references('Warehouses.Id');
    table.foreign('UnitId').references('IngredientUnits.Id');
    table.unique(['IngredientId', 'WarehouseId'], 'UX_StockBalances_Ingredient_Warehouse');
  });

  // Stock Movements (append-only ledger — stock can be reconstructed from this)
  await knex.schema.createTable('StockMovements', (table) => {
    table.increments('Id').primary();
    table.integer('IngredientId').notNullable();
    table.integer('WarehouseId').notNullable();
    table.integer('UnitId').notNullable();
    table.string('MovementType', 20).notNullable();
    // PURCHASE, SALE, WASTE, ADJUSTMENT, TRANSFER_OUT, TRANSFER_IN, RETURN, REVERSAL
    table.decimal('Quantity', 16, 4).notNullable();  // positive = in, negative = out
    table.decimal('UnitCost', 16, 2).notNullable().defaultTo(0);
    table.decimal('TotalCost', 16, 2).notNullable().defaultTo(0);
    table.integer('TicketId');           // for SALE movements
    table.integer('OrderId');            // for SALE movements
    table.integer('SupplierId');         // for PURCHASE movements
    table.string('Reference');           // document number, note, etc.
    table.string('Notes');
    table.integer('UserId').notNullable().defaultTo(0);
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.foreign('IngredientId').references('Ingredients.Id');
    table.foreign('WarehouseId').references('Warehouses.Id');
    table.foreign('UnitId').references('IngredientUnits.Id');
  });

  // Indexes
  await knex.schema.alterTable('StockMovements', (table) => {
    table.index(['IngredientId'], 'IX_StockMovements_IngredientId');
    table.index(['WarehouseId'], 'IX_StockMovements_WarehouseId');
    table.index(['MovementType'], 'IX_StockMovements_Type');
    table.index(['TicketId'], 'IX_StockMovements_TicketId');
    table.index(['CreatedAt'], 'IX_StockMovements_CreatedAt');
  });
  await knex.schema.alterTable('RecipeItems', (table) => {
    table.index(['RecipeId'], 'IX_RecipeItems_RecipeId');
    table.index(['IngredientId'], 'IX_RecipeItems_IngredientId');
  });

  // Seed default units
  await knex('IngredientUnits').insert([
    { Code: 'unit', Name: 'Unit', Type: 'count', SortOrder: 10 },
    { Code: 'gr', Name: 'Gram', Type: 'weight', SortOrder: 20 },
    { Code: 'kg', Name: 'Kilogram', Type: 'weight', SortOrder: 30 },
    { Code: 'ml', Name: 'Milliliter', Type: 'volume', SortOrder: 40 },
    { Code: 'l', Name: 'Liter', Type: 'volume', SortOrder: 50 },
    { Code: 'slice', Name: 'Slice', Type: 'count', SortOrder: 60 },
    { Code: 'piece', Name: 'Piece', Type: 'count', SortOrder: 70 },
  ]);

  // Seed unit conversions
  const kgUnit = await knex('IngredientUnits').where({ Code: 'kg' }).first();
  const grUnit = await knex('IngredientUnits').where({ Code: 'gr' }).first();
  const lUnit = await knex('IngredientUnits').where({ Code: 'l' }).first();
  const mlUnit = await knex('IngredientUnits').where({ Code: 'ml' }).first();

  if (kgUnit && grUnit) {
    await knex('UnitConversions').insert([
      { FromUnitId: kgUnit.Id, ToUnitId: grUnit.Id, Factor: 1000 },
      { FromUnitId: grUnit.Id, ToUnitId: kgUnit.Id, Factor: 0.001 },
    ]);
  }
  if (lUnit && mlUnit) {
    await knex('UnitConversions').insert([
      { FromUnitId: lUnit.Id, ToUnitId: mlUnit.Id, Factor: 1000 },
      { FromUnitId: mlUnit.Id, ToUnitId: lUnit.Id, Factor: 0.001 },
    ]);
  }

  // Seed sample ingredients
  const unitUnit = await knex('IngredientUnits').where({ Code: 'unit' }).first();
  const sliceUnit = await knex('IngredientUnits').where({ Code: 'slice' }).first();
  const mlUnit2 = await knex('IngredientUnits').where({ Code: 'ml' }).first();

  if (unitUnit) {
    await knex('Ingredients').insert([
      { Name: 'Bread Bun', Code: 'BREAD', GroupCode: 'Bakery', BaseUnitId: unitUnit.Id, MinimumStock: 10, CostPerUnit: 0.30 },
      { Name: 'Beef Patty', Code: 'BEEF', GroupCode: 'Meat', BaseUnitId: unitUnit.Id, MinimumStock: 20, CostPerUnit: 0.80 },
    ]);
  }
  if (sliceUnit) {
    await knex('Ingredients').insert([
      { Name: 'Cheese Slice', Code: 'CHEESE', GroupCode: 'Dairy', BaseUnitId: sliceUnit.Id, MinimumStock: 15, CostPerUnit: 0.15 },
      { Name: 'Bacon Strip', Code: 'BACON', GroupCode: 'Meat', BaseUnitId: sliceUnit.Id, MinimumStock: 20, CostPerUnit: 0.20 },
    ]);
  }
  if (mlUnit2) {
    await knex('Ingredients').insert([
      { Name: 'Burger Sauce', Code: 'SAUCE', GroupCode: 'Condiments', BaseUnitId: mlUnit2.Id, MinimumStock: 500, CostPerUnit: 0.005 },
    ]);
  }

  // Note: StockBalances are seeded in seeds/seed.js (after the warehouse is created)
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('StockMovements');
  await knex.schema.dropTableIfExists('StockBalances');
  await knex.schema.dropTableIfExists('RecipeItems');
  await knex.schema.dropTableIfExists('Recipes');
  await knex.schema.dropTableIfExists('Ingredients');
  await knex.schema.dropTableIfExists('UnitConversions');
  await knex.schema.dropTableIfExists('IngredientUnits');
  await knex.schema.dropTableIfExists('Suppliers');
};
