// =====================================================================
// Ticket.js — Domain entity (POCO)
// =====================================================================
// Mirrors: Samba.Domain/Models/Tickets/Ticket.cs (862 lines, the heart of the system)
//
// This is the in-memory domain entity. It carries Orders, Calculations,
// Payments, ChangePayments, PaidItems, TicketEntities, and a TransactionDocument.
//
// Key domain methods (mutate state + trigger recalculation via eventBus):
//   - addOrder(order, taxTemplates, saleTemplate, userName)
//   - addPayment(paymentType, account, amount, exchangeRate, userId)
//   - addChangePayment(changePaymentType, account, amount, exchangeRate, userId)
//   - addCalculation(calculationType, amount)
//   - removeOrder(order)
//   - lockTicket()
//   - unLock()
//   - close()
//
// Per Architect's directive: each mutation triggers recalculation AND
// publishes an event on the eventBus so subscribers stay in sync.
// =====================================================================

const { Decimal } = require('decimal.js');
const { AccountTransactionDocument } = require('./AccountTransactionDocument');
const { AccountTransaction } = require('./AccountTransaction');
const engine = require('./CalculationEngine');
const { recalculateTicket } = require('./TicketRecalculator');
const { publish, EventTopicNames } = require('../application/eventBus');

class Ticket {
  constructor(data = {}) {
    this.Id = data.Id || 0;
    this.Name = data.Name || null;
    this.TicketNumber = data.TicketNumber || null;
    this.Date = data.Date || new Date().toISOString();
    this.LastOrderDate = data.LastOrderDate || new Date().toISOString();
    this.LastPaymentDate = data.LastPaymentDate || new Date().toISOString();
    this.LastUpdateTime = data.LastUpdateTime || new Date().toISOString();
    this.IsClosed = data.IsClosed ? true : false;
    this.IsLocked = data.IsLocked ? true : false;
    this._remainingAmount = data.RemainingAmount || 0;
    this._totalAmount = data.TotalAmount || 0;
    this.DepartmentId = data.DepartmentId || 0;
    this.TicketTypeId = data.TicketTypeId || 0;
    this.Note = data.Note || null;
    this.LastModifiedUserName = data.LastModifiedUserName || null;
    this._ticketTags = data.TicketTags || null;
    this._ticketStates = data.TicketStates || null;
    this._ticketLogs = data.TicketLogs || null;
    this.ExchangeRate = data.ExchangeRate || 1;
    this.TaxIncluded = data.TaxIncluded !== undefined ? !!data.TaxIncluded : true;

    // Child collections
    this.Orders = data.Orders || [];
    this.Payments = data.Payments || [];
    this.ChangePayments = data.ChangePayments || [];
    this.Calculations = data.Calculations || [];
    this.PaidItems = data.PaidItems || [];
    this.TicketEntities = data.TicketEntities || [];

    // Transaction document (the double-entry ledger container)
    this.TransactionDocument = data.TransactionDocument
      ? (data.TransactionDocument instanceof AccountTransactionDocument
          ? data.TransactionDocument
          : new AccountTransactionDocument(data.TransactionDocument))
      : new AccountTransactionDocument({ Date: this.Date });

    // Hydrate orders' JSON fields
    for (const o of this.Orders) engine.hydrateOrder(o);
  }

  // -------------------------------------------------------------------
  // Getters / setters that mirror C# behavior
  // -------------------------------------------------------------------

  get RemainingAmount() { return this._remainingAmount; }
  set RemainingAmount(v) { this._remainingAmount = v; }

  get TotalAmount() { return this._totalAmount; }
  set TotalAmount(v) { this._totalAmount = v; }

  get TicketTags() { return this._ticketTags; }
  set TicketTags(v) { this._ticketTags = v; }

  get TicketStates() { return this._ticketStates; }
  set TicketStates(v) { this._ticketStates = v; }

  get TicketLogs() { return this._ticketLogs; }
  set TicketLogs(v) { this._ticketLogs = v; }

  get CanSubmit() { return !this.IsClosed; }   // [Ticket.cs:449]

