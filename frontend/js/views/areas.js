// =====================================================================
// views/areas.js — AreasView (pantalla de áreas post-login)
// =====================================================================
// Spec §5: pantalla principal tras login con botones de área.
// Los botones visibles dependen del rol/permisos del usuario.
// =====================================================================

const AreasView = {
  // Definición de áreas: id de vista + permiso aproximado por rol.
  // El filtrado usa App.homeForUser()/roleName + isAdmin (spec §5-6).
  AREAS: [
    { view: 'dashboard', icon: 'fa-crown', name: 'Administración', desc: 'Panel, usuarios y configuración', cls: 'area-card--admin', roles: ['admin'] },
    { view: 'pos', icon: 'fa-cart-shopping', name: 'Punto de Venta', desc: 'Mesas, pedidos y cobro', cls: 'area-card--pos', roles: ['admin', 'mesero', 'dependiente', 'waiter', 'bartender', 'barra', 'cajero', 'cashier'] },
    { view: 'kitchen', icon: 'fa-utensils', name: 'Cocina', desc: 'KDS — pantalla de preparación', cls: 'area-card--kitchen', roles: ['admin', 'cocinero', 'cocina', 'chef', 'pizzer', 'kitchen'] },
    { view: 'cash', icon: 'fa-cash-register', name: 'Caja', desc: 'Sesiones, movimientos y cierre', cls: 'area-card--cash', roles: ['admin', 'cajero', 'cashier'] },
    { view: 'inventory', icon: 'fa-boxes-stacked', name: 'Inventario', desc: 'Stock e ingredientes', cls: 'area-card--inventory', roles: ['admin'] },
    { view: 'reports', icon: 'fa-chart-bar', name: 'Reportes', desc: 'Ventas y análisis', cls: 'area-card--reports', roles: ['admin', 'cajero', 'cashier'] },
    { view: 'admin', icon: 'fa-gear', name: 'Configuración', desc: 'Productos, recetas e impresoras', cls: 'area-card--admin', roles: ['admin'] },
  ],

  init() {
    this.gridEl = document.getElementById('areas-grid');
    this.helloEl = document.getElementById('areas-hello');
    this.roleEl = document.getElementById('areas-role');
    window.store.subscribe((state, prev, reason) => {
      if (reason === 'logged-in' || reason === 'logged-out') this.render();
    });
  },

  _allowedAreas(user) {
    if (!user) return [];
    if (user.isAdmin) return this.AREAS;
    const role = (user.roleName || '').toLowerCase();
    return this.AREAS.filter(a => a.roles.some(r => role.includes(r)));
  },

  render() {
    const user = window.store.state.currentUser;
    if (this.helloEl) {
      const h = new Date().getHours();
      const greeting = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
      this.helloEl.textContent = user ? `${greeting}, ${user.name}` : greeting;
    }
    if (this.roleEl) {
      this.roleEl.textContent = user
        ? (user.roleName || (user.isAdmin ? 'Administrador' : 'Usuario'))
        : '—';
    }
    if (!this.gridEl) return;

    const areas = this._allowedAreas(user);
    this.gridEl.innerHTML = '';
    if (areas.length === 0) {
      this.gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--lba-fg-muted);">Tu usuario no tiene áreas asignadas. Contactá al administrador.</div>';
      return;
    }
    for (const area of areas) {
      const card = document.createElement('button');
      card.className = 'area-card ' + (area.cls || '');
      card.innerHTML = `
        <span class="area-card__icon"><i class="fa-solid ${area.icon}"></i></span>
        <span class="area-card__text">
          <span class="area-card__name">${this._escape(area.name)}</span>
          <span class="area-card__desc">${this._escape(area.desc)}</span>
        </span>
        <i class="fa-solid fa-chevron-right area-card__chev"></i>
      `;
      card.addEventListener('click', () => window.App.navigate(area.view));
      this.gridEl.appendChild(card);
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};

window.AreasView = AreasView;
