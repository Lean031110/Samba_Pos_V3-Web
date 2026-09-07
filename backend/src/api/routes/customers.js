// =====================================================================
// customers.js — Routes for Customer aggregate (FASE 3)
// =====================================================================
// Endpoints:
//   GET    /api/customers                 — list (with search=, active=, limit=, offset=)
//   GET    /api/customers/:id             — get by ID
//   POST   /api/customers                 — create
//   PATCH  /api/customers/:id             — update
//   POST   /api/customers/:id/deactivate  — soft-delete
//   POST   /api/customers/:id/reactivate  — restore
//   POST   /api/customers/:id/credit      — add to account balance
//   POST   /api/customers/:id/debit       — subtract from account balance
// =====================================================================

const express = require('express');
const { z } = require('zod');
const customerService = require('../services/CustomerService');
const { requirePermission } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLog');
const { ValidationError } = require('../middleware/errorHandler');

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? ` (at ${first.path.join('.')})` : '';
    throw new ValidationError(`${first.message}${path}`);
  }
  return result.data;
}

const router = express.Router();

const listQuerySchema = z.object({
  search: z.string().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).optional().default('true'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(64).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  taxId: z.string().max(64).optional(),
  accountBalance: z.number().nonnegative().optional().default(0),
}).strict();

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().max(64).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  taxId: z.string().max(64).optional(),
}).strict();

const amountSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().max(500).optional(),
}).strict();

const deactivateSchema = z.object({
  reason: z.string().max(500).optional(),
}).strict();

// GET /api/customers — list (requires pos.login)
router.get('/', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const parsed = parseOrThrow(listQuerySchema, req.query || {});
    const customers = await customerService.listCustomers({
      search: parsed.search,
      activeOnly: parsed.active === 'true',
      limit: parsed.limit,
      offset: parsed.offset,
    });
    res.json({ data: customers.map(c => c.toRow()), count: customers.length });
  } catch (err) { next(err); }
});

// GET /api/customers/:id — get by ID
router.get('/:id', requirePermission('pos.login'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const c = await customerService.getCustomerById(id);
    res.json({ data: c.toRow() });
  } catch (err) { next(err); }
});

// POST /api/customers — create
router.post('/', requirePermission('manage.users'), auditLog('customer.create', 'Customer'), async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createSchema, req.body || {});
    const c = await customerService.createCustomer(parsed);
    res.status(201).json({ data: c.toRow() });
  } catch (err) { next(err); }
});

// PATCH /api/customers/:id — update
router.patch('/:id', requirePermission('manage.users'), auditLog('customer.update', 'Customer'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const parsed = parseOrThrow(updateSchema, req.body || {});
    const c = await customerService.updateCustomer(id, parsed);
    res.json({ data: c.toRow() });
  } catch (err) { next(err); }
});

// POST /api/customers/:id/deactivate
router.post('/:id/deactivate', requirePermission('manage.users'), auditLog('customer.deactivate', 'Customer'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { reason } = parseOrThrow(deactivateSchema, req.body || {});
    const c = await customerService.deactivateCustomer(id, reason);
    res.json({ data: c.toRow() });
  } catch (err) { next(err); }
});

// POST /api/customers/:id/reactivate
router.post('/:id/reactivate', requirePermission('manage.users'), auditLog('customer.reactivate', 'Customer'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const c = await customerService.reactivateCustomer(id);
    res.json({ data: c.toRow() });
  } catch (err) { next(err); }
});

// POST /api/customers/:id/credit
router.post('/:id/credit', requirePermission('manage.users'), auditLog('customer.credit', 'Customer'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { amount, reason } = parseOrThrow(amountSchema, req.body || {});
    const c = await customerService.creditAccount(id, { amount, reason });
    res.json({ data: c.toRow() });
  } catch (err) { next(err); }
});

// POST /api/customers/:id/debit
router.post('/:id/debit', requirePermission('manage.users'), auditLog('customer.debit', 'Customer'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('id must be a positive integer');
    const { amount, reason } = parseOrThrow(amountSchema, req.body || {});
    const c = await customerService.debitAccount(id, { amount, reason });
    res.json({ data: c.toRow() });
  } catch (err) { next(err); }
});

module.exports = router;