  /**
   * Can close ticket if:
   *   - RemainingAmount == 0, OR
   *   - TicketEntities.Count > 0 (e.g. customer account), OR
   *   - Orders.Count == 0
   * Source: Ticket.CanCloseTicket  [Ticket.cs:758]
   */
  canCloseTicket() {
    return Number(this._remainingAmount) === 0
        || this.TicketEntities.length > 0
        || this.Orders.length === 0;
  }

  // -------------------------------------------------------------------
  // Ticket state mutations
  // -------------------------------------------------------------------

  /**
   * Unlock the ticket (re-open for editing).
   * Source: Ticket.UnLock()  [Ticket.cs:77]
   */
  unLock() {
    if (!this.IsClosed) this.IsLocked = false;
  }

  /**
   * Lock the ticket and all its unlocked orders.
   * Source: Ticket.LockTicket()  [Ticket.cs:522]
   */
  lockTicket() {
    for (const order of this.Orders) {
      if (!order.Locked) order.Locked = true;
    }
    if (this._shouldLock) this.IsLocked = true;
    this._shouldLock = false;
  }

  /**
   * Close the ticket.
   * Source: Ticket.Close()  [Ticket.cs:79]
   *
   * Requirements:
   *   - RemainingAmount == 0
   *   - No active product timers
   */
  close() {
    if (Number(this._remainingAmount) === 0 && !this.hasActiveTimers()) {
      this.IsClosed = true;
      this.PaidItems = [];
      this.removeZeroAmountAccountTransactions();
    }
  }

  hasActiveTimers() {
    // Sprint 2: ProductTimer not yet implemented; return false.
    return false;
  }

  removeZeroAmountAccountTransactions() {
    if (!this.TransactionDocument) return;
    this.TransactionDocument.removeZeroAmountTransactions();
  }

  // -------------------------------------------------------------------
  // Order mutations
  // -------------------------------------------------------------------

  /**
   * Add an Order to the ticket.
   * Source: Ticket.AddOrder  [Ticket.cs:232]
   *
   * Side effects:
   *   1. unLock() the ticket
   *   2. Add the order to this.Orders
   *   3. Ensure singleton AccountTransactions exist for the sale txn type
   *      and each tax template
   *   4. Set LastModifiedUserName
   *   5. Recalculate ticket totals
   *   6. Publish 'OrderAdded' event
   *
   * @param {Object} order  - the Order entity (already built via OrderBuilder)
   * @param {Array} taxTemplates  - list of TaxTemplate objects
   * @param {Object} saleTemplate  - the SALE AccountTransactionType
   * @param {string} userName
   * @param {Array} [accountDataList]  - ticket entities for account overrides
   */
  addOrder(order, taxTemplates, saleTemplate, userName, accountDataList = null) {
    this.unLock();

    // Ensure singleton AccountTransaction for the sale type
    if (saleTemplate) {
      this.TransactionDocument.addSingletonTransaction(
        saleTemplate.Id, saleTemplate, accountDataList || []
      );
    }

    // Ensure singleton AccountTransactions for each tax template
    for (const taxTemplate of (taxTemplates || [])) {
      if (taxTemplate.AccountTransactionType) {
        this.TransactionDocument.addSingletonTransaction(
          taxTemplate.AccountTransactionType.Id,
          taxTemplate.AccountTransactionType,
          accountDataList || []
        );
      }
    }

    this.Orders.push(order);
    this.LastModifiedUserName = userName;
    this.LastOrderDate = new Date().toISOString();

    // Recalculate + publish
    this._recalculateAndPublish(accountDataList);
    publish(EventTopicNames.OrderAdded, { Ticket: this, Order: order, MenuItemName: order.MenuItemName });
  }

  /**
   * Remove an Order from the ticket.
   * Source: Ticket.RemoveOrder  [Ticket.cs:269]
   *
   * Also removes the linked AccountTransaction IF no other order uses the
   * same AccountTransactionTypeId.
   */
  removeOrder(order) {
    const idx = this.Orders.indexOf(order);
    if (idx < 0) return;
    this.Orders.splice(idx, 1);

    // Check if any other order uses the same AccountTransactionTypeId
    const txnTypeId = order.AccountTransactionTypeId;
    const stillUsed = this.Orders.some(o => o.AccountTransactionTypeId === txnTypeId);
    if (!stillUsed && this.TransactionDocument) {
      this.TransactionDocument.AccountTransactions = this.TransactionDocument.AccountTransactions.filter(
        t => t.AccountTransactionTypeId !== txnTypeId
      );
    }

    this._recalculateAndPublish();
  }

