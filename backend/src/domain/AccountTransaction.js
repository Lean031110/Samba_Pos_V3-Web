// =====================================================================
// AccountTransaction.js — Domain entity (POCO)
// =====================================================================
// Mirrors: Samba.Domain/Models/Accounts/AccountTransaction.cs (234 lines)
//
// The double-entry primitive. Has:
//   - SourceTransactionValue (AccountTransactionValue) — Credit side
//   - TargetTransactionValue (AccountTransactionValue) — Debit side
//
// Key behavior: auto-reversal on negative amount.
//   If UpdateAmount(amount) is called with amount < 0 AND CanReverse():
//     → SourceTransactionValue ↔ TargetTransactionValue are swapped
//     → IsReversed = true
//     → Amount = abs(amount)
//
// Per Architect's directive: all monetary math goes through CalculationEngine.
// =====================================================================

const { roundAway } = require('./CalculationEngine');

class AccountTransactionValue {
  constructor(data = {}) {
    this.Id = data.Id || 0;
    this.AccountTransactionId = data.AccountTransactionId || 0;
    this.AccountTransactionDocumentId = data.AccountTransactionDocumentId || 0;
    this.AccountId = data.AccountId || 0;
    this.AccountTypeId = data.AccountTypeId || 0;
    this.Date = data.Date || null;
    // Decimal values stored as Decimal objects (from CalculationEngine)
    // OR as raw numbers if loaded from DB. Always access via getters.
    this._debit = data.Debit || 0;
    this._credit = data.Credit || 0;
    this._exchange = data.Exchange || 0;
    this.Name = data.Name || null;
  }

  get Debit()  { return this._debit; }
  get Credit() { return this._credit; }
  get Exchange() { return this._exchange; }

  /**
   * Apply the amount as one-sided movement on whichever side is "active".
   * Source side: Debit=0, Credit=amount (the source account is credited)
   * Target side: Credit=0, Debit=amount (the target account is debited)
   *
   * Source: AccountTransaction.Amount setter [AccountTransaction.cs:55-90]
   *
   * @param {number|Decimal} amount  absolute amount (>= 0)
   * @param {number|Decimal} exchangeRate
   */
  applyAmount(amount, exchangeRate) {
    // Source = Credit side, Target = Debit side (by SambaPOS convention)
    this._debit = 0;
    this._credit = amount;
    this.updateExchange(exchangeRate);
  }

  /**
   * Mirror of applyAmount but with debit/credit swapped (used after Reverse).
   */
  applyAmountReversed(amount, exchangeRate) {
    this._debit = amount;
    this._credit = 0;
    this.updateExchange(exchangeRate);
  }

  /**
   * Compute Exchange = (Debit - Credit) / exchangeRate, rounded to 2dp banker's.
   * Source: AccountTransactionValue.UpdateExchange  [AccountTransactionValue.cs:22-25]
   *
   * NOTE: This uses BANKER's rounding (ToEven), matching the C# original.
   */
  updateExchange(exchangeRate) {
    if (!exchangeRate || Number(exchangeRate) === 0) {
      this._exchange = 0;
      return;
    }
    const { Decimal } = require('decimal.js');
    const debit = new Decimal(this._debit || 0);
    const credit = new Decimal(this._credit || 0);
    const rate = new Decimal(exchangeRate);
    const { roundBankers } = require('./CalculationEngine');
    this._exchange = roundBankers(debit.minus(credit).div(rate), 2).toNumber();
  }

  toJSON() {
    return {
      Id: this.Id,
      AccountTransactionId: this.AccountTransactionId,
      AccountTransactionDocumentId: this.AccountTransactionDocumentId,
      AccountId: this.AccountId,
      AccountTypeId: this.AccountTypeId,
      Date: this.Date,
      Debit: this.Debit,
      Credit: this.Credit,
      Exchange: this.Exchange,
      Name: this.Name,
    };
  }
}

class AccountTransaction {
  constructor(data = {}) {
    this.Id = data.Id || 0;
    this.Name = data.Name || null;
    this.AccountTransactionDocumentId = data.AccountTransactionDocumentId || 0;
    this.AccountTransactionTypeId = data.AccountTransactionTypeId || 0;
    this.SourceAccountTypeId = data.SourceAccountTypeId || 0;
    this.TargetAccountTypeId = data.TargetAccountTypeId || 0;
    this._amount = data.Amount || 0;
    this._exchangeRate = data.ExchangeRate || 1;
    this.IsReversed = data.IsReversed ? 1 : 0;
    this.Reversable = data.Reversable !== undefined ? (data.Reversable ? 1 : 0) : 1;

    // Source (Credit) and Target (Debit) legs
    this.SourceTransactionValue = data.SourceTransactionValue
      ? new AccountTransactionValue(data.SourceTransactionValue)
      : new AccountTransactionValue();
    this.TargetTransactionValue = data.TargetTransactionValue
      ? new AccountTransactionValue(data.TargetTransactionValue)
      : new AccountTransactionValue();
  }

  get Amount() { return this._amount; }
  get ExchangeRate() { return this._exchangeRate; }

  /**
   * Whether this transaction can be auto-reversed.
   * Source: AccountTransaction.CanReverse()  [AccountTransaction.cs:228]
   */
  canReverse() {
    return this.Reversable === 1 && !this.IsReversed;
  }

