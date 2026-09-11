// =====================================================================
// admin.js — Administration CRUD routes
// =====================================================================
// Fase 3 — Administración completa.
//
// Covers CRUD for entities that don't have their own dedicated router:
//   /api/admin/users          — Users CRUD
//   /api/admin/roles          — Roles CRUD + permission assignment
//   /api/admin/terminals      — Terminals CRUD
//   /api/admin/departments    — Departments CRUD
//   /api/admin/payment-types  — Payment types CRUD
//   /api/admin/settings       — Program settings CRUD
//   /api/admin/audit-logs      — Audit log viewer (read-only)
//
// All endpoints require 'users.manage' or 'settings.manage' permission.
// =====================================================================

const express = require('express');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { requirePermission } = require('../middleware/rbac');
const { clearPermissionCache } = require('../middleware/rbac');
const bcrypt = require('bcryptjs');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();

// All admin routes require users.manage (or admin bypass)
router.use(requirePermission('users.manage'));

// =====================================================================
// USERS CRUD
// =====================================================================

// GET /api/admin/users — list all users
router.get('/users', async (req, res, next) => {
  try {
    const users = await db('Users')
      .leftJoin('UserRoles', 'Users.UserRoleId', 'UserRoles.Id')
      .select(
        'Users.Id', 'Users.Name', 'Users.UserRoleId',
        'UserRoles.Name as RoleName', 'UserRoles.IsAdmin'
      )
      .orderBy('Users.Name');
    res.json({ data: users, count: users.length });
  } catch (err) { next(err); }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const user = await db('Users')
      .leftJoin('UserRoles', 'Users.UserRoleId', 'UserRoles.Id')
      .select('Users.Id', 'Users.Name', 'Users.UserRoleId',
              'UserRoles.Name as RoleName', 'UserRoles.IsAdmin')
      .where({ 'Users.Id': id })
      .first();
    if (!user) throw new NotFoundError(`User ${id} not found`);
    res.json({ data: user });
  } catch (err) { next(err); }
});

// POST /api/admin/users — create user
router.post('/users', auditLog('admin.user.create', 'User'), async (req, res, next) => {
  try {
    const { name, pin, roleId } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (!pin) throw new ValidationError('pin is required');
    if (!roleId) throw new ValidationError('roleId is required');

    // Hash PIN with bcrypt
    const hashedPin = await bcrypt.hash(String(pin), 10);

    const [id] = await db('Users').insert({
      Name: name,
      PinCode: hashedPin,
      UserRoleId: roleId,
    });
    const user = await db('Users')
      .leftJoin('UserRoles', 'Users.UserRoleId', 'UserRoles.Id')
      .select('Users.Id', 'Users.Name', 'Users.UserRoleId',
              'UserRoles.Name as RoleName')
      .where({ 'Users.Id': id })
      .first();
    res.status(201).json({ data: user });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id — update user
router.patch('/users/:id', auditLog('admin.user.update', 'User'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { name, pin, roleId } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.Name = name;
    if (roleId !== undefined) updates.UserRoleId = roleId;
    if (pin) {
      updates.PinCode = await bcrypt.hash(String(pin), 10);
    }
    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No valid fields to update');
    }
    await db('Users').where({ Id: id }).update(updates);
    const user = await db('Users')
      .leftJoin('UserRoles', 'Users.UserRoleId', 'UserRoles.Id')
      .select('Users.Id', 'Users.Name', 'Users.UserRoleId',
              'UserRoles.Name as RoleName')
      .where({ 'Users.Id': id })
      .first();
    res.json({ data: user });
  } catch (err) { next(err); }
});

// DELETE /api/admin/users/:id — deactivate (soft delete)
router.delete('/users/:id', auditLog('admin.user.deactivate', 'User'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    // Don't actually delete — just clear the role (deactivate)
    await db('Users').where({ Id: id }).update({ UserRoleId: null });
    res.json({ data: { deactivated: true, id } });
  } catch (err) { next(err); }
});

// =====================================================================
// ROLES CRUD + Permission assignment
// =====================================================================

// GET /api/admin/roles — list all roles
router.get('/roles', async (req, res, next) => {
  try {
    const roles = await db('UserRoles')
      .select('Id', 'Name', 'IsAdmin')
      .orderBy('Name');
    res.json({ data: roles, count: roles.length });
  } catch (err) { next(err); }
});

// POST /api/admin/roles — create role
router.post('/roles', auditLog('admin.role.create', 'Role'), async (req, res, next) => {
  try {
    const { name, isAdmin = false } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    const [id] = await db('UserRoles').insert({
      Name: name,
      IsAdmin: isAdmin ? 1 : 0,
    });
    const role = await db('UserRoles').where({ Id: id }).first();
    res.status(201).json({ data: role });
  } catch (err) { next(err); }
});

// GET /api/admin/roles/:id/permissions — list permissions for a role
router.get('/roles/:id/permissions', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const perms = await db('RolePermissions')
      .join('Permissions', 'RolePermissions.PermissionId', 'Permissions.Id')
      .where({ 'RolePermissions.UserRoleId': id })
      .select('Permissions.Id', 'Permissions.Code', 'Permissions.Name', 'Permissions.Category');
    res.json({ data: perms, count: perms.length });
  } catch (err) { next(err); }
});

