// =====================================================================
// app.js — LBApos application entry point + navigation controller
// =====================================================================
// BLOQUE N — Rediseño UI Odoo 19:
//   - Navegación con "áreas": login → ÁREAS → (dashboard|pos|kitchen|cash…)
//   - Flujo por ROL tras login (admin→dashboard, mesero→pos, cocina→kds,
//     cajero→cash) con pantalla de áreas accesible siempre ("Todas las áreas")
//   - En Android (ServerConfig con modo dispositivo): kitchen abre KDS directo
//   - Topbar global Odoo-style con estado de conexión, usuario y reloj
// Mantiene: store, websocket, offline queue, push, PWA (lógica intacta).
// =====================================================================

const AREA_LABELS = {
  login: 'Inicio de sesión',
  areas: 'Áreas',
  dashboard: 'Administración',
  tables: 'Mesas',
  pos: 'Punto de Venta',
  payment: 'Pago',
  kitchen: 'Cocina',
  cash: 'Caja',
  reports: 'Reportes',
  inventory: 'Inventario',
  admin: 'Administración',
};

const App = {
  views: {},

  async init() {
    // BLOQUE Android — server config SOLO dentro del shell nativo de
    // Capacitor (APK). Cuando la web la sirve el propio backend (LAN) o
    // GitHub Pages (DEMO_MODE), la configuración no es necesaria: no
    // forzar la pantalla de bienvenida/config en el navegador.
    const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (window.ServerConfig && isNativeApp && !window.DEMO_MODE) {
      ServerConfig.init();
      if (!ServerConfig.isConfigured()) {
        console.log('[app] Native shell without server — showing welcome/config screen');
        return;
      }
    }

    // Init views
    LoginView.init();
    AreasView.init();
    DashboardView.init();
    TablesView.init();
    PosView.init();
    PaymentView.init();
    KitchenView.init();
    CashView.init();
    ReportsView.init();
    InventoryView.init();
    AdminView.init();
    this.views = {
      login: LoginView, areas: AreasView, dashboard: DashboardView,
      tables: TablesView, pos: PosView, payment: PaymentView,
      kitchen: KitchenView, cash: CashView, reports: ReportsView,
      inventory: InventoryView, admin: AdminView,
    };

    this._startClock();
    this._toggleDemoBadge();

    // Initial navigation
    const deviceMode = window.ServerConfig ? ServerConfig.getMode() : 'pos';
    if (deviceMode === 'kitchen') {
      this.navigate('kitchen');
    } else {
      this.navigate('login');
    }

    // Session restore: si hay JWT previo, restaurar usuario (sin re-login)
    if (window.DEMO_MODE && localStorage.getItem('samba_jwt')) {
      // en demo el token es estático: volver a área si el usuario lo era
      const saved = sessionStorage.getItem('lba_last_user');
      if (saved) {
        try { this._applyUser(JSON.parse(saved), { silent: true }); } catch (e) { /* noop */ }
      }
    }

    if (window.PushClient) PushClient.init();

    // BLOQUE I — offline sync auth-expired
    window.addEventListener('offline:auth-expired', (e) => {
      const msg = e.detail?.message || 'Tu sesión ha expirado durante la sincronización.';
      this.toast(msg, 'error');
      Api.setToken(null);
      this.navigate('login');
    });

    // BLOQUE I — resume offline sync after login
    window.addEventListener('store:state', (e) => {
      const state = e.detail?.state;
      if (state?.currentUser && window.OfflineQueue && OfflineQueue._syncPaused) {
        OfflineQueue.resumeSync();
      }
    });

    // Cerrar user-menu al hacer click fuera
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('user-menu');
      if (menu && !menu.hidden && !menu.contains(e.target) && !e.target.closest('#topbar-user-btn')) {
        menu.hidden = true;
      }
    });

    // Click en el fondo del modal lo cierra
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') this.closeModal();
    });

    window.App = this;
  },

  // ===================================================================
  // Navegación entre vistas (áreas)
  // ===================================================================
  navigate(viewName) {
    const views = document.querySelectorAll('.view');
    views.forEach(v => v.classList.remove('is-active'));
    const target = document.getElementById('view-' + viewName);
    if (!target) return;

    target.classList.add('is-active');
    document.body.dataset.view = viewName;
    window.store.setState({ currentView: viewName }, 'navigate');

    // Topbar: actualizar área actual
    const areaName = document.getElementById('topbar-area-name');
    if (areaName) areaName.textContent = AREA_LABELS[viewName] || viewName;

    // Refresh on-enter
    if (viewName === 'dashboard') DashboardView.refresh();
    if (viewName === 'areas') AreasView.render();
    if (viewName === 'tables') TablesView.refresh();
    if (viewName === 'pos') PosView.refresh();
    if (viewName === 'kitchen') KitchenView.load();
    if (viewName === 'admin') AdminView.load();
    if (viewName === 'cash') CashView.refresh();
    if (viewName === 'reports') ReportsView.refresh();
    if (viewName === 'inventory') InventoryView.refresh();
    if (viewName !== 'kitchen' && KitchenView._timerInterval) KitchenView.unload();
  },

  goHome() {
    this.toggleUserMenu(true);
    this.navigate('areas');
  },

  toggleSidebar() { this.goHome(); },

  toggleUserMenu(forceClose) {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    menu.hidden = forceClose === true ? true : !menu.hidden;
  },

  // ===================================================================
  // Login + flujo por rol
  // ===================================================================
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
      this._applyUser(res.user, { navigateByRole: true });
    } catch (err) {
      LoginView.showError(err.message || 'Error al iniciar sesión');
    }
  },

  _applyUser(user, { navigateByRole = false, silent = false } = {}) {
    // Topbar + menú usuario
    const nameEl = document.getElementById('header-user');
    if (nameEl) nameEl.textContent = user.name;
    const menuName = document.getElementById('user-menu-name');
    if (menuName) menuName.textContent = user.name;
    const menuRole = document.getElementById('user-menu-role');
    if (menuRole) menuRole.textContent = user.roleName || (user.isAdmin ? 'Administrador' : 'Usuario');
    try { sessionStorage.setItem('lba_last_user', JSON.stringify(user)); } catch (e) { /* noop */ }

    if (!silent) this.toast('¡Bienvenido, ' + user.name + '!', 'success');

    if (navigateByRole) {
      const dest = this.homeForUser(user);
      this.navigate(dest);
    }
  },

  /**
   * Flujo por ROL (spec §6):
   *   Administrador → dashboard · Mesero/Dependiente → pos (mesas)
   *   Cocina/Pizzero → kitchen (KDS) · Cajero → cash · Bartender → pos
   *   Otros → areas
   */
  homeForUser(user) {
    if (!user) return 'login';
    if (user.isAdmin) return 'dashboard';
    const role = (user.roleName || '').toLowerCase();
    if (role.includes('meser') || role.includes('depend') || role.includes('waiter') || role.includes('bartender') || role.includes('barra')) return 'pos';
    if (role.includes('cocin') || role.includes('chef') || role.includes('pizzer') || role.includes('kitchen')) return 'kitchen';
    if (role.includes('caja') || role.includes('cashier')) return 'cash';
    return 'areas';
  },

  logout() {
    Api.setToken(null);
    sessionStorage.removeItem('lba_last_user');
    window.store.setState({ currentUser: null, currentTicket: null }, 'logged-out');
    const nameEl = document.getElementById('header-user');
    if (nameEl) nameEl.textContent = 'Usuario';
    this.toggleUserMenu(true);
    this.navigate('login');
    this.toast('Sesión cerrada', 'info');
  },

  // ===================================================================
  // Modal + toast
  // ===================================================================
  showModal(title, htmlBody) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = htmlBody;
    document.getElementById('modal-overlay').classList.add('is-open');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('is-open');
  },

  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },

  _startClock() {
    const el = document.getElementById('header-clock');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    tick();
    setInterval(tick, 15000);
  },

  // DEMO_MODE (PR #9 hardening): badge visible en el topbar cuando la
  // build corre con la config explícita de demo (GitHub Pages). Las
  // builds de producción (LAN / APK) nunca lo muestran.
  _toggleDemoBadge() {
    const badge = document.getElementById('topbar-demo-badge');
    if (!badge) return;
    const isDemo = !!(window.LBA_CONFIG && window.LBA_CONFIG.DEMO_MODE === true);
    badge.hidden = !isDemo;
  },
};

// Bootstrap
document.addEventListener('DOMContentLoaded', () => App.init());