  /**
   * Swap source and target transaction values, set IsReversed=true.
   * Source: AccountTransaction.Reverse()  [AccountTransaction.cs:177-191]
   */
  reverse() {
    const tmp = this.SourceTransactionValue;
    this.SourceTransactionValue = this.TargetTransactionValue;
    this.TargetTransactionValue = tmp;
    this.IsReversed = 1;
  }

  /**
   * Update the amount (with auto-reversal on negative).
   * Source: AccountTransaction.UpdateAmount  [AccountTransaction.cs:193-215]
   *
   * Per Architect's directive:
   *   - Negative amount for payments (e.g. -10.00)
   *   - Positive amount for sales
   *   - Ledger stays balanced
   *
   * Behavior:
   *   1. If amount < 0 and CanReverse(): Reverse() (swap source/target)
   *   2. Else if IsReversed and amount >= 0: Reverse() back, IsReversed=false
   *   3. Amount = abs(amount)
   *   4. Amount = roundAway(Amount, 2)  -- CRITICAL: AwayFromZero, not banker's
   *   5. Apply amount to Source (Credit) and Target (Debit) legs
   *
   * @param {number|Decimal} amount  signed amount (negative → reversal)
   * @param {number|Decimal} exchangeRate
   * @param {Array<{AccountId: number, ExchangeRate: number}>} [accounts]  optional account overrides
   */
  updateAmount(amount, exchangeRate, accounts = null) {
    // Auto-reversal logic
    if (Number(amount) < 0 && this.canReverse()) {
      this.reverse();
    } else if (this.IsReversed && Number(amount) >= 0) {
      this.reverse();
      this.IsReversed = 0;
    }

    // Always store absolute value, rounded AWAY from zero (NOT banker's)
    // Source: AccountTransaction.cs:203 — Decimal.Round(Amount, 2, MidpointRounding.AwayFromZero)
    const absAmount = roundAway(Math.abs(Number(amount)), 2).toNumber();
    this._amount = absAmount;
    this._exchangeRate = Number(exchangeRate) || 1;

    // Apply account overrides if provided
    if (accounts && accounts.length > 0) {
      const srcAccount = accounts.find(a => a.AccountId === this.SourceTransactionValue.AccountId);
      if (srcAccount) {
        this.SourceTransactionValue.updateExchange(srcAccount.ExchangeRate || 1);
      }
      const tgtAccount = accounts.find(a => a.AccountId === this.TargetTransactionValue.AccountId);
      if (tgtAccount) {
        this.TargetTransactionValue.updateExchange(tgtAccount.ExchangeRate || 1);
      }
    } else {
      // Apply amount to both legs
      this.SourceTransactionValue.applyAmount(absAmount, this._exchangeRate);
      this.TargetTransactionValue.applyAmountReversed(absAmount, this._exchangeRate);
    }
  }

  /**
   * Update the description (Name + " [accountName]").
   * Source: AccountTransaction.UpdateDescription  [AccountTransaction.cs:217]
   */
  updateDescription(description) {
    this.Name = description;
  }

  /**
   * Override the source/target account IDs from ticket entity context.
   * Source: AccountTransaction.UpdateAccounts  [AccountTransaction.cs:130-160]
   *
   * @param {Array<{AccountTypeId: number, AccountId: number, ExchangeRate: number}>} accountDataList
   */
  updateAccounts(accountDataList) {
    if (!accountDataList || accountDataList.length === 0) return;
    const srcOverride = accountDataList.find(a => a.AccountTypeId === this.SourceAccountTypeId);
    if (srcOverride && srcOverride.AccountId) {
      this.SourceTransactionValue.AccountId = srcOverride.AccountId;
      this.SourceTransactionValue.AccountTypeId = this.SourceAccountTypeId;
    }
    const tgtOverride = accountDataList.find(a => a.AccountTypeId === this.TargetAccountTypeId);
    if (tgtOverride && tgtOverride.AccountId) {
      this.TargetTransactionValue.AccountId = tgtOverride.AccountId;
      this.TargetTransactionValue.AccountTypeId = this.TargetAccountTypeId;
    }
  }

  /**
   * Verify ledger balance: Debit on target must equal Credit on source.
   * Used in tests to confirm double-entry integrity.
   */
  isBalanced() {
    const { Decimal } = require('decimal.js');
    const sourceCredit = new Decimal(this.SourceTransactionValue.Credit || 0);
    const targetDebit  = new Decimal(this.TargetTransactionValue.Debit || 0);
    const sourceDebit  = new Decimal(this.SourceTransactionValue.Debit || 0);
    const targetCredit = new Decimal(this.TargetTransactionValue.Credit || 0);
    // Source Credit must equal Target Debit (the moved amount)
    return sourceCredit.eq(targetDebit)
        && sourceDebit.eq(targetCredit)
        && sourceCredit.plus(sourceDebit).eq(targetDebit.plus(targetCredit));
  }

  toJSON() {
    return {
      Id: this.Id,
      Name: this.Name,
      AccountTransactionDocumentId: this.AccountTransactionDocumentId,
      AccountTransactionTypeId: this.AccountTransactionTypeId,
      SourceAccountTypeId: this.SourceAccountTypeId,
      TargetAccountTypeId: this.TargetAccountTypeId,
      Amount: this.Amount,
      ExchangeRate: this.ExchangeRate,
      IsReversed: this.IsReversed,
      Reversable: this.Reversable,
      SourceTransactionValue: this.SourceTransactionValue.toJSON(),
      TargetTransactionValue: this.TargetTransactionValue.toJSON(),
    };
  }
}

module.exports = { AccountTransaction, AccountTransactionValue };
