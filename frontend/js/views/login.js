// =====================================================================
// views/login.js — LoginView v2 (split-screen + user selector + role landing)
// =====================================================================
// BLOQUE 2 — UI System v2
//
// Features:
//   - Split screen: branding (left) | form (right)
//   - User selector dropdown (fetches enabled users from backend)
//   - PIN keypad (touch-first)
//   - Enter key submits
//   - Error display (discrete, no user existence leak)
//   - Role-based landing after login
// =====================================================================

const LoginView = {
  usernameEl: null,
  pinEl: null,
  keypadEl: null,
  errorEl: null,
  userSelectorDisplay: null,
  userSelectorList: null,
  userSelectorName: null,
  _users: [],
  _selectedUser: 'Administrator',
  _userListOpen: false,

  init() {
    this.pinEl = document.getElementById('login-pin');
    this.keypadEl = document.getElementById('login-keypad');
    this.errorEl = document.getElementById('login-error');
    this.userSelectorDisplay = document.getElementById('login-userselector-display');
    this.userSelectorName = document.getElementById('login-userselector-name');
    this.userSelectorList = document.getElementById('login-userselector-list');

    this._buildKeypad();

    // Enter key submits
    if (this.pinEl) {
      this.pinEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.App.login();
      });
    }

    // Close user list when clicking outside
    document.addEventListener('click', (e) => {
      if (this._userListOpen && !e.target.closest('#login-userselector')) {
        this._closeUserList();
      }
    });

    // Fetch enabled users for the selector
    this._loadUsers();
  },

  /**
   * Fetch enabled users from the backend for the selector.
   * Falls back to 'Administrator' if the endpoint is not available (demo mode).
   */
  async _loadUsers() {
    try {
      if (window.DEMO_MODE && window.DEMO_DATA) {
        this._users = [{ Name: 'Administrator', Id: 1 }];
      } else {
        const res = await Api.request('GET', '/admin/users');
        if (res && res.data) {
          this._users = res.data.filter(u => u.Name).map(u => ({ Name: u.Name, Id: u.Id }));
        }
      }
    } catch {
      this._users = [{ Name: 'Administrator', Id: 1 }];
    }
    this._renderUserList();
  },

  _renderUserList() {
    if (!this.userSelectorList) return;
    this.userSelectorList.innerHTML = '';
    for (const user of this._users) {
      const btn = document.createElement('button');
      btn.className = 'ds-login-userselector__item';
      if (user.Name === this._selectedUser) {
        btn.classList.add('ds-login-userselector__item--selected');
      }
      btn.innerHTML = `<i class="fa-solid fa-user"></i> ${this._escape(user.Name)}`;
      btn.addEventListener('click', () => {
        this._selectUser(user.Name);
      });
      this.userSelectorList.appendChild(btn);
    }
  },

  _selectUser(name) {
    this._selectedUser = name;
    if (this.userSelectorName) this.userSelectorName.textContent = name;
    this._closeUserList();
    this._renderUserList();
    if (this.pinEl) {
      this.pinEl.value = '';
      this.pinEl.focus();
    }
    if (this.errorEl) this.errorEl.textContent = '';
  },

  toggleUserList() {
    if (this._userListOpen) {
      this._closeUserList();
    } else {
      this._openUserList();
    }
  },

  _openUserList() {
    if (!this.userSelectorList) return;
    this.userSelectorList.classList.remove('ds-hidden');
    this._userListOpen = true;
  },

  _closeUserList() {
    if (!this.userSelectorList) return;
    this.userSelectorList.classList.add('ds-hidden');
    this._userListOpen = false;
  },

  _buildKeypad() {
    if (!this.keypadEl) return;
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
      { icon: 'fa-delete-left', action: () => this._backspace() },
      { label: '0', action: () => this._appendPin('0') },
      { icon: 'fa-check', action: () => window.App.login(), style: 'color: var(--ds-success);' },
    ];
    this.keypadEl.innerHTML = '';
    for (const k of keys) {
      const btn = document.createElement('button');
      if (k.style) btn.style.cssText = k.style;
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
    if (this.pinEl) this.pinEl.value += digit;
    if (this.errorEl) this.errorEl.textContent = '';
  },

  _backspace() {
    if (this.pinEl) this.pinEl.value = this.pinEl.value.slice(0, -1);
  },

  getValues() {
    return {
      username: this._selectedUser || 'Administrator',
      pin: this.pinEl ? this.pinEl.value : '',
    };
  },

  showError(msg) {
    // Discrete message — don't reveal if user exists
    if (this.errorEl) this.errorEl.textContent = msg || 'Credenciales no válidas';
  },

  reset() {
    if (this.pinEl) this.pinEl.value = '';
    if (this.errorEl) this.errorEl.textContent = '';
    if (this.pinEl) this.pinEl.focus();
  },
};

window.LoginView = LoginView;
