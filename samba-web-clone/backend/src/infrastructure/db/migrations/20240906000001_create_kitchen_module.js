// =====================================================================
// Migration 20240906000001_create_kitchen_module.js
// =====================================================================
// Creates Kitchen Display System (KDS) tables with:
//   - Code/IsDefault on stations (stable identifiers, not human names)
//   - Version column on KitchenOrders (optimistic locking)
//   - UNIQUE(OrderId, KitchenStationId) constraint (idempotent routing)
// =====================================================================

exports.up = async function(knex) {
  // Kitchen Stations
  await knex.schema.createTable('KitchenStations', (table) => {
    table.increments('Id').primary();
    table.string('Code', 20).notNullable().unique();   // KITCHEN, PIZZA, DRINKS, EXPO
    table.string('Name', 100).notNullable();
    table.string('DisplayName', 100).notNullable();
    table.integer('SortOrder').notNullable().defaultTo(0);
    table.string('Color', 20);
    table.integer('PrinterId');
    table.boolean('IsActive').notNullable().defaultTo(1);
    table.boolean('IsDefault').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });

  // Kitchen Orders — one per ticket order that needs kitchen preparation
  await knex.schema.createTable('KitchenOrders', (table) => {
    table.increments('Id').primary();
    table.integer('TicketId').notNullable();
    table.integer('OrderId').notNullable();
    table.integer('KitchenStationId');
    table.string('State', 20).notNullable().defaultTo('NEW');
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('AcceptedAt');
    table.timestamp('ReadyAt');
    table.timestamp('ServedAt');
    table.integer('Priority').notNullable().defaultTo(0);
    table.string('TicketNumber', 50);
    table.string('TableName', 50);
    table.integer('OrderNumber').notNullable().defaultTo(0);
    table.string('Notes');
    table.integer('CreatedByUserId').notNullable().defaultTo(0);
    table.integer('Version').notNullable().defaultTo(1);  // Optimistic locking
    table.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
    table.foreign('KitchenStationId').references('KitchenStations.Id');
    // Idempotency: one kitchen order per (OrderId, StationId) — prevents duplicates
    table.unique(['OrderId', 'KitchenStationId'], 'UX_KitchenOrders_OrderId_StationId');
  });

  // Kitchen Order Items
  await knex.schema.createTable('KitchenOrderItems', (table) => {
    table.increments('Id').primary();
    table.integer('KitchenOrderId').notNullable();
    table.string('MenuItemName').notNullable();
    table.decimal('Quantity', 16, 3).notNullable().defaultTo(1);
    table.string('PortionName');
    table.string('Notes');
    table.string('Modifiers');
    table.string('State', 20).notNullable().defaultTo('NEW');
    table.foreign('KitchenOrderId').references('KitchenOrders.Id').onDelete('CASCADE');
  });

  // Kitchen Station Routing
  await knex.schema.createTable('KitchenStationRouting', (table) => {
    table.increments('Id').primary();
    table.integer('KitchenStationId').notNullable();
    table.string('MenuItemGroupCode');
    table.integer('MenuItemId');
    table.foreign('KitchenStationId').references('KitchenStations.Id').onDelete('CASCADE');
  });

  // Indexes
  await knex.schema.alterTable('KitchenOrders', (table) => {
    table.index(['State'], 'IX_KitchenOrders_State');
    table.index(['KitchenStationId'], 'IX_KitchenOrders_StationId');
    table.index(['TicketId'], 'IX_KitchenOrders_TicketId');
    table.index(['CreatedAt'], 'IX_KitchenOrders_CreatedAt');
  });
  await knex.schema.alterTable('KitchenOrderItems', (table) => {
    table.index(['KitchenOrderId'], 'IX_KitchenOrderItems_KitchenOrderId');
  });
  await knex.schema.alterTable('KitchenStationRouting', (table) => {
    table.index(['KitchenStationId'], 'IX_KitchenStationRouting_StationId');
    table.index(['MenuItemGroupCode'], 'IX_KitchenStationRouting_GroupCode');
  });

  // Seed default kitchen stations with stable Code identifiers
  await knex('KitchenStations').insert([
    { Code: 'KITCHEN', Name: 'kitchen', DisplayName: 'Cocina', SortOrder: 10, Color: '#FF6B6B', IsActive: 1, IsDefault: 1 },
    { Code: 'PIZZA', Name: 'pizza', DisplayName: 'Pizzería', SortOrder: 20, Color: '#4ECDC4', IsActive: 1, IsDefault: 0 },
    { Code: 'DRINKS', Name: 'bar', DisplayName: 'Bebidas', SortOrder: 30, Color: '#45B7D1', IsActive: 1, IsDefault: 0 },
    { Code: 'EXPO', Name: 'dispatch', DisplayName: 'Despacho', SortOrder: 40, Color: '#96CEB4', IsActive: 1, IsDefault: 0 },
  ]);

  // Default routing rules
  const kitchenStation = await knex('KitchenStations').where({ Code: 'KITCHEN' }).first();
  const barStation = await knex('KitchenStations').where({ Code: 'DRINKS' }).first();
  const pizzaStation = await knex('KitchenStations').where({ Code: 'PIZZA' }).first();

  if (kitchenStation) {
    await knex('KitchenStationRouting').insert([
      { KitchenStationId: kitchenStation.Id, MenuItemGroupCode: 'Food' },
      { KitchenStationId: kitchenStation.Id, MenuItemGroupCode: 'Mains' },
      { KitchenStationId: kitchenStation.Id, MenuItemGroupCode: 'Starters' },
    ]);
  }
  if (barStation) {
    await knex('KitchenStationRouting').insert([
      { KitchenStationId: barStation.Id, MenuItemGroupCode: 'Drinks' },
      { KitchenStationId: barStation.Id, MenuItemGroupCode: 'Beverages' },
    ]);
  }
  if (pizzaStation) {
    await knex('KitchenStationRouting').insert([
      { KitchenStationId: pizzaStation.Id, MenuItemGroupCode: 'Pizza' },
    ]);
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('KitchenStationRouting');
  await knex.schema.dropTableIfExists('KitchenOrderItems');
  await knex.schema.dropTableIfExists('KitchenOrders');
  await knex.schema.dropTableIfExists('KitchenStations');
};
