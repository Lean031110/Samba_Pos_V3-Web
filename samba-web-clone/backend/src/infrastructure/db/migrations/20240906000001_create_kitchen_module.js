// =====================================================================
// Migration 20240906000001_create_kitchen_module.js
// =====================================================================
// Creates Kitchen Display System (KDS) tables:
//   - KitchenStations: cocina, pizzería, bebidas, despacho
//   - KitchenOrders: órdenes enviadas a cocina (una por orden de ticket)
//   - KitchenOrderItems: items individuales dentro de una kitchen order
//   - KitchenStationRouting: routing producto → estación
// =====================================================================

exports.up = async function(knex) {
  // Kitchen Stations (cocina, pizzería, bebidas, despacho)
  await knex.schema.createTable('KitchenStations', (table) => {
    table.increments('Id').primary();
    table.string('Name', 100).notNullable();
    table.string('DisplayName', 100).notNullable();
    table.integer('SortOrder').notNullable().defaultTo(0);
    table.string('Color', 20);         // color for UI header
    table.integer('PrinterId');         // linked printer for this station
    table.boolean('IsActive').notNullable().defaultTo(1);
    table.timestamps(true, true);
  });

  // Kitchen Orders — one per ticket order that needs kitchen preparation
  await knex.schema.createTable('KitchenOrders', (table) => {
    table.increments('Id').primary();
    table.integer('TicketId').notNullable();
    table.integer('OrderId').notNullable();        // Links to Orders.Id
    table.integer('KitchenStationId');              // Which station is preparing this
    table.string('State', 20).notNullable().defaultTo('NEW');
    // States: NEW, ACCEPTED, PREPARING, READY, SERVED, VOIDED
    table.timestamp('CreatedAt').notNullable().defaultTo(knex.fn.now());
    table.timestamp('AcceptedAt');
    table.timestamp('ReadyAt');
    table.timestamp('ServedAt');
    table.integer('Priority').notNullable().defaultTo(0);  // 0=normal, 1=high, 2=urgent
    table.string('TicketNumber', 50);
    table.string('TableName', 50);
    table.integer('OrderNumber').notNullable().defaultTo(0);
    table.string('Notes');                           // Special instructions
    table.integer('CreatedByUserId').notNullable().defaultTo(0);
    table.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
    table.foreign('KitchenStationId').references('KitchenStations.Id');
  });

  // Kitchen Order Items — individual items within a kitchen order
  await knex.schema.createTable('KitchenOrderItems', (table) => {
    table.increments('Id').primary();
    table.integer('KitchenOrderId').notNullable();
    table.string('MenuItemName').notNullable();
    table.decimal('Quantity', 16, 3).notNullable().defaultTo(1);
    table.string('PortionName');
    table.string('Notes');                           // Per-item notes (no onions, extra cheese)
    table.string('Modifiers');                       // JSON: [{ name, price }]
    table.string('State', 20).notNullable().defaultTo('NEW');
    table.foreign('KitchenOrderId').references('KitchenOrders.Id').onDelete('CASCADE');
  });

  // Kitchen Station Routing — which products go to which station
  await knex.schema.createTable('KitchenStationRouting', (table) => {
    table.increments('Id').primary();
    table.integer('KitchenStationId').notNullable();
    table.string('MenuItemGroupCode');     // Route by group code (e.g., "Food", "Drinks")
    table.integer('MenuItemId');            // Or route by specific menu item
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

  // Seed default kitchen stations
  await knex('KitchenStations').insert([
    { Name: 'kitchen', DisplayName: 'Cocina', SortOrder: 10, Color: '#FF6B6B', IsActive: 1 },
    { Name: 'pizza', DisplayName: 'Pizzería', SortOrder: 20, Color: '#4ECDC4', IsActive: 1 },
    { Name: 'bar', DisplayName: 'Bebidas', SortOrder: 30, Color: '#45B7D1', IsActive: 1 },
    { Name: 'dispatch', DisplayName: 'Despacho', SortOrder: 40, Color: '#96CEB4', IsActive: 1 },
  ]);

  // Default routing: Food → kitchen, Drinks → bar, Pizza → pizza
  const kitchenStation = await knex('KitchenStations').where({ Name: 'kitchen' }).first();
  const barStation = await knex('KitchenStations').where({ Name: 'bar' }).first();
  const pizzaStation = await knex('KitchenStations').where({ Name: 'pizza' }).first();

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
