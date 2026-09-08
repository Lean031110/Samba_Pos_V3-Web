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
      window.App.toast('Error al cargar productos: ' + err.message, 'error');
    }
    // Also refresh open tickets
    try {
      const res = await Api.getTickets();
      window.store.setState({ openTickets: res.data }, 'open-tickets-loaded');
    } catch (err) {
      window.App.toast('Error al cargar tickets abiertos: ' + err.message, 'error');
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
          window.App.toast('No se puede cargar el ticket: ' + err.message, 'error');
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
      this.ticketNumberEl.textContent = '(nuevo)';
      this.tableEl.textContent = '(ninguna)';
      this.dateEl.textContent = '--';
      this.ordersListEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--samba-fg-muted);">Sin ticket seleccionado. Tocá una mesa o "Nuevo ticket".</div>';
      this._renderTotals({ subtotal: 0, tax: 0, discount: 0, total: 0 });
      return;
    }
    this.ticketNumberEl.textContent = t.TicketNumber || ('#' + t.Id);
    this.tableEl.textContent = t.TicketEntities?.[0]?.EntityName || '(ninguna)';
    this.dateEl.textContent = new Date(t.Date).toLocaleString();

    // Render orders
    if (!t.Orders || t.Orders.length === 0) {
      this.ordersListEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--samba-fg-muted);">Sin pedidos. Tocá un producto para empezar.</div>';
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
      this.productsGridEl.innerHTML = '<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--samba-fg-muted);">Sin productos cargados. Cargá el seed para crear algunos.</div>';
      return;
    }

    // Render category tabs
    const categories = window.store.getCategories();
    this.categoriesEl.innerHTML = '';
    if (categories.length === 0) {
      this.categoriesEl.innerHTML = '<div style="padding: 10px; color: var(--samba-fg-muted);">Sin categorías</div>';
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
      pageLabel.textContent = `Página ${this._currentPage} / ${totalPages}`;
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
        window.App.toast('No se puede crear ticket: ' + err.message, 'error');
        return;
      }
    }
    const ticketId = window.store.currentTicket.Id;
    try {
      const res = await Api.addOrder(ticketId, { menuItemId: menuItem.Id, quantity: 1 });
      window.store.setState({ currentTicket: res.data }, 'order-added');
    } catch (err) {
      window.App.toast('No se puede agregar el pedido: ' + err.message, 'error');
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
      window.App.toast('Nuevo ticket #' + res.data.Id + ' creado', 'success');
    } catch (err) {
      window.App.toast('No se puede crear ticket: ' + err.message, 'error');
    }
  },

  async gift() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    const ticket = window.store.currentTicket;
    if (!ticket.Orders || ticket.Orders.length === 0) {
      return window.App.toast('Sin pedidos para regalar', 'warn');
    }
    // Build order selection modal
    const orderCheckboxes = ticket.Orders.map(o => {
      const total = (Number(o.Price || 0) * Number(o.Quantity || 0)).toFixed(2);
      const checked = o.CalculatePrice ? '' : 'checked';
      const label = `${this._escape(o.MenuItemName)} x${Number(o.Quantity || 0)} ($${total})`;
      return `<label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer;">
        <input type="checkbox" class="gift-order-cb" data-order-id="${o.Id}" ${checked}>
        <span>${label}</span>
      </label>`;
    }).join('');
    window.App.showModal('Regalar pedidos', `
      <p style="margin-bottom: 8px; color: var(--samba-fg-muted);">Seleccioná los pedidos a marcar como Regalo (excluidos del total):</p>
      <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--samba-border-light); border-radius: 4px; padding: 8px;">
        ${orderCheckboxes}
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <flex-button label="Cancelar" onclick="window.App.closeModal()"></flex-button>
        <flex-button variant="discount" icon="fa-gift" label="Aplicar regalo" onclick="window.App.views.pos._applyGift()"></flex-button>
      </div>
    `);
  },

  async _applyGift() {
    const cbs = document.querySelectorAll('.gift-order-cb:checked');
    const orderIds = Array.from(cbs).map(cb => parseInt(cb.dataset.orderId, 10));
    if (orderIds.length === 0) {
      return window.App.toast('Sin pedidos seleccionados', 'warn');
    }
    try {
      const res = await Api.giftOrders(window.store.currentTicket.Id, orderIds);
      window.store.setState({ currentTicket: res.data }, 'gift-applied');
      window.App.closeModal();
      window.App.toast(`${orderIds.length} pedido(s) regalado(s)`, 'success');
    } catch (err) {
      window.App.toast('No se puede aplicar el regalo: ' + err.message, 'error');
    }
  },

  async void() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    const ticket = window.store.currentTicket;
    window.App.showModal('Anular ticket', `
      <p style="margin-bottom: 12px;">¿Seguro que querés anular el ticket #${ticket.TicketNumber || ticket.Id}?</p>
      <p style="color: var(--samba-fg-error); margin-bottom: 12px;">
        <i class="fa-solid fa-triangle-exclamation"></i> Esto revertirá todos los pagos y marcará el ticket como anulado. Esta acción no se puede deshacer.
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <flex-button label="Cancelar" onclick="window.App.closeModal()"></flex-button>
        <flex-button variant="danger" icon="fa-ban" label="Anular ticket" onclick="window.App.views.pos._confirmVoid()"></flex-button>
      </div>
    `);
  },

  async _confirmVoid() {
    try {
      const res = await Api.voidTicket(window.store.currentTicket.Id);
      window.store.setState({ currentTicket: res.data }, 'void-confirmed');
      window.App.closeModal();
      window.App.toast('Ticket anulado', 'success');
    } catch (err) {
      window.App.toast('No se puede anular el ticket: ' + err.message, 'error');
      window.App.closeModal();
    }
  },

  note() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    window.App.showModal('Nota del ticket', `
      <textarea id="note-input" rows="4" style="width: 100%; padding: 8px; background: var(--samba-bg-note); border: 1px solid var(--samba-border-input); border-radius: 4px;">${this._escape(window.store.currentTicket.Note || '')}</textarea>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <flex-button label="Cancelar" onclick="window.App.closeModal()"></flex-button>
        <flex-button variant="success" label="Guardar" onclick="window.App.views.pos._saveNote()"></flex-button>
      </div>
    `);
  },

  async _saveNote() {
    const note = document.getElementById('note-input').value;
    try {
      const res = await Api.setNote(window.store.currentTicket.Id, note);
      window.store.setState({ currentTicket: res.data }, 'note-set');
      window.App.closeModal();
      window.App.toast('Nota guardada', 'success');
    } catch (err) {
      window.App.toast('No se puede guardar la nota: ' + err.message, 'error');
    }
  },

  tags() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    const existing = (() => {
      try { return JSON.parse(window.store.currentTicket.TicketTags || '[]'); }
      catch { return []; }
    })();
    const existingHtml = existing.map(t => `<input type="text" class="tag-name" value="${this._escape(t.TagName || '')}" placeholder="Nombre de etiqueta" style="width: 45%; padding: 6px; margin: 2px;">
      <input type="text" class="tag-value" value="${this._escape(t.TagValue || '')}" placeholder="Valor" style="width: 45%; padding: 6px; margin: 2px;">`).join('');
    window.App.showModal('Etiquetas del ticket', `
      <p style="margin-bottom: 8px; color: var(--samba-fg-muted);">Pares nombre / valor de etiqueta:</p>
      <div id="tags-container" style="max-height: 250px; overflow-y: auto;">
        ${existingHtml}
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: space-between;">
        <flex-button icon="fa-plus" label="Agregar etiqueta" onclick="window.App.views.pos._addTagRow()"></flex-button>
        <div style="display: flex; gap: 8px;">
          <flex-button label="Cancelar" onclick="window.App.closeModal()"></flex-button>
          <flex-button variant="success" label="Guardar etiquetas" onclick="window.App.views.pos._saveTags()"></flex-button>
        </div>
      </div>
    `);
  },

  _addTagRow() {
    const container = document.getElementById('tags-container');
    const row = document.createElement('div');
    row.innerHTML = `<input type="text" class="tag-name" placeholder="Nombre de etiqueta" style="width: 45%; padding: 6px; margin: 2px;">
      <input type="text" class="tag-value" placeholder="Valor" style="width: 45%; padding: 6px; margin: 2px;">`;
    container.appendChild(row);
  },

  async _saveTags() {
    const names = document.querySelectorAll('.tag-name');
    const values = document.querySelectorAll('.tag-value');
    const tags = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i].value.trim();
      const value = values[i].value.trim();
      if (name) tags.push({ name, value });
    }
    try {
      const res = await Api.setTags(window.store.currentTicket.Id, tags);
      window.store.setState({ currentTicket: res.data }, 'tags-set');
      window.App.closeModal();
      window.App.toast(`${tags.length} etiqueta(s) guardada(s)`, 'success');
    } catch (err) {
      window.App.toast('No se pueden guardar las etiquetas: ' + err.message, 'error');
    }
  },

  async discount() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    // Fetch calculation types from backend (no hardcoded IDs)
    let calcTypes = window.store.state.calculationTypes;
    if (!calcTypes || calcTypes.length === 0) {
      try {
        const res = await Api.getCalculationTypes();
        calcTypes = res.data;
        window.store.setState({ calculationTypes: calcTypes }, 'calc-types-loaded');
      } catch (err) {
        return window.App.toast('No se pueden cargar los tipos de cálculo: ' + err.message, 'error');
      }
    }
    // Build modal with available discount types
    const discountTypes = calcTypes.filter(c => c.DecreaseAmount);
    if (discountTypes.length === 0) {
      return window.App.toast('No hay tipos de cálculo de descuento configurados', 'warn');
    }
    const optionsHtml = discountTypes.map(c => {
      const methodLabel = c.CalculationMethod === 0 ? '%' : c.CalculationMethod === 2 ? 'fijo' : 'redondeo';
      return `<label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer;">
        <input type="radio" name="calc-type" value="${c.Id}" ${c.Id === discountTypes[0].Id ? 'checked' : ''}>
        <span>${this._escape(c.Name)} (${methodLabel})</span>
      </label>`;
    }).join('');
    window.App.showModal('Aplicar descuento', `
      <div style="margin-bottom: 12px;">
        <p style="margin-bottom: 6px; color: var(--samba-fg-muted);">Tipo de descuento:</p>
        ${optionsHtml}
      </div>
      <div style="margin-bottom: 12px;">
        <p style="margin-bottom: 6px; color: var(--samba-fg-muted);">Importe:</p>
        <input type="number" id="discount-amount" value="10" min="0" step="0.01"
               style="width: 100%; padding: 10px; font-size: 18px; border: 1px solid var(--samba-border-input); border-radius: 4px;">
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <flex-button label="Cancelar" onclick="window.App.closeModal()"></flex-button>
        <flex-button variant="discount" icon="fa-percent" label="Aplicar" onclick="window.App.views.pos._applyDiscount()"></flex-button>
      </div>
    `);
  },

  async _applyDiscount() {
    const selectedType = document.querySelector('input[name="calc-type"]:checked');
    const amountInput = document.getElementById('discount-amount');
    if (!selectedType) return window.App.toast('Seleccioná un tipo de descuento', 'warn');
    const calculationTypeId = parseInt(selectedType.value, 10);
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount < 0) return window.App.toast('Importe inválido', 'error');
    try {
      const res = await Api.addCalculation(window.store.currentTicket.Id, { calculationTypeId, amount });
      window.store.setState({ currentTicket: res.data }, 'discount-applied');
      window.App.closeModal();
      window.App.toast('Descuento aplicado', 'success');
    } catch (err) {
      window.App.toast('No se puede aplicar el descuento: ' + err.message, 'error');
    }
  },

  async printBill() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    try {
      const res = await Api.printTicket(window.store.currentTicket.Id);
      window.App.showModal('Vista previa de impresión — Ticket #' + (window.store.currentTicket.TicketNumber || window.store.currentTicket.Id), `
        <div class="print-preview">${this._escape(res.data.formatted)}</div>
        <div style="margin-top: 12px; font-size: 12px; color: var(--samba-fg-muted);">
          Bytes ESC/POS: ${res.data.escposBytesCount} (longitud base64 ${res.data.escposBase64.length})
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
          <flex-button label="Cerrar" onclick="window.App.closeModal()"></flex-button>
          <flex-button variant="action" icon="fa-print" label="Enviar a impresora" onclick="window.App.views.pos._doPrint('${res.data.escposBase64}')"></flex-button>
        </div>
      `);
    } catch (err) {
      window.App.toast('No se puede generar la impresión: ' + err.message, 'error');
    }
  },

  async _doPrint(base64) {
    // Send the ESC/POS buffer to the backend printer endpoint
    try {
      await Api.printTicketSend(window.store.currentTicket.Id, { escposBase64: base64 });
      window.App.toast('Trabajo de impresión enviado a impresora', 'success');
      window.App.closeModal();
    } catch (err) {
      window.App.toast('Impresión fallida: ' + err.message + '. Usando impresión del navegador.', 'warn');
      // Fallback: open a new window with the formatted text and call window.print()
      try {
        const printRes = await Api.printTicket(window.store.currentTicket.Id);
        const w = window.open('', '_blank', 'width=400,height=600');
        w.document.write(`<pre style="font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap;">${printRes.data.formatted}</pre>`);
        w.document.close();
        w.focus();
        w.print();
      } catch (fallbackErr) {
        window.App.toast('Impresión de respaldo también fallida: ' + fallbackErr.message, 'error');
      }
      window.App.closeModal();
    }
  },

  async pay() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    if (Number(window.store.currentTicket.RemainingAmount || 0) <= 0) {
      return window.App.toast('El ticket no tiene saldo pendiente', 'warn');
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
