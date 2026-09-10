// =====================================================================
// views/payment.js — PaymentView rediseñado (Odoo 19 Payment Screen)
// =====================================================================
// Spec §13: TOTAL grande, métodos de pago (botones grandes), ENTREGADO,
// CAMBIO, numpad táctil, CONFIRMAR PAGO.
// MISMA lógica de pagos: addPayment(ticketId, {paymentTypeId, amount,
// tenderedAmount}) → closeTicket. Sin cambios de negocio.
// =====================================================================

const PaymentView = {
  init() {
    this.ordersEl = document.getElementById('payment-orders');
    this.numpadEl = document.getElementById('payment-numpad');
    this.typesEl = document.getElementById('payment-types');
    this.tenderedEl = document.getElementById('payment-tendered');
    this.remainingEl = document.getElementById('payment-remaining');
    this.remaining2El = document.getElementById('payment-remaining-2');
    this.changeEl = document.getElementById('payment-change');
    this.totalEl = document.getElementById('payment-total');
    this.ticketNumberEl = document.getElementById('payment-ticket-number');
    this.confirmBtnEl = document.getElementById('payment-confirm-btn');

    this._tendered = 0;
    this._ticket = null;
    this._paymentTypes = [];
    this._selectedType = null;
    this._processing = false;

    this._buildNumpad();
  },

  async load(ticket) {
    this._ticket = ticket;
    this._tendered = 0;
    this._selectedType = null;
    this.ticketNumberEl.textContent = '#' + (ticket.TicketNumber || ticket.Id);
    this._renderOrders();
    this._renderSummary();

    // Métodos de pago desde el backend (Cash / Credit Card / Voucher…)
    try {
      const res = await Api.getPaymentTypes();
      this._paymentTypes = (res.data || []).map(pt => ({
        Id: pt.Id,
        Name: pt.Name,
        Icon: this._iconForPaymentType(pt.Name),
      }));
    } catch (err) {
      window.App.toast('No se pueden cargar los métodos de pago: ' + err.message, 'error');
      this._paymentTypes = [];
    }
    this._renderPaymentTypes();
  },

  _iconForPaymentType(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('cash') || n.includes('cup') || n.includes('efectivo')) return 'fa-money-bill';
    if (n.includes('card') || n.includes('credit') || n.includes('usd') || n.includes('mlc')) return 'fa-credit-card';
    if (n.includes('transfer')) return 'fa-mobile-screen';
    if (n.includes('voucher')) return 'fa-ticket';
    if (n.includes('account') || n.includes('customer')) return 'fa-user';
    return 'fa-money-bill-wave';
  },

  _renderOrders() {
    if (!this._ticket?.Orders?.length) {
      this.ordersEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--lba-fg-muted);">Sin pedidos</div>';
      return;
    }
    this.ordersEl.innerHTML = '';
    for (const o of this._ticket.Orders) {
      const item = document.createElement('div');
      item.className = 'payline' + (o.CalculatePrice ? '' : ' is-gift');
      const total = (Number(o.Price || 0) * Number(o.Quantity || 0)).toFixed(2);
      item.innerHTML = `
        <span class="payline__qty">${Number(o.Quantity || 0)} ×</span>
        <span class="payline__name">${this._escape(o.MenuItemName)}</span>
        <span class="payline__price">$${total}</span>
      `;
      this.ordersEl.appendChild(item);
    }
  },

  _renderSummary() {
    const remaining = Number(this._ticket?.RemainingAmount || 0);
    const total = Number(this._ticket?.TotalAmount || 0);
    const change = Math.max(0, this._tendered - remaining);
    this.tenderedEl.textContent = '$' + this._tendered.toFixed(2);
    this.remainingEl.textContent = '$' + remaining.toFixed(2);
    this.remaining2El.textContent = '$' + remaining.toFixed(2);
    this.changeEl.textContent = '$' + change.toFixed(2);
    this.totalEl.textContent = '$' + total.toFixed(2);
    if (this.confirmBtnEl) {
      this.confirmBtnEl.disabled = this._processing || this._tendered <= 0 || !this._selectedType;
    }
  },

  _buildNumpad() {
    const keys = [
      { l: '7', v: '7' }, { l: '8', v: '8' }, { l: '9', v: '9' },
      { l: '4', v: '4' }, { l: '5', v: '5' }, { l: '6', v: '6' },
      { l: '1', v: '1' }, { l: '2', v: '2' }, { l: '3', v: '3' },
      { l: 'C', cls: 'np-key--clear', action: 'clear' },
      { l: '0', v: '0' },
      { l: '00', cls: 'np-key--fn', action: 'zeros' },
      { l: '⌫', cls: 'np-key--fn', action: 'back' },
      { l: 'EXACTO', cls: 'np-key--exact', action: 'exact', wide: true },
    ];
    this.numpadEl.innerHTML = '';
    for (const k of keys) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'np-key ' + (k.cls || '');
      if (k.wide) btn.style.gridColumn = 'span 2';
      btn.textContent = k.l;
      btn.addEventListener('click', () => {
        if (this._processing) return;
        if (k.action === 'back') this._tendered = Math.floor(this._tendered / 10);
        else if (k.action === 'clear') this._tendered = 0;
        else if (k.action === 'zeros') this._tendered = this._tendered * 100;
        else if (k.action === 'exact') this._tendered = Number(this._ticket?.RemainingAmount || 0);
        else this._tendered = this._tendered * 10 + parseInt(k.v, 10);
        this._renderSummary();
      });
      this.numpadEl.appendChild(btn);
    }
  },

  _renderPaymentTypes() {
    this.typesEl.innerHTML = '';
    for (const pt of this._paymentTypes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-btn' + (this._selectedType?.Id === pt.Id ? ' is-selected' : '');
      btn.innerHTML = `<i class="fa-solid ${pt.Icon}"></i> ${this._escape(pt.Name)}`;
      btn.addEventListener('click', () => {
        this._selectedType = pt;
        this._renderPaymentTypes();
        this._renderSummary();
      });
      this.typesEl.appendChild(btn);
    }
    if (this._paymentTypes.length === 0) {
      this.typesEl.innerHTML = '<div style="grid-column: 1/-1; color: var(--lba-fg-muted); font-size: 13px; padding: 6px 2px;">Sin métodos de pago configurados.</div>';
    }
  },

  /** CONFIRMAR PAGO — valida método + importe y procesa (misma lógica) */
  async confirm() {
    if (!this._selectedType) return window.App.toast('Seleccion\u00e1 un método de pago', 'warn');
    await this._processPayment(this._selectedType);
  },

  async _processPayment(paymentType) {
    if (this._processing) return;
    const remaining = Number(this._ticket.RemainingAmount || 0);
    const amount = this._tendered > 0 ? Math.min(this._tendered, remaining) : remaining;
    if (amount <= 0) {
      window.App.toast('Nada que cobrar', 'warn');
      return;
    }

    this._processing = true;
    this._renderSummary();
    this._setButtonsDisabled(true);

    try {
      const res = await Api.addPayment(this._ticket.Id, {
        paymentTypeId: paymentType.Id,
        amount,
        tenderedAmount: this._tendered > amount ? this._tendered : undefined,
      });
      window.store.setState({ currentTicket: res.data }, 'payment-processed');
      this._ticket = res.data;
      this._tendered = 0;
      this._renderOrders();
      this._renderSummary();
      const newRemaining = Number(res.data.RemainingAmount || 0);
      if (newRemaining <= 0) {
        window.App.toast('¡Pago completo! Cerrando ticket…', 'success');
        setTimeout(() => this._closeAndReturn(), 700);
      } else {
        window.App.toast(`Pago parcial: $${amount.toFixed(2)} (restante: $${newRemaining.toFixed(2)})`, 'info');
      }
    } catch (err) {
      window.App.toast('Pago fallido: ' + err.message, 'error');
    } finally {
      this._processing = false;
      this._renderSummary();
      this._setButtonsDisabled(false);
    }
  },

  _setButtonsDisabled(disabled) {
    this.typesEl.querySelectorAll('.pm-btn').forEach(btn => { btn.disabled = disabled; });
    if (this.confirmBtnEl) this.confirmBtnEl.disabled = disabled;
  },

  async _closeAndReturn() {
    try {
      const res = await Api.closeTicket(this._ticket.Id);
      window.store.setState({ currentTicket: null }, 'ticket-closed');
      window.App.toast('Ticket #' + (res.data.TicketNumber || '') + ' cerrado', 'success');
      const user = window.store.state.currentUser;
      window.App.navigate(user && user.isAdmin ? 'tables' : 'tables');
    } catch (err) {
      window.App.toast('No se puede cerrar el ticket: ' + err.message, 'error');
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.PaymentView = PaymentView;