  // -------------------------------------------------------------------
  // Calculation mutations
  // -------------------------------------------------------------------

  /**
   * Add or update a Calculation (discount/service/rounding) on the ticket.
   * Source: Ticket.AddCalculation  [Ticket.cs:379-410]
   *
   * @param {Object} calculationType  - the CalculationType definition
   * @param {number} amount  - the amount (percentage, fixed, or target)
   * @param {Object} [accountTransactionType]  - linked txn type for ledger update
   */
  addCalculation(calculationType, amount, accountTransactionType = null) {
    // Find existing Calculation with same CalculationTypeId
    let existing = this.Calculations.find(
      c => c.CalculationTypeId === calculationType.Id
    );

    if (!existing && accountTransactionType) {
      // Try by AccountTransactionTypeId as fallback
      existing = this.Calculations.find(
        c => c.AccountTransactionTypeId === accountTransactionType.Id
      );
    }

    if (!existing) {
      // Create new
      const calc = {
        Name: calculationType.Name,
        Order: calculationType.SortOrder || 0,
        CalculationTypeId: calculationType.Id,
        AccountTransactionTypeId: accountTransactionType ? accountTransactionType.Id : 0,
        CalculationType: calculationType.CalculationMethod,
        IncludeTax: calculationType.IncludeTax ? true : false,
        DecreaseAmount: calculationType.DecreaseAmount ? true : false,
        UsePlainSum: calculationType.UsePlainSum ? true : false,
        Amount: amount,
        CalculationAmount: 0,
      };
      this.Calculations.push(calc);
      existing = calc;

      // Add singleton AccountTransaction for this calculation
      if (accountTransactionType) {
        this.TransactionDocument.addSingletonTransaction(
          accountTransactionType.Id, accountTransactionType, []
        );
      }
    } else if (calculationType.ToggleCalculation && Number(existing.Amount) === Number(amount)) {
      // Toggle off
      existing.Amount = 0;
    } else {
      existing.Amount = amount;
      existing.Name = calculationType.Name;
    }

    // Auto-remove if amount == 0 and not a scripted calc (type 5)
    if (Number(existing.Amount) === 0 && existing.CalculationType !== 5) {
      this.Calculations = this.Calculations.filter(c => c !== existing);
    }

    this._recalculateAndPublish();
  }

  // -------------------------------------------------------------------
  // Payment mutations
  // -------------------------------------------------------------------

  /**
   * Add a Payment to the ticket.
   * Source: Ticket.AddPayment  [Ticket.cs:251]
   *
   * @param {Object} paymentType
   * @param {Object} account  - the Account to receive the payment
   * @param {number} amount  - the payment amount (positive)
   * @param {number} exchangeRate
   * @param {number} userId
   * @returns {Object} the new Payment row
   */
  addPayment(paymentType, account, amount, exchangeRate, userId) {
    const txn = this.TransactionDocument.addNewTransaction(
      paymentType.AccountTransactionType,
      this._getTicketAccounts(account),
      amount,
      exchangeRate
    );
    txn.updateDescription(paymentType.AccountTransactionType.Name + ' [' + (account?.Name || '') + ']');

    const payment = {
      PaymentTypeId: paymentType.Id,
      Name: account?.Name || '',
      Date: new Date().toISOString(),
      AccountTransactionId: txn.Id,  // will be 0 until persisted
      AccountTransaction: txn,
      Amount: amount,
      UserId: userId,
    };
    this.Payments.push(payment);
    this.LastPaymentDate = new Date().toISOString();

    this._recalculateAndPublish(this._getTicketAccounts(account));
    publish(EventTopicNames.PaymentProcessed, {
      Ticket: this,
      PaymentTypeName: paymentType.Name,
      TenderedAmount: amount,
      ProcessedAmount: amount,
      ChangeAmount: 0,
      RemainingAmount: this._remainingAmount,
    });

    return payment;
  }

