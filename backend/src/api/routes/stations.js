// =====================================================================
// stations.js — Stations + ProductionAreas + KDS config CRUD
// =====================================================================
// Bloque 4 — Endpoints:
//   ProductionAreas:
//     GET    /api/stations/areas
//     POST   /api/stations/areas
//     PATCH  /api/stations/areas/:id
//     DELETE /api/stations/areas/:id
//     GET    /api/stations/areas/:id/products
//     POST   /api/stations/areas/:id/products        — assign product
//     DELETE /api/stations/areas/:id/products/:productId
//
//   Stations:
//     GET    /api/stations
//     POST   /api/stations
//     GET    /api/stations/:id
//     PATCH  /api/stations/:id
//     DELETE /api/stations/:id
//
//   Station <-> Area bindings:
//     GET    /api/stations/:id/areas
//     POST   /api/stations/:id/areas
//     DELETE /api/stations/:id/areas/:areaId
//
//   KDS Config:
//     GET    /api/stations/:id/kds-config
//     PUT    /api/stations/:id/kds-config
//
//   Self-registration (Android tablets/POS):
//     POST   /api/stations/register      — creates or updates by HardwareId
// =====================================================================

const express = require('express');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();

// =====================================================================
// PRODUCTION AREAS
// =====================================================================

// GET /api/stations/areas
router.get('/areas', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const areas = await db('ProductionAreas')
      .leftJoin('Warehouses', 'ProductionAreas.WarehouseId', 'Warehouses.Id')
      .select(
        'ProductionAreas.*',
        'Warehouses.Name as WarehouseName'
      )
      .orderBy('ProductionAreas.SortOrder');
    res.json({ data: areas, count: areas.length });
  } catch (err) { next(err); }
});

// POST /api/stations/areas
router.post('/areas', requirePermission('settings.manage'), auditLog('station.area.create', 'ProductionArea'), async (req, res, next) => {
  try {
    const { name, code, displayName, color, icon, sortOrder, warehouseId } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (!code) throw new ValidationError('code is required');
    const [id] = await db('ProductionAreas').insert({
      Name: name,
      Code: String(code).toUpperCase(),
      DisplayName: displayName || name,
      Color: color || '#044392',
      Icon: icon || 'fa-utensils',
      SortOrder: sortOrder || 0,
      WarehouseId: warehouseId || null,
      IsActive: 1,
    });
    const area = await db('ProductionAreas').where({ Id: id }).first();
    res.status(201).json({ data: area });
  } catch (err) { next(err); }
});

// PATCH /api/stations/areas/:id
router.patch('/areas/:id', requirePermission('settings.manage'), auditLog('station.area.update', 'ProductionArea'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { name, code, displayName, color, icon, sortOrder, warehouseId, isActive } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.Name = name;
    if (code !== undefined) updates.Code = String(code).toUpperCase();
    if (displayName !== undefined) updates.DisplayName = displayName;
    if (color !== undefined) updates.Color = color;
    if (icon !== undefined) updates.Icon = icon;
    if (sortOrder !== undefined) updates.SortOrder = sortOrder;
    if (warehouseId !== undefined) updates.WarehouseId = warehouseId || null;
    if (isActive !== undefined) updates.IsActive = isActive ? 1 : 0;
    if (Object.keys(updates).length === 0) throw new ValidationError('No valid fields to update');
    await db('ProductionAreas').where({ Id: id }).update(updates);
    const area = await db('ProductionAreas').where({ Id: id }).first();
    if (!area) throw new NotFoundError(`Area ${id} not found`);
    res.json({ data: area });
  } catch (err) { next(err); }
});

// DELETE /api/stations/areas/:id
router.delete('/areas/:id', requirePermission('settings.manage'), auditLog('station.area.delete', 'ProductionArea'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const deleted = await db('ProductionAreas').where({ Id: id }).del();
    if (deleted === 0) throw new NotFoundError(`Area ${id} not found`);
    res.json({ data: { deleted: true, id } });
  } catch (err) { next(err); }
});

// GET /api/stations/areas/:id/products
router.get('/areas/:id/products', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const items = await db('ProductionAreaProducts')
      .join('Products', 'ProductionAreaProducts.MenuItemId', 'Products.Id')
      .where({ 'ProductionAreaProducts.ProductionAreaId': id })
      .select('ProductionAreaProducts.*', 'Products.Name as ProductName', 'Products.GroupCode')
      .orderBy('ProductionAreaProducts.SortOrder');
    res.json({ data: items, count: items.length });
  } catch (err) { next(err); }
});

