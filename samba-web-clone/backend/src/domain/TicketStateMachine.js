// =====================================================================
// TicketStateMachine.js — Formal state machine for Ticket lifecycle (FASE 2)
// =====================================================================
// The Ticket aggregate has a complex set of allowed transitions. Previously
// each guard was scattered across services; this module is the single source
// of truth for what transitions are allowed.
//
// States:
//   DRAFT     — ticket created, no orders yet (or orders present but unpaid)
//   OPEN      — has at least one order, not yet fully paid
//   LOCKED    — operator temporarily locked the ticket (e.g. during payment)
//   PAID      — fully paid, awaiting close
//   CLOSED    — finalized, no further mutations (except refund/void)
//   VOIDED    — cancelled, all orders voided
//   REFUNDED  — closed then fully refunded
//
// Allowed transitions:
//   DRAFT → OPEN           (first order added)
//   OPEN → DRAFT           (last order removed)
//   OPEN → LOCKED          (operator locks)
//   LOCKED → OPEN          (operator unlocks)
//   OPEN → PAID            (remaining = 0 after payment)
//   PAID → OPEN            (refund added; partial refund reopens)
//   PAID → CLOSED          (closeTicket called)
//   CLOSED → REFUNDED      (full refund processed)
//   DRAFT | OPEN → VOIDED  (voidTicket called; CLOSED can also be voided under rule)
//   CLOSED → VOIDED        (only with admin override + reason)
//   VOIDED → (none)        (terminal state — refund inventory only)
//   REFUNDED → (none)      (terminal state)
// =====================================================================

const { ConflictError, ValidationError } = require('../api/middleware/errorHandler');

const STATES = Object.freeze({
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  LOCKED: 'LOCKED',
  PAID: 'PAID',
  CLOSED: 'CLOSED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
});

// Map of allowed transitions: from → set of allowed targets
const TRANSITIONS = Object.freeze({
  [STATES.DRAFT]:    new Set([STATES.OPEN, STATES.LOCKED, STATES.VOIDED]),
  [STATES.OPEN]:     new Set([STATES.DRAFT, STATES.LOCKED, STATES.PAID, STATES.VOIDED]),
  [STATES.LOCKED]:   new Set([STATES.OPEN, STATES.VOIDED]),
  [STATES.PAID]:     new Set([STATES.OPEN, STATES.CLOSED, STATES.VOIDED]),
  [STATES.CLOSED]:   new Set([STATES.REFUNDED, STATES.VOIDED]),
  [STATES.VOIDED]:   new Set(),  // terminal
  [STATES.REFUNDED]: new Set(),  // terminal
});

// Reverse-lookup: which actions trigger which transitions?
const ACTION_TO_TARGET = Object.freeze({
  addOrder:        STATES.OPEN,
  removeOrder:     STATES.DRAFT,    // only if no orders remain
  lock:            STATES.LOCKED,
  unlock:          STATES.OPEN,
  addPayment:      STATES.PAID,    // only when remaining reaches 0
  partialRefund:   STATES.OPEN,    // reopens a PAID ticket
  close:           STATES.CLOSED,
  fullRefund:      STATES.REFUNDED,
  void:            STATES.VOIDED,
});

// Special rules per action
const ACTION_RULES = Object.freeze({
  addOrder: {
    requiresState: [STATES.DRAFT, STATES.OPEN],
    extraChecks: (ticket) => {
      if (ticket.IsLocked) throw new ConflictError('Ticket is locked; cannot add orders');
    },
  },
  removeOrder: {
    requiresState: [STATES.OPEN],
    extraChecks: (ticket, ctx = {}) => {
      if (ticket.IsLocked) throw new ConflictError('Ticket is locked; cannot remove orders');
      if ((ctx.ordersAfterRemoval || 0) > 0) {
        // Still has orders → stays in OPEN, not a state transition
        return STATES.OPEN;
      }
      return STATES.DRAFT;
    },
  },
  lock: {
    requiresState: [STATES.DRAFT, STATES.OPEN],
    extraChecks: () => {},
  },
  unlock: {
    requiresState: [STATES.LOCKED],
    extraChecks: () => {},
  },
  addPayment: {
    requiresState: [STATES.OPEN, STATES.LOCKED],
    extraChecks: (ticket, ctx = {}) => {
      // After payment, if remaining == 0 → PAID, else stays OPEN
      const remaining = ctx.remainingAfterPayment != null
        ? ctx.remainingAfterPayment
        : Number(ticket.RemainingAmount);
      return remaining <= 0 ? STATES.PAID : STATES.OPEN;
    },
  },
  partialRefund: {
    requiresState: [STATES.PAID],
    extraChecks: () => STATES.OPEN,
  },
  close: {
    requiresState: [STATES.PAID],
    extraChecks: (ticket) => {
      const remaining = Number(ticket.RemainingAmount || 0);
      if (remaining > 0) {
        throw new ConflictError(
          `Cannot close ticket with remaining amount ${remaining}`,
          { remainingAmount: remaining }
        );
      }
    },
  },
  fullRefund: {
    requiresState: [STATES.CLOSED],
    extraChecks: () => {},
  },
  void: {
    requiresState: [STATES.DRAFT, STATES.OPEN, STATES.LOCKED, STATES.PAID, STATES.CLOSED],
    extraChecks: (ticket, ctx = {}) => {
      // Voiding a CLOSED ticket requires admin override
      if (deriveState(ticket) === STATES.CLOSED && !ctx.adminOverride) {
        throw new ConflictError(
          'Cannot void a CLOSED ticket without admin override',
          { reason: 'closed-ticket-void-requires-admin' }
        );
      }
    },
  },
});