  /**
   * Add a ChangePayment to the ticket (cash back to customer).
   * Source: Ticket.AddChangePayment  [Ticket.cs:261]
   */
  addChangePayment(changePaymentType, account, amount, exchangeRate, userId) {
    const txn = this.TransactionDocument.addNewTransaction(
      changePaymentType.AccountTransactionType,
      this._getTicketAccounts(account),
      amount,
      exchangeRate
    );
    txn.updateDescription(changePaymentType.AccountTransactionType.Name + ' [' + (account?.Name || '') + ']');

    const changePayment = {
      ChangePaymentTypeId: changePaymentType.Id,
      Name: account?.Name || '',
      Date: new Date().toISOString(),
      AccountTransactionId: txn.Id,
      AccountTransaction: txn,
      Amount: amount,
      UserId: userId,
    };
    this.ChangePayments.push(changePayment);
    this._recalculateAndPublish(this._getTicketAccounts(account));
    return changePayment;
  }

  /**
   * Build the accountDataList from TicketEntities + the given account.
   * Source: Ticket.GetTicketAccounts(account)  [Ticket.cs:127]
   */
  _getTicketAccounts(account = null) {
    const accounts = [];
    for (const te of this.TicketEntities) {
      accounts.push({
        AccountTypeId: te.AccountTypeId,
        AccountId: te.AccountId,
        AccountName: te.EntityName,
        ExchangeRate: this.ExchangeRate,
      });
    }
    if (account && !accounts.find(a => a.AccountId === account.Id)) {
      accounts.push({
        AccountTypeId: account.AccountTypeId || 0,
        AccountId: account.Id,
        AccountName: account.Name,
        ExchangeRate: this.ExchangeRate,
      });
    }
    return accounts;
  }

  // -------------------------------------------------------------------
  // Master recalculate + publish
  // -------------------------------------------------------------------

  /**
   * Internal: run TicketRecalculator.recalculateTicket and publish
   * 'TicketTotalChanged' if totals changed.
   */
  _recalculateAndPublish(accountDataList = null) {
    const previousTotal = this._totalAmount;
    const saleTxnType = null; // already created via addSingletonTransaction in addOrder
    recalculateTicket(this, saleTxnType, accountDataList);

    if (Number(previousTotal) !== Number(this._totalAmount)) {
      publish(EventTopicNames.TicketTotalChanged, {
        Ticket: this,
        PreviousTotal: previousTotal,
        TicketTotal: this._totalAmount,
        RemainingAmount: this._remainingAmount,
      });
    }
  }

  // -------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------

  toJSON() {
    return {
      Id: this.Id,
      Name: this.Name,
      TicketNumber: this.TicketNumber,
      Date: this.Date,
      LastOrderDate: this.LastOrderDate,
      LastPaymentDate: this.LastPaymentDate,
      LastUpdateTime: this.LastUpdateTime,
      IsClosed: this.IsClosed ? 1 : 0,
      IsLocked: this.IsLocked ? 1 : 0,
      RemainingAmount: this._remainingAmount,
      TotalAmount: this._totalAmount,
      DepartmentId: this.DepartmentId,
      TicketTypeId: this.TicketTypeId,
      Note: this.Note,
      LastModifiedUserName: this.LastModifiedUserName,
      TicketTags: this._ticketTags,
      TicketStates: this._ticketStates,
      TicketLogs: this._ticketLogs,
      ExchangeRate: this.ExchangeRate,
      TaxIncluded: this.TaxIncluded ? 1 : 0,
      TransactionDocumentId: this.TransactionDocument?.Id || null,
      Orders: this.Orders,
      Payments: this.Payments,
      ChangePayments: this.ChangePayments,
      Calculations: this.Calculations,
      PaidItems: this.PaidItems,
      TicketEntities: this.TicketEntities,
      TransactionDocument: this.TransactionDocument?.toJSON(),
    };
  }
}

module.exports = { Ticket };
