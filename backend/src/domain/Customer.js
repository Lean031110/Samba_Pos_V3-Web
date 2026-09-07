// =====================================================================
// Customer.js — Customer aggregate root (FASE 2)
// =====================================================================
// Represents a customer (loyalty member, account holder, or walk-in with
// contact info). Tracks AccountBalance for customer-account payment method.
//
// Invariants:
//   - Name is required and unique per GroupId (enforced at DB level)
//   - Code is unique when present (loyalty #, member #)
//   - AccountBalance changes only via explicit credit/debit operations
//   - Soft-delete via IsActive flag (never hard-delete)
// =====================================================================

const { ValidationError, ConflictError, NotFoundError } = require('../api/middleware/errorHandler');

class Customer {
  constructor(row) {
    this.Id = row?.Id;
    this.Name = row?.Name;
    this.Code = row?.Code || null;
    this.Phone = row?.Phone || null;
    this.Email = row?.Email || null;
    this.Address = row?.Address || null;
    this.TaxId = row?.TaxId || null;
    this.AccountBalance = row?.AccountBalance != null ? Number(row.AccountBalance) : 0;
    this.GroupId = row?.GroupId || null;
    this.CreatedAt = row?.CreatedAt || new Date().toISOString();
    this.UpdatedAt = row?.UpdatedAt || new Date().toISOString();
    this.IsActive = row?.IsActive != null ? !!row.IsActive : true;
    this.Notes = row?.Notes || null;
  }

  /**
   * Credit the customer's account (e.g. prepaid top-up).
   */
  credit(amount, reason = null) {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('credit amount must be positive');
    }
    this.AccountBalance = Number((this.AccountBalance + amount).toFixed(2));
    this.UpdatedAt = new Date().toISOString();
    return { action: 'credit', amount, newBalance: this.AccountBalance, reason };
  }

  /**
   * Debit the customer's account (e.g. pay for a ticket with account).
   * Fails if insufficient balance.
   */
  debit(amount, reason = null) {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('debit amount must be positive');
    }
    if (this.AccountBalance < amount) {
      throw new ConflictError(
        `Customer ${this.Id} has insufficient balance: ${this.AccountBalance} < ${amount}`,
        { balance: this.AccountBalance, requested: amount }
      );
    }
    this.AccountBalance = Number((this.AccountBalance - amount).toFixed(2));
    this.UpdatedAt = new Date().toISOString();
    return { action: 'debit', amount, newBalance: this.AccountBalance, reason };
  }

  /**
   * Refund a previous debit (e.g. ticket voided after payment with account).
   */
  refund(amount, reason = null) {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('refund amount must be positive');
    }
    this.AccountBalance = Number((this.AccountBalance + amount).toFixed(2));
    this.UpdatedAt = new Date().toISOString();
    return { action: 'refund', amount, newBalance: this.AccountBalance, reason };
  }

  /**
   * Soft-delete (deactivate). The customer remains in the DB for audit but
   * cannot be used for new tickets.
   */
  deactivate(reason = null) {
    if (!this.IsActive) {
      throw new ConflictError(`Customer ${this.Id} is already inactive`);
    }
    this.IsActive = false;
    this.UpdatedAt = new Date().toISOString();
    if (reason) this.Notes = `${this.Notes || ''} [DEACTIVATED: ${reason}]`.trim();
    return this;
  }

  reactivate() {
    if (this.IsActive) {
      throw new ConflictError(`Customer ${this.Id} is already active`);
    }
    this.IsActive = true;
    this.UpdatedAt = new Date().toISOString();
    return this;
  }

  validate() {
    if (!this.Name || this.Name.length < 1 || this.Name.length > 255) {
      throw new ValidationError('Customer.Name must be 1-255 chars');
    }
    if (this.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.Email)) {
      throw new ValidationError('Customer.Email is invalid');
    }
    if (this.AccountBalance < 0) {
      throw new ValidationError('Customer.AccountBalance cannot be negative');
    }
    return true;
  }

  toRow() {
    return {
      Id: this.Id,
      Name: this.Name,
      Code: this.Code,
      Phone: this.Phone,
      Email: this.Email,
      Address: this.Address,
      TaxId: this.TaxId,
      AccountBalance: this.AccountBalance,
      GroupId: this.GroupId,
      CreatedAt: this.CreatedAt,
      UpdatedAt: this.UpdatedAt,
      IsActive: this.IsActive ? 1 : 0,
      Notes: this.Notes,
    };
  }
}

module.exports = { Customer };