/**
 * Derive the current state of a Ticket from its row data.
 * The DB doesn't have a State column — it's computed from flags:
 *   - IsVoided flag (if present) → VOIDED
 *   - IsClosed + fully refunded → REFUNDED
 *   - IsClosed → CLOSED
 *   - remaining == 0 && !IsClosed → PAID
 *   - IsLocked → LOCKED
 *   - has orders → OPEN
 *   - no orders → DRAFT
 */
function deriveState(ticket) {
  if (!ticket) return STATES.DRAFT;
  if (ticket.IsVoided) return STATES.VOIDED;
  if (ticket.IsClosed && ticket.IsRefunded) return STATES.REFUNDED;
  if (ticket.IsClosed) return STATES.CLOSED;
  const remaining = Number(ticket.RemainingAmount || ticket._remainingAmount || 0);
  if (remaining <= 0 && (ticket.Payments?.length > 0 || ticket.HasPayments)) return STATES.PAID;
  if (ticket.IsLocked) return STATES.LOCKED;
  if (ticket.Orders?.length > 0 || ticket.HasOrders) return STATES.OPEN;
  return STATES.DRAFT;
}

/**
 * Check whether an action is allowed on the ticket.
 * @param {object} ticket - ticket object (with Orders, Payments, IsClosed, IsLocked, RemainingAmount)
 * @param {string} action - one of ACTION_TO_TARGET keys
 * @param {object} ctx    - extra context (ordersAfterRemoval, remainingAfterPayment, adminOverride)
 * @returns {string} the target state if the action is allowed
 * @throws {ConflictError|ValidationError} if the action is not allowed
 */
function assertCan(ticket, action, ctx = {}) {
  const rule = ACTION_RULES[action];
  if (!rule) {
    throw new ValidationError(`Unknown ticket action: ${action}`);
  }
  const currentState = deriveState(ticket);
  if (!rule.requiresState.includes(currentState)) {
    throw new ConflictError(
      `Action '${action}' not allowed in state ${currentState} (requires one of: ${rule.requiresState.join(', ')})`,
      { action, currentState, allowedFrom: rule.requiresState }
    );
  }
  // extraChecks may either throw or return a target state override
  const override = rule.extraChecks(ticket, ctx);
  const targetState = override || ACTION_TO_TARGET[action];

  // Allow "self-transition" when the action keeps the ticket in the same state
  // (e.g. adding an order to an already-OPEN ticket stays in OPEN).
  if (targetState === currentState) {
    return currentState;
  }

  if (!TRANSITIONS[currentState].has(targetState)) {
    throw new ConflictError(
      `Transition ${currentState} → ${targetState} not allowed for action '${action}'`,
      { action, from: currentState, to: targetState }
    );
  }
  return targetState;
}

/**
 * Returns true if the action is allowed (does not throw).
 */
function can(ticket, action, ctx = {}) {
  try {
    assertCan(ticket, action, ctx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a state is terminal (no further transitions).
 */
function isTerminal(state) {
  return TRANSITIONS[state].size === 0;
}

module.exports = {
  STATES,
  TRANSITIONS,
  ACTION_TO_TARGET,
  deriveState,
  assertCan,
  can,
  isTerminal,
};
