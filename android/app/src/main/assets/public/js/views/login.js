// =====================================================================
// views/login.js — LoginView (estilo employee login de Odoo 19)
// =====================================================================
// Usuario + PIN + keypad numérico. En DEMO_MODE muestra chips de
// usuarios demo (Administrador/Mesero/Cocinero/Cajero) para probar
// el flujo por rol de la demo pública.
// =====================================================================

const LoginView = {
  DEMO_USERS: [
    { name: 'Administrador', role: 'Administrador' },
    { name: 'Mesero', role: 'Mesero' },
    { name: 'Cocinero', role: 'Cocinero' },
    { name: 'Cajero', role: 'Cajero' },
  ],

  init() {
    this.usernameEl = document.getElementById('login-username');
    this.pinEl = document.getElementById('login-pin');
    this.keypadEl = document.getElementById('login-keypad');
    this.errorEl = document.getElementById('login-error');
    this.usersEl = document.getElementById('login-demo-users');
    this._buildKeypad();
    this._buildDemoUsers();

    this.pinEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.App.login();
    });
  },

  _buildKeypad() {
    const keys = [
      { label: '1' }, { label: '2' }, { label: '3' },
      { label: '4' }, { label: '5' }, { label: '6' },
      { label: '7' }, { label: '8' }, { label: '9' },
      { label: '⌫', icon: 'fa-delete-left', class: 'numpad__key--danger', action: () => this._backspace() },
      { label: '0' },
      { label: '✓', icon: 'fa-check', class: 'numpad__key--login', action: () => window.App.login() },
    ];
    this.keypadEl.innerHTML = '';
    for (const k of keys) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'numpad__key ' + (k.class || '');
      btn.innerHTML = k.icon
        ? `<i class="fa-solid ${k.icon}"></i>`
        : this._escape(k.label);
      btn.addEventListener('click', () => {
        if (k.action) k.action();
        else this._appendPin(k.label);
      });
      this.keypadEl.appendChild(btn);
    }
  },

  _buildDemoUsers() {
    if (!this.usersEl) return;
    this.usersEl.innerHTML = '';
    const chips = window.DEMO_MODE ? this.DEMO_USERS : [];
    for (const u of chips) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'login-user-chip';
      chip.innerHTML = `<i class="fa-solid fa-user"></i> ${this._escape(u.name)}`;
      chip.addEventListener('click', () => {
        this.usernameEl.value = u.name;
        this.pinEl.value = '1234';
        this.errorEl.textContent = '';
      });
      this.usersEl.appendChild(chip);
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  _appendPin(digit) {
    this.pinEl.value += digit;
    this.errorEl.textContent = '';
  },

  _backspace() {
    this.pinEl.value = this.pinEl.value.slice(0, -1);
  },

  getValues() {
    return {
      username: this.usernameEl.value.trim(),
      pin: this.pinEl.value,
    };
  },

  showError(msg) {
    this.errorEl.textContent = msg;
  },

  reset() {
    this.pinEl.value = '';
    this.errorEl.textContent = '';
    this.usernameEl.focus();
  },
};

window.LoginView = LoginView;
