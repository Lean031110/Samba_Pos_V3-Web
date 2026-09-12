// bloque-12-final-features.test.js — Verify final Bloque 12 features (PG compat, CSV export, sorting)
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const F = fs.existsSync(FRONTEND_DIR) ? FRONTEND_DIR : path.join(__dirname, '..', '..', '..', 'Samba_Pos_V3-Web', 'frontend');
const BACKEND_DIR = path.join(__dirname, '..');

describe('Bloque 12 Final — PG compatibility fixes', () => {
  test('fix_idempotency_unique_constraint down() uses isSQLite guard', () => {
    const file = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations', '20260908000001_fix_idempotency_unique_constraint.js');
    const code = fs.readFileSync(file, 'utf8');
    // exports.down should have isSQLite guard
    const downMatch = code.match(/exports\.down[\s\S]*$/);
    assert.ok(downMatch, 'should have exports.down');
    assert.ok(/isSQLite\s*=\s*knex\.client\.config\.client/.test(downMatch[0]), 'down() should check isSQLite');
    assert.ok(/SERIAL/.test(downMatch[0]), 'down() should use SERIAL for PG');
    assert.ok(/ON CONFLICT/.test(downMatch[0]), 'down() should use ON CONFLICT for PG');
  });

  test('kitchen_module boolean defaults use false (PG-friendly)', () => {
    const file = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations', '20240906000001_create_kitchen_module.js');
    const code = fs.readFileSync(file, 'utf8');
    assert.ok(/\.boolean\(['"]IsDefault['"]\)\.notNullable\(\)\.defaultTo\(false\)/.test(code),
      'IsDefault should use defaultTo(false)');
  });

  test('bloque_d_inventory_extensions booleans use false (PG-friendly)', () => {
    const file = path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'migrations', '20260908000004_create_bloque_d_inventory_extensions.js');
    const code = fs.readFileSync(file, 'utf8');
    assert.ok(/\.boolean\(['"]UseCustomPrice['"]\)\.notNullable\(\)\.defaultTo\(false\)/.test(code), 'UseCustomPrice should use defaultTo(false)');
    assert.ok(/\.boolean\(['"]IsOptional['"]\)\.notNullable\(\)\.defaultTo\(false\)/.test(code), 'IsOptional should use defaultTo(false)');
    assert.ok(/\.boolean\(['"]Adjusted['"]\)\.notNullable\(\)\.defaultTo\(false\)/.test(code), 'Adjusted should use defaultTo(false)');
  });

  test('PG compat audit: 15/15 migrations compatible', () => {
    const { execSync } = require('child_process');
    const out = execSync('node scripts/audit-pg-compat.js', { cwd: path.join(BACKEND_DIR, '..'), encoding: 'utf8' });
    assert.match(out, /Migraciones PG-compatible: 15\/15/);
    assert.match(out, /Issues sin guardar: 0/);
  });
});

describe('Bloque 12 Final — CSV Export service', () => {
  test('csv-export.js exists and exposes CSVExport', () => {
    const file = path.join(F, 'js', 'services', 'csv-export.js');
    assert.ok(fs.existsSync(file), 'csv-export.js should exist');
    const code = fs.readFileSync(file, 'utf8');
    assert.ok(code.includes('window.CSVExport'), 'should expose CSVExport');
    assert.ok(code.includes('export('), 'should have export method');
    assert.ok(code.includes('_escape'), 'should have _escape helper');
    assert.ok(code.includes('Blob'), 'should use Blob for download');
  });

  test('index.html registers csv-export.js', () => {
    const html = fs.readFileSync(path.join(F, 'index.html'), 'utf8');
    assert.ok(html.includes('/js/services/csv-export.js'), 'index.html should load csv-export.js');
  });

  test('admin.js has export buttons in Users, Customers, Reports', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    assert.ok(code.includes('_exportUsers'), 'should have _exportUsers method');
    assert.ok(code.includes('_exportCustomers'), 'should have _exportCustomers method');
    assert.ok(code.includes('_exportTopProducts'), 'should have _exportTopProducts method');
    assert.ok(code.includes('_exportByCategory'), 'should have _exportByCategory method');
    assert.ok(code.includes('_exportByUser'), 'should have _exportByUser method');
  });
});

describe('Bloque 12 Final — Sorting en admin tables', () => {
  test('admin.js has _usersSort method', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    assert.ok(code.includes('_usersSort'), 'should have _usersSort method');
    assert.ok(code.includes('_usersSortCol'), 'should track sort column state');
    assert.ok(code.includes('_usersSortDir'), 'should track sort direction state');
    assert.ok(code.includes('sortIcon'), 'should display sort icon');
  });

  test('admin.js Users table headers are clickable for sorting', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    assert.ok(/onclick="window\.AdminView\._usersSort\(['"]Name['"]\)"/.test(code), 'Name header should be sortable');
    assert.ok(/onclick="window\.AdminView\._usersSort\(['"]RoleName['"]\)"/.test(code), 'RoleName header should be sortable');
  });
});

describe('Bloque 12 Final — Search in admin sections', () => {
  test('admin.js has debounced search for Users, Customers, Products', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    assert.ok(code.includes('_usersSearchDebounced'), 'should have _usersSearchDebounced');
    assert.ok(code.includes('_customersSearchDebounced'), 'should have _customersSearchDebounced');
    assert.ok(code.includes('_productsSearchDebounced'), 'should have _productsSearchDebounced');
  });

  test('admin.js search inputs wired to backend', () => {
    const code = fs.readFileSync(path.join(F, 'js', 'views', 'admin.js'), 'utf8');
    // Users search uses URLSearchParams with search param
    assert.ok(/params\.set\(['"]search['"],\s*this\._usersSearch\)/.test(code), 'Users search should set search param');
    // Customers search uses URLSearchParams
    assert.ok(/params\.set\(['"]search['"],\s*this\._customersSearch\)/.test(code), 'Customers search should set search param');
    // Products search is client-side filter (uses .filter + .includes + toLowerCase)
    assert.ok(/\.filter\(.*\.toLowerCase\(\)\.includes/.test(code), 'Products should filter client-side');
  });
});

after(async () => {
  const { db } = require('../src/infrastructure/db/db');
  await db.destroy();
});
