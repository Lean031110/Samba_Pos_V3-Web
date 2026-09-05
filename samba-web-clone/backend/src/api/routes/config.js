// =====================================================================
// config.js — Configuration routes (DB-driven, no hardcoded IDs)
// =====================================================================
// Endpoints:
//   GET /api/calculation-types — list all calculation types (discounts, services, rounding)
//   GET /api/payment-types     — list all payment types
//   GET /api/departments       — list all departments
//   GET /api/ticket-types      — list all ticket types
//   GET /api/tax-templates     — list all tax templates
// =====================================================================

const express = require('express');
const { db } = require('../../infrastructure/db/db');

const router = express.Router();

// GET /api/calculation-types
router.get('/calculation-types', async (req, res, next) => {
  try {
    const types = await db('CalculationTypes')
      .leftJoin('AccountTransactionTypes', 'CalculationTypes.AccountTransactionTypeId', 'AccountTransactionTypes.Id')
      .select(
        'CalculationTypes.Id',
        'CalculationTypes.Name',
        'CalculationTypes.SortOrder',
        'CalculationTypes.CalculationMethod',
        'CalculationTypes.Amount',
        'CalculationTypes.MaxAmount',
        'CalculationTypes.IncludeTax',
        'CalculationTypes.DecreaseAmount',
        'CalculationTypes.UsePlainSum',
        'CalculationTypes.ToggleCalculation',
        'CalculationTypes.AccountTransactionTypeId'
      )
      .orderBy('CalculationTypes.SortOrder');
    res.json({ data: types, count: types.length });
  } catch (err) { next(err); }
});

// GET /api/payment-types
router.get('/payment-types', async (req, res, next) => {
  try {
    const types = await db('PaymentTypes')
      .leftJoin('AccountTransactionTypes', 'PaymentTypes.AccountTransactionTypeId', 'AccountTransactionTypes.Id')
      .leftJoin('Accounts', 'PaymentTypes.AccountId', 'Accounts.Id')
      .select(
        'PaymentTypes.Id',
        'PaymentTypes.Name',
        'PaymentTypes.SortOrder',
        'PaymentTypes.ButtonColor',
        'PaymentTypes.FontSize',
        'PaymentTypes.AccountTransactionTypeId',
        'PaymentTypes.AccountId',
        'AccountTransactionTypes.Name as AccountTransactionTypeName',
        'Accounts.Name as AccountName'
      )
      .orderBy('PaymentTypes.SortOrder');
    res.json({ data: types, count: types.length });
  } catch (err) { next(err); }
});

// GET /api/departments
router.get('/departments', async (req, res, next) => {
  try {
    const depts = await db('Departments')
      .leftJoin('Warehouses', 'Departments.WarehouseId', 'Warehouses.Id')
      .leftJoin('TicketTypes', 'Departments.TicketTypeId', 'TicketTypes.Id')
      .leftJoin('ScreenMenus', 'Departments.ScreenMenuId', 'ScreenMenus.Id')
      .select(
        'Departments.Id',
        'Departments.Name',
        'Departments.SortOrder',
        'Departments.PriceTag',
        'Departments.WarehouseId',
        'Departments.TicketTypeId',
        'Departments.ScreenMenuId',
        'Departments.TicketCreationMethod',
        'Warehouses.Name as WarehouseName',
        'TicketTypes.Name as TicketTypeName',
        'ScreenMenus.Name as ScreenMenuName'
      )
      .orderBy('Departments.SortOrder');
    res.json({ data: depts, count: depts.length });
  } catch (err) { next(err); }
});

// GET /api/ticket-types
router.get('/ticket-types', async (req, res, next) => {
  try {
    const types = await db('TicketTypes')
      .select('Id', 'Name', 'SortOrder', 'ScreenMenuId', 'TaxIncluded',
              'TicketNumeratorId', 'OrderNumeratorId', 'SaleTransactionTypeId')
      .orderBy('SortOrder');
    res.json({ data: types, count: types.length });
  } catch (err) { next(err); }
});

// GET /api/tax-templates
router.get('/tax-templates', async (req, res, next) => {
  try {
    const templates = await db('TaxTemplates')
      .select('Id', 'Name', 'SortOrder', 'Rate', 'Rounding', 'AccountTransactionTypeId')
      .orderBy('SortOrder');
    res.json({ data: templates, count: templates.length });
  } catch (err) { next(err); }
});

module.exports = router;
