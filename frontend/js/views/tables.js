// =====================================================================
// views/tables.js — TablesView (mapa de mesas del POS)
// =====================================================================
// Spec §12: grid de mesas con estados libre/ocupada/cuenta/bloqueada.
// Color + icono + texto (nunca solo color). Click en mesa libre crea
// ticket; mesa ocupada abre el ticket existente.
// Mantiene la lógica de negocio de DashboardView (createTicket/getTicket).
// =====================================================================

const TABLE_STATE_LABELS = {
  'Available': 'Libre',
  'New Orders': 'Pedido pendiente',
  'Bill Requested': 'Cuenta',
  'Locked': 'Bloqueada',
};

const TablesView = {
  init() {
    this.gridEl = document.getElementById('tables-grid');
    window.store.subscribe((state, prev, reason) => {
      if (reason === 'tables-loaded' || reason === 'EntityUpdated' || reason === 'ticket-closed') {
        this._render();
      }
    });
    this._render();
  },

  async refresh() {
    try {
      const res = await Api.getTables();
      window.store.setState({ tables: res.data }, 'tables-loaded');
    } catch (err) {
      window.App.toast('Error al cargar mesas: ' + err.message, 'error');
    }
  },

  _render() {
    if (!this.gridEl) return;
    const tables = window.store.tables;
    this.gridEl.innerHTML = '';

    if (!tables || tables.length === 0) {
      this.gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--lba-fg-muted);">Sin mesas configuradas.</div>';
      return;
    }

    for (const table of tables) {
      const state = this._extractState(table);
      const stateKey = (TABLE_STATE_LABELS[state] ? state : 'Locked').toLowerCase().replace(/\s+/g, '-');
      const stateLabel = TABLE_STATE_LABELS[state] || state;
      const icon = state === 'Available' ? 'fa-circle-check'
        : state === 'New Orders' ? 'fa-utensils'
        : state === 'Bill Requested' ? 'fa-file-invoice-dollar' : 'fa-lock';
      const occupied = state !== 'Available' && state !== 'Locked';

      const tile = document.createElement('button');
      tile.className = 'table-tile2 table-tile2--' + stateKey;
      tile.innerHTML = `
        <span class="table-tile2__num">${this._escape(table.Name)}</span>
        <span class="table-tile2__state"><i class="fa-solid ${icon}"></i> ${this._escape(stateLabel)}</span>
        ${occupied ? '<span class="table-tile2__amount">Ver ticket →</span>' : '<span class="table-tile2__amount">Abrir mesa</span>'}
      `;
      tile.addEventListener('click', () => this._onTableClick(table));
      this.gridEl.appendChild(tile);
    }
  },

  _extractState(table) {
    if (!table.EntityStates || !Array.isArray(table.EntityStates)) return table.State || 'Available';
    const status = table.EntityStates.find(s => s.StateName === 'Status');
    return status?.State || 'Available';
  },

  async _onTableClick(table) {
    const state = this._extractState(table);
    const stateLabel = TABLE_STATE_LABELS[state] || state;

    if (state === 'Available') {
      try {
        const res = await Api.createTicket({ tableId: table.Id });
        window.store.setState({
          currentTicket: res.data,
          openTickets: [...window.store.openTickets, res.data],
        }, 'ticket-created');
        window.App.toast(`Ticket #${res.data.Id} creado — Mesa ${table.Name}`, 'success');
        window.App.navigate('pos');
      } catch (err) {
        window.App.toast('No se puede crear ticket: ' + err.message, 'error');
      }
    } else {
      try {
        const ticketsRes = await Api.getTickets();
        const open = (ticketsRes.data || []).find(t =>
          t.TicketEntities?.some(te => te.EntityId === table.Id)
        );
        if (open) {
          const full = await Api.getTicket(open.Id);
          window.store.setState({ currentTicket: full.data }, 'ticket-loaded');
          window.App.navigate('pos');
        } else {
          window.App.toast(`Mesa ${table.Name} está «${stateLabel}» pero no tiene ticket abierto`, 'warn');
        }
      } catch (err) {
        window.App.toast('No se puede cargar el ticket: ' + err.message, 'error');
      }
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.TablesView = TablesView;
