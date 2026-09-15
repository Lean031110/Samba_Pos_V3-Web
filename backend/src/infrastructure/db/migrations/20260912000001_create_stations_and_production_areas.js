// =====================================================================
// Migration 20260912000001_create_stations_and_production_areas.js
// =====================================================================
// Bloque 4 — Estaciones + Áreas de producción + KDS config
//
// Stations:    Dispositivos físicos (POS, KDS, Caja, Display).
//              Reemplazan a Terminals con metadatos modernos:
//              stationType, ipAddress, hardwareId, role default.
//
// ProductionAreas: Áreas de elaboración (Cocina, Pizzería, Barra, Salon).
//                  Diferentes de PrintAreas (áreas de impresión).
//                  Cada ProductionArea tiene: color, icon, KDS display mode.
//
// StationAreaBindings: Relación N:M entre Stations y ProductionAreas.
//                      Una KDS station puede mostrar varias áreas a la vez.
//
// KDSConfigs: Configuración KDS por station+area (column count, refresh
//             interval, sound enabled, auto-bump seconds, etc.).
// =====================================================================

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
  const isSQLite = knex.client.config.client === 'sqlite3';

  // Helper: check if column exists
  const hasColumn = async (table, column) => {
    try {
      if (isSQLite) {
        const info = await knex.raw(`PRAGMA table_info(${table})`);
        return info.some(r => r.name === column);
      } else {
        const r = await knex.raw(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = ? AND column_name = ?
        `, [table, column]);
        return (r.rows || r).length > 0;
      }
    } catch { return false; }
  };

  // -----------------------------------------------------------------
  // ProductionAreas — Áreas de elaboración
  // -----------------------------------------------------------------
  const hasAreasTable = await knex.schema.hasTable('ProductionAreas');
  if (!hasAreasTable) {
    await knex.schema.createTable('ProductionAreas', (t) => {
      t.increments('Id').primary();
      t.string('Name', 100).notNullable();
      t.string('Code', 20).notNullable(); // 'KITCHEN', 'PIZZA', 'BAR', 'SALON'
      t.string('DisplayName', 100);
      t.string('Color', 20).notNullable().defaultTo('#044392'); // brand blue
      t.string('Icon', 50).notNullable().defaultTo('fa-utensils');
      t.integer('SortOrder').notNullable().defaultTo(0);
      t.integer('IsActive').notNullable().defaultTo(1);
      t.integer('WarehouseId').nullable(); // Vincula área a almacén (Bloque 5)
      t.timestamps(true, true);

      if (isSQLite) {
        t.unique(['Code'], 'UX_ProductionAreas_Code');
      } else {
        // PostgreSQL: unique on lower(Code) for case-insensitive
        knex.raw('CREATE UNIQUE INDEX UX_ProductionAreas_Code ON "ProductionAreas" (LOWER("Code"))').catch(() => {});
      }
    });

    // Seed default production areas
    await knex('ProductionAreas').insert([
      { Name: 'Cocina',  Code: 'KITCHEN',  DisplayName: 'Cocina',  Color: '#dc3545', Icon: 'fa-utensils',   SortOrder: 1, IsActive: 1 },
      { Name: 'Pizzería',Code: 'PIZZA',    DisplayName: 'Pizzería',Color: '#fd7e14', Icon: 'fa-pizza-slice',SortOrder: 2, IsActive: 1 },
      { Name: 'Barra',    Code: 'BAR',     DisplayName: 'Barra',   Color: '#198754', Icon: 'fa-martini-glass-citrus', SortOrder: 3, IsActive: 1 },
      { Name: 'Salón',    Code: 'SALON',   DisplayName: 'Salón',   Color: '#0d6efd', Icon: 'fa-bell-concierge', SortOrder: 4, IsActive: 1 },
      { Name: 'Cafetería',Code: 'CAFE',    DisplayName: 'Cafetería',Color: '#6610f2', Icon: 'fa-mug-hot',   SortOrder: 5, IsActive: 1 },
    ]);
  }

  // -----------------------------------------------------------------
  // Stations — Dispositivos físicos
  // -----------------------------------------------------------------
  const hasStationsTable = await knex.schema.hasTable('Stations');
  if (!hasStationsTable) {
    await knex.schema.createTable('Stations', (t) => {
      t.increments('Id').primary();
      t.string('Name', 100).notNullable();
      t.string('Code', 30).notNullable();               // 'POS-01', 'KDS-KIT-01', 'CAJA-01'
      t.string('StationType', 20).notNullable();          // 'POS' | 'KDS' | 'CASHIER' | 'DISPLAY' | 'KITCHEN_DISPLAY'
      t.string('DefaultRole', 50).nullable();             // Auto-login role hint
      t.string('IpAddress', 45).nullable();
      t.string('HardwareId', 100).nullable();             // Device fingerprint
      t.string('OperatingSystem', 50).nullable();
      t.string('FormFactor', 20).notNullable().defaultTo('DESKTOP'); // DESKTOP | TABLET | PHONE | KIOSK
      t.string('LicenseKey', 100).nullable();
      t.integer('AutoLogoutSeconds').notNullable().defaultTo(0); // 0 = no auto-logout
      t.integer('ReportPrinterId').notNullable().defaultTo(0);
      t.integer('IsActive').notNullable().defaultTo(1);
      t.timestamps(true, true);

      if (isSQLite) {
        t.unique(['Code'], 'UX_Stations_Code');
      } else {
        knex.raw('CREATE UNIQUE INDEX UX_Stations_Code ON "Stations" (LOWER("Code"))').catch(() => {});
      }
    });

    await knex('Stations').insert([
      { Name: 'POS Mostrador 01', Code: 'POS-01', StationType: 'POS',      FormFactor: 'DESKTOP', AutoLogoutSeconds: 300, IsActive: 1 },
      { Name: 'POS Mesa 01',     Code: 'POS-02', StationType: 'POS',      FormFactor: 'TABLET',  AutoLogoutSeconds: 600, IsActive: 1 },
      { Name: 'KDS Cocina',      Code: 'KDS-01', StationType: 'KDS',      FormFactor: 'DESKTOP', AutoLogoutSeconds: 0,   IsActive: 1 },
      { Name: 'KDS Pizzería',    Code: 'KDS-02', StationType: 'KDS',      FormFactor: 'TABLET',  AutoLogoutSeconds: 0,   IsActive: 1 },
      { Name: 'Caja Principal',  Code: 'CAJA-01',StationType: 'CASHIER', FormFactor: 'DESKTOP', AutoLogoutSeconds: 300, IsActive: 1 },
    ]);
  }

  // -----------------------------------------------------------------
  // StationAreaBindings — Relación N:M entre Stations y ProductionAreas
  // (Una KDS station puede mostrar varias áreas a la vez)
  // -----------------------------------------------------------------
  const hasBindingsTable = await knex.schema.hasTable('StationAreaBindings');
  if (!hasBindingsTable) {
    await knex.schema.createTable('StationAreaBindings', (t) => {
      t.increments('Id').primary();
      t.integer('StationId').notNullable();
      t.integer('ProductionAreaId').notNullable();
      t.integer('SortOrder').notNullable().defaultTo(0);
      t.timestamps(true, true);

      t.foreign('StationId').references('Stations.Id').onDelete('CASCADE');
      t.foreign('ProductionAreaId').references('ProductionAreas.Id').onDelete('CASCADE');
      if (isSQLite) {
        t.unique(['StationId', 'ProductionAreaId'], 'UX_StationAreaBindings');
      } else {
        knex.raw('CREATE UNIQUE INDEX UX_StationAreaBindings ON "StationAreaBindings" ("StationId", "ProductionAreaId")').catch(() => {});
      }
    });

    // Bind KDS-01 → KITCHEN, KDS-02 → PIZZA
    const kds1 = await knex('Stations').where({ Code: 'KDS-01' }).first();
    const kds2 = await knex('Stations').where({ Code: 'KDS-02' }).first();
    const kitchen = await knex('ProductionAreas').where({ Code: 'KITCHEN' }).first();
    const pizza   = await knex('ProductionAreas').where({ Code: 'PIZZA' }).first();
    if (kds1 && kitchen) await knex('StationAreaBindings').insert({ StationId: kds1.Id, ProductionAreaId: kitchen.Id, SortOrder: 1 });
    if (kds2 && pizza)   await knex('StationAreaBindings').insert({ StationId: kds2.Id, ProductionAreaId: pizza.Id,   SortOrder: 1 });
  }

  // -----------------------------------------------------------------
  // KDSConfigs — Configuración KDS por station+area
  // -----------------------------------------------------------------
  const hasKDSConfigs = await knex.schema.hasTable('KDSConfigs');
  if (!hasKDSConfigs) {
    await knex.schema.createTable('KDSConfigs', (t) => {
      t.increments('Id').primary();
      t.integer('StationId').notNullable();
      t.integer('ProductionAreaId').nullable(); // null = global station config
      t.integer('ColumnCount').notNullable().defaultTo(4);
      t.integer('RefreshIntervalMs').notNullable().defaultTo(5000);
      t.integer('AutoBumpSeconds').notNullable().defaultTo(0); // 0 = manual bump
      t.integer('SoundEnabled').notNullable().defaultTo(1);
      t.integer('ColorCodingEnabled').notNullable().defaultTo(1);
      t.string('FontScale', 10).notNullable().defaultTo('MD'); // SM | MD | LG | XL
      t.integer('ShowPrepTime').notNullable().defaultTo(1);
      t.integer('ShowAllergens').notNullable().defaultTo(0);
      t.timestamps(true, true);

      t.foreign('StationId').references('Stations.Id').onDelete('CASCADE');
      t.foreign('ProductionAreaId').references('ProductionAreas.Id').onDelete('CASCADE');
    });
  }

  // -----------------------------------------------------------------
  // ProductionAreaProducts — Vincula Productos a áreas de producción
  // (Para que el KDS sepa a qué área enrutar cada pedido)
  // -----------------------------------------------------------------
  const hasAreaProducts = await knex.schema.hasTable('ProductionAreaProducts');
  if (!hasAreaProducts) {
    await knex.schema.createTable('ProductionAreaProducts', (t) => {
      t.increments('Id').primary();
      t.integer('ProductionAreaId').notNullable();
      t.integer('MenuItemId').notNullable();    // Products.Id / MenuItems.Id
      t.integer('SortOrder').notNullable().defaultTo(0);
      t.timestamps(true, true);

      t.foreign('ProductionAreaId').references('ProductionAreas.Id').onDelete('CASCADE');
      if (isSQLite) {
        t.unique(['ProductionAreaId', 'MenuItemId'], 'UX_ProductionAreaProducts');
      } else {
        knex.raw('CREATE UNIQUE INDEX UX_ProductionAreaProducts ON "ProductionAreaProducts" ("ProductionAreaId", "MenuItemId")').catch(() => {});
      }
    });
  }
}

async function down(knex) {
  await knex.schema.dropTableIfExists('ProductionAreaProducts');
  await knex.schema.dropTableIfExists('KDSConfigs');
  await knex.schema.dropTableIfExists('StationAreaBindings');
  await knex.schema.dropTableIfExists('Stations');
  await knex.schema.dropTableIfExists('ProductionAreas');
}

module.exports = { up, down };
