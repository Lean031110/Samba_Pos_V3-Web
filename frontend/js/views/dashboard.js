// =====================================================================
// views/dashboard.js — EntityDashboardView (table map)
// =====================================================================
// Displays tables in a 7-column grid. Tile colors reflect state:
//   - Available  → LightGreen (#90EE90)  — text black
//   - New Orders → DarkBlue (#00008B)    — text white
//   - Bill Requested → Orange (#FFA500)  — text black
//   - Locked     → Gray (#808080)        — text white
//
// Tapping an Available table opens a new ticket for that table.
// Tapping an Occupied table opens the existing ticket.
// =====================================================================

// Map backend table states (English, SambaPOS convention) to Spanish
// display labels. The English values are kept for CSS class matching
// (table-tile--available, etc.) and logic comparisons.
const TABLE_STATE_LABELS = {
  'Available':       'Disponible',
  'New Orders':      'Nuevos pedidos',
  'Bill Requested':  'Cuenta solicitada',
  'Locked':          'Bloqueada',
};

const DashboardView = {
  init() {
    this.gridEl = document.getElementById('dashboard-grid');
    this._render();
    // Subscribe to store changes
    window.store.subscribe((state, prev, reason) => {
      if (reason === 'tables-loaded' || reason === 'EntityUpdated') {
        this._render();
      }
    });
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
    const tables = window.store.tables;
    const filterText = (document.getElementById('dashboard-search-input')?.value || '').toLowerCase();

    const filtered = filterText
      ? tables.filter(t => (t.Name || '').toLowerCase().includes(filterText))
      : tables;

    this.gridEl.innerHTML = '';
    if (filtered.length === 0) {
      this.gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--samba-fg-muted);">Sin mesas. Cargá el seed para crear algunas o hacé clic en Nueva mesa.</div>';
      return;
    }

    for (const table of filtered) {
      const state = this._extractState(table);
      const stateLabel = TABLE_STATE_LABELS[state] || state;
      const tile = document.createElement('div');
      tile.className = 'table-tile table-tile--' + state.toLowerCase().replace(/\s+/g, '-');
      tile.innerHTML = `
        <div class="table-tile__name">${this._escape(table.Name)}</div>
        <div class="table-tile__state">${stateLabel}</div>
      `;
      tile.addEventListener('click', () => this._onTableClick(table));
      this.gridEl.appendChild(tile);
    }
  },

  /**
   * Extract the human-readable state name from the table's EntityStates JSON.
   * Example: EntityStates = [{StateName:"Status", State:"Available"}]
   */
  _extractState(table) {
    if (!table.EntityStates || !Array.isArray(table.EntityStates)) return 'Desconocido';
    const status = table.EntityStates.find(s => s.StateName === 'Status');
    return status?.State || 'Desconocido';
  },

  async _onTableClick(table) {
    const state = this._extractState(table);
    const stateLabel = TABLE_STATE_LABELS[state] || state;
    window.App.toast(`Mesa ${table.Name} (${stateLabel}) tocada`, 'info');

    if (state === 'Available') {
      // Create a new ticket linked to this table
      try {
        const res = await Api.createTicket({ tableId: table.Id });
        window.App.toast(`Ticket #${res.data.Id} creado para mesa ${table.Name}`, 'success');
        window.store.setState({
          currentTicket: res.data,
          openTickets: [...window.store.openTickets, res.data],
        }, 'ticket-created');
        window.App.navigate('pos');
      } catch (err) {
        window.App.toast('No se puede crear ticket: ' + err.message, 'error');
      }
    } else {
      // Open existing ticket on this table
      try {
        const ticketsRes = await Api.getTickets();
        const open = ticketsRes.data.find(t =>
          t.TicketEntities?.some(te => te.EntityId === table.Id)
        );
        if (open) {
          const full = await Api.getTicket(open.Id);
          window.store.setState({ currentTicket: full.data }, 'ticket-loaded');
          window.App.navigate('pos');
        } else {
          window.App.toast('La mesa está marcada como ' + (TABLE_STATE_LABELS[state] || state) + ' pero no se encontró ningún ticket abierto', 'warn');
        }
      } catch (err) {
        window.App.toast('No se puede cargar el ticket: ' + err.message, 'error');
      }
    }
  },

  filter(text) {
    this._render();
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.DashboardView = DashboardView;
