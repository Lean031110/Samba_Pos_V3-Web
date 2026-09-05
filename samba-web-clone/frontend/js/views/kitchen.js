// =====================================================================
// kitchen.js — Kitchen Display System (KDS) frontend view
// =====================================================================
// Features:
//   - Columns/cards per station (Cocina, Pizzería, Bebidas, Despacho)
//   - Color by state (NEW=blue, ACCEPTED=yellow, PREPARING=orange, READY=green, SERVED=gray)
//   - Timer since creation
//   - Priority indicator
//   - Ticket number, table name, products, quantities, notes, modifications
//   - BUMP / READY / SERVED / VOID / RECALL buttons
//   - Filter by station
//   - Sound notification (configurable)
//   - Realtime updates via WebSocket
// =====================================================================

const KitchenView = {
  init() {
    this.containerEl = null;
    this.filterEl = null;
    this._orders = [];
    this._stations = [];
    this._selectedStationId = null;
    this._soundEnabled = true;
    this._timerInterval = null;
  },

  async load() {
    try {
      const stationsRes = await Api.request('GET', '/kitchen/stations');
      this._stations = stationsRes.data || [];
    } catch (err) {
      window.App.toast('Cannot load kitchen stations: ' + err.message, 'error');
      this._stations = [];
    }
    await this.refresh();
    // Start timer refresh
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => this._refreshTimers(), 1000);
  },

  unload() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  },

  async refresh() {
    try {
      const url = this._selectedStationId
        ? `/kitchen/orders?stationId=${this._selectedStationId}`
        : '/kitchen/orders';
      const res = await Api.request('GET', url);
      const newOrders = res.data || [];
      // Check if we have new orders (for sound notification)
      if (this._orders.length > 0 && newOrders.length > this._orders.length) {
        this._playSound();
      }
      this._orders = newOrders;
      this._render();
    } catch (err) {
      window.App.toast('Cannot load kitchen orders: ' + err.message, 'error');
    }
  },

  _render() {
    if (!this.containerEl) return;

    // Station filter bar
    let html = '<div class="kds-stations-bar">';
    html += `<button class="category-tab ${!this._selectedStationId ? 'is-active' : ''}" onclick="window.App.views.kitchen._filterStation(null)">All Stations</button>`;
    for (const s of this._stations) {
      html += `<button class="category-tab ${this._selectedStationId === s.Id ? 'is-active' : ''}" style="${this._selectedStationId === s.Id ? `background: ${s.Color}; color: white;` : ''}" onclick="window.App.views.kitchen._filterStation(${s.Id})">${s.DisplayName}</button>`;
    }
    html += `<button class="category-tab" onclick="window.App.views.kitchen._toggleSound()">${this._soundEnabled ? '🔊 Sound On' : '🔇 Sound Off'}</button>`;
    html += '</div>';

    // Orders grid
    if (this._orders.length === 0) {
      html += '<div style="padding: 40px; text-align: center; color: var(--samba-fg-muted); font-size: 24px;">No active orders 🎉</div>';
    } else {
      html += '<div class="kds-orders-grid">';
      for (const order of this._orders) {
        html += this._renderOrderCard(order);
      }
      html += '</div>';
    }

    this.containerEl.innerHTML = html;
  },

  _renderOrderCard(order) {
    const stateColors = {
      NEW:       { bg: '#E3F2FD', border: '#2196F3', text: '#1565C0' },
      ACCEPTED:  { bg: '#FFF8E1', border: '#FFC107', text: '#F57F17' },
      PREPARING: { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
      READY:     { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32' },
      SERVED:    { bg: '#F5F5F5', border: '#9E9E9E', text: '#616161' },
      VOIDED:    { bg: '#FFEBEE', border: '#F44336', text: '#C62828' },
    };
    const colors = stateColors[order.State] || stateColors.NEW;
    const elapsed = this._formatElapsed(order.CreatedAt);
    const priorityBadge = order.Priority > 0
      ? `<span style="background: #F44336; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">PRIORITY</span>`
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
      buttonsHtml = `<button class="kds-btn" onclick="window.App.views.kitchen._updateState(${order.Id}, 'ACCEPTED')">Accept</button>`;
    } else if (order.State === 'ACCEPTED') {
      buttonsHtml = `<button class="kds-btn kds-btn--preparing" onclick="window.App.views.kitchen._updateState(${order.Id}, 'PREPARING')">Start</button>`;
    } else if (order.State === 'PREPARING') {
      buttonsHtml = `<button class="kds-btn kds-btn--ready" onclick="window.App.views.kitchen._bump(${order.Id})">BUMP (Ready)</button>`;
    } else if (order.State === 'READY') {
      buttonsHtml = `<button class="kds-btn kds-btn--served" onclick="window.App.views.kitchen._serve(${order.Id})">Served</button>
                     <button class="kds-btn kds-btn--recall" onclick="window.App.views.kitchen._updateState(${order.Id}, 'PREPARING')">Recall</button>`;
    } else if (order.State === 'SERVED') {
      buttonsHtml = `<button class="kds-btn kds-btn--recall" onclick="window.App.views.kitchen._recall(${order.Id})">Recall</button>`;
    }

    return `<div class="kds-card" style="background: ${colors.bg}; border-color: ${colors.border};">
      <div class="kds-card-header" style="border-bottom: 2px solid ${colors.border};">
        <div class="kds-ticket-info">
          <span class="kds-ticket-num">#${order.TicketNumber || order.TicketId}</span>
          ${order.TableName ? `<span class="kds-table">📍 ${this._escape(order.TableName)}</span>` : ''}
          ${priorityBadge}
        </div>
        <span class="kds-timer" data-created="${order.CreatedAt}">${elapsed}</span>
      </div>
      <div class="kds-card-body">
        ${itemsHtml}
      </div>
      <div class="kds-card-footer" style="border-top: 1px solid ${colors.border};">
        <span class="kds-state" style="color: ${colors.text};">${order.State}</span>
        ${buttonsHtml}
        ${order.State !== 'VOIDED' ? `<button class="kds-btn kds-btn--void" onclick="window.App.views.kitchen._void(${order.Id})">Void</button>` : ''}
      </div>
    </div>`;
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
      if (created) t.textContent = this._formatElapsed(created);
    }
  },

  async _filterStation(stationId) {
    this._selectedStationId = stationId;
    await this.refresh();
  },

  _toggleSound() {
    this._soundEnabled = !this._soundEnabled;
    this._render();
  },

  _playSound() {
    if (!this._soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* AudioContext not available */ }
  },

  async _updateState(orderId, state) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/state`, { state });
      await this.refresh();
    } catch (err) {
      window.App.toast('Cannot update order: ' + err.message, 'error');
    }
  },

  async _bump(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/bump`);
      await this.refresh();
      window.App.toast('Order marked as READY', 'success');
    } catch (err) {
      window.App.toast('Bump failed: ' + err.message, 'error');
    }
  },

  async _serve(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/serve`);
      await this.refresh();
    } catch (err) {
      window.App.toast('Serve failed: ' + err.message, 'error');
    }
  },

  async _void(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/void`);
      await this.refresh();
    } catch (err) {
      window.App.toast('Void failed: ' + err.message, 'error');
    }
  },

  async _recall(orderId) {
    try {
      await Api.request('POST', `/kitchen/orders/${orderId}/recall`);
      await this.refresh();
    } catch (err) {
      window.App.toast('Recall failed: ' + err.message, 'error');
    }
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
