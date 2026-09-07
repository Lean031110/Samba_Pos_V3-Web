// =====================================================================
// Notification.js — Notification aggregate root (FASE 2 — prepares FASE 9)
// =====================================================================
// A Notification is an in-app or push notification record. It can target a
// specific user, a role (pos/kitchen/admin), or be a broadcast.
//
// State machine:
//   (created, IsDelivered=0, IsRead=0)
//     ──deliver()──► (IsDelivered=1, DeliveredAt=now)
//     ──markRead(userId)──► (IsRead=1, ReadAt=now)
//   (terminal — notifications are immutable after read)
//
// IdempotencyKey on creation prevents duplicate notifications for the same
// logical event (e.g. "ticket:42 ready" should only create one row).
//
// In FASE 9 (Web Push) this aggregate will be paired with:
//   - VAPID keys
//   - Subscription registry (per device)
//   - Service Worker push handler
// The domain layer here is intentionally push-agnostic.
// =====================================================================

const { ConflictError, ValidationError } = require('../api/middleware/errorHandler');

const CATEGORIES = Object.freeze({
  KITCHEN: 'kitchen',
  PRINTER: 'printer',
  STOCK: 'stock',
  SYSTEM: 'system',
  TICKET: 'ticket',
});

const SEVERITIES = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical',
});

class Notification {
  constructor(row) {
    this.Id = row?.Id;
    this.CreatedAt = row?.CreatedAt || new Date().toISOString();
    this.Category = row?.Category;
    this.Severity = row?.Severity || SEVERITIES.INFO;
    this.Title = row?.Title;
    this.Body = row?.Body || null;
    this.Action = row?.Action || null;
    this.TargetUserId = row?.TargetUserId || null;
    this.TargetRole = row?.TargetRole || null;
    this.EntityId = row?.EntityId || null;
    this.EntityType = row?.EntityType || null;
    this.IsRead = row?.IsRead != null ? !!row.IsRead : false;
    this.IsDelivered = row?.IsDelivered != null ? !!row.IsDelivered : false;
    this.ReadAt = row?.ReadAt || null;
    this.DeliveredAt = row?.DeliveredAt || null;
    this.IdempotencyKey = row?.IdempotencyKey || null;
  }

  /**
   * Mark this notification as delivered (push sent to device).
   * Idempotent: calling twice has no extra effect.
   */
  deliver() {
    if (this.IsDelivered) return false;
    this.IsDelivered = true;
    this.DeliveredAt = new Date().toISOString();
    return true;
  }

  /**
   * Mark this notification as read by the user.
   * Idempotent: calling twice has no extra effect.
   */
  markRead() {
    if (this.IsRead) return false;
    this.IsRead = true;
    this.ReadAt = new Date().toISOString();
    return true;
  }

  /**
   * Whether this notification should be shown to the given user/role.
   * Broadcasts (TargetUserId=null, TargetRole=null) are visible to everyone.
   */
  isVisibleTo({ userId, role, isAdmin = false }) {
    if (isAdmin) return true;
    if (this.TargetUserId != null && this.TargetUserId === userId) return true;
    if (this.TargetRole != null && this.TargetRole === role) return true;
    if (this.TargetUserId == null && this.TargetRole == null) return true;  // broadcast
    return false;
  }

  /**
   * Validate this notification before persisting.
   */
  validate() {
    if (!this.Category) throw new ValidationError('Notification.Category is required');
    if (!this.Title) throw new ValidationError('Notification.Title is required');
    if (!Object.values(CATEGORIES).includes(this.Category)) {
      throw new ValidationError(`Invalid category: ${this.Category}`);
    }
    if (!Object.values(SEVERITIES).includes(this.Severity)) {
      throw new ValidationError(`Invalid severity: ${this.Severity}`);
    }
    if (this.Title.length > 200) {
      throw new ValidationError('Notification.Title must be <= 200 chars');
    }
    if (this.TargetRole != null && !['pos', 'kitchen', 'admin'].includes(this.TargetRole)) {
      throw new ValidationError(`Invalid TargetRole: ${this.TargetRole}`);
    }
    return true;
  }

  toRow() {
    return {
      Id: this.Id,
      CreatedAt: this.CreatedAt,
      Category: this.Category,
      Severity: this.Severity,
      Title: this.Title,
      Body: this.Body,
      Action: this.Action,
      TargetUserId: this.TargetUserId,
      TargetRole: this.TargetRole,
      EntityId: this.EntityId,
      EntityType: this.EntityType,
      IsRead: this.IsRead ? 1 : 0,
      IsDelivered: this.IsDelivered ? 1 : 0,
      ReadAt: this.ReadAt,
      DeliveredAt: this.DeliveredAt,
      IdempotencyKey: this.IdempotencyKey,
    };
  }
}

Notification.CATEGORIES = CATEGORIES;
Notification.SEVERITIES = SEVERITIES;

module.exports = { Notification };
