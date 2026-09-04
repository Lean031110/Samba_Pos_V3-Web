// =====================================================================
// seed.js — Initial data (mandatory for behavioral parity with SambaPOS V3)
// =====================================================================
// Per Architect's directive: ALL inserts run inside ONE transaction.
// If any insert fails, rollback the entire seed.
//
// Mirrors: Samba.Presentation.Services/Common/DataGeneration/DataCreationService.cs
//         + RuleGenerator.GenerateSystemRules(workspace)
// =====================================================================

/**
 * @param {import('knex').Knex} knex
 */
async function seed(knex) {
  console.log('[seed] Starting transactional seed...');

  // ---- Open a single transaction wrapping ALL inserts ----
  await knex.transaction(async (trx) => {
    // Inside a transaction, defer FK checks so out-of-order inserts work
    await trx.raw('PRAGMA defer_foreign_keys = ON');

    // -----------------------------------------------------------------
    // 1. AccountTypes (5)
    // -----------------------------------------------------------------
    await trx('AccountTypes').insert([
      { Name: 'Sales Accounts',      DefaultFilterType: 0, WorkingRule: 0, SortOrder: 10 },
      { Name: 'Receivable Accounts', DefaultFilterType: 0, WorkingRule: 0, SortOrder: 20 },
      { Name: 'Payment Accounts',    DefaultFilterType: 0, WorkingRule: 0, SortOrder: 30 },
      { Name: 'Discount Accounts',   DefaultFilterType: 0, WorkingRule: 0, SortOrder: 40 },
      { Name: 'Customer Accounts',   DefaultFilterType: 0, WorkingRule: 0, SortOrder: 50 },
    ]);
    const [salesATId, receivableATId, paymentATId, discountATId, customerATId] =
      await trx('AccountTypes').orderBy('Id').pluck('Id');

    // -----------------------------------------------------------------
    // 2. Accounts (7)
    // -----------------------------------------------------------------
    await trx('Accounts').insert([
      { Name: 'Sales',        AccountTypeId: salesATId },
      { Name: 'Receivables',  AccountTypeId: receivableATId },
      { Name: 'Cash',         AccountTypeId: paymentATId },
      { Name: 'Credit Card',  AccountTypeId: paymentATId },
      { Name: 'Voucher',      AccountTypeId: paymentATId },
      { Name: 'Discount',     AccountTypeId: discountATId },
      { Name: 'Rounding',     AccountTypeId: discountATId },
    ]);
    const [salesAccId, receivableAccId, cashAccId, ccAccId, voucherAccId, discountAccId, roundingAccId] =
      await trx('Accounts').orderBy('Id').pluck('Id');

    // -----------------------------------------------------------------
    // 3. AccountTransactionTypes (7)
    // -----------------------------------------------------------------
    await trx('AccountTransactionTypes').insert([
      { Name: 'Discount Transaction',         SortOrder: 10,
        SourceAccountTypeId: receivableATId, TargetAccountTypeId: discountATId,
        DefaultSourceAccountId: receivableAccId, DefaultTargetAccountId: discountAccId },
      { Name: 'Rounding Transaction',         SortOrder: 20,
        SourceAccountTypeId: receivableATId, TargetAccountTypeId: discountATId,
        DefaultSourceAccountId: receivableAccId, DefaultTargetAccountId: roundingAccId },
      { Name: 'Sale Transaction',             SortOrder: 30,
        SourceAccountTypeId: salesATId, TargetAccountTypeId: receivableATId,
        DefaultSourceAccountId: salesAccId, DefaultTargetAccountId: receivableAccId },
      { Name: 'Payment Transaction',          SortOrder: 40,
        SourceAccountTypeId: receivableATId, TargetAccountTypeId: paymentATId,
        DefaultSourceAccountId: receivableAccId, DefaultTargetAccountId: cashAccId },
      { Name: 'Customer Account Transaction', SortOrder: 50,
        SourceAccountTypeId: receivableATId, TargetAccountTypeId: customerATId,
        DefaultSourceAccountId: receivableAccId, DefaultTargetAccountId: 0 },
      { Name: 'Customer Cash Payment',        SortOrder: 60,
        SourceAccountTypeId: customerATId, TargetAccountTypeId: paymentATId,
        DefaultSourceAccountId: 0, DefaultTargetAccountId: cashAccId },
      { Name: 'Customer Credit Card Payment', SortOrder: 70,
        SourceAccountTypeId: customerATId, TargetAccountTypeId: paymentATId,
        DefaultSourceAccountId: 0, DefaultTargetAccountId: ccAccId },
    ]);
    const [discountTxnId, roundingTxnId, saleTxnId, paymentTxnId,
           customerAcctTxnId, custCashTxnId, custCcTxnId] =
      await trx('AccountTransactionTypes').orderBy('Id').pluck('Id');

    // -----------------------------------------------------------------
    // 4. Numerators (2)
    // -----------------------------------------------------------------
    await trx('Numerators').insert([
      { Name: 'Ticket Numerator', Number: 0, NumberFormat: '#' },
      { Name: 'Order Numerator',  Number: 0, NumberFormat: '#' },
    ]);
    const [ticketNumId, orderNumId] = await trx('Numerators').orderBy('Id').pluck('Id');

    // -----------------------------------------------------------------
    // 5. WarehouseType + Warehouse
    // -----------------------------------------------------------------
    const [whTypeId] = await trx('WarehouseTypes').insert({ Name: 'Warehouses' });
    const [warehouseId] = await trx('Warehouses').insert({
      Name: 'Local Warehouse', WarehouseTypeId: whTypeId, SortOrder: 10,
    });

    // -----------------------------------------------------------------
    // 6. CalculationTypes (2) + CalculationSelectors (2)
    // -----------------------------------------------------------------
    await trx('CalculationTypes').insert([
      { Name: 'Discount', SortOrder: 10, CalculationMethod: 0, Amount: 0, MaxAmount: 0,
        IncludeTax: 0, DecreaseAmount: 1, UsePlainSum: 0, ToggleCalculation: 0,
        AccountTransactionTypeId: discountTxnId },
      { Name: 'Round',    SortOrder: 20, CalculationMethod: 2, Amount: 0, MaxAmount: 0,
        IncludeTax: 1, DecreaseAmount: 1, UsePlainSum: 0, ToggleCalculation: 0,
        AccountTransactionTypeId: roundingTxnId },
    ]);
    const [discountCtId, roundCtId] = await trx('CalculationTypes').orderBy('Id').pluck('Id');

    await trx('CalculationSelectors').insert([
      { Name: 'Discount', ButtonHeader: '%',     ButtonColor: 'Gainsboro', FontSize: 30, SortOrder: 10 },
      { Name: 'Round',    ButtonHeader: 'Round', ButtonColor: 'Gainsboro', FontSize: 30, SortOrder: 20 },
    ]);
    const [discountCsId, roundCsId] = await trx('CalculationSelectors').orderBy('Id').pluck('Id');

    await trx('CalculationSelectorCalculationTypes').insert([
      { CalculationSelectorId: discountCsId, CalculationTypeId: discountCtId },
      { CalculationSelectorId: roundCsId,    CalculationTypeId: roundCtId },
    ]);
    await trx('CalculationSelectorMaps').insert([
      { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        CalculationSelectorId: discountCsId },
      { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        CalculationSelectorId: roundCsId },
    ]);

    // -----------------------------------------------------------------
    // 7. ScreenMenu (1)
    // -----------------------------------------------------------------
    const [screenMenuId] = await trx('ScreenMenus').insert({
      Name: 'Menu', CategoryColumnCount: 1, CategoryColumnWidthRate: 25,
    });

    // -----------------------------------------------------------------
    // 8. TicketType (1)
    // -----------------------------------------------------------------
    await trx('TicketTypes').insert({
      Name: 'Ticket', SortOrder: 10, ScreenMenuId: screenMenuId, TaxIncluded: 1,
      TicketNumeratorId: ticketNumId, OrderNumeratorId: orderNumId,
      SaleTransactionTypeId: saleTxnId,
    });
    const [ticketTypeId] = await trx('TicketTypes').orderBy('Id').pluck('Id');

    // -----------------------------------------------------------------
    // 9. EntityTypes (2): Customers + Tables
    // -----------------------------------------------------------------
    await trx('EntityTypes').insert([
      { Name: 'Customers', SortOrder: 10, EntityName: 'Customer', AccountTypeId: customerATId,
        WarehouseTypeId: 0, AccountNameTemplate: '[Name]-[Phone]', PrimaryFieldName: 'Name' },
      { Name: 'Tables',    SortOrder: 20, EntityName: 'Table',    AccountTypeId: 0,
        WarehouseTypeId: 0, PrimaryFieldName: 'Name' },
    ]);
    const [customersEtId, tablesEtId] = await trx('EntityTypes').orderBy('Id').pluck('Id');

    await trx('EntityCustomFields').insert({
      Name: 'Phone', FieldType: 0, EditingFormat: '(###) ### ####',
      ValueSource: null, Hidden: 0, EntityTypeId: customersEtId,
    });

    await trx('EntityTypeAssignments').insert([
      { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: ticketTypeId,
        EntityTypeId: tablesEtId, EntityTypeName: 'Tables',
        AskBeforeCreatingTicket: 0, State: null, CopyToNewTickets: 1, SortOrder: 10 },
      { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: ticketTypeId,
        EntityTypeId: customersEtId, EntityTypeName: 'Customers',
        AskBeforeCreatingTicket: 0, State: null, CopyToNewTickets: 0, SortOrder: 20 },
    ]);

    // -----------------------------------------------------------------
    // 10. Department (1)
    // -----------------------------------------------------------------
    await trx('Departments').insert({
      Name: 'Restaurant', SortOrder: 10, PriceTag: null,
      WarehouseId: warehouseId, TicketTypeId: ticketTypeId,
      ScreenMenuId: screenMenuId, TicketCreationMethod: 0,
    });
    const [departmentId] = await trx('Departments').orderBy('Id').pluck('Id');

    // -----------------------------------------------------------------
    // 11. UserRoles + Users (admin / 1234)
    // -----------------------------------------------------------------
    await trx('UserRoles').insert({
      Name: 'Admin', IsAdmin: 1, DepartmentId: departmentId,
    });
    const [userRoleId] = await trx('UserRoles').orderBy('Id').pluck('Id');

    await trx('Users').insert({
      Name: 'Administrator', PinCode: '1234', UserRoleId: userRoleId,
    });

    // -----------------------------------------------------------------
    // 12. PaymentTypes (4) + PaymentTypeMaps
    // -----------------------------------------------------------------
    await trx('PaymentTypes').insert([
      { Name: 'Cash',            SortOrder: 10, ButtonColor: 'Gainsboro', FontSize: 40,
        AccountTransactionTypeId: paymentTxnId, AccountId: cashAccId },
      { Name: 'Credit Card',     SortOrder: 20, ButtonColor: 'Gainsboro', FontSize: 40,
        AccountTransactionTypeId: paymentTxnId, AccountId: ccAccId },
      { Name: 'Voucher',         SortOrder: 30, ButtonColor: 'Gainsboro', FontSize: 40,
        AccountTransactionTypeId: paymentTxnId, AccountId: voucherAccId },
      { Name: 'Customer Account',SortOrder: 40, ButtonColor: 'Gainsboro', FontSize: 40,
        AccountTransactionTypeId: customerAcctTxnId, AccountId: null },
    ]);
    const ptIds = await trx('PaymentTypes').orderBy('Id').pluck('Id');
    for (const ptId of ptIds) {
      await trx('PaymentTypeMaps').insert({
        TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0, PaymentTypeId: ptId,
      });
    }

    // -----------------------------------------------------------------
    // 13. Printers (3) + PrinterTemplates (3) + PrintJobs (2) + PrinterMaps (2)
    // -----------------------------------------------------------------
    await trx('Printers').insert([
      { Name: 'Ticket Printer',  ShareName: 'Ticket Printer',  PrinterType: 0, CodePage: 857, CharsPerLine: 42 },
      { Name: 'Kitchen Printer', ShareName: 'Kitchen Printer', PrinterType: 0, CodePage: 857, CharsPerLine: 42 },
      { Name: 'Invoice Printer', ShareName: 'Invoice Printer', PrinterType: 0, CodePage: 857, CharsPerLine: 42 },
    ]);
    const [ticketPrinterId, kitchenPrinterId] =
      await trx('Printers').orderBy('Id').pluck('Id');

    const defaultTicketTemplate = [
      '<L00>Ticket: {TICKET NUMBER}',
      '<L00>Date: {DATE} {TIME}',
      '<F>',
      '{ORDERS}',
      '<F>',
      '<J00>Total|{TOTAL AMOUNT}',
      '<F>',
      '<C00>Thank you!',
      '<cut>',
    ].join('\n');

    const defaultKitchenTemplate = [
      '<C00>**Kitchen Order**',
      '<L00>Ticket: {TICKET NUMBER}',
      '<F>',
      '{ORDERS}',
      '<cut>',
    ].join('\n');

    const defaultReceiptTemplate = [
      '<L00>{ENTITY NAME:Customer}',
      '<L00>{TICKET NUMBER}',
      '<F>',
      '{ORDERS}',
      '<F>',
      '<J00>Total|{TOTAL AMOUNT}',
      '<J00>Paid|{PAYMENT TOTAL}',
      '<J00>Change|{CHANGE AMOUNT}',
      '<cut>',
    ].join('\n');

    await trx('PrinterTemplates').insert([
      { Name: 'Ticket Template',           Template: defaultTicketTemplate,   MergeLines: 0 },
      { Name: 'Kitchen Order Template',    Template: defaultKitchenTemplate,  MergeLines: 1 },
      { Name: 'Customer Receipt Template', Template: defaultReceiptTemplate,  MergeLines: 0 },
    ]);
    const [ticketTplId, kitchenTplId, receiptTplId] =
      await trx('PrinterTemplates').orderBy('Id').pluck('Id');

    await trx('PrintJobs').insert([
      { Name: 'Print Bill',                      WhatToPrint: 0, UseForPaidTickets: 0, ExcludeTax: 0 },
      { Name: 'Print Orders to Kitchen Printer', WhatToPrint: 0, UseForPaidTickets: 0, ExcludeTax: 0 },
    ]);
    const [printBillJobId, kitchenJobId] = await trx('PrintJobs').orderBy('Id').pluck('Id');

    await trx('PrinterMaps').insert([
      { PrintJobId: printBillJobId, MenuItemGroupCode: null, MenuItemId: 0,
        PrinterId: ticketPrinterId, PrinterTemplateId: ticketTplId },
      { PrintJobId: kitchenJobId,   MenuItemGroupCode: null, MenuItemId: 0,
        PrinterId: kitchenPrinterId, PrinterTemplateId: kitchenTplId },
    ]);

    // -----------------------------------------------------------------
    // 14. Terminal (1)
    // -----------------------------------------------------------------
    await trx('Terminals').insert({
      Name: 'Server', IsDefault: 1, AutoLogout: 0,
      ReportPrinterId: ticketPrinterId, TransactionPrinterId: ticketPrinterId,
    });

    // -----------------------------------------------------------------
    // 15. AccountScreens + AccountScreenValues
    // -----------------------------------------------------------------
    const [accountScreenId] = await trx('AccountScreens').insert({
      Name: 'General', Filter: 0, DisplayAsTree: 0, SortOrder: 10,
      AutomationCommandMapData: null,
    });
    await trx('AccountScreenValues').insert([
      { AccountScreenId: accountScreenId, AccountTypeId: salesATId,
        AccountTypeName: 'Sales Accounts', DisplayDetails: 1, SortOrder: 10 },
      { AccountScreenId: accountScreenId, AccountTypeId: receivableATId,
        AccountTypeName: 'Receivable Accounts', DisplayDetails: 1, SortOrder: 20 },
      { AccountScreenId: accountScreenId, AccountTypeId: discountATId,
        AccountTypeName: 'Discount Accounts', DisplayDetails: 1, SortOrder: 30 },
      { AccountScreenId: accountScreenId, AccountTypeId: paymentATId,
        AccountTypeName: 'Payment Accounts', DisplayDetails: 1, SortOrder: 40 },
    ]);

    // -----------------------------------------------------------------
    // 16. AccountTransactionDocumentTypes (2)
    // -----------------------------------------------------------------
    await trx('AccountTransactionDocumentTypes').insert([
      { Name: 'Customer Cash', ButtonHeader: 'Cash', ButtonColor: 'Gainsboro',
        MasterAccountTypeId: customerATId, DefaultAmount: '[Balance]',
        DescriptionTemplate: 'Cash Payment',
        BatchCreateDocuments: 0, Filter: 0, SortOrder: 10, PrinterTemplateId: receiptTplId },
      { Name: 'Customer Credit Card', ButtonHeader: 'Credit Card', ButtonColor: 'Gainsboro',
        MasterAccountTypeId: customerATId, DefaultAmount: '[Balance]',
        DescriptionTemplate: 'Credit Card Payment',
        BatchCreateDocuments: 0, Filter: 0, SortOrder: 20, PrinterTemplateId: receiptTplId },
    ]);
    const [custCashDtId, custCcDtId] =
      await trx('AccountTransactionDocumentTypes').orderBy('Id').pluck('Id');

    await trx('AccountTransactionDocumentTypeAccountTransactionTypes').insert([
      { AccountTransactionDocumentTypeId: custCashDtId, AccountTransactionTypeId: custCashTxnId },
      { AccountTransactionDocumentTypeId: custCcDtId,   AccountTransactionTypeId: custCcTxnId },
    ]);
    await trx('AccountTransactionDocumentTypeMaps').insert([
      { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        AccountTransactionDocumentTypeId: custCashDtId },
      { TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        AccountTransactionDocumentTypeId: custCcDtId },
    ]);

    // -----------------------------------------------------------------
    // 17. InventoryTransactionType (1) + DocumentType (1)
    // -----------------------------------------------------------------
    await trx('InventoryTransactionTypes').insert({
      Name: 'Purchase',
      SourceWarehouseTypeId: 0, TargetWarehouseTypeId: whTypeId,
      DefaultSourceWarehouseId: 0, DefaultTargetWarehouseId: warehouseId,
      SortOrder: 10,
    });
    const [invTxnTypeId] = await trx('InventoryTransactionTypes').orderBy('Id').pluck('Id');

    await trx('InventoryTransactionDocumentTypes').insert({
      Name: 'Purchase Transaction',
      SourceEntityTypeId: 0, TargetEntityTypeId: 0,
      DefaultSourceEntityId: 0, DefaultTargetEntityId: 0,
      SortOrder: 10,
      AccountTransactionTypeId: null, InventoryTransactionTypeId: invTxnTypeId,
    });

    // -----------------------------------------------------------------
    // 18. AutomationCommands (9)
    // -----------------------------------------------------------------
    await trx('AutomationCommands').insert([
      { Name: 'Close Ticket',  ButtonHeader: 'Close Ticket',  Color: 'RoyalBlue',   FontSize: 30, SortOrder: 10, ToggleValues: 0, Values: '' },
      { Name: 'Settle',        ButtonHeader: 'Settle',        Color: '#FF9800',     FontSize: 30, SortOrder: 20, ToggleValues: 0, Values: '' },
      { Name: 'Print Bill',    ButtonHeader: 'Print Bill',    Color: 'Gainsboro',   FontSize: 30, SortOrder: 30, ToggleValues: 0, Values: '' },
      { Name: 'Unlock Ticket', ButtonHeader: 'Unlock',        Color: 'Gainsboro',   FontSize: 30, SortOrder: 40, ToggleValues: 0, Values: '' },
      { Name: 'Add Ticket',    ButtonHeader: 'Add Ticket',    Color: 'Gainsboro',   FontSize: 30, SortOrder: 50, ToggleValues: 0, Values: '' },
      { Name: 'Gift',          ButtonHeader: 'Gift',          Color: 'Purple',      FontSize: 30, SortOrder: 60, ToggleValues: 0, Values: '' },
      { Name: 'Cancel Gift',   ButtonHeader: 'Cancel Gift',   Color: 'Gainsboro',   FontSize: 30, SortOrder: 70, ToggleValues: 0, Values: '' },
      { Name: 'Void',          ButtonHeader: 'Void',          Color: 'Red',         FontSize: 30, SortOrder: 80, ToggleValues: 0, Values: '' },
      { Name: 'Cancel Void',   ButtonHeader: 'Cancel Void',   Color: 'Gainsboro',   FontSize: 30, SortOrder: 90, ToggleValues: 0, Values: '' },
    ]);
    const acIds = await trx('AutomationCommands').orderBy('Id').pluck('Id');
    const [closeTicketAcId, settleAcId, printBillAcId, unlockTicketAcId, addTicketAcId,
          giftAcId, cancelGiftAcId, voidAcId, cancelVoidAcId] = acIds;
    for (const acId of acIds) {
      await trx('AutomationCommandMaps').insert({
        TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        AutomationCommandId: acId,
        DisplayOnTicket: 1, DisplayOnPayment: 0, DisplayOnOrders: 0,
        DisplayOnTicketList: 0, DisplayUnderTicket: 0, DisplayUnderTicket2: 0,
        DisplayOnCommandSelector: 0,
        EnabledStates: '*', VisibleStates: '*',
      });
    }

    // -----------------------------------------------------------------
    // 19. AppActions (13)
    // -----------------------------------------------------------------
    await trx('AppActions').insert([
      { Name: 'Update Order',           ActionType: 'UpdateOrder',           Parameter: '{}',                                                                  SortOrder: 10 },
      { Name: 'Update Ticket Status',   ActionType: 'UpdateTicketStatus',    Parameter: '{"StateName":"Status","State":"New","StateValue":""}',                SortOrder: 20 },
      { Name: 'Update Order Status',    ActionType: 'UpdateOrderStatus',     Parameter: '{"StateName":"Status","State":"New","StateValue":""}',                SortOrder: 30 },
      { Name: 'Update Order Gift State',ActionType: 'UpdateOrderGiftState',  Parameter: '{"StateName":"GiftStatus","State":"","StateValue":""}',               SortOrder: 40 },
      { Name: 'Update Entity State',    ActionType: 'UpdateEntityState',     Parameter: '{"EntityTypeName":"Tables","StateName":"Status","State":"Available","StateValue":""}', SortOrder: 50 },
      { Name: 'Create Ticket',          ActionType: 'CreateTicket',          Parameter: '{}',                                                                  SortOrder: 60 },
      { Name: 'Close Ticket',           ActionType: 'CloseTicket',           Parameter: '{}',                                                                  SortOrder: 70 },
      { Name: 'Display Payment Screen', ActionType: 'DisplayPaymentScreen',  Parameter: '{}',                                                                  SortOrder: 80 },
      { Name: 'Execute Print Bill Job', ActionType: 'ExecutePrintJob',       Parameter: '{"PrintJobName":"Print Bill","Copies":1,"PrintTicket":true,"HighPriority":false}', SortOrder: 90 },
      { Name: 'Execute Kitchen Print',  ActionType: 'ExecutePrintJob',       Parameter: '{"PrintJobName":"Print Orders to Kitchen Printer","Copies":1,"PrintTicket":true,"HighPriority":true}', SortOrder: 100 },
      { Name: 'Lock Ticket',            ActionType: 'LockTicket',            Parameter: '{}',                                                                  SortOrder: 110 },
      { Name: 'Unlock Ticket',          ActionType: 'UnlockTicket',          Parameter: '{}',                                                                  SortOrder: 120 },
      { Name: 'Mark Ticket As Closed',  ActionType: 'MarkTicketAsClosed',    Parameter: '{}',                                                                  SortOrder: 130 },
    ]);
    const actIds = await trx('AppActions').orderBy('Id').pluck('Id');
    const [updOrderAct, updTicketStatusAct, updOrderStatusAct, updGiftAct, updEntityAct,
          createTicketAct, closeTicketAct, displayPaymentAct, execBillAct, execKitchenAct,
          lockTicketAct, unlockTicketAct, markClosedAct] = actIds;

    // -----------------------------------------------------------------
    // 20. AppRules (19) — the system automation rules
    // -----------------------------------------------------------------
    const ruleDefs = [
      { Name: 'New Ticket Creating Rule',        EventName: 'TicketCreating',        SortOrder: 10,
        actions: [
          { actionId: updTicketStatusAct, name: 'Update Ticket Status', paramValues: 'StateName=Status#State=New#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'New Order Adding Rule',           EventName: 'OrderAdded',            SortOrder: 20,
        actions: [
          { actionId: execKitchenAct, name: 'Execute Kitchen Print', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Ticket Payment Check',            EventName: 'BeforeTicketClosing',   SortOrder: 30,
        actions: [
          { actionId: markClosedAct, name: 'Mark Ticket As Closed', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Ticket Moved Rule',               EventName: 'TicketMoved',           SortOrder: 40,
        actions: [
          { actionId: updEntityAct, name: 'Update Entity State', paramValues: 'EntityTypeName=Tables#StateName=Status#State=Available#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Ticket Closing Rule',             EventName: 'TicketClosing',         SortOrder: 50,
        actions: [
          { actionId: lockTicketAct, name: 'Lock Ticket', paramValues: '', sortOrder: 10 },
          { actionId: execBillAct,   name: 'Execute Print Bill Job', paramValues: '', sortOrder: 20 },
        ]},
      { Name: 'Gift Rule',                       EventName: 'GiftRequested',         SortOrder: 60,
        actions: [
          { actionId: updGiftAct, name: 'Update Order Gift State', paramValues: 'StateName=GiftStatus#State=Gift#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Cancel Gift Rule',                EventName: 'CancelGiftRequested',   SortOrder: 70,
        actions: [
          { actionId: updGiftAct, name: 'Update Order Gift State', paramValues: 'StateName=GiftStatus#State=#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Void Rule',                       EventName: 'VoidRequested',         SortOrder: 80,
        actions: [
          { actionId: updOrderStatusAct, name: 'Update Order Status', paramValues: 'StateName=Status#State=Void#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Cancel Void Rule',                EventName: 'CancelVoidRequested',   SortOrder: 90,
        actions: [
          { actionId: updOrderStatusAct, name: 'Update Order Status', paramValues: 'StateName=Status#State=Submitted#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Update New Order Entity Color',   EventName: 'TicketOpened',          SortOrder: 100,
        actions: [
          { actionId: updEntityAct, name: 'Update Entity State', paramValues: 'EntityTypeName=Tables#StateName=Status#State=New Orders#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Update Available Entity Color',   EventName: 'TicketClosed',          SortOrder: 110,
        actions: [
          { actionId: updEntityAct, name: 'Update Entity State', paramValues: 'EntityTypeName=Tables#StateName=Status#State=Available#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Update Moved Entity Color',       EventName: 'TicketMoving',          SortOrder: 120,
        actions: [
          { actionId: updEntityAct, name: 'Update Entity State', paramValues: 'EntityTypeName=Tables#StateName=Status#State=Bill Requested#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Print Bill Rule',                 EventName: 'PrintBillRequested',    SortOrder: 130,
        actions: [
          { actionId: execBillAct, name: 'Execute Print Bill Job', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Unlock Ticket Rule',              EventName: 'UnlockTicketRequested', SortOrder: 140,
        actions: [
          { actionId: unlockTicketAct, name: 'Unlock Ticket', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Create Ticket Rule',              EventName: 'CreateTicketRequested', SortOrder: 150,
        actions: [
          { actionId: createTicketAct, name: 'Create Ticket', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Update Merged Tickets State',     EventName: 'TicketMerged',          SortOrder: 160,
        actions: [
          { actionId: updTicketStatusAct, name: 'Update Ticket Status', paramValues: 'StateName=Status#State=Merged#StateValue=', sortOrder: 10 },
        ]},
      { Name: 'Close Ticket Rule',               EventName: 'CloseTicketRequested',  SortOrder: 170,
        actions: [
          { actionId: closeTicketAct, name: 'Close Ticket', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Settle Rule',                     EventName: 'SettleRequested',       SortOrder: 180,
        actions: [
          { actionId: displayPaymentAct, name: 'Display Payment Screen', paramValues: '', sortOrder: 10 },
        ]},
      { Name: 'Payment Processed Rule',          EventName: 'PaymentProcessed',      SortOrder: 190,
        actions: [
          { actionId: execBillAct, name: 'Execute Print Bill Job', paramValues: '', sortOrder: 10 },
        ]},
    ];

    for (const rule of ruleDefs) {
      const [ruleId] = await trx('AppRules').insert({
        Name: rule.Name,
        EventName: rule.EventName,
        EventConstraints: '[]',
        CustomConstraint: null,
        RuleConstraints: '[]',
        ConstraintMatch: 0,
        SortOrder: rule.SortOrder,
      });
      await trx('AppRuleMaps').insert({
        TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
        AppRuleId: ruleId,
      });
      for (const ac of rule.actions) {
        await trx('ActionContainers').insert({
          Name: ac.name,
          AppActionId: ac.actionId,
          AppRuleId: ruleId,
          ParameterValues: ac.paramValues,
          CustomConstraint: null,
          SortOrder: ac.sortOrder,
        });
      }
    }

    // -----------------------------------------------------------------
    // 21. States (initial set)
    // -----------------------------------------------------------------
    await trx('States').insert([
      { Name: 'New Orders',       GroupName: 'Status', StateType: 2, Color: 'DarkBlue'    },
      { Name: 'Available',        GroupName: 'Status', StateType: 0, Color: 'LightGreen'  },
      { Name: 'Bill Requested',   GroupName: 'Status', StateType: 0, Color: 'Orange'      },
      { Name: 'New',              GroupName: 'Status', StateType: 1, Color: 'LightSkyBlue' },
      { Name: 'Unpaid',           GroupName: 'Status', StateType: 1, Color: 'OrangeRed'    },
      { Name: 'Locked',           GroupName: 'Status', StateType: 1, Color: 'Gray'         },
      { Name: 'IsClosed',         GroupName: 'Status', StateType: 1, Color: 'DarkGreen'    },
      { Name: 'Gift',             GroupName: 'GStatus',StateType: 2, Color: 'Bisque'       },
      { Name: 'Status',           GroupName: 'Status', StateType: 2, Color: 'Gainsboro'    },
    ]);

    console.log('[seed] All inserts completed. Committing transaction...');
  });

  console.log('[seed] Transactional seed completed successfully.');
}

module.exports = { seed };
