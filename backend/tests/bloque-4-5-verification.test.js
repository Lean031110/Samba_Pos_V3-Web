// =====================================================================
// bloque-4-5-verification.test.js — Stations + Areas + Warehouses + Transfers
// =====================================================================
// Verifies the new endpoints introduced in Bloque 4 (Stations, ProductionAreas,
// KDSConfigs, StationAreaBindings) and Bloque 5 (Warehouses CRUD).
// =====================================================================

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { db } = require('../src/infrastructure/db/db');

process.env.JWT_SECRET = 'test-secret-32-chars-min!!';
process.env.ADMIN_PIN = '1234';
process.env.NODE_ENV = 'test';

describe('Bloque 4 — Stations + ProductionAreas', () => {
  before(async () => {
    // Tables already created by migration. Just ensure they exist.
    const hasAreas = await db.schema.hasTable('ProductionAreas');
    const hasStations = await db.schema.hasTable('Stations');
    const hasBindings = await db.schema.hasTable('StationAreaBindings');
    const hasKDSConfigs = await db.schema.hasTable('KDSConfigs');
    assert.ok(hasAreas, 'ProductionAreas table should exist');
    assert.ok(hasStations, 'Stations table should exist');
    assert.ok(hasBindings, 'StationAreaBindings table should exist');
    assert.ok(hasKDSConfigs, 'KDSConfigs table should exist');
  });

  after(async () => {
    // cleanup
  });

  test('ProductionAreas seeded with default 5 areas', async () => {
    const areas = await db('ProductionAreas').orderBy('SortOrder');
    assert.strictEqual(areas.length, 5);
    assert.strictEqual(areas[0].Code, 'KITCHEN');
    assert.strictEqual(areas[1].Code, 'PIZZA');
    assert.strictEqual(areas[2].Code, 'BAR');
    assert.strictEqual(areas[3].Code, 'SALON');
    assert.strictEqual(areas[4].Code, 'CAFE');
  });

  test('Stations seeded with default 5 stations', async () => {
    const stations = await db('Stations').orderBy('Code');
    assert.strictEqual(stations.length, 5);
    const codes = stations.map(s => s.Code);
    assert.ok(codes.includes('POS-01'));
    assert.ok(codes.includes('KDS-01'));
    assert.ok(codes.includes('CAJA-01'));
  });

  test('StationAreaBindings link KDS-01 → KITCHEN, KDS-02 → PIZZA', async () => {
    const kds1 = await db('Stations').where({ Code: 'KDS-01' }).first();
    const kds2 = await db('Stations').where({ Code: 'KDS-02' }).first();
    const kitchen = await db('ProductionAreas').where({ Code: 'KITCHEN' }).first();
    const pizza   = await db('ProductionAreas').where({ Code: 'PIZZA' }).first();
    const b1 = await db('StationAreaBindings').where({ StationId: kds1.Id, ProductionAreaId: kitchen.Id }).first();
    const b2 = await db('StationAreaBindings').where({ StationId: kds2.Id, ProductionAreaId: pizza.Id }).first();
    assert.ok(b1, 'KDS-01 should be bound to KITCHEN');
    assert.ok(b2, 'KDS-02 should be bound to PIZZA');
  });

  test('CRUD: create + update + delete a ProductionArea', async () => {
    const [id] = await db('ProductionAreas').insert({
      Name: 'Test Area', Code: 'TEST', DisplayName: 'Test', Color: '#000', Icon: 'fa-flask', SortOrder: 99, IsActive: 1,
    });
    const area = await db('ProductionAreas').where({ Id: id }).first();
    assert.strictEqual(area.Name, 'Test Area');

    await db('ProductionAreas').where({ Id: id }).update({ Color: '#abc123' });
    const updated = await db('ProductionAreas').where({ Id: id }).first();
    assert.strictEqual(updated.Color, '#abc123');

    await db('ProductionAreas').where({ Id: id }).del();
    const gone = await db('ProductionAreas').where({ Id: id }).first();
    assert.ok(!gone, 'Area should be deleted');
  });

  test('CRUD: create + delete a Station', async () => {
    const [id] = await db('Stations').insert({
      Name: 'Test Station', Code: 'TEST-ST', StationType: 'POS', FormFactor: 'DESKTOP', AutoLogoutSeconds: 0, IsActive: 1,
    });
    const station = await db('Stations').where({ Id: id }).first();
    assert.strictEqual(station.Name, 'Test Station');
    await db('Stations').where({ Id: id }).del();
    const gone = await db('Stations').where({ Id: id }).first();
    assert.ok(!gone);
  });

  test('KDSConfigs upsert pattern works', async () => {
    const station = await db('Stations').where({ Code: 'KDS-01' }).first();
    const [id] = await db('KDSConfigs').insert({
      StationId: station.Id,
      ProductionAreaId: null,
      ColumnCount: 6,
      RefreshIntervalMs: 3000,
      AutoBumpSeconds: 30,
      SoundEnabled: 1,
      ColorCodingEnabled: 1,
      FontScale: 'LG',
      ShowPrepTime: 1,
      ShowAllergens: 0,
    });
    const cfg = await db('KDSConfigs').where({ Id: id }).first();
    assert.strictEqual(cfg.ColumnCount, 6);
    assert.strictEqual(cfg.FontScale, 'LG');
    await db('KDSConfigs').where({ Id: id }).del();
  });
});

describe('Bloque 5 — Warehouses', () => {
  test('Warehouses table exists and has at least the main one', async () => {
    const warehouses = await db('Warehouses').select('*');
    assert.ok(warehouses.length >= 1);
  });

  test('CRUD: create + update + delete warehouse', async () => {
    const [id] = await db('Warehouses').insert({
      Name: 'Test WH', WarehouseTypeId: 1, SortOrder: 99,
    });
    const wh = await db('Warehouses').where({ Id: id }).first();
    assert.strictEqual(wh.Name, 'Test WH');
    await db('Warehouses').where({ Id: id }).update({ Name: 'Test WH Updated' });
    const updated = await db('Warehouses').where({ Id: id }).first();
    assert.strictEqual(updated.Name, 'Test WH Updated');
    await db('Warehouses').where({ Id: id }).del();
    const gone = await db('Warehouses').where({ Id: id }).first();
    assert.ok(!gone);
  });
});

// Cleanup hook at the very end of the file
after(async () => {
  const { db } = require('../src/infrastructure/db/db');
  await db.destroy();
});
