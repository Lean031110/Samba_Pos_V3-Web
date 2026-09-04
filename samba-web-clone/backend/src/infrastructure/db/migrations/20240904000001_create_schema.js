// =====================================================================
// Migration 20240904000001_create_schema.js
// =====================================================================
// Creates the entire SambaPOS V3 schema (96 tables) in a single
// migration, in topological order (parents before children).
//
// Per Architect's directive:
//   * Id INTEGER PRIMARY KEY AUTOINCREMENT  (simple PK)
//   * UNIQUE(Id, ParentId) for tables that originally had composite PK
//   * INDEX on every FK column
//   * All FKs explicit (no EF shadow columns)
//   * Type mapping: TEXT for nvarchar, NUMERIC(16,2/3) for decimals,
//     INTEGER for bit/int, TEXT (ISO8601) for datetime
// =====================================================================

/**
 * @param {import('knex').Knex} knex
 * @param {boolean} isSQLite
 */
async function up(knex) {
  const isSQLite = knex.client.config.client === 'sqlite3';

  // Helper: create a table with the standard audit columns
  const createTable = async (name, builder) => {
    await knex.schema.createTable(name, (table) => {
      table.increments('Id').primary();
      builder(table);
    });
  };

  // -----------------------------------------------------------------
  // 1. Lookup tables (no FK dependencies)
  // -----------------------------------------------------------------
  await createTable('WarehouseTypes', (t) => {
    t.text('Name');
  });

  await createTable('AccountTypes', (t) => {
    t.text('Name');
    t.integer('DefaultFilterType').notNullable().defaultTo(0);
    t.integer('WorkingRule').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.text('Tags');
  });

  await createTable('UserRoles', (t) => {
    t.text('Name');
    t.integer('IsAdmin').notNullable().defaultTo(0);
    t.integer('DepartmentId').notNullable().defaultTo(0);
  });

  await createTable('WorkPeriods', (t) => {
    t.text('Name');
    t.text('StartDate').notNullable();
    t.text('EndDate').notNullable();
    t.text('StartDescription');
    t.text('EndDescription');
  });

  await createTable('ForeignCurrencies', (t) => {
    t.text('Name');
    t.text('CurrencySymbol');
    t.decimal('ExchangeRate', 18, 2).notNullable().defaultTo(1);
    t.decimal('Rounding', 18, 2).notNullable().defaultTo(0);
  });

  await createTable('Triggers', (t) => {
    t.text('Name');
    t.text('Expression');
    t.text('LastTrigger').notNullable();
  });

  await createTable('ProgramSettings', (t) => {
    t.text('Name');
    t.text('Value');
  });

  await createTable('Numerators', (t) => {
    t.text('Name');
    t.binary('LastUpdateTime'); // rowversion / binary(8)
    t.integer('Number').notNullable().defaultTo(0);
    t.text('NumberFormat');
  });

  await createTable('TaskTypes', (t) => {
    t.text('Name');
  });

  await createTable('States', (t) => {
    t.text('Name');
    t.text('GroupName');
    t.integer('StateType').notNullable().defaultTo(0); // 0=Entity, 1=Ticket, 2=Order
    t.text('Color');
    t.integer('ShowOnEndOfDayReport').notNullable().defaultTo(0);
    t.integer('ShowOnProductReport').notNullable().defaultTo(0);
    t.integer('ShowOnTicket').notNullable().defaultTo(0);
  });

  await createTable('AppActions', (t) => {
    t.text('Name');
    t.text('ActionType');
    t.text('Parameter');
    t.integer('SortOrder').notNullable().defaultTo(0);
  });

  await createTable('Scripts', (t) => {
    t.text('Name');
    t.text('HandlerName');
    t.text('Code');
  });

  await createTable('EntityTypes', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.text('EntityName');
    t.integer('AccountTypeId').notNullable().defaultTo(0);
    t.integer('WarehouseTypeId').notNullable().defaultTo(0);
    t.text('AccountNameTemplate');
    t.text('PrimaryFieldName');
    t.text('PrimaryFieldFormat');
    t.text('DisplayFormat');
    t.text('AccountBalanceDisplayFormat');
  });

  await createTable('TicketTypes', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('ScreenMenuId').notNullable().defaultTo(0);
    t.integer('TaxIncluded').notNullable().defaultTo(1);
    t.integer('TicketNumeratorId').notNullable().defaultTo(0);
    t.integer('OrderNumeratorId').notNullable().defaultTo(0);
    t.integer('SaleTransactionTypeId').notNullable().defaultTo(0);
  });

  await createTable('MenuItemPriceDefinitions', (t) => {
    t.text('Name');
    t.text('PriceTag');
  });

  await createTable('ScreenMenus', (t) => {
    t.text('Name');
    t.integer('CategoryColumnCount').notNullable().defaultTo(1);
    t.integer('CategoryColumnWidthRate').notNullable().defaultTo(25);
  });

  await createTable('TaxTemplates', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.decimal('Rate', 16, 2).notNullable().defaultTo(0);
    t.integer('Rounding').notNullable().defaultTo(0);
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
  });

  await createTable('InventoryItems', (t) => {
    t.text('Name');
    t.text('GroupCode');
    t.text('BaseUnit');
    t.text('TransactionUnit');
    t.integer('TransactionUnitMultiplier').notNullable().defaultTo(1);
    t.text('Warehouse');
  });

  await createTable('InventoryTransactionTypes', (t) => {
    t.text('Name');
    t.integer('SourceWarehouseTypeId').notNullable().defaultTo(0);
    t.integer('TargetWarehouseTypeId').notNullable().defaultTo(0);
    t.integer('DefaultSourceWarehouseId').notNullable().defaultTo(0);
    t.integer('DefaultTargetWarehouseId').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
  });

  await createTable('AccountTransactionTypes', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('SourceAccountTypeId').notNullable().defaultTo(0);
    t.integer('TargetAccountTypeId').notNullable().defaultTo(0);
    t.integer('DefaultSourceAccountId').notNullable().defaultTo(0);
    t.integer('DefaultTargetAccountId').notNullable().defaultTo(0);
    t.integer('ForeignCurrencyId').notNullable().defaultTo(0);
  });

  await createTable('AccountTransactionDocumentTypes', (t) => {
    t.text('Name');
    t.text('ButtonHeader');
    t.text('ButtonColor');
    t.integer('MasterAccountTypeId').notNullable().defaultTo(0);
    t.text('DefaultAmount');
    t.text('DescriptionTemplate');
    t.text('ExchangeTemplate');
    t.integer('BatchCreateDocuments').notNullable().defaultTo(0);
    t.integer('Filter').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('PrinterTemplateId').notNullable().defaultTo(0);
  });

  await createTable('Printers', (t) => {
    t.text('Name');
    t.text('ShareName');
    t.integer('PrinterType').notNullable().defaultTo(0);
    t.integer('CodePage').notNullable().defaultTo(857);
    t.integer('CharsPerLine').notNullable().defaultTo(42);
    t.integer('PageHeight').notNullable().defaultTo(0);
    t.text('CustomPrinterName');
    t.text('CustomPrinterData');
  });

  await createTable('PrinterTemplates', (t) => {
    t.text('Name');
    t.text('Template');
    t.integer('MergeLines').notNullable().defaultTo(0);
  });

  await createTable('PrintJobs', (t) => {
    t.text('Name');
    t.integer('WhatToPrint').notNullable().defaultTo(0);
    t.integer('UseForPaidTickets').notNullable().defaultTo(0);
    t.integer('ExcludeTax').notNullable().defaultTo(0);
  });

  await createTable('Terminals', (t) => {
    t.text('Name');
    t.integer('IsDefault').notNullable().defaultTo(0);
    t.integer('AutoLogout').notNullable().defaultTo(0);
    t.integer('ReportPrinterId').notNullable().defaultTo(0);
    t.integer('TransactionPrinterId').notNullable().defaultTo(0);
  });

  await createTable('Warehouses', (t) => {
    t.text('Name');
    t.integer('WarehouseTypeId').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.foreign('WarehouseTypeId').references('WarehouseTypes.Id');
  });

  await createTable('Departments', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.text('PriceTag');
    t.integer('WarehouseId').notNullable().defaultTo(0);
    t.integer('TicketTypeId').notNullable().defaultTo(0);
    t.integer('ScreenMenuId').notNullable().defaultTo(0);
    t.integer('TicketCreationMethod').notNullable().defaultTo(0);
    t.foreign('WarehouseId').references('Warehouses.Id');
    t.foreign('TicketTypeId').references('TicketTypes.Id');
    t.foreign('ScreenMenuId').references('ScreenMenus.Id');
  });

  await createTable('Users', (t) => {
    t.text('Name');
    t.text('PinCode');
    t.integer('UserRoleId');
    t.foreign('UserRoleId').references('UserRoles.Id');
  });

  await createTable('Permissions', (t) => {
    t.text('Name');
    t.integer('Value').notNullable().defaultTo(0);
    t.integer('UserRoleId').notNullable();
    t.foreign('UserRoleId').references('UserRoles.Id').onDelete('CASCADE');
  });

  await createTable('Accounts', (t) => {
    t.text('Name');
    t.integer('AccountTypeId').notNullable();
    t.integer('ForeignCurrencyId').notNullable().defaultTo(0);
    t.foreign('AccountTypeId').references('AccountTypes.Id').onDelete('CASCADE');
  });

  await createTable('AccountScreens', (t) => {
    t.text('Name');
    t.integer('Filter').notNullable().defaultTo(0);
    t.integer('DisplayAsTree').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.text('AutomationCommandMapData');
  });

  await createTable('MenuItems', (t) => {
    t.text('Name');
    t.text('GroupCode');
    t.text('Barcode');
    t.text('Tag');
  });

  await createTable('CalculationTypes', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('CalculationMethod').notNullable().defaultTo(0);
    t.decimal('Amount', 16, 2).notNullable().defaultTo(0);
    t.decimal('MaxAmount', 16, 2).notNullable().defaultTo(0);
    t.integer('IncludeTax').notNullable().defaultTo(0);
    t.integer('DecreaseAmount').notNullable().defaultTo(0);
    t.integer('UsePlainSum').notNullable().defaultTo(0);
    t.integer('ToggleCalculation').notNullable().defaultTo(0);
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
    t.foreign('AccountTransactionTypeId').references('AccountTransactionTypes.Id');
  });

  await createTable('CalculationSelectors', (t) => {
    t.text('Name');
    t.text('ButtonHeader');
    t.text('ButtonColor');
    t.integer('FontSize').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
  });

  await createTable('PaymentTypes', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.text('ButtonColor');
    t.integer('FontSize').notNullable().defaultTo(40);
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
    t.integer('AccountId');
    t.foreign('AccountTransactionTypeId').references('AccountTransactionTypes.Id');
    t.foreign('AccountId').references('Accounts.Id');
  });

  await createTable('ChangePaymentTypes', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
    t.integer('AccountId');
    t.foreign('AccountTransactionTypeId').references('AccountTransactionTypes.Id');
    t.foreign('AccountId').references('Accounts.Id');
  });

  await createTable('OrderTagGroups', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('ColumnCount').notNullable().defaultTo(0);
    t.integer('ButtonHeight').notNullable().defaultTo(0);
    t.integer('FontSize').notNullable().defaultTo(0);
    t.text('ButtonColor');
    t.integer('MaxSelectedItems').notNullable().defaultTo(0);
    t.integer('MinSelectedItems').notNullable().defaultTo(0);
    t.integer('AddTagPriceToOrderPrice').notNullable().defaultTo(0);
    t.integer('FreeTagging').notNullable().defaultTo(0);
    t.integer('SaveFreeTags').notNullable().defaultTo(0);
    t.text('GroupTag');
    t.integer('TaxFree').notNullable().defaultTo(0);
    t.integer('Hidden').notNullable().defaultTo(0);
  });

  await createTable('TicketTagGroups', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('FreeTagging').notNullable().defaultTo(0);
    t.integer('SaveFreeTags').notNullable().defaultTo(0);
    t.text('ButtonColorWhenTagSelected');
    t.text('ButtonColorWhenNoTagSelected');
    t.integer('ForceValue').notNullable().defaultTo(0);
    t.integer('AskBeforeCreatingTicket').notNullable().defaultTo(0);
    t.integer('DataType').notNullable().defaultTo(0);
  });

  await createTable('ProductTimers', (t) => {
    t.text('Name');
    t.integer('PriceType').notNullable().defaultTo(0);
    t.decimal('PriceDuration', 16, 2).notNullable().defaultTo(1);
    t.decimal('MinTime', 16, 2).notNullable().defaultTo(0);
    t.decimal('TimeRounding', 16, 2).notNullable().defaultTo(0);
    t.integer('StartTime').notNullable().defaultTo(0);
  });

  await createTable('AutomationCommands', (t) => {
    t.text('Name');
    t.text('ButtonHeader');
    t.text('Color');
    t.integer('FontSize').notNullable().defaultTo(30);
    t.text('Values');
    t.integer('ToggleValues').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
  });

  await createTable('AppRules', (t) => {
    t.text('Name');
    t.text('EventName');
    t.text('EventConstraints');
    t.text('CustomConstraint');
    t.text('RuleConstraints');
    t.integer('ConstraintMatch').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
  });

  await createTable('InventoryTransactionDocumentTypes', (t) => {
    t.text('Name');
    t.integer('SourceEntityTypeId').notNullable().defaultTo(0);
    t.integer('TargetEntityTypeId').notNullable().defaultTo(0);
    t.integer('DefaultSourceEntityId').notNullable().defaultTo(0);
    t.integer('DefaultTargetEntityId').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('AccountTransactionTypeId');   // nullable: seed allows 0/null when not linked to a txn type
    t.integer('InventoryTransactionTypeId'); // nullable for same reason
    t.foreign('AccountTransactionTypeId').references('AccountTransactionTypes.Id');
    t.foreign('InventoryTransactionTypeId').references('InventoryTransactionTypes.Id');
  });

  await createTable('EntityScreens', (t) => {
    t.text('Name');
    t.integer('TicketTypeId').notNullable().defaultTo(0);
    t.integer('EntityTypeId').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('DisplayMode').notNullable().defaultTo(0);
    t.text('BackgroundColor');
    t.text('BackgroundImage');
    t.integer('FontSize').notNullable().defaultTo(50);
    t.integer('PageCount').notNullable().defaultTo(0);
    t.integer('RowCount').notNullable().defaultTo(0);
    t.integer('ColumnCount').notNullable().defaultTo(0);
    t.integer('ButtonHeight').notNullable().defaultTo(0);
    t.text('DisplayState');
    t.text('StateFilter');
    t.integer('AskTicketType').notNullable().defaultTo(0);
    t.text('SearchValueReplacePattern');
  });

  await createTable('MenuItemPortions', (t) => {
    t.text('Name');
    t.integer('MenuItemId').notNullable();
    t.integer('Multiplier').notNullable().defaultTo(1);
    t.foreign('MenuItemId').references('MenuItems.Id').onDelete('CASCADE');
  });

  await createTable('ScreenMenuCategories', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('ScreenMenuId').notNullable();
    t.integer('MostUsedItemsCategory').notNullable().defaultTo(0);
    t.integer('ColumnCount').notNullable().defaultTo(0);
    t.integer('MenuItemButtonHeight').notNullable().defaultTo(0);
    t.text('MenuItemButtonColor');
    t.float('MenuItemFontSize').notNullable().defaultTo(0);
    t.integer('WrapText').notNullable().defaultTo(0);
    t.integer('PageCount').notNullable().defaultTo(0);
    t.integer('MainButtonHeight').notNullable().defaultTo(0);
    t.text('MainButtonColor');
    t.float('MainFontSize').notNullable().defaultTo(0);
    t.integer('SubButtonHeight').notNullable().defaultTo(0);
    t.integer('SubButtonRows').notNullable().defaultTo(1);
    t.text('SubButtonColorDef');
    t.integer('NumeratorType').notNullable().defaultTo(0);
    t.text('NumeratorValues');
    t.text('AlphaButtonValues');
    t.text('ImagePath');
    t.integer('MaxItems').notNullable().defaultTo(0);
    t.foreign('ScreenMenuId').references('ScreenMenus.Id').onDelete('CASCADE');
  });

  await createTable('OrderTags', (t) => {
    t.text('Name');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('OrderTagGroupId').notNullable();
    t.decimal('Price', 16, 2).notNullable().defaultTo(0);
    t.integer('MenuItemId').notNullable().defaultTo(0);
    t.integer('MaxQuantity').notNullable().defaultTo(1);
    t.foreign('OrderTagGroupId').references('OrderTagGroups.Id').onDelete('CASCADE');
  });

  await createTable('TicketTags', (t) => {
    t.text('Name');
    t.integer('TicketTagGroupId').notNullable();
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.foreign('TicketTagGroupId').references('TicketTagGroups.Id').onDelete('CASCADE');
  });

  await createTable('AccountTransactionDocuments', (t) => {
    t.text('Name');
    t.text('Date').notNullable();
    t.integer('DocumentTypeId').notNullable().defaultTo(0);
  });

  await createTable('Entities', (t) => {
    t.text('Name');
    t.integer('EntityTypeId').notNullable();
    t.text('LastUpdateTime').notNullable();
    t.text('SearchString');
    t.text('CustomData');
    t.integer('AccountId').notNullable().defaultTo(0);
    t.integer('WarehouseId').notNullable().defaultTo(0);
    t.foreign('EntityTypeId').references('EntityTypes.Id').onDelete('CASCADE');
  });

  await createTable('EntityCustomFields', (t) => {
    t.text('Name');
    t.integer('FieldType').notNullable().defaultTo(0);
    t.text('EditingFormat');
    t.text('ValueSource');
    t.integer('Hidden').notNullable().defaultTo(0);
    t.integer('EntityTypeId');
    t.foreign('EntityTypeId').references('EntityTypes.Id');
  });

  await createTable('ProductTimerValues', (t) => {
    t.integer('ProductTimerId').notNullable().defaultTo(0);
    t.integer('PriceType').notNullable().defaultTo(0);
    t.decimal('PriceDuration', 16, 2).notNullable().defaultTo(1);
    t.decimal('MinTime', 16, 2).notNullable().defaultTo(0);
    t.decimal('TimeRounding', 16, 2).notNullable().defaultTo(0);
    t.text('Start').notNullable();
    t.text('End').notNullable();
  });

  await createTable('Recipes', (t) => {
    t.text('Name');
    t.decimal('FixedCost', 16, 2).notNullable().defaultTo(0);
    t.integer('PortionId');
    t.foreign('PortionId').references('MenuItemPortions.Id');
  });

  await createTable('InventoryTransactionsDocuments', (t) => {
    t.text('Name');
    t.text('Date').notNullable();
  });

  await createTable('PeriodicConsumptions', (t) => {
    t.text('Name');
    t.integer('WorkPeriodId').notNullable().defaultTo(0);
    t.text('StartDate').notNullable();
    t.text('EndDate').notNullable();
    t.text('LastUpdateTime').notNullable();
  });

  await createTable('Tasks', (t) => {
    t.text('Name');
    t.integer('TaskTypeId').notNullable();
    t.text('Content');
    t.text('StartDate').notNullable();
    t.text('EndDate').notNullable();
    t.text('CustomData');
    t.integer('Completed').notNullable().defaultTo(0);
    t.text('LastUpdateTime').notNullable();
    t.foreign('TaskTypeId').references('TaskTypes.Id').onDelete('CASCADE');
  });

  await createTable('ActionContainers', (t) => {
    t.text('Name');
    t.integer('AppActionId').notNullable();
    t.integer('AppRuleId').notNullable();
    t.text('ParameterValues');
    t.text('CustomConstraint');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.foreign('AppActionId').references('AppActions.Id');
    t.foreign('AppRuleId').references('AppRules.Id').onDelete('CASCADE');
  });

  // -----------------------------------------------------------------
  // 2. Tickets (the heart of the system) — needs TransactionDocument first
  // -----------------------------------------------------------------
  await createTable('Tickets', (t) => {
    t.text('Name');
    t.text('LastUpdateTime').notNullable();
    t.text('TicketNumber');
    t.text('Date').notNullable();
    t.text('LastOrderDate').notNullable();
    t.text('LastPaymentDate').notNullable();
    t.integer('IsClosed').notNullable().defaultTo(0);
    t.integer('IsLocked').notNullable().defaultTo(0);
    t.decimal('RemainingAmount', 16, 2).notNullable().defaultTo(0);
    t.decimal('TotalAmount', 16, 2).notNullable().defaultTo(0);
    t.integer('DepartmentId').notNullable().defaultTo(0);
    t.integer('TicketTypeId').notNullable().defaultTo(0);
    t.text('Note');
    t.text('LastModifiedUserName');
    t.text('TicketTags');
    t.text('TicketStates');
    t.text('TicketLogs');
    t.decimal('ExchangeRate', 18, 2).notNullable().defaultTo(1);
    t.integer('TaxIncluded').notNullable().defaultTo(1);
    t.integer('TransactionDocumentId');   // nullable: ticket can exist without a document yet
    t.foreign('DepartmentId').references('Departments.Id');
    t.foreign('TicketTypeId').references('TicketTypes.Id');
    t.foreign('TransactionDocumentId').references('AccountTransactionDocuments.Id');
  });

  // -----------------------------------------------------------------
  // 3. Ticket children (composite Id+TicketId in original → simple Id + UNIQUE here)
  // -----------------------------------------------------------------
  await createTable('Orders', (t) => {
    t.integer('TicketId').notNullable();
    t.integer('WarehouseId').notNullable().defaultTo(0);
    t.integer('DepartmentId').notNullable().defaultTo(0);
    t.integer('MenuItemId').notNullable().defaultTo(0);
    t.text('MenuItemName');
    t.text('PortionName');
    t.decimal('Price', 16, 2).notNullable().defaultTo(0);
    t.decimal('Quantity', 16, 3).notNullable().defaultTo(0);
    t.integer('PortionCount').notNullable().defaultTo(0);
    t.integer('Locked').notNullable().defaultTo(0);
    t.integer('CalculatePrice').notNullable().defaultTo(1);
    t.integer('DecreaseInventory').notNullable().defaultTo(0);
    t.integer('IncreaseInventory').notNullable().defaultTo(0);
    t.integer('OrderNumber').notNullable().defaultTo(0);
    t.text('CreatingUserName');
    t.text('CreatedDateTime').notNullable();
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
    t.integer('ProductTimerValueId');
    t.text('PriceTag');
    t.text('Tag');
    t.text('Taxes');
    t.text('OrderTags');
    t.text('OrderStates');
    t.unique(['Id', 'TicketId']);
    t.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
    t.foreign('MenuItemId').references('MenuItems.Id');
    t.foreign('AccountTransactionTypeId').references('AccountTransactionTypes.Id');
  });

  await createTable('Payments', (t) => {
    t.integer('PaymentTypeId').notNullable().defaultTo(0);
    t.integer('TicketId').notNullable();
    t.text('Name');
    t.text('Date').notNullable();
    t.integer('AccountTransactionId').notNullable().defaultTo(0);
    t.decimal('Amount', 16, 2).notNullable().defaultTo(0);
    t.integer('UserId').notNullable().defaultTo(0);
    t.unique(['Id', 'TicketId']);
    t.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
    t.foreign('PaymentTypeId').references('PaymentTypes.Id');
  });

  await createTable('ChangePayments', (t) => {
    t.integer('ChangePaymentTypeId').notNullable().defaultTo(0);
    t.integer('TicketId').notNullable();
    t.text('Name');
    t.text('Date').notNullable();
    t.integer('AccountTransactionId').notNullable().defaultTo(0);
    t.decimal('Amount', 16, 2).notNullable().defaultTo(0);
    t.integer('UserId').notNullable().defaultTo(0);
    t.unique(['Id', 'TicketId']);
    t.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
    t.foreign('ChangePaymentTypeId').references('ChangePaymentTypes.Id');
  });

  await createTable('Calculations', (t) => {
    t.text('Name');
    t.integer('Order').notNullable().defaultTo(0);
    t.integer('CalculationTypeId').notNullable().defaultTo(0);
    t.integer('TicketId').notNullable();
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
    t.integer('CalculationType').notNullable().defaultTo(0);
    t.integer('IncludeTax').notNullable().defaultTo(0);
    t.integer('DecreaseAmount').notNullable().defaultTo(0);
    t.integer('UsePlainSum').notNullable().defaultTo(0);
    t.decimal('Amount', 16, 2).notNullable().defaultTo(0);
    t.decimal('CalculationAmount', 16, 2).notNullable().defaultTo(0);
    t.unique(['Id', 'TicketId']);
    t.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
    t.foreign('CalculationTypeId').references('CalculationTypes.Id');
  });

  await createTable('PaidItems', (t) => {
    t.text('Key');
    t.decimal('Quantity', 16, 3).notNullable().defaultTo(0);
    t.integer('TicketId').notNullable();
    t.unique(['Id', 'TicketId']);
    t.foreign('TicketId').references('Tickets.Id').onDelete('CASCADE');
  });

  await createTable('TicketEntities', (t) => {
    t.integer('EntityTypeId').notNullable().defaultTo(0);
    t.integer('EntityId').notNullable().defaultTo(0);
    t.integer('AccountId').notNullable().defaultTo(0);
    t.integer('AccountTypeId').notNullable().defaultTo(0);
    t.text('EntityName');
    t.text('EntityCustomData');
    t.integer('TicketId');
    t.foreign('TicketId').references('Tickets.Id');
    t.foreign('EntityId').references('Entities.Id');
  });

  // -----------------------------------------------------------------
  // 4. AccountTransaction children (composite Id+DocumentId in original)
  // -----------------------------------------------------------------
  await createTable('AccountTransactions', (t) => {
    t.text('Name');
    t.decimal('Amount', 16, 2).notNullable().defaultTo(0);
    t.decimal('ExchangeRate', 16, 2).notNullable().defaultTo(1);
    t.integer('AccountTransactionDocumentId').notNullable();
    t.integer('AccountTransactionTypeId').notNullable().defaultTo(0);
    t.integer('SourceAccountTypeId').notNullable().defaultTo(0);
    t.integer('TargetAccountTypeId').notNullable().defaultTo(0);
    t.integer('IsReversed').notNullable().defaultTo(0);
    t.integer('Reversable').notNullable().defaultTo(1);
    t.unique(['Id', 'AccountTransactionDocumentId']);
    t.foreign('AccountTransactionDocumentId')
      .references('AccountTransactionDocuments.Id').onDelete('CASCADE');
    t.foreign('AccountTransactionTypeId').references('AccountTransactionTypes.Id');
  });

  await createTable('AccountTransactionValues', (t) => {
    t.text('Name');
    t.integer('AccountTypeId').notNullable().defaultTo(0);
    t.integer('AccountId').notNullable().defaultTo(0);
    t.text('Date').notNullable();
    t.decimal('Debit', 16, 2).notNullable().defaultTo(0);
    t.decimal('Credit', 16, 2).notNullable().defaultTo(0);
    t.decimal('Exchange', 16, 2).notNullable().defaultTo(0);
    t.integer('AccountTransactionId').notNullable();
    t.integer('AccountTransactionDocumentId').notNullable();
    t.unique(['Id', 'AccountTransactionId', 'AccountTransactionDocumentId']);
    // SQLite/Knex limitation: composite FKs aren't well supported via builder API.
    // AccountTransactions.Id is already a simple AUTOINCREMENT PK (unique by itself),
    // so a single-column FK is sufficient for integrity. We keep the UNIQUE constraint
    // above to preserve the original composite-key semantic.
    t.foreign('AccountTransactionId').references('AccountTransactions.Id').onDelete('CASCADE');
    t.foreign('AccountTransactionDocumentId').references('AccountTransactionDocuments.Id').onDelete('CASCADE');
  });

  // -----------------------------------------------------------------
  // 5. Map tables (Terminal/Department/UserRole/TicketType scoping)
  // -----------------------------------------------------------------
  const mapTables = [
    ['OrderTagMaps', 'OrderTagGroupId', 'OrderTagGroups'],
    ['TicketTagMaps', 'TicketTagGroupId', 'TicketTagGroups'],
    ['TaxTemplateMaps', 'TaxTemplateId', 'TaxTemplates'],
    ['ProductTimerMaps', 'ProductTimerId', 'ProductTimers'],
    ['PaymentTypeMaps', 'PaymentTypeId', 'PaymentTypes'],
    ['ChangePaymentTypeMaps', 'ChangePaymentTypeId', 'ChangePaymentTypes'],
    ['CalculationSelectorMaps', 'CalculationSelectorId', 'CalculationSelectors'],
    ['AppRuleMaps', 'AppRuleId', 'AppRules'],
    ['AutomationCommandMaps', 'AutomationCommandId', 'AutomationCommands'],
    ['AccountTransactionDocumentTypeMaps', 'AccountTransactionDocumentTypeId', 'AccountTransactionDocumentTypes'],
    ['EntityScreenMaps', 'EntityScreenId', 'EntityScreens'],
    // MenuAssignments + EntityTypeAssignments declare their own TicketTypeId FK
    // (with ON DELETE CASCADE) and skip the generic one above.
    ['MenuAssignments', null, 'TicketTypes'],
    ['EntityTypeAssignments', null, 'TicketTypes'],
  ];
  for (const [tbl, fkCol, refTbl] of mapTables) {
    await createTable(tbl, (t) => {
      t.integer('TerminalId').notNullable().defaultTo(0);
      t.integer('DepartmentId').notNullable().defaultTo(0);
      t.integer('UserRoleId').notNullable().defaultTo(0);
      // MenuAssignments and EntityTypeAssignments declare TicketTypeId themselves
      // (because they have an explicit FK with ON DELETE CASCADE).
      if (tbl !== 'MenuAssignments' && tbl !== 'EntityTypeAssignments') {
        t.integer('TicketTypeId').notNullable().defaultTo(0);
      }
      if (fkCol) {
        t.integer(fkCol).notNullable();
      }
      // Some maps have extra columns:
      if (tbl === 'OrderTagMaps' || tbl === 'TaxTemplateMaps' || tbl === 'ProductTimerMaps') {
        t.text('MenuItemGroupCode');
        t.integer('MenuItemId').notNullable().defaultTo(0);
      }
      if (tbl === 'AutomationCommandMaps') {
        t.integer('DisplayOnTicket').notNullable().defaultTo(1);
        t.integer('DisplayOnPayment').notNullable().defaultTo(0);
        t.integer('DisplayOnOrders').notNullable().defaultTo(0);
        t.integer('DisplayOnTicketList').notNullable().defaultTo(0);
        t.integer('DisplayUnderTicket').notNullable().defaultTo(0);
        t.integer('DisplayUnderTicket2').notNullable().defaultTo(0);
        t.integer('DisplayOnCommandSelector').notNullable().defaultTo(0);
        t.text('EnabledStates');
        t.text('VisibleStates');
      }
      if (tbl === 'MenuAssignments') {
        t.integer('TicketTypeId').notNullable();  // FK target
        t.text('TerminalName');
        t.integer('MenuId').notNullable().defaultTo(0);
        t.integer('SortOrder').notNullable().defaultTo(0);
      }
      if (tbl === 'EntityTypeAssignments') {
        t.integer('TicketTypeId').notNullable();  // FK target
        t.integer('EntityTypeId').notNullable().defaultTo(0);
        t.text('EntityTypeName');
        t.integer('AskBeforeCreatingTicket').notNullable().defaultTo(0);
        t.text('State');
        t.integer('CopyToNewTickets').notNullable().defaultTo(1);
        t.integer('SortOrder').notNullable().defaultTo(0);
      }
      if (fkCol) {
        t.foreign(fkCol).references(`${refTbl}.Id`).onDelete('CASCADE');
      } else {
        // MenuAssignments / EntityTypeAssignments: FK on TicketTypeId
        t.foreign('TicketTypeId').references('TicketTypes.Id').onDelete('CASCADE');
      }
    });
  }

  // -----------------------------------------------------------------
  // 6. Other child tables
  // -----------------------------------------------------------------
  await createTable('MenuItemPrices', (t) => {
    t.integer('MenuItemPortionId').notNullable();
    t.text('PriceTag');
    t.decimal('Price', 16, 2).notNullable().defaultTo(0);
    t.unique(['Id', 'MenuItemPortionId']);
    t.foreign('MenuItemPortionId').references('MenuItemPortions.Id').onDelete('CASCADE');
  });

  await createTable('ScreenMenuItems', (t) => {
    t.text('Name');
    t.integer('ScreenMenuCategoryId').notNullable();
    t.integer('MenuItemId').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.integer('AutoSelect').notNullable().defaultTo(0);
    t.text('ButtonColor');
    t.integer('Quantity').notNullable().defaultTo(0);
    t.text('ImagePath');
    t.float('FontSize').notNullable().defaultTo(0);
    t.text('SubMenuTag');
    t.text('ItemPortion');
    t.text('OrderTags');
    t.text('OrderStates');
    t.text('AutomationCommand');
    t.text('AutomationCommandValue');
    t.foreign('ScreenMenuCategoryId').references('ScreenMenuCategories.Id').onDelete('CASCADE');
  });

  await createTable('AccountScreenValues', (t) => {
    t.integer('AccountScreenId').notNullable();
    t.integer('AccountTypeId').notNullable().defaultTo(0);
    t.text('AccountTypeName');
    t.integer('DisplayDetails').notNullable().defaultTo(0);
    t.integer('HideZeroBalanceAccounts').notNullable().defaultTo(0);
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.unique(['Id', 'AccountScreenId']);
    t.foreign('AccountScreenId').references('AccountScreens.Id').onDelete('CASCADE');
  });

  await createTable('EntityScreenItems', (t) => {
    t.text('Name');
    t.integer('EntityScreenId').notNullable();
    t.integer('EntityId').notNullable().defaultTo(0);
    t.text('EntityState');
    t.integer('SortOrder').notNullable().defaultTo(0);
    t.text('LastUpdateTime').notNullable();
    t.unique(['Id', 'EntityScreenId']);
    t.foreign('EntityScreenId').references('EntityScreens.Id').onDelete('CASCADE');
  });

  await createTable('EntityStateValues', (t) => {
    t.integer('EntityId').notNullable().defaultTo(0);
    t.text('EntityStates');
    t.foreign('EntityId').references('Entities.Id');
  });

  await createTable('Widgets', (t) => {
    t.text('Name');
    t.integer('EntityScreenId').notNullable().defaultTo(0);
    t.integer('XLocation').notNullable().defaultTo(0);
    t.integer('YLocation').notNullable().defaultTo(0);
    t.integer('Height').notNullable().defaultTo(0);
    t.integer('Width').notNullable().defaultTo(0);
    t.integer('CornerRadius').notNullable().defaultTo(0);
    t.float('Angle').notNullable().defaultTo(0);
    t.float('Scale').notNullable().defaultTo(1);
    t.text('Properties');
    t.text('CreatorName');
    t.integer('AutoRefresh').notNullable().defaultTo(0);
    t.integer('AutoRefreshInterval').notNullable().defaultTo(0);
    t.foreign('EntityScreenId').references('EntityScreens.Id').onDelete('CASCADE');
  });

  await createTable('PrinterMaps', (t) => {
    t.integer('PrintJobId').notNullable().defaultTo(0);
    t.text('MenuItemGroupCode');
    t.integer('MenuItemId').notNullable().defaultTo(0);
    t.integer('PrinterId').notNullable().defaultTo(0);
    t.integer('PrinterTemplateId').notNullable().defaultTo(0);
    t.foreign('PrintJobId').references('PrintJobs.Id').onDelete('CASCADE');
    t.foreign('PrinterId').references('Printers.Id');
    t.foreign('PrinterTemplateId').references('PrinterTemplates.Id');
  });

  await createTable('CalculationSelectorCalculationTypes', (t) => {
    t.integer('CalculationSelectorId').notNullable();
    t.integer('CalculationTypeId').notNullable();
    t.primary(['CalculationSelectorId', 'CalculationTypeId']); // pure M:N, no Id
    t.foreign('CalculationSelectorId').references('CalculationSelectors.Id').onDelete('CASCADE');
    t.foreign('CalculationTypeId').references('CalculationTypes.Id').onDelete('CASCADE');
  });

  await createTable('AccountTransactionDocumentTypeAccountTransactionTypes', (t) => {
    t.integer('AccountTransactionDocumentTypeId').notNullable();
    t.integer('AccountTransactionTypeId').notNullable();
    t.primary(['AccountTransactionDocumentTypeId', 'AccountTransactionTypeId']);
    t.foreign('AccountTransactionDocumentTypeId')
      .references('AccountTransactionDocumentTypes.Id').onDelete('CASCADE');
    t.foreign('AccountTransactionTypeId')
      .references('AccountTransactionTypes.Id').onDelete('CASCADE');
  });

  await createTable('AccountTransactionDocumentAccountMaps', (t) => {
    t.integer('AccountTransactionDocumentTypeId').notNullable().defaultTo(0);
    t.integer('AccountId').notNullable().defaultTo(0);
    t.text('AccountName');
    t.integer('MappedAccountId').notNullable().defaultTo(0);
    t.text('MappedAccountName');
    t.foreign('AccountTransactionDocumentTypeId')
      .references('AccountTransactionDocumentTypes.Id').onDelete('CASCADE');
  });

  await createTable('RecipeItems', (t) => {
    t.decimal('Quantity', 16, 3).notNullable().defaultTo(0);
    t.integer('RecipeId').notNullable().defaultTo(0);
    t.integer('InventoryItemId');
    t.foreign('RecipeId').references('Recipes.Id').onDelete('CASCADE');
    t.foreign('InventoryItemId').references('InventoryItems.Id');
  });

  await createTable('InventoryTransactions', (t) => {
    t.integer('InventoryTransactionDocumentId').notNullable().defaultTo(0);
    t.integer('InventoryTransactionTypeId').notNullable().defaultTo(0);
    t.integer('SourceWarehouseId').notNullable().defaultTo(0);
    t.integer('TargetWarehouseId').notNullable().defaultTo(0);
    t.text('Date').notNullable();
    t.text('Unit');
    t.integer('Multiplier').notNullable().defaultTo(1);
    t.decimal('Quantity', 16, 3).notNullable().defaultTo(0);
    t.decimal('Price', 16, 2).notNullable().defaultTo(0);
    t.integer('InventoryItemId');
    t.foreign('InventoryTransactionDocumentId')
      .references('InventoryTransactionsDocuments.Id').onDelete('CASCADE');
    t.foreign('InventoryItemId').references('InventoryItems.Id');
  });

  await createTable('WarehouseConsumptions', (t) => {
    t.integer('PeriodicConsumptionId').notNullable();
    t.integer('WarehouseId').notNullable().defaultTo(0);
    t.unique(['Id', 'PeriodicConsumptionId']);
    t.foreign('PeriodicConsumptionId')
      .references('PeriodicConsumptions.Id').onDelete('CASCADE');
  });

  await createTable('PeriodicConsumptionItems', (t) => {
    t.integer('PeriodicConsumptionId').notNullable();
    t.integer('WarehouseConsumptionId').notNullable();
    t.integer('InventoryItemId').notNullable().defaultTo(0);
    t.text('InventoryItemName');
    t.text('UnitName');
    t.decimal('UnitMultiplier', 16, 2).notNullable().defaultTo(1);
    t.decimal('InStock', 16, 3).notNullable().defaultTo(0);
    t.decimal('Added', 16, 3).notNullable().defaultTo(0);
    t.decimal('Removed', 16, 3).notNullable().defaultTo(0);
    t.decimal('Consumption', 16, 3).notNullable().defaultTo(0);
    t.decimal('PhysicalInventory', 16, 3);
    t.decimal('Cost', 16, 2).notNullable().defaultTo(0);
    t.unique(['Id', 'WarehouseConsumptionId', 'PeriodicConsumptionId']);
  });

  await createTable('CostItems', (t) => {
    t.text('Name');
    t.integer('PeriodicConsumptionId').notNullable();
    t.integer('WarehouseConsumptionId').notNullable();
    t.integer('MenuItemId').notNullable().defaultTo(0);
    t.integer('PortionId').notNullable().defaultTo(0);
    t.text('PortionName');
    t.decimal('Quantity', 16, 3).notNullable().defaultTo(0);
    t.decimal('CostPrediction', 16, 2).notNullable().defaultTo(0);
    t.decimal('Cost', 16, 2).notNullable().defaultTo(0);
    t.unique(['Id', 'WarehouseConsumptionId', 'PeriodicConsumptionId']);
  });

  await createTable('TaskTokens', (t) => {
    t.integer('TaskId').notNullable();
    t.text('Caption');
    t.text('Value');
    t.integer('Type').notNullable().defaultTo(0);
    t.integer('ReferenceTypeId').notNullable().defaultTo(0);
    t.integer('ReferenceId').notNullable().defaultTo(0);
    t.unique(['Id', 'TaskId']);
    t.foreign('TaskId').references('Tasks.Id').onDelete('CASCADE');
  });

  await createTable('TaskCustomFields', (t) => {
    t.text('Name');
    t.integer('TaskTypeId').notNullable().defaultTo(0);
    t.integer('FieldType').notNullable().defaultTo(0);
    t.text('EditingFormat');
    t.text('DisplayFormat');
    t.unique(['Id', 'TaskTypeId']);
    t.foreign('TaskTypeId').references('TaskTypes.Id').onDelete('CASCADE');
  });

  // -----------------------------------------------------------------
  // 7. VersionInfo (FluentMigrator-style version tracking, preserved)
  // -----------------------------------------------------------------
  await knex.schema.createTable('VersionInfo', (t) => {
    t.bigInteger('Version').notNullable();
  });
  // Stamp versions 1..24 to mirror the original migration history
  for (let v = 1; v <= 24; v++) {
    await knex('VersionInfo').insert({ Version: v });
  }

  // -----------------------------------------------------------------
  // 8. Indexes (manual — Knex auto-creates indexes for FK columns
  //    but we want explicit composite indexes for performance)
  // -----------------------------------------------------------------
  await knex.schema.alterTable('Tickets', (t) => {
    t.index(['LastPaymentDate'], 'IX_Tickets_LastPaymentDate');
    t.index(['TicketNumber'], 'IX_Tickets_TicketNumber');
    t.index(['DepartmentId'], 'IX_Tickets_DepartmentId');
    t.index(['TicketTypeId'], 'IX_Tickets_TicketTypeId');
  });
  await knex.schema.alterTable('Orders', (t) => {
    t.index(['TicketId'], 'IX_Orders_TicketId');
    t.index(['TicketId', 'OrderNumber'], 'IX_Orders_TicketId_OrderNumber');
    t.index(['MenuItemId'], 'IX_Orders_MenuItemId');
  });
  await knex.schema.alterTable('Payments', (t) => {
    t.index(['TicketId'], 'IX_Payments_TicketId');
    t.index(['PaymentTypeId'], 'IX_Payments_PaymentTypeId');
  });
  await knex.schema.alterTable('Calculations', (t) => {
    t.index(['TicketId'], 'IX_Calculations_TicketId');
    t.index(['CalculationTypeId'], 'IX_Calculations_CalculationTypeId');
  });
  await knex.schema.alterTable('ChangePayments', (t) => {
    t.index(['TicketId'], 'IX_ChangePayments_TicketId');
  });
  await knex.schema.alterTable('PaidItems', (t) => {
    t.index(['TicketId'], 'IX_PaidItems_TicketId');
  });
  await knex.schema.alterTable('TicketEntities', (t) => {
    t.index(['TicketId'], 'IX_TicketEntities_TicketId');
    t.index(['EntityId'], 'IX_TicketEntities_EntityId');
  });
  await knex.schema.alterTable('EntityStateValues', (t) => {
    t.unique(['EntityId'], 'IX_EntityStateValue_EntityId');
  });
  await knex.schema.alterTable('AccountTransactions', (t) => {
    t.index(['AccountTransactionDocumentId'], 'IX_AT_DocumentId');
    t.index(['AccountTransactionTypeId'], 'IX_AT_TypeId');
  });
  await knex.schema.alterTable('AccountTransactionValues', (t) => {
    t.index(['AccountId'], 'IX_ATV_AccountId');
    t.index(['AccountTransactionId'], 'IX_ATV_ATId');
  });
  await knex.schema.alterTable('Entities', (t) => {
    t.index(['EntityTypeId'], 'IX_Entities_EntityTypeId');
  });
  await knex.schema.alterTable('MenuItems', (t) => {
    t.index(['GroupCode'], 'IX_MenuItems_GroupCode');
    t.index(['Barcode'], 'IX_MenuItems_Barcode');
  });
}

