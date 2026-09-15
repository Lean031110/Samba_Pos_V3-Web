// =====================================================================
// store.js — Singleton Observable Store
// =====================================================================
// Per Architect's directive:
//   "El estado del Ticket debe vivir en un Store Singleton (Patrón Observable).
//    No permitas que el estado se fragmente en múltiples componentes; el
//    original usa EventAggregator, y tú debes emularlo con un EventTarget
//    global o un PubSub ligero."
//
// This is the single source of truth for the frontend. All views read
// from and subscribe to this store. WebSocket events from the backend
// update the store, which then notifies all subscribers.
// =====================================================================

class Store extends EventTarget {
  constructor() {
    super();
    this._state = {
      // Auth
      currentUser: null,

      // Reference data (cached on first load)
      products: [],
      tables: [],
      paymentTypes: [],
      calculationTypes: [],

      // Current ticket being edited (the active one)
      currentTicket: null,

      // All open tickets (for the open-tickets strip)
      openTickets: [],

      // UI state
      currentView: 'login',
      selectedTableId: null,
      selectedCategoryId: null,

      // Connection
      wsConnected: false,
    };
  }

  /**
   * Get the current state (read-only).
   */
  get state() {
    return this._state;
  }

  /**
   * Update part of the state and emit a 'change' event.
   * @param {Object} partial — partial state to merge
   * @param {string} [reason] — short reason for the change (for logging)
   */
  setState(partial, reason = '') {
    const previous = { ...this._state };
    this._state = { ...this._state, ...partial };
    this._emitChange(previous, reason);
  }

  /**
   * Subscribe to state changes.
   * @param {(state, previous, reason) => void} handler
   * @returns {() => void} unsubscribe function
   */
  subscribe(handler) {
    const listener = (e) => handler(e.detail.state, e.detail.previous, e.detail.reason);
    this.addEventListener('change', listener);
    return () => this.removeEventListener('change', listener);
  }

  _emitChange(previous, reason) {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { state: this._state, previous, reason }
    }));
  }

  // ===================================================================
  // Convenience getters
  // ===================================================================

  get currentTicket() { return this._state.currentTicket; }
  get openTickets()   { return this._state.openTickets; }
  get tables()        { return this._state.tables; }
  get products()      { return this._state.products; }

  /**
   * Find a table by ID.
   */
  getTableById(id) {
    return this._state.tables.find(t => t.Id === id);
  }

  /**
   * Get the products grouped by category (GroupCode).
   */
  getProductsByCategory(categoryCode) {
    if (!categoryCode) return this._state.products;
    return this._state.products.filter(p => p.GroupCode === categoryCode);
  }

  /**
   * Get distinct categories from products.
   */
  getCategories() {
    const set = new Set();
    for (const p of this._state.products) {
      if (p.GroupCode) set.add(p.GroupCode);
    }
    return [...set];
  }
}

// Singleton instance (exported on window for non-module scripts)
window.store = new Store();
