// =====================================================================
// views/cash.js — CashView (Caja — spec §21)
// =====================================================================
// Tabs: Caja actual (abrir/cerrar) · Movimientos · Historial.
// Usa /api/cash-sessions/* existentes (sin cambios de lógica).
// =====================================================================

const CashView = {
  init() {
    this.bodyEl = document.getElementById('cash-body');
    this._tab = 'current';
    this._sessions = [];
  },

  async refresh() {
    try {
      const res = await Api.request('GET', '/cash-sessions');
      this._sessions = res.data || [];
    } catch (err) {
      this._sessions = [];
      window.App.toast('No se pueden cargar las sesiones de caja: ' + err.message, 'error');
    }
    this.render();
  },

  showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('#cash-tabs .simple-tab').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
    this.render();
  },

  get _current() {
    return this._sessions.find(s => s.Status === 'OPEN') || null;
  },

  render() {
    if (!this.bodyEl) return;
    if (this._tab === 'current') this._renderCurrent();
    else if (this._tab === 'movements') this._renderMovements();
    else this._renderHistory();
  },

  _renderCurrent() {
    const cur = this._current;
    this.bodyEl.innerHTML = `
      <div class="panel-card" style="max-width: 560px;">
        <div class="panel-card__header">
          <i class="fa-solid fa-cash-register"></i> Sesión actual
          ${cur ? '<span class="badge badge--ok"><i class="fa-solid fa-circle-check"></i> ABIERTA</span>' : '<span class="badge badge--muted"><i class="fa-solid fa-circle-xmark"></i> CERRADA</span>'}
        </div>
        <div class="panel-card__body">
          ${cur ? `
            <table class="table-odoo">
              <tbody>
                <tr><td data-label="Abierta por">Abierta por</td><td class="num">${this._escape(cur.OpenedByName || '—')}</td></tr>
                <tr><td data-label="Apertura">Apertura</td><td class="num">${this._fmt(cur.OpenedAt)}</td></tr>
                <tr><td data-label="Fondo inicial">Fondo inicial</td><td class="num">$${Number(cur.OpeningAmount || 0).toFixed(2)}</td></tr>
              </tbody>
            </table>
            <div style="display: flex; gap: 10px; margin-top: 14px;">
              <button class="btn-odoo btn-odoo--danger" onclick="window.App.views.cash.closeSession(${cur.Id})">
                <i class="fa-solid fa-lock"></i> Cerrar caja
              </button>
            </div>
          ` : `
            <p style="color: var(--lba-fg-muted); margin: 4px 0 14px;">No hay sesión abierta. Abrí la caja para comenzar a cobrar.</p>
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <label style="font-weight: 700; font-size: 13px;">Fondo inicial: $</label>
              <input type="number" id="cash-opening-amount" value="100" min="0" step="0.01"
                     style="width: 140px; height: 44px; padding: 0 12px; border: 1px solid var(--lba-border-default); border-radius: var(--lba-radius-sm); font-size: 16px;">
              <button class="btn-odoo" onclick="window.App.views.cash.openSession()">
                <i class="fa-solid fa-lock-open"></i> Abrir caja
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  },

  _renderMovements() {
    const cur = this._current;
    if (!cur) {
      this.bodyEl.innerHTML = '<div class="panel-card"><div class="panel-card__body" style="color: var(--lba-fg-muted);">Sin sesión de caja abierta — no hay movimientos.</div></div>';
      return;
    }
    this.bodyEl.innerHTML = `
      <div class="panel-card" style="max-width: 720px;">
        <div class="panel-card__header"><i class="fa-solid fa-arrow-right-arrow-left"></i> Movimientos de la sesión #${cur.Id}</div>
        <div class="panel-card__body">
          <table class="table-odoo">
            <thead><tr><th>Hora</th><th>Concepto</th><th class="num">Importe</th></tr></thead>
            <tbody>
              <tr><td data-label="Hora">${this._fmtTime(cur.OpenedAt)}</td><td>Apertura de caja</td><td class="num">$${Number(cur.OpeningAmount || 0).toFixed(2)}</td></tr>
              ${(cur.Events || []).map(e => `
                <tr><td data-label="Hora">${this._fmtTime(e.CreatedAt)}</td><td>${this._escape(e.EventTypeName || e.EventType || 'Movimiento')}</td><td class="num">${e.Amount != null ? '$' + Number(e.Amount).toFixed(2) : '—'}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  _renderHistory() {
    const closed = this._sessions.filter(s => s.Status !== 'OPEN');
    this.bodyEl.innerHTML = `
      <div class="panel-card" style="max-width: 780px;">
        <div class="panel-card__header"><i class="fa-solid fa-clock-rotate-left"></i> Historial de sesiones</div>
        <div class="panel-card__body">
          ${closed.length === 0
            ? '<div style="color: var(--lba-fg-muted);">Sin sesiones cerradas registradas.</div>'
            : `<table class="table-odoo">
                <thead><tr><th>#</th><th>Apertura</th><th>Cierre</th><th>Abrió</th><th class="num">Fondo</th><th class="num">Cierre</th><th>Estado</th></tr></thead>
                <tbody>
                  ${closed.map(s => `
                    <tr>
                      <td data-label="#">${s.Id}</td>
                      <td data-label="Apertura">${this._fmt(s.OpenedAt)}</td>
                      <td data-label="Cierre">${s.ClosedAt ? this._fmt(s.ClosedAt) : '—'}</td>
                      <td data-label="Abrió">${this._escape(s.OpenedByName || '—')}</td>
                      <td data-label="Fondo" class="num">$${Number(s.OpeningAmount || 0).toFixed(2)}</td>
                      <td data-label="Cierre" class="num">${s.ClosingAmount != null ? '$' + Number(s.ClosingAmount).toFixed(2) : '—'}</td>
                      <td><span class="badge badge--muted">${this._escape(s.Status)}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
      </div>
    `;
  },

  async openSession() {
    const amountEl = document.getElementById('cash-opening-amount');
    const openingAmount = parseFloat(amountEl?.value || '100');
    try {
      await Api.openCashSession({ openingAmount });
      window.App.toast('Caja abierta', 'success');
      this.refresh();
    } catch (err) {
      window.App.toast('No se puede abrir la caja: ' + err.message, 'error');
    }
  },

  async closeSession(id) {
    if (!id) return;
    if (!confirm('¿Cerrar la sesión de caja? Se consolidarán los movimientos.')) return;
    try {
      await Api.closeCashSession(id, {});
      window.App.toast('Caja cerrada', 'success');
      this.refresh();
    } catch (err) {
      window.App.toast('No se puede cerrar la caja: ' + err.message, 'error');
    }
  },

  _fmt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch (e) { return '—'; }
  },

  _fmtTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.CashView = CashView;
