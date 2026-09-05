// =====================================================================
// views/pos.js — PosView (main POS screen)
// =====================================================================
// 4 zones (CSS Grid):
//   1. Ticket info bar (top)
//   2. Open tickets strip (horizontal)
//   3. Main area: orders (left 60%) + products (right 40%)
//   4. Command bar (bottom): Gift, Void, Note, Tags, Discount, Print, Pay
// =====================================================================

const PosView = {
  init() {
    this.ordersListEl = document.getElementById('pos-orders-list');
    this.totalsEl = document.getElementById('pos-totals');
    this.categoriesEl = document.getElementById('pos-categories');
    this.productsGridEl = document.getElementById('pos-products-grid');
    this.pagingEl = document.getElementById('pos-products-paging');
    this.ticketNumberEl = document.getElementById('pos-ticket-number');
    this.tableEl = document.getElementById('pos-table');
    this.dateEl = document.getElementById('pos-date');
    this.grandTotalEl = document.getElementById('pos-grand-total');
    this.openTicketsEl = document.getElementById('pos-opentickets');

    this._currentPage = 1;

    // Subscribe to store
    window.store.subscribe((state, prev, reason) => {
      if (state.currentTicket !== prev.currentTicket) this._renderTicket();
      if (state.openTickets !== prev.openTickets) this._renderOpenTickets();
      if (state.products !== prev.products) this._renderProducts();
    });

    this._renderProducts();
    this._renderTicket();
    this._renderOpenTickets();
  },

  async refresh() {
    try {
      const res = await Api.getProducts();
      window.store.setState({ products: res.data }, 'products-loaded');
    } catch (err) {
      window.App.toast('Failed to load products: ' + err.message, 'error');
    }
    // Also refresh open tickets
    try {
      const res = await Api.getTickets();
      window.store.setState({ openTickets: res.data }, 'open-tickets-loaded');
    } catch (err) {
      window.App.toast('Failed to load open tickets: ' + err.message, 'error');
    }
  },

  // ===================================================================
  // Open tickets strip
  // ===================================================================

  _renderOpenTickets() {
    const tiles = this.openTicketsEl.querySelectorAll('.pos-opentickets__tile:not(.pos-opentickets__tile--new)');
    tiles.forEach(t => t.remove());
    const newTile = this.openTicketsEl.querySelector('.pos-opentickets__tile--new');

    for (const ticket of window.store.openTickets) {
      const tile = document.createElement('div');
      tile.className = 'pos-opentickets__tile';
      const total = Number(ticket.TotalAmount || 0).toFixed(2);
      const table = ticket.TicketEntities?.[0]?.EntityName || '—';
      tile.innerHTML = `
        <div>#${ticket.Id}</div>
        <div style="font-size: 11px; opacity: 0.8;">${table}</div>
        <div>$${total}</div>
      `;
      tile.addEventListener('click', async () => {
        try {
          const full = await Api.getTicket(ticket.Id);
          window.store.setState({ currentTicket: full.data }, 'ticket-loaded');
        } catch (err) {
          window.App.toast('Cannot load ticket: ' + err.message, 'error');
        }
      });
      this.openTicketsEl.insertBefore(tile, newTile);
    }
  },

  // ===================================================================
  // Ticket display (info bar + orders + totals)
  // ===================================================================

  _renderTicket() {
    const t = window.store.currentTicket;
    if (!t) {
      this.ticketNumberEl.textContent = '(new)';
      this.tableEl.textContent = '(none)';
      this.dateEl.textContent = '--';
      this.ordersListEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--samba-fg-muted);">No ticket selected. Tap a table or "New Ticket".</div>';
      this._renderTotals({ subtotal: 0, tax: 0, discount: 0, total: 0 });
      return;
    }
    this.ticketNumberEl.textContent = t.TicketNumber || ('#' + t.Id);
    this.tableEl.textContent = t.TicketEntities?.[0]?.EntityName || '(none)';
    this.dateEl.textContent = new Date(t.Date).toLocaleString();

    // Render orders
    if (!t.Orders || t.Orders.length === 0) {
      this.ordersListEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--samba-fg-muted);">No orders yet. Tap a product button to start.</div>';
    } else {
      this.ordersListEl.innerHTML = '';
      for (const order of t.Orders) {
        const item = document.createElement('div');
        item.className = 'ticket-item';
        if (!order.CalculatePrice) item.classList.add('is-gift');
        const qty = Number(order.Quantity || 0);
        const price = Number(order.Price || 0);
        const total = (price * qty).toFixed(2);
        item.innerHTML = `
          <span class="ticket-item__name">${this._escape(order.MenuItemName)} <em style="color: var(--samba-fg-muted); font-size: 12px;">${order.PortionName || ''}</em></span>
          <span class="ticket-item__qty">${qty} ×</span>
          <span class="ticket-item__total">$${total}</span>
        `;
        this.ordersListEl.appendChild(item);
      }
    }

    // Compute totals
    const totals = this._computeTotals(t);
    this._renderTotals(totals);
  },

  _computeTotals(ticket) {
    let subtotal = 0;
    for (const o of (ticket?.Orders || [])) {
      if (o.CalculatePrice) subtotal += Number(o.Price || 0) * Number(o.Quantity || 0);
    }
    let discount = 0;
    for (const c of (ticket?.Calculations || [])) {
      discount += Number(c.CalculationAmount || 0);
    }
    const total = Number(ticket?.TotalAmount || 0);
    const tax = Math.max(0, total - subtotal - discount);
    return { subtotal, tax, discount, total };
  },

  _renderTotals({ subtotal, tax, discount, total }) {
    const rows = this.totalsEl.children;
    rows[0].querySelector('span:last-child').textContent = '$' + subtotal.toFixed(2);
    rows[1].querySelector('span:last-child').textContent = '$' + tax.toFixed(2);
    rows[2].querySelector('span:last-child').textContent = '$' + discount.toFixed(2);
    this.grandTotalEl.textContent = '$' + total.toFixed(2);
  },

  // ===================================================================
  // Product selector (categories + grid + paging)
  // ===================================================================

  _renderProducts() {
    const products = window.store.products;
    if (products.length === 0) {
      this.categoriesEl.innerHTML = '';
      this.productsGridEl.innerHTML = '<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--samba-fg-muted);">No products loaded. Use the seed to create some.</div>';
      return;
    }

    // Render category tabs
    const categories = window.store.getCategories();
    this.categoriesEl.innerHTML = '';
    if (categories.length === 0) {
      this.categoriesEl.innerHTML = '<div style="padding: 10px; color: var(--samba-fg-muted);">No categories</div>';
    } else {
      for (const cat of categories) {
        const tab = document.createElement('button');
        tab.className = 'category-tab' + (cat === window.store.state.selectedCategoryId ? ' is-active' : '');
        tab.textContent = cat;
        tab.addEventListener('click', () => {
          window.store.setState({ selectedCategoryId: cat }, 'category-selected');
          this._currentPage = 1;
          this._renderProducts();
        });
        this.categoriesEl.appendChild(tab);
      }
    }

    // Render product buttons (filtered by selected category)
    const selectedCat = window.store.state.selectedCategoryId || categories[0];
    const items = selectedCat ? products.filter(p => p.GroupCode === selectedCat) : products;
    const pageSize = 20;   // 5 cols × 4 rows
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (this._currentPage > totalPages) this._currentPage = totalPages;
    const start = (this._currentPage - 1) * pageSize;
    const page = items.slice(start, start + pageSize);

    this.productsGridEl.innerHTML = '';
    for (const item of page) {
      const portion = item.Portions?.[0];
      const price = Number(portion?.Prices?.[0]?.Price || 0);
      const btn = document.createElement('flex-button');
      btn.setAttribute('label', item.Name);
      btn.setAttribute('sublabel', '$' + price.toFixed(2));
      btn.setAttribute('icon', 'fa-utensils');
      btn.style.minHeight = '60px';
      btn.style.flexDirection = 'column';
      btn.addEventListener('click', () => this._addProduct(item));
      this.productsGridEl.appendChild(btn);
    }

    // Paging
    this.pagingEl.innerHTML = '';
    if (totalPages > 1) {
      const prev = document.createElement('flex-button');
      prev.setAttribute('label', '◀');
      prev.style.minHeight = '40px';
      prev.style.padding = '0 12px';
      prev.addEventListener('click', () => { if (this._currentPage > 1) { this._currentPage--; this._renderProducts(); } });
      this.pagingEl.appendChild(prev);

      const pageLabel = document.createElement('div');
      pageLabel.style.alignSelf = 'center';
      pageLabel.style.padding = '0 10px';
      pageLabel.textContent = `Page ${this._currentPage} / ${totalPages}`;
      this.pagingEl.appendChild(pageLabel);

      const next = document.createElement('flex-button');
      next.setAttribute('label', '▶');
      next.style.minHeight = '40px';
      next.style.padding = '0 12px';
      next.addEventListener('click', () => { if (this._currentPage < totalPages) { this._currentPage++; this._renderProducts(); } });
      this.pagingEl.appendChild(next);
    }
  },

  async _addProduct(menuItem) {
    if (!window.store.currentTicket) {
      // Auto-create a ticket if none selected
      try {
        const res = await Api.createTicket({});
        window.store.setState({
          currentTicket: res.data,
          openTickets: [...window.store.openTickets, res.data],
        }, 'ticket-auto-created');
      } catch (err) {
        window.App.toast('Cannot create ticket: ' + err.message, 'error');
        return;
      }
    }
    const ticketId = window.store.currentTicket.Id;
    try {
      const res = await Api.addOrder(ticketId, { menuItemId: menuItem.Id, quantity: 1 });
      window.store.setState({ currentTicket: res.data }, 'order-added');
    } catch (err) {
      window.App.toast('Cannot add order: ' + err.message, 'error');
    }
  },

  // ===================================================================
  // Command bar actions
  // ===================================================================

  async newTicket() {
    try {
      const res = await Api.createTicket({});
      window.store.setState({
        currentTicket: res.data,
        openTickets: [...window.store.openTickets, res.data],
      }, 'ticket-created');
      window.App.toast('New ticket #' + res.data.Id + ' created', 'success');
    } catch (err) {
      window.App.toast('Cannot create ticket: ' + err.message, 'error');
    }
  },

  async gift() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    window.App.toast('Gift action — not yet wired to a CalculationType', 'warn');
  },

  async voidAction() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    window.App.toast('Void action — not yet wired', 'warn');
  },

  note() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    window.App.showModal('Ticket Note', `
      <textarea id="note-input" rows="4" style="width: 100%; padding: 8px; background: var(--samba-bg-note); border: 1px solid var(--samba-border-input); border-radius: 4px;">${this._escape(window.store.currentTicket.Note || '')}</textarea>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <flex-button label="Cancel" onclick="window.App.closeModal()"></flex-button>
        <flex-button variant="success" label="Save" onclick="window.App.views.pos._saveNote()"></flex-button>
      </div>
    `);
  },

  async _saveNote() {
    const note = document.getElementById('note-input').value;
    // We don't have a dedicated endpoint yet — would need POST /api/tickets/:id/note
    window.App.closeModal();
    window.App.toast('Note saving requires a dedicated endpoint (Sprint 5)', 'warn');
  },

  tags() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    window.App.toast('Tags selector — not yet implemented (Sprint 5)', 'warn');
  },

  async discount() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    // Use the seeded Discount CalculationType (id=1, CalculationMethod=0 = percent)
    const percent = prompt('Enter discount percentage:', '10');
    if (!percent) return;
    const amount = parseFloat(percent);
    if (isNaN(amount) || amount < 0 || amount > 100) {
      return window.App.toast('Invalid percentage', 'error');
    }
    try {
      const res = await Api.addCalculation(window.store.currentTicket.Id, { calculationTypeId: 1, amount });
      window.store.setState({ currentTicket: res.data }, 'discount-applied');
      window.App.toast(`${amount}% discount applied`, 'success');
    } catch (err) {
      window.App.toast('Cannot apply discount: ' + err.message, 'error');
    }
  },

  async printBill() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    try {
      const res = await Api.printTicket(window.store.currentTicket.Id);
      window.App.showModal('Print Preview — Ticket #' + (window.store.currentTicket.TicketNumber || window.store.currentTicket.Id), `
        <div class="print-preview">${this._escape(res.data.formatted)}</div>
        <div style="margin-top: 12px; font-size: 12px; color: var(--samba-fg-muted);">
          ESC/POS bytes: ${res.data.escposBytesCount} (base64 length ${res.data.escposBase64.length})
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
          <flex-button label="Close" onclick="window.App.closeModal()"></flex-button>
          <flex-button variant="action" icon="fa-print" label="Print" onclick="window.App.views.pos._doPrint('${res.data.escposBase64}')"></flex-button>
        </div>
      `);
    } catch (err) {
      window.App.toast('Cannot generate print: ' + err.message, 'error');
    }
  },

  _doPrint(_base64) {
    window.App.toast('Print sent to mock ESC/POS (real WebUSB in Sprint 5)', 'info');
    window.App.closeModal();
  },

  async pay() {
    if (!window.store.currentTicket) return window.App.toast('No ticket selected', 'warn');
    if (Number(window.store.currentTicket.RemainingAmount || 0) <= 0) {
      return window.App.toast('Ticket has no remaining balance', 'warn');
    }
    window.App.navigate('payment');
    if (window.App.views.payment) {
      window.App.views.payment.load(window.store.currentTicket);
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.PosView = PosView;
