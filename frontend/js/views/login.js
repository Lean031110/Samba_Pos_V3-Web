// =====================================================================
// views/login.js — LoginView with numeric PIN pad
// =====================================================================
// Layout:
//   [ Username textbox ]
//   [ Password masked ]
//   [ 4x3 numeric keypad: 1 2 3 / 4 5 6 / 7 8 9 / ⌫ 0 ✓ ]
//   [ Login button (green gradient) ]
// =====================================================================

const LoginView = {
  init() {
    this.usernameEl = document.getElementById('login-username');
    this.pinEl = document.getElementById('login-pin');
    this.keypadEl = document.getElementById('login-keypad');
    this.errorEl = document.getElementById('login-error');
    this._buildKeypad();

    // Allow Enter key to submit
    this.pinEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.App.login();
    });
  },

  _buildKeypad() {
    const keys = [
      { label: '1', action: () => this._appendPin('1') },
      { label: '2', action: () => this._appendPin('2') },
      { label: '3', action: () => this._appendPin('3') },
      { label: '4', action: () => this._appendPin('4') },
      { label: '5', action: () => this._appendPin('5') },
      { label: '6', action: () => this._appendPin('6') },
      { label: '7', action: () => this._appendPin('7') },
      { label: '8', action: () => this._appendPin('8') },
      { label: '9', action: () => this._appendPin('9') },
      { label: '⌫', icon: 'fa-delete-left', class: 'numpad__key--danger', action: () => this._backspace() },
      { label: '0', action: () => this._appendPin('0') },
      { label: '✓', icon: 'fa-check', class: 'numpad__key--login', action: () => window.App.login() },
    ];
    this.keypadEl.innerHTML = '';
    for (const k of keys) {
      const btn = document.createElement('button');
      btn.className = 'numpad__key ' + (k.class || '');
      btn.innerHTML = k.icon
        ? `<i class="fa-solid ${k.icon}"></i>`
        : this._escape(k.label);
      btn.addEventListener('click', k.action);
      this.keypadEl.appendChild(btn);
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
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
