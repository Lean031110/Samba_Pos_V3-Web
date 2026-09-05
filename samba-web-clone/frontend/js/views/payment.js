// =====================================================================
// views/payment.js — PaymentEditorView
// =====================================================================
// Layout:
//   [ Header: ticket# + remaining amount ]
//   [ Left 60%: order list ]
//   [ Right 40%:
//       - Numeric keypad (4×3: 7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0 ✓)
//       - Summary: tendered, remaining, change, total
//       - Payment type buttons (Cash, Credit Card, Voucher, Customer Account)
//   ]
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

    this._tendered = 0;
    this._ticket = null;
    this._paymentTypes = [];

    this._buildNumpad();
  },

  async load(ticket) {
    this._ticket = ticket;
    this._tendered = 0;
    this.ticketNumberEl.textContent = '#' + (ticket.TicketNumber || ticket.Id);
    this._renderOrders();
    this._renderSummary();

    // Fetch payment types from backend (no hardcoded IDs)
    try {
      const res = await Api.getPaymentTypes();
      this._paymentTypes = (res.data || []).map(pt => ({
        Id: pt.Id,
        Name: pt.Name,
        ButtonColor: pt.ButtonColor || 'Gainsboro',
        Icon: this._iconForPaymentType(pt.Name),
      }));
    } catch (err) {
      window.App.toast('Cannot load payment types: ' + err.message, 'error');
      this._paymentTypes = [];
    }
    this._renderPaymentTypes();
  },

  _iconForPaymentType(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('cash'))      return 'fa-money-bill';
    if (n.includes('card') || n.includes('credit')) return 'fa-credit-card';
    if (n.includes('voucher'))   return 'fa-ticket';
    if (n.includes('account') || n.includes('customer')) return 'fa-user';
    return 'fa-money-bill-wave';
  },

  _renderOrders() {
    if (!this._ticket?.Orders?.length) {
      this.ordersEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--samba-fg-muted);">No orders</div>';
      return;
    }
    this.ordersEl.innerHTML = '';
    for (const o of this._ticket.Orders) {
      const item = document.createElement('div');
      item.className = 'ticket-item';
      if (!o.CalculatePrice) item.classList.add('is-gift');
      const total = (Number(o.Price || 0) * Number(o.Quantity || 0)).toFixed(2);
      item.innerHTML = `
        <span class="ticket-item__name">${this._escape(o.MenuItemName)}</span>
        <span class="ticket-item__qty">${Number(o.Quantity || 0)} ×</span>
        <span class="ticket-item__total">$${total}</span>
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
  },

  _buildNumpad() {
    const keys = [
      { l: '7', v: '7' }, { l: '8', v: '8' }, { l: '9', v: '9' },
      { l: '4', v: '4' }, { l: '5', v: '5' }, { l: '6', v: '6' },
      { l: '1', v: '1' }, { l: '2', v: '2' }, { l: '3', v: '3' },
      { l: '⌫', icon: 'fa-delete-left', cls: 'numpad__key--danger', action: 'back' },
      { l: '0', v: '0' },
      { l: '✓', icon: 'fa-check', cls: 'numpad__key--accent', action: 'exact' },
    ];
    this.numpadEl.innerHTML = '';
    for (const k of keys) {
      const btn = document.createElement('button');
      btn.className = 'numpad__key ' + (k.cls || '');
      btn.innerHTML = k.icon ? `<i class="fa-solid ${k.icon}"></i>` : this._escape(k.l);
      btn.addEventListener('click', () => {
        if (k.action === 'back') this._tendered = Math.floor(this._tendered / 10);
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
      const btn = document.createElement('flex-button');
      btn.setAttribute('label', pt.Name);
      btn.setAttribute('icon', pt.Icon);
      btn.setAttribute('size', 'xl');
      btn.style.minHeight = '70px';
      btn.addEventListener('click', () => this._processPayment(pt));
      this.typesEl.appendChild(btn);
    }
    // Add Close button (back to POS)
    const closeBtn = document.createElement('flex-button');
    closeBtn.setAttribute('label', 'Back');
    closeBtn.setAttribute('icon', 'fa-arrow-left');
    closeBtn.setAttribute('variant', 'danger');
    closeBtn.style.minHeight = '70px';
    closeBtn.addEventListener('click', () => window.App.navigate('pos'));
    this.typesEl.appendChild(closeBtn);
  },

  async _processPayment(paymentType) {
    // Prevent double-click: disable all payment buttons during processing
    if (this._processing) return;
    this._processing = true;
    this._setButtonsDisabled(true);

    const remaining = Number(this._ticket.RemainingAmount || 0);
    const amount = this._tendered > 0 ? Math.min(this._tendered, remaining) : remaining;
    if (amount <= 0) {
      window.App.toast('Nothing to pay', 'warn');
      this._processing = false;
      this._setButtonsDisabled(false);
      return;
    }
    try {
      const res = await Api.addPayment(this._ticket.Id, {
        paymentTypeId: paymentType.Id,
        amount,
        tenderedAmount: this._tendered > amount ? this._tendered : undefined,
      });
      window.store.setState({ currentTicket: res.data }, 'payment-processed');
      this._ticket = res.data;
      this._tendered = 0;
      this._renderSummary();
      const newRemaining = Number(res.data.RemainingAmount || 0);
      if (newRemaining <= 0) {
        window.App.toast('Payment complete! Closing ticket...', 'success');
        setTimeout(() => this._closeAndReturn(), 800);
      } else {
        window.App.toast(`Partial payment: $${amount.toFixed(2)} (remaining: $${newRemaining.toFixed(2)})`, 'info');
      }
    } catch (err) {
      window.App.toast('Payment failed: ' + err.message, 'error');
    } finally {
      this._processing = false;
      this._setButtonsDisabled(false);
    }
  },

  _setButtonsDisabled(disabled) {
    const buttons = this.typesEl.querySelectorAll('flex-button');
    buttons.forEach(btn => {
      if (disabled) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
    });
  },

  async _closeAndReturn() {
    try {
      const res = await Api.closeTicket(this._ticket.Id);
      window.store.setState({ currentTicket: null }, 'ticket-closed');
      window.App.toast('Ticket #' + res.data.TicketNumber + ' closed', 'success');
      window.App.navigate('dashboard');
    } catch (err) {
      window.App.toast('Cannot close ticket: ' + err.message, 'error');
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.PaymentView = PaymentView;
