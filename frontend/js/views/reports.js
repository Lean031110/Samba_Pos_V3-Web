// =====================================================================
// views/reports.js — ReportsView (Reportes — spec §21)
// =====================================================================
// Tabs: Ventas (resumen) · Top productos.
// Usa /api/reports/* existentes.
// =====================================================================

const ReportsView = {
  init() {
    this.bodyEl = document.getElementById('reports-body');
    this._tab = 'sales';
  },

  async refresh() {
    if (this._tab === 'sales') await this._renderSales();
    else await this._renderTop();
  },

  showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('#reports-tabs .simple-tab').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
    this.refresh();
  },

  async _renderSales() {
    this.bodyEl.innerHTML = '<div style="color: var(--lba-fg-muted); padding: 20px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando…</div>';
    let sales = {};
    try {
      const res = await Api.getReport('sales');
      sales = res.data || {};
    } catch (err) {
      window.App.toast('No se pueden cargar los reportes: ' + err.message, 'error');
    }

    this.bodyEl.innerHTML = `
      <div class="kpi-grid" style="max-width: 900px;">
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-sack-dollar"></i> Ventas totales</span>
          <span class="kpi-card__value">$${Number(sales.totalSales || 0).toFixed(2)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-receipt"></i> Tickets</span>
          <span class="kpi-card__value">${Number(sales.totalTickets || 0)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-chart-simple"></i> Promedio</span>
          <span class="kpi-card__value">$${Number(sales.avgTicket || 0).toFixed(2)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-ban"></i> Anulados</span>
          <span class="kpi-card__value">${Number(sales.totalVoided || 0)}</span>
          <span class="kpi-card__hint">$${Number(sales.voidedAmount || 0).toFixed(2)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label"><i class="fa-solid fa-rotate-left"></i> Reembolsos</span>
          <span class="kpi-card__value">${Number(sales.totalRefunded || 0)}</span>
          <span class="kpi-card__hint">$${Number(sales.refundedAmount || 0).toFixed(2)}</span>
        </div>
      </div>
    `;
  },

  async _renderTop() {
    this.bodyEl.innerHTML = '<div style="color: var(--lba-fg-muted); padding: 20px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando…</div>';
    let top = [];
    try {
      const res = await Api.getReport('top-products');
      top = res.data || [];
    } catch (err) {
      window.App.toast('No se pueden cargar el top de productos: ' + err.message, 'error');
    }

    this.bodyEl.innerHTML = `
      <div class="panel-card" style="max-width: 720px;">
        <div class="panel-card__header"><i class="fa-solid fa-ranking-star"></i> Productos más vendidos</div>
        <div class="panel-card__body">
          ${top.length === 0
            ? '<div style="color: var(--lba-fg-muted);">Sin datos.</div>'
            : `<table class="table-odoo">
                <thead><tr><th>#</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Total</th></tr></thead>
                <tbody>
                  ${top.map((t, i) => `
                    <tr>
                      <td data-label="#">${i + 1}</td>
                      <td data-label="Producto">${this._escape(t.name)}</td>
                      <td data-label="Cantidad" class="num">${Number(t.quantity || 0)}</td>
                      <td data-label="Total" class="num">$${Number(t.total || 0).toFixed(2)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
      </div>
    `;
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.ReportsView = ReportsView;
