// =====================================================================
// kitchen.js — Kitchen Display System (KDS) frontend view
// =====================================================================
// Features:
//   - Columns/cards per station (Cocina, Pizzería, Bebidas, Despacho)
//   - Color by state (NEW=blue, ACCEPTED=yellow, PREPARING=orange, READY=green, SERVED=gray)
//   - Timer since creation (turns red after 10 minutes — URGENT)
//   - Priority indicator (badge + sorting)
//   - Ticket number, table name, products, quantities, notes, modifications
//   - BUMP / READY / SERVED / VOID / RECALL buttons
//   - Filter by station AND by state
//   - Sound notification (configurable, two-tone chime for new orders)
//   - Vibration on Android (configurable)
//   - Auto-refresh every 30s (in addition to WebSocket events)
//   - Realtime updates via WebSocket + auto-resync on reconnect
// =====================================================================

// Map of internal KDS state codes to user-facing Spanish labels.
// Used wherever the raw `order.State` would be shown to the user.
const STATE_LABELS = {
  'NEW': 'Nuevo',
  'ACCEPTED': 'Aceptado',
  'PREPARING': 'Preparando',
  'READY': 'Listo',
  'SERVED': 'Servido',
  'VOIDED': 'Anulado',
};

const KitchenView = {
  init() {
    this.containerEl = null;
    this.filterEl = null;
    this._orders = [];
    this._stations = [];
    this._selectedStationId = null;
    this._selectedStateFilter = 'active'; // 'all' | 'active' | 'ready' | 'served'
    this._soundEnabled = true;
    this._vibrationEnabled = true;
    this._timerInterval = null;
    this._autoRefreshInterval = null;
    this._lastOrderCount = 0;
    this._lastOrderIds = new Set();
  },

  async load() {
    try {
      const stationsRes = await Api.request('GET', '/kitchen/stations');
      this._stations = stationsRes.data || [];
    } catch (err) {
      window.App.toast('No se pueden cargar las estaciones de cocina: ' + err.message, 'error');
      this._stations = [];
    }
    // Subscribe to the kitchen role room so we receive KitchenOrderAdded / Updated / Voided
    // events. Without this, the KDS view would NOT receive realtime updates — the server
    // only emits these events to the role:kitchen room (see server.js bridgeEventsToSocket).
    if (window.socket && window.socket.connected) {
      window.socket.emit('subscribe:role', 'kitchen');
    } else {
      // Socket not yet connected — retry in 1s (websocket-client polls every 3s)
      setTimeout(() => {
        if (window.socket && window.socket.connected) {
          window.socket.emit('subscribe:role', 'kitchen');
        }
      }, 1500);
    }
    await this.refresh();
    // Start timer refresh (every 1s for live timer display)
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => this._refreshTimers(), 1000);
    // Start auto-refresh (every 30s as a safety net beyond WebSocket)
    if (this._autoRefreshInterval) clearInterval(this._autoRefreshInterval);
    this._autoRefreshInterval = setInterval(() => this.refresh(), 30000);
  },

  unload() {
    // Leave the kitchen role room when leaving the KDS view
    if (window.socket && window.socket.connected) {
      window.socket.emit('unsubscribe:role', 'kitchen');
    }
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    if (this._autoRefreshInterval) {
      clearInterval(this._autoRefreshInterval);
      this._autoRefreshInterval = null;
    }
  },

  async refresh() {
    try {
      const url = this._selectedStationId
        ? `/kitchen/orders?stationId=${this._selectedStationId}`
        : '/kitchen/orders';
      const res = await Api.request('GET', url);
      const newOrders = res.data || [];
      // Check if we have NEW orders that we didn't know about → play sound + vibrate.
      const newOrderIds = new Set(newOrders.map(o => o.Id));
      const brandNewOrders = newOrders.filter(o =>
        o.State === 'NEW' && !this._lastOrderIds.has(o.Id)
      );
      if (brandNewOrders.length > 0 && this._lastOrderIds.size > 0) {
        // Don't trigger on first load.
        this._playSound();
        this._vibrate();
        this._showBrowserNotification(brandNewOrders);
      }
      this._orders = newOrders;
      this._lastOrderIds = newOrderIds;
      this._lastOrderCount = newOrders.length;
      this._render();
    } catch (err) {
      window.App.toast('No se pueden cargar los pedidos de cocina: ' + err.message, 'error');
    }
  },

  _render() {
    if (!this.containerEl) return;

    // Apply state filter
    const filteredOrders = this._applyStateFilter(this._orders);

    // KDS topbar — station name, clock, connection status (Bloque 12 FASE G)
    const stationName = this._selectedStationId
      ? (this._stations.find(s => s.Id === this._selectedStationId)?.DisplayName || 'KDS')
      : 'Todas las estaciones';
    const wsConnected = !!(window.store?.state?.wsConnected);
    const clock = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    let html = `
      <div class="kds-topbar">
        <div class="kds-topbar__station">
          <i class="fa-solid fa-fire"></i>
          <span>${this._escape(stationName)}</span>
        </div>
        <div class="kds-topbar__clock" id="kds-clock">${clock}</div>
        <div class="kds-topbar__conn">
          <span class="kds-topbar__conn-dot ${wsConnected ? '' : 'offline'}"></span>
          <span>${wsConnected ? 'Online' : 'Offline'}</span>
        </div>
        <button class="kds-kitchen-toggle" onclick="window.App.views.kitchen._toggleKitchenMode()">
          <i class="fa-solid fa-expand"></i> Kitchen Mode
        </button>
      </div>
    `;

    // Stats bar — counts by state
    const stats = {
      active: this._orders.filter(o => o.State === 'NEW' || o.State === 'ACCEPTED' || o.State === 'PREPARING').length,
      ready: this._orders.filter(o => o.State === 'READY').length,
      urgent: this._orders.filter(o => this._isUrgent(o)).length,
      late: this._orders.filter(o => this._isLate(o)).length,
    };
    html += `
      <div class="kds-stats">
        <div class="kds-stat"><i class="fa-solid fa-utensils"></i> <span class="kds-stat__num">${stats.active}</span> Activos</div>
        ${stats.urgent > 0 ? `<div class="kds-stat kds-stat--urgent"><i class="fa-solid fa-exclamation-triangle"></i> <span class="kds-stat__num">${stats.urgent}</span> Urgentes</div>` : ''}
        ${stats.late > 0 ? `<div class="kds-stat kds-stat--late"><i class="fa-solid fa-clock"></i> <span class="kds-stat__num">${stats.late}</span> Tarde</div>` : ''}
        ${stats.ready > 0 ? `<div class="kds-stat kds-stat--ready"><i class="fa-solid fa-check-circle"></i> <span class="kds-stat__num">${stats.ready}</span> Listos</div>` : ''}
      </div>
    `;

    // Station filter bar + state filter
    html += '<div class="kds-toolbar">';
    html += '<div class="kds-toolbar__stations">';
    html += `<button class="kds-station-tab ${!this._selectedStationId ? 'is-active' : ''}" onclick="window.App.views.kitchen._filterStation(null)">Todas</button>`;
    for (const s of this._stations) {
      const count = this._orders.filter(o => o.StationId === s.Id && o.State !== 'SERVED' && o.State !== 'VOIDED').length;
      const countBadge = count > 0 ? `<span class="kds-station-tab__count">${count}</span>` : '';
      html += `<button class="kds-station-tab ${this._selectedStationId === s.Id ? 'is-active' : ''}" onclick="window.App.views.kitchen._filterStation(${s.Id})" style="${this._selectedStationId === s.Id ? `background: ${s.Color || 'var(--lba-accent)'}; color: white;` : ''}">${this._escape(s.DisplayName)}${countBadge}</button>`;
    }
    html += '</div>';
    html += '<div class="kds-toolbar__filters">';
    const stateFilters = [
      { id: 'active', label: 'Activos' },
      { id: 'ready', label: 'Listo' },
      { id: 'served', label: 'Servido' },
      { id: 'all', label: 'Todos' },
    ];
    for (const sf of stateFilters) {
      const isActive = this._selectedStateFilter === sf.id;
      html += `<button class="kds-state-filter ${isActive ? 'is-active' : ''}" onclick="window.App.views.kitchen._filterState('${sf.id}')">${sf.label}</button>`;
    }
    html += `<button class="kds-sound-toggle" onclick="window.App.views.kitchen._toggleSound()" title="Alternar sonido">${this._soundEnabled ? '🔊' : '🔇'}</button>`;
    html += `<button class="kds-sound-toggle" onclick="window.App.views.kitchen._toggleVibration()" title="Alternar vibración">${this._vibrationEnabled ? '📳' : '📴'}</button>`;
    html += '</div>';
    html += '</div>';

    // Orders grid — uses .kds-board (responsive columns from kds-tablet.css)
    if (filteredOrders.length === 0) {
      html += `
        <div class="kds-empty">
          <i class="fa-solid fa-circle-check"></i>
          <div class="kds-empty__title">Sin pedidos activos</div>
          <div class="kds-empty__subtitle">Cuando entre un nuevo pedido aparecerá aquí</div>
        </div>
      `;
    } else {
      // Sort by priority (desc) then by CreatedAt (asc)
      const sorted = [...filteredOrders].sort((a, b) => {
        if (b.Priority !== a.Priority) return (b.Priority || 0) - (a.Priority || 0);
        return new Date(a.CreatedAt) - new Date(b.CreatedAt);
      });
      html += '<div class="kds-board">';
      for (const order of sorted) {
        html += this._renderOrderCard(order);
      }
      html += '</div>';
    }

    this.containerEl.innerHTML = html;
  },

  _toggleKitchenMode() {
    document.documentElement.classList.toggle('is-kitchen-mode');
    const isOn = document.documentElement.classList.contains('is-kitchen-mode');
    // Wake lock — keep screen on while in kitchen mode (Bloque 12 #19)
    if (isOn) {
      this._requestWakeLock();
    } else {
      this._releaseWakeLock();
    }
    window.App?.toast(isOn ? 'Modo cocina activado' : 'Modo cocina desactivado', 'info');
  },

  async _requestWakeLock() {
    // Use the Screen Wake Lock API (Android Capacitor supports it)
    try {
      if ('wakeLock' in navigator) {
        this._wakeLock = await navigator.wakeLock.request('screen');
        console.log('[KDS] Wake lock acquired');
      }
    } catch (e) {
      console.warn('[KDS] Wake lock not available:', e.message);
    }
  },

  async _releaseWakeLock() {
    if (this._wakeLock) {
      try {
        await this._wakeLock.release();
        this._wakeLock = null;
        console.log('[KDS] Wake lock released');
      } catch (e) {
        console.warn('[KDS] Wake lock release failed:', e.message);
      }
    }
  },

  _isLate(order) {
    const elapsedMin = (Date.now() - new Date(order.CreatedAt).getTime()) / 60000;
    return elapsedMin > 15 && order.State !== 'READY' && order.State !== 'SERVED';
  },

  _applyStateFilter(orders) {
    switch (this._selectedStateFilter) {
      case 'active':
        return orders.filter(o => o.State !== 'SERVED' && o.State !== 'VOIDED');
      case 'ready':
        return orders.filter(o => o.State === 'READY');
      case 'served':
        return orders.filter(o => o.State === 'SERVED' || o.State === 'VOIDED');
      case 'all':
      default:
        return orders;
    }
  },

  _renderOrderCard(order) {
    const stateClasses = {
      NEW:       'kds-card--new',
      ACCEPTED:  'kds-card--accepted',
      PREPARING: 'kds-card--preparing',
      READY:     'kds-card--ready',
      SERVED:    'kds-card--served',
      VOIDED:    'kds-card--void',
    };
    const stateClass = stateClasses[order.State] || stateClasses.NEW;
    const elapsed = this._formatElapsed(order.CreatedAt);
    const isUrgent = this._isUrgent(order);
    const priorityBadge = order.Priority > 0
      ? `<span class="kds-priority-badge">PRIORIDAD</span>`
      : '';

    let itemsHtml = '';
    for (const item of (order.Items || [])) {
      itemsHtml += `<div class="kds-item">
        <span class="kds-item-qty">${item.Quantity}×</span>
        <span class="kds-item-name">${this._escape(item.MenuItemName)}</span>
        ${item.PortionName ? `<span class="kds-item-portion">(${this._escape(item.PortionName)})</span>` : ''}
        ${item.Notes ? `<div class="kds-item-notes">📝 ${this._escape(item.Notes)}</div>` : ''}
      </div>`;
    }

    let buttonsHtml = '';
    if (order.State === 'NEW') {
      buttonsHtml = `<button class="kds-btn kds-btn--primary" onclick="window.App.views.kitchen._updateState(${order.Id}, 'ACCEPTED')">Aceptar</button>`;
    } else if (order.State === 'ACCEPTED') {
      buttonsHtml = `<button class="kds-btn kds-btn--preparing" onclick="window.App.views.kitchen._updateState(${order.Id}, 'PREPARING')">Iniciar</button>`;
    } else if (order.State === 'PREPARING') {
      buttonsHtml = `<button class="kds-btn kds-btn--ready" onclick="window.App.views.kitchen._bump(${order.Id})">Listo</button>`;
    } else if (order.State === 'READY') {
      buttonsHtml = `<button class="kds-btn kds-btn--served" onclick="window.App.views.kitchen._serve(${order.Id})">Servido</button>
                     <button class="kds-btn kds-btn--recall" onclick="window.App.views.kitchen._updateState(${order.Id}, 'PREPARING')">Recuperar</button>`;
    } else if (order.State === 'SERVED') {
      buttonsHtml = `<button class="kds-btn kds-btn--recall" onclick="window.App.views.kitchen._recall(${order.Id})">Recuperar</button>`;
    }

    return `<div class="kds-card ${stateClass} ${isUrgent ? 'kds-card--urgent' : ''}">
      <div class="kds-card-header">
        <div class="kds-ticket-info">
          <span class="kds-ticket-num">#${order.TicketNumber || order.TicketId}</span>
          ${order.TableName ? `<span class="kds-table">📍 ${this._escape(order.TableName)}</span>` : ''}
          ${priorityBadge}
        </div>
        <span class="kds-timer ${isUrgent ? 'kds-timer--urgent' : ''}" data-created="${order.CreatedAt}">${elapsed}</span>
      </div>
      <div class="kds-card-body">
        ${itemsHtml}
      </div>
      <div class="kds-card-footer">
        <span class="kds-state">${STATE_LABELS[order.State] || order.State}</span>
        <div class="kds-card-actions">
          ${buttonsHtml}
          ${order.State !== 'VOIDED' && order.State !== 'SERVED' ? `<button class="kds-btn kds-btn--void" onclick="window.App.views.kitchen._void(${order.Id})">Anular</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  _isUrgent(order) {
    if (order.State === 'SERVED' || order.State === 'VOIDED') return false;
    const elapsedSec = (Date.now() - new Date(order.CreatedAt).getTime()) / 1000;
    // Urgent: > 10 minutes for non-priority, > 5 minutes for priority
    const threshold = order.Priority > 0 ? 5 * 60 : 10 * 60;
    return elapsedSec > threshold;
  },

  _formatElapsed(createdAt) {
    const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remSecs}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  },

  _refreshTimers() {
    const timers = document.querySelectorAll('.kds-timer');
    for (const t of timers) {
      const created = t.dataset.created;
      if (created) {
        t.textContent = this._formatElapsed(created);
        // Toggle urgent class based on elapsed time + card context.
        const card = t.closest('.kds-card');
        if (card) {
          const orderState = card.classList.contains('kds-card--served') || card.classList.contains('kds-card--void')
            ? 'SERVED' : 'ACTIVE';
          if (orderState === 'ACTIVE') {
            const seconds = Math.floor((Date.now() - new Date(created).getTime()) / 1000);
            const isUrgent = seconds > 600; // 10 min
            t.classList.toggle('kds-timer--urgent', isUrgent);
            card.classList.toggle('kds-card--urgent', isUrgent);
          }
        }
      }
    }
  },

  async _filterStation(stationId) {
    this._selectedStationId = stationId;
    await this.refresh();
  },

  _filterState(stateFilter) {
    this._selectedStateFilter = stateFilter;
    this._render();
  },

  _toggleSound() {
    this._soundEnabled = !this._soundEnabled;
    this._render();
  },

  _toggleVibration() {
    this._vibrationEnabled = !this._vibrationEnabled;
    this._render();
  },

  _playSound() {
    if (!this._soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;

      // Two-tone chime: high beep + medium beep (more distinctive than single beep).
      const playBeep = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.25, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
        osc.start(now + start);
        osc.stop(now + start + duration);
      };
      playBeep(880, 0, 0.15);   // A5 — bright, attention-grabbing
      playBeep(660, 0.18, 0.2);  // E5 — softer follow-up
    } catch (e) { /* AudioContext not available */ }
  },

  _vibrate() {
    if (!this._vibrationEnabled) return;
    if ('vibrate' in navigator) {
      // Pattern: 200ms vibration, 100ms pause, 200ms vibration
      navigator.vibrate([200, 100, 200]);
    }
  },

  _showBrowserNotification(orders) {
    // Use Web Notifications if permission was granted; otherwise no-op.
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      const title = orders.length === 1
        ? `Nuevo pedido: #${orders[0].TicketNumber || orders[0].TicketId}`
        : `${orders.length} nuevos pedidos en cocina`;
      const body = orders.length === 1
        ? (orders[0].TableName ? `Mesa ${orders[0].TableName}` : 'Para llevar')
        : `${orders.length} pedidos esperando preparación`;
      const n = new Notification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon.png',
        tag: 'kds-new-order',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      // Auto-close after 10s.
      setTimeout(() => n.close(), 10000);
    } catch (e) { /* Notification API may not be available */ }
  },

  async _updateState(orderId, state) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/state`, { state });
      await this.refresh();
    } catch (err) {
      window.App.toast('No se puede actualizar el pedido: ' + err.message, 'error');
    }
  },

  async _bump(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/bump`);
      await this.refresh();
      window.App.toast('Pedido marcado como Listo', 'success');
    } catch (err) {
      window.App.toast('Error al marcar como Listo: ' + err.message, 'error');
    }
  },

  async _serve(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/serve`);
      await this.refresh();
    } catch (err) {
      window.App.toast('Error al servir: ' + err.message, 'error');
    }
  },

  async _void(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/void`);
      await this.refresh();
    } catch (err) {
      window.App.toast('Error al anular: ' + err.message, 'error');
    }
  },

  async _recall(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/recall`);
      await this.refresh();
    } catch (err) {
      window.App.toast('Error al recuperar: ' + err.message, 'error');
    }
  },

  // Request notification permission (called from a user action, e.g., button tap).
  async requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  // Called by WebSocket client when a KitchenOrderAdded event arrives
  addOrder(payload) {
    this.refresh();
  },

  // Called by WebSocket client when a KitchenOrderUpdated event arrives
  updateOrder(payload) {
    this.refresh();
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.KitchenView = KitchenView;
