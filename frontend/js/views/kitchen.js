// =====================================================================
// views/kitchen.js — KDS rediseñado (Odoo 19 Preparation Display)
// =====================================================================
// Spec §14-18:
//   - Pantalla completa, fondo oscuro profesional
//   - Topbar: título + filtros de etapa con contadores
//     (TODAS 12 | PREPARANDO 5 | LISTAS 4 | COMPLETADAS 3)
//   - Sidebar de ESTACIONES (Cocina, Pizzería, Barra…) con contadores
//   - Order cards: #ticket, mesa, timer mm:ss, productos, notas,
//     prioridad, estado, acciones grandes táctiles
//   - SLA: > 10 min (o > 5 min con prioridad) → URGENTE discreto
// MISMA lógica: mismos endpoints /kitchen/* y websocket role:kitchen.
// =====================================================================

const STATE_LABELS = {
  'NEW': 'Nuevo',
  'ACCEPTED': 'Aceptado',
  'PREPARING': 'Preparando',
  'READY': 'Listo',
  'SERVED': 'Entregado',
  'VOIDED': 'Anulado',
};

const STAGES = [
  { id: 'all', label: 'Todas' },
  { id: 'active', label: 'En curso' },
  { id: 'preparing', label: 'Preparando' },
  { id: 'ready', label: 'Listas' },
  { id: 'served', label: 'Completadas' },
];