async function down(knex) {
  // Drop in reverse-dependency order
  const tables = [
    'VersionInfo',
    'TaskCustomFields', 'TaskTokens',
    'CostItems', 'PeriodicConsumptionItems', 'WarehouseConsumptions',
    'InventoryTransactions', 'RecipeItems', 'InventoryTransactionsDocuments',
    'AccountTransactionDocumentAccountMaps',
    'AccountTransactionDocumentTypeAccountTransactionTypes',
    'CalculationSelectorCalculationTypes',
    'PrinterMaps', 'Widgets', 'EntityStateValues', 'EntityScreenItems',
    'AccountScreenValues', 'ScreenMenuItems', 'MenuItemPrices',
    'EntityTypeAssignments', 'MenuAssignments',
    'EntityScreenMaps', 'AccountTransactionDocumentTypeMaps',
    'AutomationCommandMaps', 'AppRuleMaps', 'CalculationSelectorMaps',
    'ChangePaymentTypeMaps', 'PaymentTypeMaps', 'ProductTimerMaps',
    'TaxTemplateMaps', 'TicketTagMaps', 'OrderTagMaps',
    'AccountTransactionValues', 'AccountTransactions',
    'TicketEntities', 'PaidItems', 'Calculations', 'ChangePayments', 'Payments', 'Orders',
    'Tickets', 'AccountTransactionDocuments',
    'ActionContainers', 'Tasks', 'PeriodicConsumptions',
    'InventoryTransactionDocumentTypes', 'Recipes', 'ProductTimerValues',
    'EntityCustomFields', 'Entities', 'TicketTags', 'OrderTags',
    'ScreenMenuCategories', 'MenuItemPortions', 'EntityScreens',
    'AppRules', 'AutomationCommands', 'ProductTimers', 'TicketTagGroups',
    'OrderTagGroups', 'ChangePaymentTypes', 'PaymentTypes',
    'CalculationSelectors', 'CalculationTypes', 'MenuItems',
    'AccountScreens', 'Accounts', 'Permissions', 'Users', 'Departments',
    'Warehouses', 'Terminals', 'PrintJobs', 'PrinterTemplates', 'Printers',
    'AccountTransactionDocumentTypes', 'AccountTransactionTypes',
    'InventoryTransactionTypes', 'InventoryItems', 'TaxTemplates',
    'ScreenMenus', 'MenuItemPriceDefinitions', 'TicketTypes', 'EntityTypes',
    'Scripts', 'AppActions', 'States', 'TaskTypes', 'Numerators',
    'ProgramSettings', 'Triggers', 'ForeignCurrencies', 'WorkPeriods',
    'UserRoles', 'AccountTypes', 'WarehouseTypes',
  ];
  for (const tbl of tables) {
    await knex.schema.dropTableIfExists(tbl);
  }
}

module.exports = { up, down };
