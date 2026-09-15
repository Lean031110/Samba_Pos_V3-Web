// =====================================================================
// views/dashboard.js — DashboardView (admin KPIs, estilo Odoo Webclient)
// =====================================================================
// Spec §19-20: cards blancas sobre gris con KPIs (ventas, tickets,
// ticket promedio, caja, pedidos cocina, stock bajo), gráfico simple
// de barras por categoría, actividad reciente, alertas y accesos rápidos.
// Datos vía /api/reports/sales, /api/kitchen/orders, /api/inventory/stock,
// /api/cash-sessions (endpoints existentes — sin cambios de lógica).
// =====================================================================

const DashboardView = {
  init() {
    this.contentEl = document.getElementById('dash-content');
  },

  async refresh() {
    if (!this.contentEl) return;
    this._loadData();
  },

  async _loadData() {
    const [salesRes, kitchenRes, stockRes, cashRes, topRes] = await Promise.allSettled([
      Api.getReport('sales'),
      Api.request('GET', '/kitchen/orders'),
      Api.request('GET', '/inventory/stock/1'),
      Api.request('GET', '/cash-sessions/current'),
      Api.getReport('top-products'),
    ]);

    const sales = salesRes.status === 'fulfilled' ? (salesRes.value?.data || {}) : {};
    const kitchenOrders = kitchenRes.status === 'fulfilled' ? (kitchenRes.value?.data || []) : [];
    const stock = stockRes.status === 'fulfilled' ? (stockRes.value?.data || []) : [];
    const cash = cashRes.status === 'fulfilled' ? (cashRes.value?.data || null) : null;
    const top = topRes.status === 'fulfilled' ? (topRes.value?.data || []) : [];

    const lowStock = (stock || []).filter(s => Number(s.Quantity) <= Number(s.MinimumStock || 0));
    const activeKitchen = (kitchenOrders || []).filter(o => o.State !== 'SERVED' && o.State !== 'VOIDED');
    const cashOpen = cash && cash.Status === 'OPEN';
    const totalSales = Number(sales.totalSales || 0);
    const totalTickets = Number(sales.totalTickets || 0);
    const avgTicket = totalTickets > 0 ? totalSales / totalTickets : 0;

    const now = new Date();
    this.contentEl.innerHTML = `
      <h1 class="dash__title">Panel de administración</h1>
      <p class="dash__subtitle">${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-sack-dollar"></i> Ventas hoy</span>
          <span class="kpi-card__value">$${totalSales.toFixed(2)}</span>
          <span class="kpi-card__hint">${totalTickets} tickets emitidos</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-receipt"></i> Tickets</span>
          <span class="kpi-card__value">${totalTickets}</span>
          <span class="kpi-card__hint">cuenta y anulado: ${Number(sales.totalVoided || 0) + Number(sales.totalRefunded || 0)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-chart-simple"></i> Ticket promedio</span>
          <span class="kpi-card__value">$${avgTicket.toFixed(2)}</span>
        </div>
        <div class="kpi-card ${cashOpen ? 'kpi-card--ok' : 'kpi-card--warn'}">
          <span class="kpi-card__label"><i class="fa-solid fa-cash-register"></i> Caja</span>
          <span class="kpi-card__value">${cashOpen ? 'ABIERTA' : 'CERRADA'}</span>
          <span class="kpi-card__hint">${cashOpen ? 'desde ' + this._fmtTime(cash.OpenedAt) : 'sin sesión activa'}</span>
        </div>
        <div class="kpi-card ${activeKitchen.length > 0 ? 'kpi-card--warn' : ''}">
          <span class="kpi-card__label"><i class="fa-solid fa-fire-burner"></i> Pedidos cocina</span>
          <span class="kpi-card__value">${activeKitchen.length}</span>
          <span class="kpi-card__hint">en preparación</span>
        </div>
        <div class="kpi-card ${lowStock.length > 0 ? 'kpi-card--danger' : 'kpi-card--ok'}">
          <span class="kpi-card__label"><i class="fa-solid fa-triangle-exclamation"></i> Stock bajo</span>
          <span class="kpi-card__value">${lowStock.length}</span>
          <span class="kpi-card__hint">ingredientes por reponer</span>
        </div>
      </div>

      <div class="dash-cards">
        <div class="panel-card">
          <div class="panel-card__header"><i class="fa-solid fa-ranking-star"></i> Ventas por producto</div>
          <div class="panel-card__body">
            ${this._renderTopBars(top)}
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header"><i class="fa-solid fa-bolt"></i> Actividad reciente</div>
          <div class="panel-card__body">
            ${this._renderActivity(kitchenOrders, sales)}
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header"><i class="fa-solid fa-table-cells-large"></i> Accesos rápidos</div>
          <div class="panel-card__body">
            <div class="quick-grid">
              <button class="quick-btn" onclick="window.App.navigate('pos')"><i class="fa-solid fa-cart-shopping"></i> POS</button>
              <button class="quick-btn" onclick="window.App.navigate('kitchen')"><i class="fa-solid fa-utensils"></i> Cocina</button>
              <button class="quick-btn" onclick="window.App.navigate('cash')"><i class="fa-solid fa-cash-register"></i> Caja</button>
              <button class="quick-btn" onclick="window.App.navigate('inventory')"><i class="fa-solid fa-warehouse"></i> Inventario</button>
              <button class="quick-btn" onclick="window.App.navigate('reports')"><i class="fa-solid fa-chart-bar"></i> Reportes</button>
              <button class="quick-btn" onclick="window.App.navigate('admin')"><i class="fa-solid fa-gear"></i> Configuración</button>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header"><i class="fa-solid fa-bell"></i> Alertas</div>
          <div class="panel-card__body">
            ${this._renderAlerts(lowStock, activeKitchen, cashOpen, sales)}
          </div>
        </div>
      </div>
    `;
  },

  _renderTopBars(top) {
    if (!top || top.length === 0) {
      return '<div style="color: var(--lba-fg-muted); padding: 12px 0;">Sin datos de ventas.</div>';
    }
    const max = Math.max(...top.map(t => Number(t.total || 0)), 1);
    return top.slice(0, 7).map(t => `
      <div class="bar-row">
        <span class="bar-row__label" title="${this._escape(t.name)}">${this._escape(t.name)}</span>
        <span class="bar-row__track"><span class="bar-row__fill" style="width: ${Math.round((Number(t.total || 0) / max) * 100)}%"></span></span>
        <span class="bar-row__value">${Number(t.quantity || 0)} · $${Number(t.total || 0).toFixed(0)}</span>
      </div>
    `).join('');
  },

  _renderActivity(kitchenOrders, sales) {
    const rows = [];
    const active = (kitchenOrders || []).filter(o => o.State !== 'SERVED' && o.State !== 'VOIDED');
    for (const o of active.slice(0, 3)) {
      rows.push(`<div class="activity-row"><span class="activity-row__time">${this._fmtTime(o.CreatedAt)}</span><span class="activity-row__text">Pedido #${o.TicketNumber || o.TicketId} en cocina (${o.TableName || 'llevar'})</span></div>`);
    }
    if (Number(sales.totalVoided || 0) > 0) {
      rows.push(`<div class="activity-row"><span class="activity-row__time">—</span><span class="activity-row__text">${sales.totalVoided} ticket(s) anulados hoy</span></div>`);
    }
    if (Number(sales.totalRefunded || 0) > 0) {
      rows.push(`<div class="activity-row"><span class="activity-row__time">—</span><span class="activity-row__text">${sales.totalRefunded} reembolso(s) registrados</span></div>`);
    }
    if (rows.length === 0) rows.push('<div style="color: var(--lba-fg-muted); padding: 10px 0;">Sin actividad reciente.</div>');
    return rows.join('');
  },

  _renderAlerts(lowStock, activeKitchen, cashOpen, sales) {
    const items = [];
    for (const s of (lowStock || []).slice(0, 4)) {
      items.push(`<div style="display:flex; gap:8px; align-items:center; padding: 7px 0; border-bottom: 1px dashed var(--lba-border-light);">
        <span class="badge badge--danger"><i class="fa-solid fa-triangle-exclamation"></i> Bajo</span>
        <span style="flex:1;">${this._escape(s.IngredientName)}</span>
        <span style="font-weight:700; font-variant-numeric: tabular-nums;">${Number(s.Quantity).toFixed(1)} ${this._escape(s.UnitCode || '')}</span>
      </div>`);
    }
    if (!cashOpen) {
      items.push('<div style="display:flex; gap:8px; align-items:center; padding: 7px 0;"><span class="badge badge--warn"><i class="fa-solid fa-cash-register"></i> Caja</span><span style="flex:1;">No hay sesión de caja abierta</span></div>');
    }
    if (items.length === 0) items.push('<div style="color: var(--lba-fg-muted); padding: 10px 0;"><i class="fa-solid fa-circle-check" style="color: var(--lba-success)"></i> Todo en orden.</div>');
    return items.join('');
  },

  _fmtTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return '—'; }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.DashboardView = DashboardView;
