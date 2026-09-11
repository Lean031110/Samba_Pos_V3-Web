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
    // BLOQUE Android — Initialize server config (for Android POS tablets)
    // Skip entirely if DEMO_MODE (GitHub Pages demo — no server needed)
    if (window.ServerConfig && !window.DEMO_MODE) {
      ServerConfig.init();
      if (!ServerConfig.isConfigured()) {
        console.log('[app] Server not configured — showing config screen');
        return;
      }
    }

    // Initialize views
    LoginView.init();
    DashboardView.init();
    PosView.init();
    PaymentView.init();
    KitchenView.init();
    AdminView.init();
    this.views = { login: LoginView, dashboard: DashboardView, pos: PosView, payment: PaymentView, kitchen: KitchenView, admin: AdminView };

    // Clock
    this._startClock();

    // Initial navigation — role-based landing (not hardcoded)
    const deviceMode = window.ServerConfig ? ServerConfig.getMode() : 'pos';
    if (deviceMode === 'kitchen') {
      this.navigate('kitchen');
    } else {
      // Role-based landing: determine the best view for this user
      const user = window.store.state.currentUser;
      const landingView = this._resolveLandingView(user);
      this.navigate(landingView);
    }

    // Initialize push notifications (after login will subscribe properly)
    if (window.PushClient) {
      PushClient.init();
    }

    // BLOQUE 2 — Update footer with station/server info
    this._updateFooter();

    // BLOQUE I — Listen for offline sync auth-expired events
    // When JWT expires during offline sync, show a toast + redirect to login
    window.addEventListener('offline:auth-expired', (e) => {
      const msg = e.detail?.message || 'Tu sesión ha expirado durante la sincronización.';
      this.toast(msg, 'error');
      // Navigate to login (the sync is paused — user must re-login to resume)
      Api.setToken(null);
      this.navigate('login');
    });

    // BLOQUE I — Resume offline sync after successful login
    // When the user logs in again, resume the paused sync
    window.addEventListener('store:state', (e) => {
      const state = e.detail?.state;
      if (state?.currentUser && window.OfflineQueue && OfflineQueue._syncPaused) {
        OfflineQueue.resumeSync();
      }
    });

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
      if (viewName === 'kitchen') {
        KitchenView.containerEl = document.getElementById('kds-container');
        KitchenView.load();
      }
      if (viewName === 'admin') {
        AdminView.load();
      }
      if (viewName !== 'kitchen' && KitchenView._timerInterval) {
        KitchenView.unload();
      }
    }
  },

  /**
   * BLOQUE 2 — Update footer with station/server/mode info.
   * Shows: version, station name, server URL, connection status, device mode.
   */
  _updateFooter() {
    const stationEl = document.getElementById('footer-station');
    const serverEl = document.getElementById('footer-server');
    const modeEl = document.getElementById('footer-mode');

    // Station name (from ServerConfig or default)
    const mode = window.ServerConfig ? ServerConfig.getMode() : 'pos';
    const serverUrl = window.ServerConfig && ServerConfig.isConfigured()
      ? ServerConfig.getServerUrl()
      : (window.location.origin || 'localhost:3001');

    if (stationEl) stationEl.textContent = mode === 'kitchen' ? 'KDS' : 'POS';
    if (serverEl) serverEl.textContent = serverUrl.replace(/^https?:\/\//, '');
    if (modeEl) modeEl.innerHTML = 'Modo: <strong>' + (mode === 'kitchen' ? 'Cocina' : 'POS') + '</strong>';
  },

  /**
   * BLOQUE 2 — Resolve the landing view based on user role/permissions.
   * Not hardcoded — uses a configurable policy:
   *   - Admin → dashboard (can see everything)
   *   - Kitchen role → kitchen (KDS)
   *   - POS/Cashier role → pos
   *   - Default → login (no user, or unknown role)
   *
   * Future: this can be replaced by a RoleDefaultView config from the backend.
   */
  _resolveLandingView(user) {
    if (!user) return 'login';
    if (user.isAdmin) return 'dashboard';
    // Check role-based permissions for landing
    // This is a hint, not the final authority — the backend still protects
    if (user.roleName) {
      const role = user.roleName.toLowerCase();
      if (role.includes('cocina') || role.includes('kitchen') || role.includes('chef')) return 'kitchen';
      if (role.includes('caja') || role.includes('cashier')) return 'admin'; // cash tab
      if (role.includes('inventario') || role.includes('inventory')) return 'admin'; // inventory tab
    }
    // Default for POS users (waiters, cashiers, etc.)
    return 'pos';
  },

  /**
   * Login handler — calls POST /api/auth/login to get a JWT.
   * Stores token in localStorage via Api.setToken().
   */
  async login() {
    const { username, pin } = LoginView.getValues();
    if (!username || !pin) {
      LoginView.showError('Usuario y PIN son obligatorios');
      return;
    }
    try {
      const res = await Api.login(username, pin);
      Api.setToken(res.token);
      window.store.setState({ currentUser: res.user }, 'logged-in');
      LoginView.reset();
      document.getElementById('header-user').textContent = res.user.name;
      // BLOQUE 2 — Role-based landing: navigate to the appropriate view
      const landingView = this._resolveLandingView(res.user);
      this.navigate(landingView);
      this.toast('Bienvenido, ' + res.user.name, 'success');
    } catch (err) {
      // Discrete error — don't reveal if the user exists
      LoginView.showError('Credenciales no válidas');
    }
  },

  logout() {
    Api.setToken(null);
    window.store.setState({ currentUser: null, currentTicket: null }, 'logged-out');
    document.getElementById('header-user').textContent = '—';
    this.navigate('login');
    this.toast('Sesión cerrada', 'info');
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