// POST /api/stations/areas/:id/products — assign product to area
router.post('/areas/:id/products', requirePermission('settings.manage'), auditLog('station.area.bindProduct', 'ProductionAreaProduct'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { menuItemId, sortOrder } = req.body || {};
    if (!menuItemId) throw new ValidationError('menuItemId is required');
    try {
      await db('ProductionAreaProducts').insert({
        ProductionAreaId: id,
        MenuItemId: menuItemId,
        SortOrder: sortOrder || 0,
      });
    } catch (e) {
      // Already exists — update sortOrder
      await db('ProductionAreaProducts')
        .where({ ProductionAreaId: id, MenuItemId })
        .update({ SortOrder: sortOrder || 0 });
    }
    res.status(201).json({ data: { assigned: true, areaId: id, menuItemId } });
  } catch (err) { next(err); }
});

// DELETE /api/stations/areas/:id/products/:productId
router.delete('/areas/:id/products/:productId', requirePermission('settings.manage'), auditLog('station.area.unbindProduct', 'ProductionAreaProduct'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(id) || isNaN(productId)) throw new ValidationError('ids must be numbers');
    await db('ProductionAreaProducts')
      .where({ ProductionAreaId: id, MenuItemId: productId })
      .del();
    res.json({ data: { removed: true, areaId: id, menuItemId: productId } });
  } catch (err) { next(err); }
});

// =====================================================================
// STATIONS
// =====================================================================

// GET /api/stations
router.get('/', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const stations = await db('Stations').orderBy('Code');
    res.json({ data: stations, count: stations.length });
  } catch (err) { next(err); }
});

// POST /api/stations
router.post('/', requirePermission('settings.manage'), auditLog('station.create', 'Station'), async (req, res, next) => {
  try {
    const { name, code, stationType, defaultRole, ipAddress, hardwareId, operatingSystem, formFactor, autoLogoutSeconds, reportPrinterId } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (!code) throw new ValidationError('code is required');
    if (!stationType) throw new ValidationError('stationType is required');
    const [id] = await db('Stations').insert({
      Name: name,
      Code: String(code).toUpperCase(),
      StationType: stationType,
      DefaultRole: defaultRole || null,
      IpAddress: ipAddress || null,
      HardwareId: hardwareId || null,
      OperatingSystem: operatingSystem || null,
      FormFactor: formFactor || 'DESKTOP',
      AutoLogoutSeconds: autoLogoutSeconds || 0,
      ReportPrinterId: reportPrinterId || 0,
      IsActive: 1,
    });
    const station = await db('Stations').where({ Id: id }).first();
    res.status(201).json({ data: station });
  } catch (err) { next(err); }
});

// GET /api/stations/:id
router.get('/:id', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const station = await db('Stations').where({ Id: id }).first();
    if (!station) throw new NotFoundError(`Station ${id} not found`);
    res.json({ data: station });
  } catch (err) { next(err); }
});

// PATCH /api/stations/:id
router.patch('/:id', requirePermission('settings.manage'), auditLog('station.update', 'Station'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { name, code, stationType, defaultRole, ipAddress, hardwareId, operatingSystem, formFactor, autoLogoutSeconds, reportPrinterId, isActive } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.Name = name;
    if (code !== undefined) updates.Code = String(code).toUpperCase();
    if (stationType !== undefined) updates.StationType = stationType;
    if (defaultRole !== undefined) updates.DefaultRole = defaultRole || null;
    if (ipAddress !== undefined) updates.IpAddress = ipAddress || null;
    if (hardwareId !== undefined) updates.HardwareId = hardwareId || null;
    if (operatingSystem !== undefined) updates.OperatingSystem = operatingSystem || null;
    if (formFactor !== undefined) updates.FormFactor = formFactor;
    if (autoLogoutSeconds !== undefined) updates.AutoLogoutSeconds = autoLogoutSeconds;
    if (reportPrinterId !== undefined) updates.ReportPrinterId = reportPrinterId || 0;
    if (isActive !== undefined) updates.IsActive = isActive ? 1 : 0;
    if (Object.keys(updates).length === 0) throw new ValidationError('No valid fields to update');
    await db('Stations').where({ Id: id }).update(updates);
    const station = await db('Stations').where({ Id: id }).first();
    if (!station) throw new NotFoundError(`Station ${id} not found`);
    res.json({ data: station });
  } catch (err) { next(err); }
});

// DELETE /api/stations/:id (soft delete)
router.delete('/:id', requirePermission('settings.manage'), auditLog('station.deactivate', 'Station'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    await db('Stations').where({ Id: id }).update({ IsActive: 0 });
    res.json({ data: { deactivated: true, id } });
  } catch (err) { next(err); }
});

// =====================================================================
// STATION <-> AREA BINDINGS
// =====================================================================

// GET /api/stations/:id/areas
router.get('/:id/areas', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const areas = await db('StationAreaBindings')
      .join('ProductionAreas', 'StationAreaBindings.ProductionAreaId', 'ProductionAreas.Id')
      .where({ 'StationAreaBindings.StationId': id })
      .select('ProductionAreas.*', 'StationAreaBindings.SortOrder as BindingSortOrder')
      .orderBy('StationAreaBindings.SortOrder');
    res.json({ data: areas, count: areas.length });
  } catch (err) { next(err); }
});

