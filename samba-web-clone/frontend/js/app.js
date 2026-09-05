// =====================================================================
// app.js — Application entry point + navigation controller
// =====================================================================
// Mirrors Samba.Presentation PRISM region manager: a single #app-main
// region holds all views; only one is .is-active at a time.
// Navigation between views is instant (no page reload, no flicker).
// =====================================================================

const App = {
  views: {},   // populated below

  async init() {
    // Initialize views
    LoginView.init();
    DashboardView.init();
    PosView.init();
    PaymentView.init();
    this.views = { login: LoginView, dashboard: DashboardView, pos: PosView, payment: PaymentView };

    // Clock
    this._startClock();

    // Initial navigation
    this.navigate('login');

    // Expose globally for inline onclick handlers
    window.App = this;
  },

  /**
   * Navigate to a view by name ('login', 'dashboard', 'pos', 'payment').
   * Hides all other views, shows the requested one with a fade transition.
   */
  navigate(viewName) {
    const views = document.querySelectorAll('.view');
    views.forEach(v => v.classList.remove('is-active'));
    const target = document.getElementById('view-' + viewName);
    if (target) {
      target.classList.add('is-active');
      window.store.setState({ currentView: viewName }, 'navigate');
      // Refresh data when entering certain views
      if (viewName === 'dashboard') DashboardView.refresh();
      if (viewName === 'pos') PosView.refresh();
    }
  },

  /**
   * Login handler — verifies PIN against the seeded admin user (PIN=1234).
   * In a real app this would hit POST /api/auth/login.
   */
  async login() {
    const { username, pin } = LoginView.getValues();
    if (!username || !pin) {
      LoginView.showError('Username and PIN are required');
      return;
    }
    // Mock: hardcoded check against the seed (admin/1234)
    // Real auth will come in Sprint 5 with JWT.
    if (pin === '1234' && username.toLowerCase() === 'administrator') {
      window.store.setState({ currentUser: { name: username } }, 'logged-in');
      LoginView.reset();
      document.getElementById('header-user').textContent = username;
      this.navigate('dashboard');
      this.toast('Welcome, ' + username, 'success');
    } else {
      LoginView.showError('Invalid credentials. Try administrator / 1234');
    }
  },

  logout() {
    window.store.setState({ currentUser: null, currentTicket: null }, 'logged-out');
    document.getElementById('header-user').textContent = '—';
    this.navigate('login');
    this.toast('Logged out', 'info');
  },

  /**
   * Show a modal dialog.
   * @param {string} title
   * @param {string} htmlBody
   */
  showModal(title, htmlBody) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = htmlBody;
    document.getElementById('modal-overlay').classList.add('is-open');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('is-open');
  },

  /**
   * Show a toast message.
   * @param {string} message
   * @param {'info'|'success'|'warn'|'error'} type
   * @param {number} duration — ms (default 3000)
   */
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms';
      setTimeout(() => toast.remove(), 200);
    }, duration);
    // Also log to footer status
    document.getElementById('footer-status').textContent = message;
  },

  _startClock() {
    const el = document.getElementById('header-clock');
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString();
    };
    tick();
    setInterval(tick, 1000);
  },
};

// Bootstrap on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => App.init());
