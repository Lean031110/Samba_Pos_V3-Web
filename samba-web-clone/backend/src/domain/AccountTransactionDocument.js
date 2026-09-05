// =====================================================================
// AccountTransactionDocument.js — Domain entity
// =====================================================================
// Mirrors: Samba.Domain/Models/Accounts/AccountTransactionDocument.cs (64 lines)
//
// Container for AccountTransactions. Two key factory methods:
//   - AddNewTransaction(template, accountDataList, amount, exchangeRate)
//       Always creates a new transaction row.
//   - AddSingletonTransaction(transactionTypeId, template, accountDataList)
//       Creates only if no transaction with that AccountTransactionTypeId exists.
//   - UpdateSingletonTransactionAmount(transactionTypeId, name, amount, exchangeRate)
//       Updates the singleton's amount (creates if missing).
//
// Source: AccountTransactionDocument.cs
// =====================================================================

const { AccountTransaction } = require('./AccountTransaction');
const { roundAway } = require('./CalculationEngine');

class AccountTransactionDocument {
  constructor(data = {}) {
    this.Id = data.Id || 0;
    this.Name = data.Name || null;
    this.Date = data.Date || new Date().toISOString();
    this.DocumentTypeId = data.DocumentTypeId || 0;
    this.AccountTransactions = (data.AccountTransactions || []).map(
      t => t instanceof AccountTransaction ? t : new AccountTransaction(t)
    );
  }

  /**
   * Add a new AccountTransaction (always creates a new row).
   * Source: AccountTransactionDocument.AddNewTransaction  [.cs:33-40]
   *
   * @param {{
   *   Id: number, Name: string,
   *   SourceAccountTypeId: number, TargetAccountTypeId: number,
   *   DefaultSourceAccountId: number, DefaultTargetAccountId: number,
   * }} template - AccountTransactionType definition
   * @param {Array} accountDataList  - overrides from ticket entities
   * @param {number} amount  - signed amount (negative → auto-reverse)
   * @param {number} exchangeRate
   * @returns {AccountTransaction}
   */
  addNewTransaction(template, accountDataList, amount, exchangeRate) {
    const txn = new AccountTransaction({
      Name: template.Name,
      AccountTransactionTypeId: template.Id,
      SourceAccountTypeId: template.SourceAccountTypeId,
      TargetAccountTypeId: template.TargetAccountTypeId,
      SourceTransactionValue: {
        AccountId: template.DefaultSourceAccountId,
        AccountTypeId: template.SourceAccountTypeId,
        Date: this.Date,
      },
      TargetTransactionValue: {
        AccountId: template.DefaultTargetAccountId,
        AccountTypeId: template.TargetAccountTypeId,
        Date: this.Date,
      },
      Date: this.Date,
      ExchangeRate: exchangeRate,
    });
    txn.updateAccounts(accountDataList);
    txn.updateAmount(amount, exchangeRate);
    txn.updateDescription(template.Name + ' [' + (accountDataList?.[0]?.AccountName || '') + ']');
    this.AccountTransactions.push(txn);
    return txn;
  }

  /**
   * Add a transaction only if no transaction with the given
   * AccountTransactionTypeId already exists (idempotent).
   * Source: AccountTransactionDocument.AddSingletonTransaction  [.cs:41-47]
   *
   * @param {number} transactionTypeId
   * @param {Object} template  - AccountTransactionType
   * @param {Array} accountDataList
   * @returns {AccountTransaction} the existing or newly-created transaction
   */
  addSingletonTransaction(transactionTypeId, template, accountDataList) {
    const existing = this.AccountTransactions.find(
      t => t.AccountTransactionTypeId === transactionTypeId
    );
    if (existing) return existing;
    return this.addNewTransaction(template, accountDataList, 0, 1);
  }

  /**
   * Update the amount of a singleton transaction by AccountTransactionTypeId.
   * If the singleton doesn't exist yet, it's created.
   * Source: AccountTransactionDocument.UpdateSingletonTransactionAmount  [.cs:49-57]
   *
   * @param {number} transactionTypeId
   * @param {string} name
   * @param {number} amount  - absolute (always positive; sign comes from Reversable)
   * @param {number} exchangeRate
   * @param {Object} [template]  - required if creating new
   * @param {Array}  [accountDataList]
   */
  updateSingletonTransactionAmount(transactionTypeId, name, amount, exchangeRate, template = null, accountDataList = null) {
    let txn = this.AccountTransactions.find(
      t => t.AccountTransactionTypeId === transactionTypeId
    );
    if (!txn) {
      if (!template) throw new Error(`Singleton transaction ${transactionTypeId} not found and no template provided`);
      txn = this.addNewTransaction(template, accountDataList || [], 0, exchangeRate);
    }
    txn.updateAmount(amount, exchangeRate, accountDataList);
    txn.updateDescription(name + ' [' + (accountDataList?.[0]?.AccountName || '') + ']');
  }

  /**
   * Get the total amount of all transactions in this document.
   * Source: AccountTransactionDocument.GetAmount()  [.cs:59]
   *
   * NOTE: This returns the sum of all Amount fields. Since each transaction
   * has its own meaning (sale, tax, discount, payment, change), the sum
   * is NOT necessarily zero — that's only true for a fully-settled ticket.
   */
  getAmount() {
    const { Decimal } = require('decimal.js');
    return this.AccountTransactions.reduce(
      (sum, t) => sum.plus(t.Amount || 0),
      new Decimal(0)
    );
  }

  /**
   * Remove all transactions with Amount == 0 (called during Ticket.Close).
   * Source: Ticket.RemoveZeroAmountAccountTransactions  [Ticket.cs:816]
   */
  removeZeroAmountTransactions() {
    this.AccountTransactions = this.AccountTransactions.filter(t => Number(t.Amount) !== 0);
  }

  toJSON() {
    return {
      Id: this.Id,
      Name: this.Name,
      Date: this.Date,
      DocumentTypeId: this.DocumentTypeId,
      AccountTransactions: this.AccountTransactions.map(t => t.toJSON()),
    };
  }
}

module.exports = { AccountTransactionDocument };