// POST /api/stations/:id/areas — bind area to station
router.post('/:id/areas', requirePermission('settings.manage'), auditLog('station.bindArea', 'StationAreaBinding'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { productionAreaId, sortOrder } = req.body || {};
    if (!productionAreaId) throw new ValidationError('productionAreaId is required');
    try {
      await db('StationAreaBindings').insert({
        StationId: id,
        ProductionAreaId: productionAreaId,
        SortOrder: sortOrder || 0,
      });
    } catch (e) {
      // Already bound — update sort order
      await db('StationAreaBindings')
        .where({ StationId: id, ProductionAreaId: productionAreaId })
        .update({ SortOrder: sortOrder || 0 });
    }
    res.status(201).json({ data: { bound: true, stationId: id, productionAreaId } });
  } catch (err) { next(err); }
});

// DELETE /api/stations/:id/areas/:areaId
router.delete('/:id/areas/:areaId', requirePermission('settings.manage'), auditLog('station.unbindArea', 'StationAreaBinding'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const areaId = parseInt(req.params.areaId, 10);
    if (isNaN(id) || isNaN(areaId)) throw new ValidationError('ids must be numbers');
    await db('StationAreaBindings')
      .where({ StationId: id, ProductionAreaId: areaId })
      .del();
    res.json({ data: { removed: true, stationId: id, productionAreaId: areaId } });
  } catch (err) { next(err); }
});

// =====================================================================
// KDS CONFIG
// =====================================================================

// GET /api/stations/:id/kds-config
router.get('/:id/kds-config', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const configs = await db('KDSConfigs').where({ StationId: id });
    res.json({ data: configs, count: configs.length });
  } catch (err) { next(err); }
});

// PUT /api/stations/:id/kds-config — upsert config (body: productionAreaId?, columnCount, refreshIntervalMs, ...)
router.put('/:id/kds-config', requirePermission('settings.manage'), auditLog('station.kdsConfig.upsert', 'KDSConfig'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { productionAreaId, columnCount, refreshIntervalMs, autoBumpSeconds, soundEnabled, colorCodingEnabled, fontScale, showPrepTime, showAllergens } = req.body || {};
    const filter = { StationId: id };
    if (productionAreaId) filter.ProductionAreaId = productionAreaId;
    else filter.ProductionAreaId = null;
    const existing = await db('KDSConfigs').where(filter).first();
    const payload = {
      StationId: id,
      ProductionAreaId: productionAreaId || null,
      ColumnCount: columnCount || 4,
      RefreshIntervalMs: refreshIntervalMs || 5000,
      AutoBumpSeconds: autoBumpSeconds || 0,
      SoundEnabled: soundEnabled === undefined ? 1 : (soundEnabled ? 1 : 0),
      ColorCodingEnabled: colorCodingEnabled === undefined ? 1 : (colorCodingEnabled ? 1 : 0),
      FontScale: fontScale || 'MD',
      ShowPrepTime: showPrepTime === undefined ? 1 : (showPrepTime ? 1 : 0),
      ShowAllergens: showAllergens === undefined ? 0 : (showAllergens ? 1 : 0),
    };
    if (existing) {
      await db('KDSConfigs').where(filter).update(payload);
      const updated = await db('KDSConfigs').where(filter).first();
      res.json({ data: updated });
    } else {
      const [newId] = await db('KDSConfigs').insert(payload);
      const created = await db('KDSConfigs').where({ Id: newId }).first();
      res.status(201).json({ data: created });
    }
  } catch (err) { next(err); }
});

// =====================================================================
// SELF-REGISTRATION (Android tablets, kiosks)
// =====================================================================

// POST /api/stations/register — register or update by HardwareId
router.post('/register', async (req, res, next) => {
  try {
    const { name, code, stationType, hardwareId, ipAddress, operatingSystem, formFactor } = req.body || {};
    if (!hardwareId) throw new ValidationError('hardwareId is required');
    if (!code) throw new ValidationError('code is required');
    const existing = await db('Stations').where({ HardwareId: hardwareId }).first();
    if (existing) {
      await db('Stations').where({ Id: existing.Id }).update({
        IpAddress: ipAddress || existing.IpAddress,
        OperatingSystem: operatingSystem || existing.OperatingSystem,
        FormFactor: formFactor || existing.FormFactor,
        Name: name || existing.Name,
      });
      const updated = await db('Stations').where({ Id: existing.Id }).first();
      res.json({ data: updated });
    } else {
      const [id] = await db('Stations').insert({
        Name: name || code,
        Code: String(code).toUpperCase(),
        StationType: stationType || 'POS',
        HardwareId: hardwareId,
        IpAddress: ipAddress || null,
        OperatingSystem: operatingSystem || null,
        FormFactor: formFactor || 'TABLET',
        AutoLogoutSeconds: 0,
        IsActive: 1,
      });
      const created = await db('Stations').where({ Id: id }).first();
      res.status(201).json({ data: created });
    }
  } catch (err) { next(err); }
});

module.exports = router;
