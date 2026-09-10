// =====================================================================
// views/inventory.js — InventoryView (Inventario — spec §21)
// =====================================================================
// Tabs: Stock (todos los ingredientes) · Stock bajo (alertas).
// Usa /api/inventory/* existentes.
// =====================================================================

const InventoryView = {
  init() {
    this.bodyEl = document.getElementById('inventory-body');
    this._tab = 'stock';
    this._stock = [];
  },

  async refresh() {
    try {
      const res = await Api.request('GET', '/inventory/stock/1');
      this._stock = res.data || [];
    } catch (err) {
      this._stock = [];
      window.App.toast('No se puede cargar el inventario: ' + err.message, 'error');
    }
    this.render();
  },

  showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('#inventory-tabs .simple-tab').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
    this.render();
  },

  render() {
    if (!this.bodyEl) return;
    const items = this._tab === 'low'
      ? this._stock.filter(s => Number(s.Quantity) <= Number(s.MinimumStock || 0))
      : this._stock;

    this.bodyEl.innerHTML = `
      <div class="panel-card" style="max-width: 820px;">
        <div class="panel-card__header">
          <i class="fa-solid fa-warehouse"></i>
          ${this._tab === 'low' ? 'Ingredientes bajo mínimo' : 'Stock de ingredientes'}
          <span class="badge badge--info">${items.length}</span>
        </div>
        <div class="panel-card__body">
          ${items.length === 0
            ? `<div style="color: var(--lba-fg-muted); padding: 8px 0;">
                 ${this._tab === 'low' ? '<i class="fa-solid fa-circle-check" style="color: var(--lba-success)"></i> Ningún ingrediente bajo mínimo.' : 'Sin datos de inventario.'}
               </div>`
            : `<table class="table-odoo">
                <thead><tr><th>Ingrediente</th><th class="num">Cantidad</th><th class="num">Mínimo</th><th>Estado</th></tr></thead>
                <tbody>
                  ${items.map(s => {
                    const low = Number(s.Quantity) <= Number(s.MinimumStock || 0);
                    return `
                    <tr>
                      <td data-label="Ingrediente">${this._escape(s.IngredientName)}</td>
                      <td data-label="Cantidad" class="num">${Number(s.Quantity).toFixed(1)} ${this._escape(s.UnitCode || '')}</td>
                      <td data-label="Mínimo" class="num">${Number(s.MinimumStock || 0).toFixed(1)}</td>
                      <td data-label="Estado">${low
                        ? '<span class="badge badge--danger"><i class="fa-solid fa-triangle-exclamation"></i> REPOSICIONAR</span>'
                        : '<span class="badge badge--ok"><i class="fa-solid fa-circle-check"></i> OK</span>'}</td>
                    </tr>`;
                  }).join('')}
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

window.InventoryView = InventoryView;
