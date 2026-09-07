// =====================================================================
// CustomerService.js — Service for Customer aggregate (FASE 3)
// =====================================================================

const { db } = require('../../infrastructure/db/db');
const { Customer } = require('../../domain/Customer');
const {
  NotFoundError, ConflictError, ValidationError,
} = require('../middleware/errorHandler');

/**
 * List customers with optional filters.
 */
async function listCustomers({ search = null, activeOnly = true, limit = 50, offset = 0 } = {}) {
  const q = db('Customers');
  if (activeOnly) q.where({ IsActive: 1 });
  if (search) {
    q.where(function () {
      this.where('Name', 'like', `%${search}%`)
          .orWhere('Code', 'like', `%${search}%`)
          .orWhere('Phone', 'like', `%${search}%`)
          .orWhere('Email', 'like', `%${search}%`);
    });
  }
  q.orderBy('Name', 'asc').limit(limit).offset(offset);
  const rows = await q;
  return rows.map(r => new Customer(r));
}

async function getCustomerById(id) {
  const row = await db('Customers').where({ Id: id }).first();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  return new Customer(row);
}

async function createCustomer({ name, code, phone, email, address, taxId, accountBalance = 0 }) {
  const c = new Customer({
    Name: name, Code: code, Phone: phone, Email: email,
    Address: address, TaxId: taxId, AccountBalance: accountBalance,
  });
  c.validate();
  // Check Code uniqueness if present
  if (code) {
    const existing = await db('Customers').where({ Code: code }).first();
    if (existing) throw new ConflictError(`Customer code '${code}' already exists`);
  }
  const [id] = await db('Customers').insert({
    Name: c.Name, Code: c.Code, Phone: c.Phone, Email: c.Email,
    Address: c.Address, TaxId: c.TaxId, AccountBalance: c.AccountBalance,
    IsActive: 1,
  });
  return getCustomerById(id);
}

async function updateCustomer(id, updates) {
  const row = await db('Customers').where({ Id: id }).first();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  const c = new Customer({ ...row, ...updates });
  c.validate();
  await db('Customers').where({ Id: id }).update({
    Name: c.Name, Code: c.Code, Phone: c.Phone, Email: c.Email,
    Address: c.Address, TaxId: c.TaxId,
    UpdatedAt: new Date().toISOString(),
  });
  return getCustomerById(id);
}

async function deactivateCustomer(id, reason = null) {
  const row = await db('Customers').where({ Id: id }).first();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  const c = new Customer(row);
  c.deactivate(reason);
  await db('Customers').where({ Id: id }).update({
    IsActive: 0,
    Notes: c.Notes,
    UpdatedAt: new Date().toISOString(),
  });
  return getCustomerById(id);
}

async function reactivateCustomer(id) {
  const row = await db('Customers').where({ Id: id }).first();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  const c = new Customer(row);
  c.reactivate();
  await db('Customers').where({ Id: id }).update({
    IsActive: 1,
    UpdatedAt: new Date().toISOString(),
  });
  return getCustomerById(id);
}

/**
 * Credit a customer's account.
 */
async function creditAccount(id, { amount, reason = null }) {
  const row = await db('Customers').where({ Id: id }).first();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  const c = new Customer(row);
  c.credit(amount, reason);
  await db('Customers').where({ Id: id }).update({
    AccountBalance: c.AccountBalance,
    UpdatedAt: new Date().toISOString(),
  });
  return c;
}

/**
 * Debit a customer's account (e.g. pay for a ticket with customer account).
 */
async function debitAccount(id, { amount, reason = null }) {
  const row = await db('Customers').where({ Id: id }).first();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  const c = new Customer(row);
  c.debit(amount, reason);
  await db('Customers').where({ Id: id }).update({
    AccountBalance: c.AccountBalance,
    UpdatedAt: new Date().toISOString(),
  });
  return c;
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  reactivateCustomer,
  creditAccount,
  debitAccount,
};
