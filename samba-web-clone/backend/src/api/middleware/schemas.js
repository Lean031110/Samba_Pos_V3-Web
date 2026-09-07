// =====================================================================
// schemas.js — Zod schemas for request validation
// =====================================================================
// Centralized validation for all critical endpoints. Every write to the
// domain layer MUST pass through these schemas to:
//   1. Reject malformed payloads with a 400 (not a 500)
//   2. Prevent NoSQL-style / type-confusion attacks
//   3. Document the API contract in a single source of truth
//
// Usage in a route handler:
//   const { loginSchema, parseOrThrow } = require('../middleware/schemas');
//   const parsed = parseOrThrow(loginSchema, req.body);
//   // parsed is now strongly typed
// =====================================================================

const { z } = require('zod');
const { ValidationError } = require('./errorHandler');

/**
 * Parse a body against a Zod schema. Throws ValidationError on failure so
 * the Express error handler returns 400 with a clear message.
 */
function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? ` (at ${first.path.join('.')})` : '';
    throw new ValidationError(`${first.message}${path}`);
  }
  return result.data;
}

// --- Common building blocks ---
const positiveInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();
const nonNegNum = z.number().nonnegative();
const string1to255 = z.string().min(1).max(255);

// --- Auth ---
const loginSchema = z.object({
  username: string1to255,
  pin: z.union([
    z.string().min(1).max(64),   // PIN can be string of any length (rate-limited)
    z.number().int().min(0).max(99999999).transform(n => String(n)),
  ]),
}).strict();

// --- Tickets ---
const createTicketSchema = z.object({
  departmentId: positiveInt.optional(),
  ticketTypeId: positiveInt.optional(),
  tableId: positiveInt.optional(),
  terminalId: nonNegInt.optional(),
  note: z.string().max(2000).optional(),
}).strict();

const addOrderSchema = z.object({
  orders: z.array(z.object({
    menuItemId: positiveInt,
    portionId: positiveInt.optional(),
    quantity: z.number().gt(0).max(9999),
    price: nonNegNum.optional(),
    tags: z.array(string1to255).max(20).optional(),
    note: z.string().max(500).optional(),
    calculatePrice: z.boolean().optional(),
  })).min(1).max(500),
}).strict();

const addCalculationSchema = z.object({
  calculationTypeId: positiveInt,
  amount: nonNegNum.optional(),
  applyTo: z.enum(['all', 'selected']).optional(),
  orderIds: z.array(positiveInt).max(500).optional(),
}).strict();

const addPaymentSchema = z.object({
  paymentTypeId: positiveInt,
  amount: nonNegNum,
  // Optional idempotency key — required in Phase 2 for true idempotency
  idempotencyKey: z.string().min(8).max(128).optional(),
}).strict();

const closeTicketSchema = z.object({
  expectedVersion: nonNegInt.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).strict();

const voidTicketSchema = z.object({
  reason: z.string().min(1).max(500),
  expectedVersion: nonNegInt.optional(),
}).strict();

const refundTicketSchema = z.object({
  amount: nonNegNum,
  reason: z.string().min(1).max(500),
  paymentTypeId: positiveInt.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).strict();

const splitTicketSchema = z.object({
  orderIds: z.array(positiveInt).min(1).max(100),
  targetTicketId: positiveInt.optional(),
}).strict();

const mergeTicketsSchema = z.object({
  sourceTicketIds: z.array(positiveInt).min(2).max(20),
  targetTicketId: positiveInt.optional(),
}).strict();

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
}).strict();

const giftSchema = z.object({
  orderIds: z.array(positiveInt).min(1).max(100).optional(),
  reason: z.string().max(500).optional(),
}).strict();

const tagsSchema = z.object({
  tags: z.array(z.object({
    name: z.string().min(1).max(255),
    value: z.string().max(1000).optional(),
  })).min(1).max(20),
}).strict();

// --- Inventory ---
const ingredientCreateSchema = z.object({
  name: string1to255,
  code: z.string().max(64).optional(),
  groupCode: z.string().max(64).optional(),
  baseUnitId: positiveInt,
  minimumStock: nonNegNum.optional(),
  costPerUnit: nonNegNum.optional(),
}).strict();

const recipeSaveSchema = z.object({
  items: z.array(z.object({
    ingredientId: positiveInt,
    quantity: nonNegNum,
    unitId: positiveInt.optional(),
  })).min(0).max(200),
}).strict();

const stockMovementSchema = z.object({
  warehouseId: positiveInt,
  ingredientId: positiveInt,
  quantity: z.number(), // can be negative for adjustments / consumption
  movementType: z.enum(['purchase', 'adjustment', 'waste', 'transfer_in', 'transfer_out', 'consumption']),
  reason: z.string().max(500).optional(),
  ref: z.string().max(128).optional(),
}).strict();

// --- Printers ---
const printerCreateSchema = z.object({
  name: string1to255,
  shareName: z.string().min(1).max(255),  // host:port for TCP
  printerType: z.number().int().min(0).max(10).optional(),
  codePage: z.number().int().min(0).max(65535).optional(),
  charsPerLine: z.number().int().min(1).max(255).optional(),
}).strict();

// --- Kitchen ---
const kitchenStateSchema = z.object({
  state: z.enum(['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'VOIDED']),
  expectedVersion: nonNegInt.optional(),
}).strict();

const kitchenVersionedSchema = z.object({
  expectedVersion: nonNegInt.optional(),
}).strict();

module.exports = {
  parseOrThrow,
  // Auth
  loginSchema,
  // Tickets
  createTicketSchema,
  addOrderSchema,
  addCalculationSchema,
  addPaymentSchema,
  closeTicketSchema,
  voidTicketSchema,
  refundTicketSchema,
  splitTicketSchema,
  mergeTicketsSchema,
  noteSchema,
  giftSchema,
  tagsSchema,
  // Inventory
  ingredientCreateSchema,
  recipeSaveSchema,
  stockMovementSchema,
  // Printers
  printerCreateSchema,
  // Kitchen
  kitchenStateSchema,
  kitchenVersionedSchema,
};