// POST /api/admin/roles/:id/permissions — assign permission to role
router.post('/roles/:id/permissions', auditLog('admin.role.assignPerm', 'Role'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const { permissionId } = req.body || {};
    if (!permissionId) throw new ValidationError('permissionId is required');

    // Check role exists
    const role = await db('UserRoles').where({ Id: id }).first();
    if (!role) throw new NotFoundError(`Role ${id} not found`);

    // Check permission exists
    const perm = await db('Permissions').where({ Id: permissionId }).first();
    if (!perm) throw new NotFoundError(`Permission ${permissionId} not found`);

    // Insert (ignore if already exists)
    try {
      await db('RolePermissions').insert({
        UserRoleId: id,
        PermissionId: permissionId,
      });
    } catch (e) {
      // Already exists — that's OK
    }

    // Clear permission cache so changes take effect immediately
    clearPermissionCache();

    res.status(201).json({ data: { assigned: true, roleId: id, permissionId } });
  } catch (err) { next(err); }
});

// DELETE /api/admin/roles/:id/permissions/:permId — remove permission from role
router.delete('/roles/:id/permissions/:permId', auditLog('admin.role.removePerm', 'Role'), async (req, res, next) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    const permId = parseInt(req.params.permId, 10);
    if (isNaN(roleId) || isNaN(permId)) throw new ValidationError('ids must be numbers');
    const deleted = await db('RolePermissions')
      .where({ UserRoleId: roleId, PermissionId: permId })
      .del();
    if (deleted === 0) throw new NotFoundError('Permission assignment not found');

    // Clear permission cache
    clearPermissionCache();

    res.json({ data: { removed: true, roleId, permissionId: permId } });
  } catch (err) { next(err); }
});

// GET /api/admin/permissions — list all available permissions
router.get('/permissions', async (req, res, next) => {
  try {
    const perms = await db('Permissions')
      .select('Id', 'Code', 'Name', 'Category')
      .orderBy('Category')
      .orderBy('Name');
    res.json({ data: perms, count: perms.length });
  } catch (err) { next(err); }
});

// =====================================================================
// DEPARTMENTS CRUD
// =====================================================================

router.get('/departments', async (req, res, next) => {
  try {
    const depts = await db('Departments').orderBy('Name');
    res.json({ data: depts, count: depts.length });
  } catch (err) { next(err); }
});

router.post('/departments', auditLog('admin.dept.create', 'Department'), async (req, res, next) => {
  try {
    const { name, warehouseId } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    const [id] = await db('Departments').insert({
      Name: name,
      WarehouseId: warehouseId || null,
    });
    const dept = await db('Departments').where({ Id: id }).first();
    res.status(201).json({ data: dept });
  } catch (err) { next(err); }
});

// =====================================================================
// TERMINALS CRUD
// =====================================================================

router.get('/terminals', async (req, res, next) => {
  try {
    const terminals = await db('Terminals').orderBy('Name');
    res.json({ data: terminals, count: terminals.length });
  } catch (err) { next(err); }
});

router.post('/terminals', auditLog('admin.terminal.create', 'Terminal'), async (req, res, next) => {
  try {
    const { name, autoLogout, reportPrinterId } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    const [id] = await db('Terminals').insert({
      Name: name,
      AutoLogout: autoLogout || 0,
      ReportPrinterId: reportPrinterId || 0,
    });
    const terminal = await db('Terminals').where({ Id: id }).first();
    res.status(201).json({ data: terminal });
  } catch (err) { next(err); }
});

// =====================================================================
// PAYMENT TYPES CRUD
// =====================================================================

router.get('/payment-types', async (req, res, next) => {
  try {
    const types = await db('PaymentTypes').orderBy('Name');
    res.json({ data: types, count: types.length });
  } catch (err) { next(err); }
});

router.post('/payment-types', auditLog('admin.paytype.create', 'PaymentType'), async (req, res, next) => {
  try {
    const { name, accountTransactionTypeId } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    const [id] = await db('PaymentTypes').insert({
      Name: name,
      AccountTransactionTypeId: accountTransactionTypeId || 4,
    });
    const pt = await db('PaymentTypes').where({ Id: id }).first();
    res.status(201).json({ data: pt });
  } catch (err) { next(err); }
});

// =====================================================================
// SETTINGS CRUD (ProgramSettings)
// =====================================================================

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await db('ProgramSettings').orderBy('Name');
    res.json({ data: settings, count: settings.length });
  } catch (err) { next(err); }
});

router.patch('/settings/:name', auditLog('admin.settings.update', 'Settings'), async (req, res, next) => {
  try {
    const name = req.params.name;
    const { value } = req.body || {};
    if (value === undefined) throw new ValidationError('value is required');
    const existing = await db('ProgramSettings').where({ Name: name }).first();
    if (existing) {
      await db('ProgramSettings').where({ Name: name }).update({ Value: String(value) });
    } else {
      await db('ProgramSettings').insert({ Name: name, Value: String(value) });
    }
    res.json({ data: { name, value: String(value) } });
  } catch (err) { next(err); }
});

// =====================================================================
// AUDIT LOG VIEWER (read-only)
// =====================================================================

router.get('/audit-logs', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    const logs = await db('AuditLogs')
      .orderBy('CreatedAt', 'desc')
      .limit(limit)
      .offset(offset);
    const total = await db('AuditLogs').count('* as c').first();
    res.json({ data: logs, count: logs.length, total: total.c });
  } catch (err) { next(err); }
});

module.exports = router;