const KitchenView = {
  init() {
    this.containerEl = null;
    this._orders = [];
    this._stations = [];
    this._selectedStationId = null;
    this._selectedStage = 'active';
    this._soundEnabled = true;
    this._vibrationEnabled = true;
    this._timerInterval = null;
    this._autoRefreshInterval = null;
    this._lastOrderIds = new Set();
  },

  get containerEl() { return this._containerEl; },
  set containerEl(el) { this._containerEl = el; },

  async load() {
    this._containerEl = document.getElementById('kds-screen');
    try {
      const stationsRes = await Api.request('GET', '/kitchen/stations');
      this._stations = stationsRes.data || [];
    } catch (err) {
      window.App.toast('No se pueden cargar las estaciones: ' + err.message, 'error');
      this._stations = [];
    }

    // Suscribirse al room de cocina para eventos realtime
    if (window.socket && window.socket.connected) {
      window.socket.emit('subscribe:role', 'kitchen');
    } else {
      setTimeout(() => {
        if (window.socket && window.socket.connected) {
          window.socket.emit('subscribe:role', 'kitchen');
        }
      }, 1500);
    }

    await this.refresh();

    if (this._timerInterval) clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => this._refreshTimers(), 1000);
    if (this._autoRefreshInterval) clearInterval(this._autoRefreshInterval);
    this._autoRefreshInterval = setInterval(() => this.refresh(), 30000);
  },

  unload() {
    if (window.socket && window.socket.connected) {
      window.socket.emit('unsubscribe:role', 'kitchen');
    }
    if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
    if (this._autoRefreshInterval) { clearInterval(this._autoRefreshInterval); this._autoRefreshInterval = null; }
  },

  async refresh() {
    try {
      const url = this._selectedStationId
        ? `/kitchen/orders?stationId=${this._selectedStationId}`
        : '/kitchen/orders';
      const res = await Api.request('GET', url);
      const newOrders = res.data || [];

      const newOrderIds = new Set(newOrders.map(o => o.Id));
      const brandNew = newOrders.filter(o => o.State === 'NEW' && !this._lastOrderIds.has(o.Id));
      if (brandNew.length > 0 && this._lastOrderIds.size > 0) {
        this._playSound();
        this._vibrate();
        this._showBrowserNotification(brandNew);
      }
      this._orders = newOrders;
      this._lastOrderIds = newOrderIds;
      this._render();
    } catch (err) {
      window.App.toast('No se pueden cargar los pedidos de cocina: ' + err.message, 'error');
    }
  },

  // ===================================================================
  // Render
  // ===================================================================

  _render() {
    if (!this._containerEl) return;
    const filtered = this._applyStageFilter(this._orders);

    const stageCounts = {
      all: this._orders.length,
      active: this._orders.filter(o => o.State !== 'SERVED' && o.State !== 'VOIDED').length,
      preparing: this._orders.filter(o => o.State === 'PREPARING' || o.State === 'ACCEPTED').length,
      ready: this._orders.filter(o => o.State === 'READY').length,
      served: this._orders.filter(o => o.State === 'SERVED' || o.State === 'VOIDED').length,
    };

    let html = `
      <div class="kds-topbar">
        <span class="kds-topbar__title"><i class="fa-solid fa-fire-burner"></i> <span>LBApos · Cocina</span></span>
        <div class="kds-topbar__tools">
          <button class="kds-tool" onclick="window.App.views.kitchen._toggleSound()" title="Sonido">${this._soundEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>'}</button>
          <button class="kds-tool" onclick="window.App.views.kitchen._toggleVibration()" title="Vibración">${this._vibrationEnabled ? '<i class="fa-solid fa-mobile-screen"></i>' : '<i class="fa-solid fa-mobile-screen-button"></i>'}</button>
        </div>
      </div>

      <div class="kds-stagebar">
        ${STAGES.map(s => `
          <button class="kds-stage ${this._selectedStage === s.id ? 'is-active' : ''}"
                  onclick="window.App.views.kitchen._filterStage('${s.id}')">
            ${s.label} <span class="kds-stage__count">${stageCounts[s.id]}</span>
          </button>
        `).join('')}
      </div>

      <div class="kds-body">
        <aside class="kds-stations">
          <div class="kds-stations__title">Estaciones</div>
          <button class="kds-station ${!this._selectedStationId ? 'is-active' : ''}"
                  onclick="window.App.views.kitchen._filterStation(null)">
            <span class="kds-station__dot" style="background: var(--lba-blue-400)"></span>
            <span class="kds-station__name">Todas</span>
            <span class="kds-station__count">${this._orders.filter(o => o.State !== 'SERVED' && o.State !== 'VOIDED').length}</span>
          </button>
          ${this._stations.map(s => {
            const count = this._orders.filter(o => o.StationId === s.Id && o.State !== 'SERVED' && o.State !== 'VOIDED').length;
            return `
            <button class="kds-station ${this._selectedStationId === s.Id ? 'is-active' : ''}"
                    onclick="window.App.views.kitchen._filterStation(${s.Id})">
              <span class="kds-station__dot" style="background: ${s.Color || '#6b7280'}"></span>
              <span class="kds-station__name">${this._escape(s.DisplayName || s.Name)}</span>
              <span class="kds-station__count">${count}</span>
            </button>`;
          }).join('')}
        </aside>

        <div class="kds-cards" id="kds-cards">
          ${filtered.length === 0
            ? '<div class="kds-empty2"><i class="fa-solid fa-champagne-glasses"></i> Sin pedidos en esta vista</div>'
            : ''}
        </div>
      </div>
    `;

    this._containerEl.innerHTML = html;

    const cardsEl = this._containerEl.querySelector('#kds-cards');
    const sorted = [...filtered].sort((a, b) => {
      if (b.Priority !== a.Priority) return (b.Priority || 0) - (a.Priority || 0);
      return new Date(a.CreatedAt) - new Date(b.CreatedAt);
    });
    for (const order of sorted) {
      cardsEl.insertAdjacentHTML('beforeend', this._renderOrderCard(order));
    }
  },

  _applyStageFilter(orders) {
    switch (this._selectedStage) {
      case 'active': return orders.filter(o => o.State !== 'SERVED' && o.State !== 'VOIDED');
      case 'preparing': return orders.filter(o => o.State === 'PREPARING' || o.State === 'ACCEPTED');
      case 'ready': return orders.filter(o => o.State === 'READY');
      case 'served': return orders.filter(o => o.State === 'SERVED' || o.State === 'VOIDED');
      case 'all':
      default: return orders;
    }
  },

  _renderOrderCard(order) {
    const stateCls = {
      NEW: 'kds-card2--new',
      ACCEPTED: 'kds-card2--accepted',
      PREPARING: 'kds-card2--preparing',
      READY: 'kds-card2--ready',
      SERVED: 'kds-card2--served',
      VOIDED: 'kds-card2--voided',
    }[order.State] || 'kds-card2--new';

    const elapsed = this._formatElapsed(order.CreatedAt);
    const isUrgent = this._isUrgent(order);

    let itemsHtml = '';
    for (const item of (order.Items || [])) {
      itemsHtml += `
        <div class="kds-item2">
          <span class="kds-item2__qty">${item.Quantity}×</span>
          <span class="kds-item2__name">${this._escape(item.MenuItemName)}
            ${item.PortionName ? `<span class="kds-item2__portion">(${this._escape(item.PortionName)})</span>` : ''}
          </span>
        </div>
        ${item.Notes ? `<div class="kds-item2__note"><i class="fa-solid fa-note-sticky"></i> ${this._escape(item.Notes)}</div>` : ''}
      `;
    }

    let actions = '';
    if (order.State === 'NEW') {
      actions = `<button class="kds-act kds-act--accept" onclick="window.App.views.kitchen._updateState(${order.Id}, 'ACCEPTED')"><i class="fa-solid fa-play"></i> ACEPTAR</button>`;
    } else if (order.State === 'ACCEPTED') {
      actions = `<button class="kds-act kds-act--accept" onclick="window.App.views.kitchen._updateState(${order.Id}, 'PREPARING')"><i class="fa-solid fa-fire"></i> PREPARANDO</button>`;
    } else if (order.State === 'PREPARING') {
      actions = `<button class="kds-act kds-act--ready" onclick="window.App.views.kitchen._bump(${order.Id})"><i class="fa-solid fa-check"></i> LISTO</button>`;
    } else if (order.State === 'READY') {
      actions = `<button class="kds-act kds-act--serve" onclick="window.App.views.kitchen._serve(${order.Id})"><i class="fa-solid fa-hand-holding-heart"></i> ENTREGAR</button>
                 <button class="kds-act" onclick="window.App.views.kitchen._updateState(${order.Id}, 'PREPARING')"><i class="fa-solid fa-rotate-left"></i></button>`;
    } else if (order.State === 'SERVED') {
      actions = `<button class="kds-act" onclick="window.App.views.kitchen._recall(${order.Id})"><i class="fa-solid fa-rotate-left"></i> RECUPERAR</button>`;
    }
    if (order.State !== 'VOIDED' && order.State !== 'SERVED') {
      actions += `<button class="kds-act kds-act--danger" onclick="window.App.views.kitchen._void(${order.Id})"><i class="fa-solid fa-ban"></i> ANULAR</button>`;
    }

    return `
      <div class="kds-card2 ${stateCls} ${isUrgent ? 'kds-card2--urgent' : ''}" data-order-id="${order.Id}">
        <div class="kds-card2__header">
          <span class="kds-card2__num">#${order.TicketNumber || order.TicketId}</span>
          ${order.TableName ? `<span class="kds-card2__table"><i class="fa-solid fa-location-dot"></i> ${this._escape(order.TableName)}</span>` : ''}
          ${order.Priority > 0 ? '<span class="kds-card2__table" style="background:#3b1216; color:#fca5a5;"><i class="fa-solid fa-flag"></i> PRIORIDAD</span>' : ''}
          <span class="kds-card2__timer" data-created="${order.CreatedAt}"><i class="fa-regular fa-clock"></i> ${elapsed}</span>
        </div>
        <div class="kds-card2__items">${itemsHtml}</div>
        <div class="kds-card2__footer">
          <span class="kds-card2__state">${STATE_LABELS[order.State] || order.State}</span>
          <div class="kds-card2__actions">${actions}</div>
        </div>
      </div>
    `;
  },

  _isUrgent(order) {
    if (order.State === 'SERVED' || order.State === 'VOIDED') return false;
    const elapsedSec = (Date.now() - new Date(order.CreatedAt).getTime()) / 1000;
    const threshold = order.Priority > 0 ? 5 * 60 : 10 * 60; // SLA
    return elapsedSec > threshold;
  },

  _formatElapsed(createdAt) {
    const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    if (seconds < 3600) return `${mm}:${ss}`;
    const hh = Math.floor(seconds / 3600);
    return `${hh}:${mm}:${ss}`;
  },

  _refreshTimers() {
    const timers = document.querySelectorAll('.kds-card2__timer');
    for (const t of timers) {
      const created = t.dataset.created;
      if (!created) continue;
      t.innerHTML = `<i class="fa-regular fa-clock"></i> ${this._formatElapsed(created)}`;
    }
    // Recalcular urgencia (discreto — solo borde/timer)
    const cards = document.querySelectorAll('.kds-card2');
    for (const card of cards) {
      const id = parseInt(card.dataset.orderId, 10);
      const order = this._orders.find(o => o.Id === id);
      if (order) card.classList.toggle('kds-card2--urgent', this._isUrgent(order));
    }
  },

  async _filterStation(stationId) {
    this._selectedStationId = stationId;
    await this.refresh();
  },

  _filterStage(stage) {
    this._selectedStage = stage;
    this._render();
  },

  _toggleSound() { this._soundEnabled = !this._soundEnabled; this._render(); },
  _toggleVibration() { this._vibrationEnabled = !this._vibrationEnabled; this._render(); },

  _playSound() {
    if (!this._soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
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
      playBeep(880, 0, 0.15);
      playBeep(660, 0.18, 0.2);
    } catch (e) { /* AudioContext no disponible */ }
  },

  _vibrate() {
    if (!this._vibrationEnabled) return;
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  },

  _showBrowserNotification(orders) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      const title = orders.length === 1
        ? `Nuevo pedido: #${orders[0].TicketNumber || orders[0].TicketId}`
        : `${orders.length} nuevos pedidos en cocina`;
      const body = orders.length === 1
        ? (orders[0].TableName ? `Mesa ${orders[0].TableName}` : 'Para llevar')
        : `${orders.length} pedidos esperando preparación`;
      // APP_BASE_PATH: iconos resueltos desde el base path (root o sub-path de Pages)
      const n = new Notification(title, { body, icon: (window.LBA_BASE || '/') + 'icons/icon-192.png', badge: (window.LBA_BASE || '/') + 'icons/favicon.png', tag: 'kds-new-order' });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 10000);
    } catch (e) { /* Notification API */ }
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
      window.App.toast('Error al entregar: ' + err.message, 'error');
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

  async requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  addOrder(payload) { this.refresh(); },
  updateOrder(payload) { this.refresh(); },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.KitchenView = KitchenView;
