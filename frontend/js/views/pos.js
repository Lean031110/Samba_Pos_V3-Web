// =====================================================================
// views/pos.js — PosView rediseñado (Odoo 19 Product Screen)
// =====================================================================
// Estructura (spec §8):
//   [ Order panel 40% ] | [ Categorías + Productos 60% ]
//   - order line: qty · nombre · precio + [−][+], nota, eliminar
//   - totals: subtotal / descuento / impuesto / total
//   - [PAGAR] grande
//   - productos: cards con nombre+precio (imagen si existe), 48-52px+
//   - categorías siempre visibles con scroll horizontal
// MISMA lógica de negocio: createTicket/addOrder/gift/void/note/tags/
// discount/print vía los mismos endpoints REST (solo cambia el render).
// =====================================================================

const PosView = {
  init() {
    this.ordersListEl = document.getElementById('pos-orders-list');
    this.categoriesEl = document.getElementById('pos-categories');
    this.productsGridEl = document.getElementById('pos-products-grid');
    this.pagingEl = document.getElementById('pos-products-paging');
    this.ticketNumberEl = document.getElementById('pos-ticket-number');
    this.tableEl = document.getElementById('pos-table');
    this.dateEl = document.getElementById('pos-date');
    this.grandTotalEl = document.getElementById('pos-grand-total');
    this.payAmountEl = document.getElementById('pos-pay-amount');
    this.payBtnEl = document.getElementById('pos-pay-btn');
    this.orderTitleEl = document.getElementById('pos-order-title');
    this.orderMetaEl = document.getElementById('pos-order-meta');
    this.subtotalEl = document.getElementById('pos-subtotal');
    this.discountEl = document.getElementById('pos-discount');
    this.taxEl = document.getElementById('pos-tax');

    this._currentPage = 1;
    this._selectedOrder = null;

    window.store.subscribe((state, prev, reason) => {
      if (state.currentTicket !== prev.currentTicket) this._renderTicket();
      if (state.products !== prev.products) this._renderProducts();
      if (state.selectedCategoryId !== prev.selectedCategoryId) this._renderProducts();
    });

    this._renderProducts();
    this._renderTicket();
  },

  async refresh() {
    try {
      const res = await Api.getProducts();
      window.store.setState({ products: res.data }, 'products-loaded');
    } catch (err) {
      window.App.toast('Error al cargar productos: ' + err.message, 'error');
    }
    try {
      const res = await Api.getTickets();
      window.store.setState({ openTickets: res.data }, 'open-tickets-loaded');
    } catch (err) {
      window.App.toast('Error al cargar tickets abiertos: ' + err.message, 'error');
    }
  },

  // ===================================================================
  // Ticket / order panel
  // ===================================================================

  _renderTicket() {
    const t = window.store.currentTicket;

    if (!t) {
      this.ticketNumberEl.textContent = '(nuevo)';
      this.tableEl.textContent = '(ninguna)';
      this.dateEl.textContent = '--';
      this.orderTitleEl.textContent = 'Pedido';
      this.orderMetaEl.textContent = 'Tocá una mesa o un producto para comenzar';
      this.ordersListEl.innerHTML = `
        <div style="padding: 28px 16px; text-align: center; color: var(--lba-fg-muted);">
          <i class="fa-solid fa-receipt" style="font-size: 30px; opacity: 0.35; display: block; margin-bottom: 8px;"></i>
          Sin ticket seleccionado.<br>Tocá una mesa o un producto.
        </div>`;
      this._renderTotals({ subtotal: 0, tax: 0, discount: 0, total: 0 });
      return;
    }

    this.ticketNumberEl.textContent = t.TicketNumber || ('#' + t.Id);
    this.tableEl.textContent = t.TicketEntities?.[0]?.EntityName || '(ninguna)';
    this.dateEl.textContent = new Date(t.Date).toLocaleDateString();
    this.orderTitleEl.textContent = 'Pedido ' + (t.TicketNumber || '#' + t.Id);
    this.orderMetaEl.textContent = (t.TicketEntities?.[0]?.EntityName ? 'Mesa ' + t.TicketEntities[0].EntityName + ' · ' : '') + new Date(t.Date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!t.Orders || t.Orders.length === 0) {
      this.ordersListEl.innerHTML = `
        <div style="padding: 28px 16px; text-align: center; color: var(--lba-fg-muted);">
          <i class="fa-solid fa-cart-plus" style="font-size: 30px; opacity: 0.35; display: block; margin-bottom: 8px;"></i>
          Sin pedidos aún. Tocá un producto para empezar.
        </div>`;
    } else {
      this.ordersListEl.innerHTML = '';
      for (const order of t.Orders) {
        this.ordersListEl.appendChild(this._renderOrderLine(order));
      }
    }

    this._renderTotals(this._computeTotals(t));
  },

  _renderOrderLine(order) {
    const item = document.createElement('div');
    item.className = 'orderline' + (order.CalculatePrice ? '' : ' is-gift');
    const qty = Number(order.Quantity || 0);
    const price = Number(order.Price || 0);
    const total = (price * qty).toFixed(2);

    item.innerHTML = `
      <div class="orderline__top">
        <span class="orderline__qty">${qty} ×</span>
        <span class="orderline__name">${this._escape(order.MenuItemName)}
          ${order.PortionName ? `<em class="orderline__portion">(${this._escape(order.PortionName)})</em>` : ''}
        </span>
        <span class="orderline__price">$${total}</span>
      </div>
      ${order.Notes ? `<div class="orderline__notes"><i class="fa-solid fa-note-sticky"></i> ${this._escape(order.Notes)}</div>` : ''}
      <div class="orderline__actions">
        <button class="orderline__act" data-act="dec" title="Restar uno"><i class="fa-solid fa-minus"></i></button>
        <button class="orderline__act" data-act="inc" title="Sumar uno"><i class="fa-solid fa-plus"></i></button>
        <button class="orderline__act orderline__act--danger" data-act="del" title="Eliminar línea"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    item.addEventListener('click', () => {
      this._selectedOrder = order;
      item.classList.add('is-selected');
      this.ordersListEl.querySelectorAll('.orderline').forEach(el => { if (el !== item) el.classList.remove('is-selected'); });
    });
    item.querySelector('[data-act="inc"]').addEventListener('click', (e) => { e.stopPropagation(); this._changeQty(order, 1); });
    item.querySelector('[data-act="dec"]').addEventListener('click', (e) => { e.stopPropagation(); this._changeQty(order, -1); });
    item.querySelector('[data-act="del"]').addEventListener('click', (e) => { e.stopPropagation(); this._changeQty(order, -qty); });
    return item;
  },

  async _changeQty(order, delta) {
    const ticket = window.store.currentTicket;
    if (!ticket) return;
    const newQty = Number(order.Quantity || 0) + delta;
    try {
      if (newQty <= 0) {
        // Eliminar línea: enviar cantidad 0 (el backend reduce/quita)
        await Api.addOrder(ticket.Id, { menuItemId: order.MenuItemId, quantity: 0, orderId: order.Id });
      } else {
        await Api.addOrder(ticket.Id, { menuItemId: order.MenuItemId, quantity: newQty, orderId: order.Id });
      }
      const full = await Api.getTicket(ticket.Id);
      window.store.setState({ currentTicket: full.data }, 'order-updated');
    } catch (err) {
      window.App.toast('No se puede modificar la línea: ' + err.message, 'error');
    }
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
    this.subtotalEl.textContent = '$' + subtotal.toFixed(2);
    this.taxEl.textContent = '$' + tax.toFixed(2);
    this.discountEl.textContent = discount > 0 ? '-$' + discount.toFixed(2) : '$0.00';
    this.grandTotalEl.textContent = '$' + total.toFixed(2);
    if (this.payAmountEl) this.payAmountEl.textContent = '$' + total.toFixed(2);
    if (this.payBtnEl) this.payBtnEl.disabled = total <= 0;
  },

  // ===================================================================
  // Productos + categorías
  // ===================================================================

  _renderProducts() {
    const products = window.store.products;
    if (!products || products.length === 0) {
      this.categoriesEl.innerHTML = '';
      this.productsGridEl.innerHTML = '<div style="grid-column: 1/-1; padding: 30px; text-align: center; color: var(--lba-fg-muted);">Sin productos cargados.</div>';
      return;
    }

    // Categorías (scroll horizontal, siempre visibles — spec §10)
    const categories = ['Todo', ...window.store.getCategories()];
    const selected = window.store.state.selectedCategoryId || 'Todo';
    this.categoriesEl.innerHTML = '';
    for (const cat of categories) {
      const tab = document.createElement('button');
      tab.className = 'category-tab' + (cat === selected ? ' is-active' : '');
      tab.textContent = cat;
      tab.addEventListener('click', () => {
        window.store.setState({ selectedCategoryId: cat }, 'category-selected');
        this._currentPage = 1;
      });
      this.categoriesEl.appendChild(tab);
    }

    // Grid de productos
    const items = selected === 'Todo' ? products : products.filter(p => p.GroupCode === selected);
    const pageSize = 18;
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (this._currentPage > totalPages) this._currentPage = totalPages;
    const start = (this._currentPage - 1) * pageSize;
    const page = items.slice(start, start + pageSize);

    this.productsGridEl.innerHTML = '';
    for (const item of page) {
      this.productsGridEl.appendChild(this._renderProductCard(item));
    }

    // Paging
    this.pagingEl.innerHTML = '';
    if (totalPages > 1) {
      const prev = document.createElement('button');
      prev.className = 'page-btn'; prev.textContent = '◀';
      prev.addEventListener('click', () => { if (this._currentPage > 1) { this._currentPage--; this._renderProducts(); } });
      const label = document.createElement('span');
      label.className = 'page-label';
      label.textContent = `Página ${this._currentPage} / ${totalPages}`;
      const next = document.createElement('button');
      next.className = 'page-btn'; next.textContent = '▶';
      next.addEventListener('click', () => { if (this._currentPage < totalPages) { this._currentPage++; this._renderProducts(); } });
      this.pagingEl.append(prev, label, next);
    }
  },

  _renderProductCard(item) {
    const portion = item.Portions?.[0];
    const price = Number(portion?.Prices?.[0]?.Price || item.Price || 0);
    const out = item.IsAvailable === 0 || item.IsAvailable === false;

    const card = document.createElement('button');
    card.className = 'product-card' + (out ? ' is-out' : '');
    card.disabled = !!out;
    const img = item.ImageUrl || item.Image
      ? `<div class="product-card__img" style="background-image: url('${this._escapeAttr(item.ImageUrl || item.Image)}')"></div>`
      : '<div class="product-card__img"></div>';
    card.innerHTML = `
      ${img}
      <div class="product-card__body">
        <span class="product-card__name">${this._escape(item.Name)}</span>
        <span class="product-card__price">$${price.toFixed(2)}</span>
      </div>
    `;
    card.addEventListener('click', () => this._addProduct(item));
    return card;
  },

  async _addProduct(menuItem) {
    if (!window.store.currentTicket) {
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
  // Acciones de barra de comandos (misma lógica, presentaci\u00f3n Odoo)
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
    const orderCheckboxes = ticket.Orders.map(o => {
      const total = (Number(o.Price || 0) * Number(o.Quantity || 0)).toFixed(2);
      const checked = o.CalculatePrice ? '' : 'checked';
      const label = `${this._escape(o.MenuItemName)} ×${Number(o.Quantity || 0)} ($${total})`;
      return `<label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
        <input type="checkbox" class="gift-order-cb" data-order-id="${o.Id}" ${checked} style="width: 18px; height: 18px;">
        <span>${label}</span>
      </label>`;
    }).join('');
    window.App.showModal('Regalar pedidos', `
      <p style="margin-bottom: 8px; color: var(--lba-fg-muted);">Marc\u00e1 los pedidos a convertir en Regalo (excluidos del total):</p>
      <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--lba-border-light); border-radius: var(--lba-radius-sm); padding: 6px;">
        ${orderCheckboxes}
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <button class="btn-odoo btn-odoo--secondary" onclick="window.App.closeModal()">Cancelar</button>
        <button class="btn-odoo" onclick="window.App.views.pos._applyGift()"><i class="fa-solid fa-gift"></i> Aplicar regalo</button>
      </div>
    `);
  },

  async _applyGift() {
    const cbs = document.querySelectorAll('.gift-order-cb:checked');
    const orderIds = Array.from(cbs).map(cb => parseInt(cb.dataset.orderId, 10));
    if (orderIds.length === 0) return window.App.toast('Sin pedidos seleccionados', 'warn');
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
      <p style="margin-bottom: 12px;">¿Seguro que quer\u00e9s anular el ticket #${ticket.TicketNumber || ticket.Id}?</p>
      <p style="color: var(--lba-fg-error); margin-bottom: 14px;">
        <i class="fa-solid fa-triangle-exclamation"></i> Se revertir\u00e1n los pagos y el ticket quedar\u00e1 anulado. Acci\u00f3n irreversible.
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn-odoo btn-odoo--secondary" onclick="window.App.closeModal()">Cancelar</button>
        <button class="btn-odoo btn-odoo--danger" onclick="window.App.views.pos._confirmVoid()"><i class="fa-solid fa-ban"></i> Anular ticket</button>
      </div>
    `);
  },

  async _confirmVoid() {
    try {
      const res = await Api.voidTicket(window.store.currentTicket.Id);
      window.store.setState({ currentTicket: null }, 'void-confirmed');
      window.App.closeModal();
      window.App.toast('Ticket anulado', 'success');
      window.App.navigate('tables');
    } catch (err) {
      window.App.toast('No se puede anular: ' + err.message, 'error');
    }
  },

  note() {
    if (!window.store.currentTicket) return window.App.toast('Sin ticket seleccionado', 'warn');
    window.App.showModal('Nota del ticket', `
      <textarea id="note-input" rows="4" style="width: 100%; padding: 10px; border: 1px solid var(--lba-border-default); border-radius: var(--lba-radius-sm); font-family: inherit; box-sizing: border-box;">${this._escape(window.store.currentTicket.Note || '')}</textarea>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <button class="btn-odoo btn-odoo--secondary" onclick="window.App.closeModal()">Cancelar</button>
        <button class="btn-odoo" onclick="window.App.views.pos._saveNote()"><i class="fa-solid fa-check"></i> Guardar</button>
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
      catch (e) { return []; }
    })();
    const existingHtml = existing.map(t => `<input type="text" class="tag-name" value="${this._escape(t.TagName || t.name || '')}" placeholder="Nombre" style="width: 45%; padding: 8px; margin: 2px; border: 1px solid var(--lba-border-default); border-radius: 4px;">
      <input type="text" class="tag-value" value="${this._escape(t.TagValue || t.value || '')}" placeholder="Valor" style="width: 45%; padding: 8px; margin: 2px; border: 1px solid var(--lba-border-default); border-radius: 4px;">`).join('');
    window.App.showModal('Etiquetas del ticket', `
      <div id="tags-container" style="max-height: 250px; overflow-y: auto;">${existingHtml}</div>
      <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: space-between;">
        <button class="btn-odoo btn-odoo--secondary" onclick="window.App.views.pos._addTagRow()"><i class="fa-solid fa-plus"></i> Agregar</button>
        <div style="display: flex; gap: 8px;">
          <button class="btn-odoo btn-odoo--secondary" onclick="window.App.closeModal()">Cancelar</button>
          <button class="btn-odoo" onclick="window.App.views.pos._saveTags()"><i class="fa-solid fa-check"></i> Guardar</button>
        </div>
      </div>
    `);
  },

  _addTagRow() {
    const container = document.getElementById('tags-container');
    const row = document.createElement('div');
    row.innerHTML = `<input type="text" class="tag-name" placeholder="Nombre" style="width: 45%; padding: 8px; margin: 2px; border: 1px solid var(--lba-border-default); border-radius: 4px;">
      <input type="text" class="tag-value" placeholder="Valor" style="width: 45%; padding: 8px; margin: 2px; border: 1px solid var(--lba-border-default); border-radius: 4px;">`;
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
    let calcTypes = window.store.state.calculationTypes;
    if (!calcTypes || calcTypes.length === 0) {
      try {
        const res = await Api.getCalculationTypes();
        calcTypes = res.data;
        window.store.setState({ calculationTypes: calcTypes }, 'calc-types-loaded');
      } catch (err) {
        return window.App.toast('No se pueden cargar los tipos de c\u00e1lculo: ' + err.message, 'error');
      }
    }
    const discountTypes = (calcTypes || []).filter(c => c.DecreaseAmount);
    if (discountTypes.length === 0) {
      return window.App.toast('No hay tipos de descuento configurados', 'warn');
    }
    const optionsHtml = discountTypes.map(c => {
      const methodLabel = c.CalculationMethod === 0 ? '%' : c.CalculationMethod === 2 ? 'fijo' : 'redondeo';
      return `<label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer;">
        <input type="radio" name="calc-type" value="${c.Id}" ${c.Id === discountTypes[0].Id ? 'checked' : ''} style="width: 18px; height: 18px;">
        <span>${this._escape(c.Name)} (${methodLabel})</span>
      </label>`;
    }).join('');
    window.App.showModal('Aplicar descuento', `
      <div style="margin-bottom: 12px;">
        <p style="margin: 0 0 6px; color: var(--lba-fg-muted); font-weight: 700;">Tipo de descuento</p>
        ${optionsHtml}
      </div>
      <div style="margin-bottom: 12px;">
        <p style="margin: 0 0 6px; color: var(--lba-fg-muted); font-weight: 700;">Importe</p>
        <input type="number" id="discount-amount" value="10" min="0" step="0.01"
               style="width: 100%; padding: 10px; font-size: 18px; border: 1px solid var(--lba-border-default); border-radius: var(--lba-radius-sm); box-sizing: border-box;">
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn-odoo btn-odoo--secondary" onclick="window.App.closeModal()">Cancelar</button>
        <button class="btn-odoo" onclick="window.App.views.pos._applyDiscount()"><i class="fa-solid fa-percent"></i> Aplicar</button>
      </div>
    `);
  },

  async _applyDiscount() {
    const selectedType = document.querySelector('input[name="calc-type"]:checked');
    const amountInput = document.getElementById('discount-amount');
    if (!selectedType) return window.App.toast('Seleccion\u00e1 un tipo de descuento', 'warn');
    const calculationTypeId = parseInt(selectedType.value, 10);
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount < 0) return window.App.toast('Importe inv\u00e1lido', 'error');
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
      window.App.showModal('Vista previa — Ticket #' + (window.store.currentTicket.TicketNumber || window.store.currentTicket.Id), `
        <div class="print-preview" style="background: #fafafa; border: 1px solid var(--lba-border-light); border-radius: var(--lba-radius-sm); padding: 12px; font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 300px; overflow: auto;">${this._escape(res.data.formatted)}</div>
        <div style="margin-top: 12px; font-size: 12px; color: var(--lba-fg-muted);">
          Bytes ESC/POS: ${res.data.escposBytesCount}
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
          <button class="btn-odoo btn-odoo--secondary" onclick="window.App.closeModal()">Cerrar</button>
          <button class="btn-odoo" onclick="window.App.views.pos._doPrint('${res.data.escposBase64}')"><i class="fa-solid fa-print"></i> Enviar a impresora</button>
        </div>
      `);
    } catch (err) {
      window.App.toast('No se puede generar la impresi\u00f3n: ' + err.message, 'error');
    }
  },

  async _doPrint(base64) {
    try {
      await Api.printTicketSend(window.store.currentTicket.Id, { escposBase64: base64 });
      window.App.toast('Trabajo de impresión enviado', 'success');
      window.App.closeModal();
    } catch (err) {
      window.App.toast('Impresión fallida: ' + err.message + '. Usando impresión del navegador.', 'warn');
      try {
        const printRes = await Api.printTicket(window.store.currentTicket.Id);
        const w = window.open('', '_blank', 'width=400,height=600');
        w.document.write(`<pre style="font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap;">${printRes.data.formatted}</pre>`);
        w.document.close();
        w.focus();
        w.print();
      } catch (fallbackErr) {
        window.App.toast('Impresión de respaldo también falló: ' + fallbackErr.message, 'error');
      }
      window.App.closeModal();
    }
  },

  pay() {
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

  _escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
};

window.PosView = PosView;
