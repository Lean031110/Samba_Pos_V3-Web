// =====================================================================
// views/admin.js — AdminView (panel de administración)
// =====================================================================
// Panel lateral con 5 pestañas:
//   1. Productos   — CRUD de menú (lista + modal nuevo/editar + eliminar)
//   2. Inventario  — stock por almacén, alertas, movimientos, ajuste manual
//   3. Recetas     — recetas por porción, costo, precio, margen y % margen
//   4. Impresoras  — impresoras, áreas de impresión, reglas de routing, test print
//   5. Configuración — versión, uptime, estado WS, estado impresoras, cola de impresión
//
// Convenciones:
//   - Toda la UI visible está en español.
//   - API REST en /api/* vía Api.request(method, path, body) (paths SIN
//     prefijo /api porque Api.request ya lo añade — ver services/api.js).
//   - El endpoint /version vive en la raíz (no bajo /api), así que se
//     consulta con fetch directo (no requiere autenticación).
//   - Los modales usan el contenedor #modal-overlay compartido. Como
//     app.js usa la clase `is-open` pero mobile.css usa `modal-overlay--open`,
//     nuestro helper añade AMBAS clases para que el modal sea visible.
//   - Botones touch-friendly (.kds-btn tiene min-height: 48px).
//   - Tablas con scroll horizontal en pantallas pequeñas.
// =====================================================================

const AdminView = {
  init() {
    this.contentEl = document.getElementById('admin-content');
    this._currentTab = null;
    this._warehouseId = 1;            // almacén por defecto (se refresca con /departments)
    this._productsCache = [];          // cache de productos para edición
    this._ingredientsCache = [];       // cache de ingredientes para editor de receta
    this._unitsCache = [];             // cache de unidades
    this._modalCloseBound = false;
    this._stylesInjected = false;
    this._injectStyles();
    this._setupModalListeners();
  },

  /**
   * Inyecta los estilos admin-* una sola vez. Las clases `.admin-layout`,
   * `.admin-sidebar`, `.admin-content` y `.admin-nav-item` se mencionan como
   * ya definidas, pero en esta versión del proyecto no existen en los CSS
   * cargados. Para que el panel se vea correctamente sin tocar los .css,
   * inyectamos un <style> con todo lo necesario.
   */
  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;
    if (document.getElementById('admin-view-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-view-styles';
    style.textContent = `
      /* Layout principal — FIX BLOQUE N: solo display cuando .is-active.
         (Antes: .view-admin { display:flex } forzaba que la vista admin
         quedara SIEMPRE renderizada encima de las demás (opacity 0 +
         position absolute) e interceptaba todos los clicks). */
      .view-admin.is-active { display: flex; overflow: hidden; flex-direction: row; }
      .admin-layout { display: flex; width: 100%; height: 100%; background: var(--lba-bg-app); }
      .admin-sidebar {
        width: var(--lba-sidebar-w); flex-shrink: 0;
        background: var(--lba-bg-sidebar); color: var(--lba-fg-on-blue);
        display: flex; flex-direction: column; overflow-y: auto;
      }
      .admin-sidebar__header {
        padding: 16px 18px; font-size: 16px; font-weight: 700;
        border-bottom: 1px solid rgba(255,255,255,0.15);
        display: flex; align-items: center; gap: 8px;
      }
      .admin-sidebar__nav { padding: 8px; display: flex; flex-direction: column; gap: 4px; }
      .admin-nav-item {
        background: transparent; border: none; color: var(--lba-fg-on-blue-muted);
        padding: 12px 14px; min-height: var(--lba-touch-min);
        text-align: left; cursor: pointer; border-radius: var(--lba-radius-sm);
        font-size: 14px; font-weight: 500;
        display: flex; align-items: center; gap: 10px;
        transition: background var(--lba-anim-fast), color var(--lba-anim-fast);
      }
      .admin-nav-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
      .admin-nav-item.active { background: rgba(255,255,255,0.18); color: #fff; font-weight: 700; }
      .admin-content { flex: 1; overflow-y: auto; padding: 18px 22px; }

      /* Header de pestaña */
      .admin-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
      .admin-title { font-size: 20px; font-weight: 700; color: var(--lba-blue-900); }
      .admin-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .admin-inline-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--lba-fg-muted); }
      .admin-inline-label input { width: 60px; padding: 6px 8px; border: 1px solid var(--lba-border-default); border-radius: 4px; }

      /* Secciones */
      .admin-section-title { font-size: 15px; font-weight: 700; color: var(--lba-blue-700); margin: 22px 0 8px 0; padding-bottom: 6px; border-bottom: 1px solid var(--lba-border-light); }

      /* Loading + empty */
      .admin-loading { padding: 32px; text-align: center; color: var(--lba-fg-muted); display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 14px; }
      .admin-loading i { font-size: 24px; color: var(--lba-accent); }
      .admin-empty { padding: 18px; text-align: center; color: var(--lba-fg-muted); font-size: 13px; }

      /* Tablas */
      .admin-table-wrap.is-scrollable { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .admin-table { width: 100%; border-collapse: collapse; background: var(--lba-bg-panel); border-radius: var(--lba-radius-md); overflow: hidden; box-shadow: var(--lba-shadow-sm); font-size: 13px; }
      .admin-table th { background: var(--lba-blue-100); color: var(--lba-blue-900); font-weight: 700; text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--lba-border-light); white-space: nowrap; }
      .admin-table td { padding: 10px 12px; border-bottom: 1px solid var(--lba-border-light); vertical-align: middle; }
      .admin-table tr:last-child td { border-bottom: none; }
      .admin-table tr:hover td { background: var(--lba-bg-hover); }
      .admin-num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--lba-font-mono); white-space: nowrap; }
      .admin-num--danger { color: var(--lba-danger); font-weight: 700; }
      .admin-num--warning { color: var(--lba-warning); font-weight: 700; }
      .admin-num--success { color: var(--lba-success); font-weight: 700; }
      .admin-row-actions { display: flex; gap: 4px; flex-wrap: wrap; }
      .admin-row-actions .kds-btn { min-width: 0; padding: 4px 8px; font-size: 12px; }

      /* Tags */
      .admin-tag { display: inline-block; padding: 2px 8px; border-radius: var(--lba-radius-pill); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: var(--lba-blue-100); color: var(--lba-blue-700); }
      .admin-tag--success { background: var(--lba-success-bg); color: var(--lba-success); }
      .admin-tag--danger  { background: var(--lba-danger-bg);  color: var(--lba-danger); }
      .admin-tag--warning { background: var(--lba-warning-bg); color: var(--lba-warning); }
      .admin-tag--info    { background: var(--lba-info-bg);    color: var(--lba-info); }

      /* Alertas */
      .admin-alert { background: var(--lba-danger-bg); border-left: 4px solid var(--lba-danger); padding: 12px 14px; border-radius: var(--lba-radius-sm); margin-bottom: 16px; }
      .admin-alert h3 { margin: 0 0 8px 0; color: var(--lba-danger); font-size: 14px; display: flex; align-items: center; gap: 6px; }
      .admin-alert--ok { background: var(--lba-success-bg); border-left-color: var(--lba-success); color: var(--lba-success); font-size: 13px; padding: 10px 14px; display: flex; align-items: center; gap: 6px; }

      /* Cards (tab configuración) */
      .admin-card { background: var(--lba-bg-panel); border-radius: var(--lba-radius-md); padding: 16px; margin-bottom: 14px; box-shadow: var(--lba-shadow-sm); }
      .admin-card h3 { margin: 0 0 12px 0; font-size: 14px; color: var(--lba-blue-900); display: flex; align-items: center; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--lba-border-light); }
      .admin-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 16px; font-size: 13px; }
      .admin-card-grid > div { display: flex; gap: 6px; align-items: center; }
      .admin-card-grid > div > span:first-child { color: var(--lba-fg-muted); }

      .admin-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
      .admin-stat { background: var(--lba-blue-50); border-radius: var(--lba-radius-sm); padding: 12px; text-align: center; }
      .admin-stat__num { font-size: 22px; font-weight: 700; color: var(--lba-blue-700); font-variant-numeric: tabular-nums; }
      .admin-stat__label { font-size: 11px; color: var(--lba-fg-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 4px; }
      .admin-stat--warn { background: var(--lba-warning-bg); } .admin-stat--warn .admin-stat__num { color: var(--lba-warning); }
      .admin-stat--danger { background: var(--lba-danger-bg); } .admin-stat--danger .admin-stat__num { color: var(--lba-danger); }
      .admin-stat--success { background: var(--lba-success-bg); } .admin-stat--success .admin-stat__num { color: var(--lba-success); }
      .admin-stat--info { background: var(--lba-info-bg); } .admin-stat--info .admin-stat__num { color: var(--lba-info); }

      /* Muestras de color (áreas de impresión) */
      .admin-color-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; vertical-align: middle; border: 1px solid rgba(0,0,0,0.2); }

      /* Modales: formularios */
      .admin-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; }
      .admin-field > span { color: var(--lba-fg-muted); font-weight: 600; }
      .admin-field input, .admin-field select, .admin-field textarea {
        padding: 10px; font-size: 14px; border: 1px solid var(--lba-border-default); border-radius: var(--lba-radius-sm);
        background: var(--lba-bg-panel); color: var(--lba-fg-default); min-height: 40px;
      }
      .admin-field input:focus, .admin-field select:focus, .admin-field textarea:focus {
        outline: none; border-color: var(--lba-border-focus); box-shadow: 0 0 0 2px var(--lba-blue-100);
      }
      .admin-field--inline { flex-direction: row; align-items: center; gap: 8px; }
      .admin-row { display: flex; gap: 8px; }
      .admin-row > .admin-field { flex: 1; }
      .admin-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--lba-border-light); }
      .admin-note { font-size: 12px; color: var(--lba-fg-muted); padding: 8px 10px; background: var(--lba-blue-50); border-radius: var(--lba-radius-sm); margin: 8px 0; display: flex; align-items: center; gap: 6px; }
      .admin-note--danger { background: var(--lba-danger-bg); color: var(--lba-danger); }
      .admin-note i { color: var(--lba-info); }
      .admin-note--danger i { color: var(--lba-danger); }

      /* Editor de recetas */
      .admin-recipe-header { padding: 10px 12px; background: var(--lba-blue-100); border-radius: var(--lba-radius-sm); margin-bottom: 12px; font-size: 13px; color: var(--lba-blue-900); }
      .admin-recipe-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; max-height: 320px; overflow-y: auto; }
      .admin-recipe-row { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 6px; align-items: center; }
      .admin-recipe-row select, .admin-recipe-row input { padding: 8px; font-size: 13px; border: 1px solid var(--lba-border-default); border-radius: 4px; min-height: 36px; }
      .admin-margin-result { margin-top: 12px; padding: 12px; background: var(--lba-blue-50); border-radius: var(--lba-radius-sm); }
      .admin-margin-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; border-bottom: 1px dashed var(--lba-border-light); }
      .admin-margin-row:last-child { border-bottom: none; }

      /* Responsive: en pantallas chicas el sidebar se va arriba */
      @media (max-width: 720px) {
        .admin-layout { flex-direction: column; }
        .admin-sidebar { width: 100%; }
        .admin-sidebar__nav { flex-direction: row; overflow-x: auto; }
        .admin-nav-item { white-space: nowrap; }
        .admin-content { padding: 12px; }
        .admin-header { flex-direction: column; align-items: stretch; }
      }
    `;
    document.head.appendChild(style);
  },

  async load() {
    await this.showTab('products');
  },

  unload() {
    // Nada que limpiar por ahora (no hay timers en este módulo).
  },

  async showTab(tabName) {
    this._currentTab = tabName;
    // Actualiza el estado activo de los botones de navegación laterales.
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.adminTab === tabName);
    });
    switch (tabName) {
      case 'products':  await this._renderProducts();  break;
      case 'inventory': await this._renderInventory(); break;
      case 'recipes':   await this._renderRecipes();   break;
      case 'printers':  await this._renderPrinters();   break;
      case 'templates': await this._renderTemplates();  break;
      case 'cash':      await this._renderCash();       break;
      case 'reports':   await this._renderReports();    break;
      case 'config':    await this._renderConfig();    break;
      default:
        this._setContent('<p class="admin-empty">Pestaña no reconocida</p>');
    }
  },

  // ===================================================================
  // Helpers generales
  // ===================================================================

  _setContent(html) {
    if (this.contentEl) this.contentEl.innerHTML = html;
  },

  _loading(title) {
    this._setContent(`
      <div class="admin-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>${this._escape(title || 'Cargando...')}</span>
      </div>
    `);
  },

  /**
   * Abre el modal compartido (#modal-overlay). Añade AMBAS clases
   * `is-open` (esperada por app.js/layout.css) y `modal-overlay--open`
   * (esperada por mobile.css) para que el modal sea visible sin importar
   * cuál regla CSS aplique.
   */
  _showModal(title, htmlBody, options) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (titleEl) titleEl.textContent = title || '';
    if (bodyEl) bodyEl.innerHTML = htmlBody || '';
    // Llama al helper de App si existe (puede añadir lógica extra en el futuro)
    if (window.App && typeof window.App.showModal === 'function') {
      window.App.showModal(title, htmlBody);
    }
    // Asegura visibilidad con ambas clases CSS
    overlay.classList.add('is-open');
    overlay.classList.add('modal-overlay--open');
  },

  _closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.classList.remove('modal-overlay--open');
    if (window.App && typeof window.App.closeModal === 'function') {
      window.App.closeModal();
    }
  },

  _setupModalListeners() {
    if (this._modalCloseBound) return;
    this._modalCloseBound = true;
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    // Cerrar al hacer clic fuera del card (en el overlay)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeModal();
    });
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('modal-overlay--open')) {
        this._closeModal();
      }
    });
  },

  _escape(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  _formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return this._escape(iso);
      return d.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return this._escape(iso);
    }
  },

  _formatMoney(n) {
    const num = Number(n || 0);
    return '$' + num.toFixed(2);
  },

  _formatNumber(n, decimals) {
    const num = Number(n || 0);
    const d = decimals === undefined ? 2 : decimals;
    return num.toFixed(d);
  },

  _formatPercent(n) {
    const num = Number(n || 0);
    return num.toFixed(1) + '%';
  },

  _formatUptime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const parts = [];
    if (days > 0)  parts.push(days + 'd');
    if (hours > 0 || days > 0) parts.push(hours + 'h');
    parts.push(mins + 'm');
    parts.push(secs + 's');
    return parts.join(' ');
  },

  _error(msg) {
    if (window.App && typeof window.App.toast === 'function') {
      window.App.toast(msg, 'error');
    }
  },

  _toast(msg, type) {
    if (window.App && typeof window.App.toast === 'function') {
      window.App.toast(msg, type || 'info');
    }
  },

  /**
   * Encabezado estándar para cada tab: título + barra de acciones.
   */
  _header(title, actionsHtml) {
    return `
      <div class="admin-header">
        <h2 class="admin-title">${this._escape(title)}</h2>
        <div class="admin-actions">${actionsHtml || ''}</div>
      </div>
    `;
  },

  /**
   * Renderiza una tabla con scroll horizontal y clases consistentes.
   */
  _table(headers, rowsHtml, opts) {
    const o = opts || {};
    const ths = headers.map(h => `<th>${this._escape(h)}</th>`).join('');
    return `
      <div class="admin-table-wrap${o.scrollable === false ? '' : ' is-scrollable'}">
        <table class="admin-table">
          <thead><tr>${ths}</tr></thead>
          <tbody>${rowsHtml || ''}</tbody>
        </table>
      </div>
    `;
  },

  // ===================================================================
  // Tab 1: PRODUCTOS
  // ===================================================================

  async _renderProducts() {
    this._loading('Cargando productos...');
    let items = [];
    try {
      const res = await Api.request('GET', '/products');
      items = (res && res.data) || [];
      this._productsCache = items;
    } catch (err) {
      this._error('No se pueden cargar productos: ' + (err.message || err));
      this._setContent(this._header('Productos', this._btn('Nuevo producto', 'kds-btn--primary', 'fa-plus', "window.AdminView._newProduct()")) +
        '<p class="admin-empty">Error al cargar productos.</p>');
      return;
    }
    const newBtn = this._btn('Nuevo producto', 'kds-btn--primary', 'fa-plus', "window.AdminView._newProduct()");
    if (items.length === 0) {
      this._setContent(this._header('Productos', newBtn) +
        '<p class="admin-empty">No hay productos cargados. Hacé clic en "Nuevo producto" para crear el primero.</p>');
      return;
    }
    const rows = items.map(it => {
      const price = Number(it.Portions?.[0]?.Prices?.[0]?.Price || 0);
      const group = it.GroupCode || '—';
      return `
        <tr>
          <td data-label="Nombre">${this._escape(it.Name)}</td>
          <td data-label="Grupo">${this._escape(group)}</td>
          <td data-label="Precio" class="admin-num">${this._formatMoney(price)}</td>
          <td data-label="Acciones" class="admin-row-actions">
            ${this._btn('Editar', '', 'fa-pen', `window.AdminView._editProduct(${it.Id})`)}
            ${this._btn('Eliminar', 'kds-btn--void', 'fa-trash', `window.AdminView._deleteProduct(${it.Id})`)}
          </td>
        </tr>
      `;
    }).join('');
    this._setContent(
      this._header('Productos (' + items.length + ')', newBtn) +
      this._table(['Nombre', 'Grupo', 'Precio', 'Acciones'], rows)
    );
  },

  _btn(label, cls, icon, onclick, extraAttrs) {
    const clsAttr = cls ? (' ' + cls) : '';
    const iconHtml = icon ? `<i class="fa-solid ${icon}"></i> ` : '';
    const extra = extraAttrs || '';
    return `<button class="kds-btn${clsAttr}" onclick="${onclick}" ${extra}>${iconHtml}${this._escape(label)}</button>`;
  },

  _newProduct() {
    this._productForm(null);
  },

  _editProduct(id) {
    const item = this._productsCache.find(p => p.Id === id);
    if (!item) {
      this._toast('Producto no encontrado en caché. Recargá la lista.', 'warn');
      return;
    }
    this._productForm(item);
  },

  _productForm(item) {
    const isEdit = !!item;
    const name = item?.Name || '';
    const groupCode = item?.GroupCode || '';
    const barcode = item?.Barcode || '';
    const price = item?.Portions?.[0]?.Prices?.[0]?.Price || '';
    const title = isEdit ? 'Editar producto' : 'Nuevo producto';
    const html = `
      <form id="product-form" onsubmit="return false;">
        <label class="admin-field">
          <span>Nombre *</span>
          <input type="text" id="prod-name" value="${this._escape(name)}" required
                 placeholder="Ej: Hamburguesa Clásica" autocomplete="off">
        </label>
        <label class="admin-field">
          <span>Grupo (GroupCode)</span>
          <input type="text" id="prod-group" value="${this._escape(groupCode)}"
                 placeholder="Ej: COMIDAS" autocomplete="off">
        </label>
        <label class="admin-field">
          <span>Precio *</span>
          <input type="number" id="prod-price" value="${price !== '' ? price : ''}"
                 step="0.01" min="0" required placeholder="0.00">
        </label>
        <label class="admin-field">
          <span>Código de barras</span>
          <input type="text" id="prod-barcode" value="${this._escape(barcode)}"
                 placeholder="Opcional" autocomplete="off">
        </label>
        ${isEdit ? `<p class="admin-note"><i class="fa-solid fa-circle-info"></i> La edición actualiza nombre, grupo, precio y código. Las porciones adicionales no se modifican.</p>` : ''}
        <div class="admin-modal-actions">
          ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
          ${this._btn(isEdit ? 'Guardar cambios' : 'Crear producto', 'kds-btn--primary', 'fa-check', `window.AdminView._saveProduct(${isEdit ? item.Id : 'null'})`)}
        </div>
      </form>
    `;
    this._showModal(title, html);
  },

  async _saveProduct(id) {
    const name = document.getElementById('prod-name').value.trim();
    const groupCode = document.getElementById('prod-group').value.trim();
    const priceVal = document.getElementById('prod-price').value;
    const barcode = document.getElementById('prod-barcode').value.trim();
    if (!name) { this._toast('El nombre es obligatorio', 'warn'); return; }
    const price = parseFloat(priceVal);
    if (isNaN(price) || price < 0) { this._toast('El precio debe ser un número válido', 'warn'); return; }
    const body = { name, price, groupCode: groupCode || null, barcode: barcode || null };
    try {
      if (id) {
        // PATCH no está implementado en el backend actual; intentamos primero
        // PATCH y, si falla, mostramos un mensaje claro.
        try {
          await Api.request('PATCH', '/products/' + id, body);
          this._toast('Producto actualizado', 'success');
        } catch (patchErr) {
          this._toast('La API no soporta edición directa (PATCH /products/:id). Actualizá el producto desde la base de datos o añadí el endpoint.', 'warn');
          return;
        }
      } else {
        await Api.request('POST', '/products', body);
        this._toast('Producto creado', 'success');
      }
      this._closeModal();
      await this._renderProducts();
    } catch (err) {
      this._error('No se puede guardar el producto: ' + (err.message || err));
    }
  },

  _deleteProduct(id) {
    const item = this._productsCache.find(p => p.Id === id);
    const label = item ? item.Name : ('#' + id);
    const html = `
      <p>¿Seguro que querés eliminar/desactivar el producto <strong>${this._escape(label)}</strong>?</p>
      <p class="admin-note admin-note--danger">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Si el backend no soporta DELETE /products/:id, la acción fallará con un mensaje de error.
      </p>
      <div class="admin-modal-actions">
        ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
        ${this._btn('Eliminar', 'kds-btn--void', 'fa-trash', `window.AdminView._confirmDeleteProduct(${id})`)}
      </div>
    `;
    this._showModal('Eliminar producto', html);
  },

  async _confirmDeleteProduct(id) {
    try {
      await Api.request('DELETE', '/products/' + id);
      this._toast('Producto eliminado', 'success');
      this._closeModal();
      await this._renderProducts();
    } catch (err) {
      this._toast('No se puede eliminar: ' + (err.message || err), 'warn');
    }
  },

  // ===================================================================
  // Tab 2: INVENTARIO
  // ===================================================================

  async _renderInventory() {
    this._loading('Cargando inventario...');
    // Descubre warehouseId por defecto desde /departments (sólo la primera vez)
    if (this._warehouseId === 1) {
      try {
        const deptRes = await Api.request('GET', '/departments');
        const ids = (deptRes.data || [])
          .map(d => d.WarehouseId)
          .filter(v => v !== null && v !== undefined);
        if (ids.length > 0) this._warehouseId = ids[0];
      } catch { /* ignora — usa el valor por defecto */ }
    }
    const warehouseId = this._warehouseId;
    let ingredients = [], balances = [], lowStock = [], movements = [];
    try {
      const [ingRes, stkRes, lowRes, movRes] = await Promise.all([
        Api.request('GET', '/inventory/ingredients').catch(() => ({ data: [] })),
        Api.request('GET', '/inventory/stock/' + warehouseId).catch(() => ({ data: [] })),
        Api.request('GET', '/inventory/stock/' + warehouseId + '/low').catch(() => ({ data: [] })),
        Api.request('GET', '/inventory/movements?limit=20').catch(() => ({ data: [] })),
      ]);
      ingredients = ingRes.data || [];
      balances = stkRes.data || [];
      lowStock = lowRes.data || [];
      movements = movRes.data || [];
      this._ingredientsCache = ingredients;
    } catch (err) {
      this._error('No se puede cargar el inventario: ' + (err.message || err));
    }

    // Selector de almacén
    const whSelector = `
      <label class="admin-inline-label">
        <span>Almacén:</span>
        <input type="number" id="inv-warehouse" value="${warehouseId}" min="1" max="99"
               onchange="window.AdminView._changeWarehouse(this.value)">
      </label>
    `;
    const adjustBtn = this._btn('Ajustar stock', 'kds-btn--primary', 'fa-scale-balanced',
      `window.AdminView._openStockAdjustment()`);

    // Alertas de stock bajo
    let alertsHtml = '';
    if (lowStock.length > 0) {
      const rows = lowStock.map(a => `
        <tr>
          <td>${this._escape(a.Name)}</td>
          <td class="admin-num admin-num--danger">${this._formatNumber(a.Quantity)}</td>
          <td class="admin-num">${this._formatNumber(a.MinimumStock)}</td>
          <td>
            ${this._btn('Ajustar', 'kds-btn--void', 'fa-arrow-up',
              `window.AdminView._openStockAdjustment(${a.Id})`)}
          </td>
        </tr>
      `).join('');
      alertsHtml = `
        <div class="admin-alert">
          <h3><i class="fa-solid fa-triangle-exclamation"></i> Alertas de stock bajo (${lowStock.length})</h3>
          ${this._table(['Ingrediente', 'Stock actual', 'Mínimo', 'Acción'], rows)}
        </div>
      `;
    } else {
      alertsHtml = `
        <div class="admin-alert admin-alert--ok">
          <i class="fa-solid fa-circle-check"></i> Sin alertas de stock bajo en el almacén ${warehouseId}.
        </div>
      `;
    }

    // Stock por ingrediente (join con balances)
    const balanceByIngredient = new Map();
    for (const b of balances) balanceByIngredient.set(b.IngredientId, b);
    const stockRows = ingredients.map(ing => {
      const bal = balanceByIngredient.get(ing.Id);
      const qty = bal ? Number(bal.Quantity) : 0;
      const unit = bal?.UnitCode || ing.BaseUnitCode || '—';
      const min = Number(ing.MinimumStock || 0);
      const isLow = qty <= min && min > 0;
      const cost = Number(ing.CostPerUnit || 0);
      return `
        <tr>
          <td data-label="Ingrediente">${this._escape(ing.Name)}</td>
          <td data-label="Código">${this._escape(ing.Code || '—')}</td>
          <td data-label="Stock" class="admin-num${isLow ? ' admin-num--danger' : ''}">${this._formatNumber(qty)} ${this._escape(unit)}</td>
          <td data-label="Mínimo" class="admin-num">${this._formatNumber(min)}</td>
          <td data-label="Costo/U" class="admin-num">${this._formatMoney(cost)}</td>
          <td data-label="Acciones" class="admin-row-actions">
            ${this._btn('Ajustar', '', 'fa-arrow-up', `window.AdminView._openStockAdjustment(${ing.Id})`)}
          </td>
        </tr>
      `;
    }).join('');

    // Movimientos recientes
    let movHtml = '';
    if (movements.length === 0) {
      movHtml = '<p class="admin-empty">Sin movimientos recientes.</p>';
    } else {
      const mrows = movements.map(m => {
        const qty = Number(m.Quantity || 0);
        const sign = qty >= 0 ? '+' : '';
        return `
          <tr>
            <td data-label="Tipo"><span class="admin-tag admin-tag--${this._movementTypeClass(m.MovementType)}">${this._escape(m.MovementType)}</span></td>
            <td data-label="Ingrediente">${this._escape(m.IngredientName || '—')}</td>
            <td data-label="Cantidad" class="admin-num">${sign}${this._formatNumber(qty)} ${this._escape(m.UnitCode || '')}</td>
            <td data-label="Fecha">${this._formatDate(m.CreatedAt)}</td>
            <td data-label="Referencia">${this._escape(m.Reference || m.Notes || '—')}</td>
          </tr>
        `;
      }).join('');
      movHtml = this._table(['Tipo', 'Ingrediente', 'Cantidad', 'Fecha', 'Referencia'], mrows);
    }

    this._setContent(
      this._header('Inventario', whSelector + adjustBtn) +
      alertsHtml +
      '<h3 class="admin-section-title">Stock actual</h3>' +
      this._table(['Ingrediente', 'Código', 'Stock', 'Mínimo', 'Costo/U', 'Acciones'], stockRows) +
      '<h3 class="admin-section-title">Movimientos recientes</h3>' +
      movHtml
    );
  },

  _movementTypeClass(t) {
    const map = {
      PURCHASE: 'success',
      SALE: 'info',
      WASTE: 'danger',
      ADJUSTMENT: 'warning',
      TRANSFER_OUT: 'danger',
      TRANSFER_IN: 'success',
      RETURN: 'success',
      REVERSAL: 'warning',
    };
    return map[t] || 'info';
  },

  async _changeWarehouse(val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      this._warehouseId = n;
      await this._renderInventory();
    }
  },

  /**
   * Abre el modal para registrar un movimiento de stock manual.
   * @param {number} [ingredientId] — ID del ingrediente pre-seleccionado
   */
  _openStockAdjustment(ingredientId) {
    const ingredients = this._ingredientsCache || [];
    if (ingredients.length === 0) {
      this._toast('No hay ingredientes cargados. Recargá la pestaña de inventario.', 'warn');
      return;
    }
    const opts = ingredients
      .map(i => `<option value="${i.Id}"${i.Id === ingredientId ? ' selected' : ''}>${this._escape(i.Name)} (${this._escape(i.Code || '—')})</option>`)
      .join('');
    const html = `
      <form id="movement-form" onsubmit="return false;">
        <label class="admin-field">
          <span>Ingrediente *</span>
          <select id="mov-ingredient">${opts}</select>
        </label>
        <label class="admin-field">
          <span>Tipo de movimiento *</span>
          <select id="mov-type">
            <option value="PURCHASE">Compra (ingreso)</option>
            <option value="ADJUSTMENT">Ajuste (corrección)</option>
            <option value="WASTE">Merma (pérdida)</option>
            <option value="RETURN">Devolución (ingreso)</option>
            <option value="TRANSFER_IN">Transferencia entrada</option>
            <option value="TRANSFER_OUT">Transferencia salida</option>
          </select>
        </label>
        <div class="admin-row">
          <label class="admin-field">
            <span>Cantidad *</span>
            <input type="number" id="mov-qty" step="0.001" required placeholder="0">
          </label>
          <label class="admin-field">
            <span>Costo unitario</span>
            <input type="number" id="mov-cost" step="0.01" min="0" value="0" placeholder="0.00">
          </label>
        </div>
        <label class="admin-field">
          <span>Referencia</span>
          <input type="text" id="mov-ref" placeholder="Ej: Factura A-1234" autocomplete="off">
        </label>
        <label class="admin-field">
          <span>Notas</span>
          <textarea id="mov-notes" rows="2" placeholder="Opcional"></textarea>
        </label>
        <p class="admin-note"><i class="fa-solid fa-circle-info"></i> Usá cantidad negativa para salidas (merma, transferencia salida). El tipo WASTE debería usar valor negativo.</p>
        <div class="admin-modal-actions">
          ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
          ${this._btn('Registrar', 'kds-btn--primary', 'fa-check', "window.AdminView._saveStockMovement()")}
        </div>
      </form>
    `;
    this._showModal('Ajustar stock', html);
  },

  async _saveStockMovement() {
    const ingredientId = parseInt(document.getElementById('mov-ingredient').value, 10);
    const movementType = document.getElementById('mov-type').value;
    const quantity = parseFloat(document.getElementById('mov-qty').value);
    const unitCost = parseFloat(document.getElementById('mov-cost').value) || 0;
    const reference = document.getElementById('mov-ref').value.trim();
    const notes = document.getElementById('mov-notes').value.trim();
    if (isNaN(ingredientId)) { this._toast('Seleccioná un ingrediente', 'warn'); return; }
    if (isNaN(quantity) || quantity === 0) { this._toast('La cantidad debe ser distinta de cero', 'warn'); return; }
    const body = {
      ingredientId,
      warehouseId: this._warehouseId,
      movementType,
      quantity,
      unitCost,
      reference: reference || null,
      notes: notes || null,
    };
    try {
      await Api.request('POST', '/inventory/movements', body);
      this._toast('Movimiento registrado', 'success');
      this._closeModal();
      await this._renderInventory();
    } catch (err) {
      this._error('No se puede registrar el movimiento: ' + (err.message || err));
    }
  },

  // ===================================================================
  // Tab 3: RECETAS
  // ===================================================================

  async _renderRecipes() {
    this._loading('Cargando recetas y costos...');
    let recipes = [], costSummary = [];
    try {
      const [recRes, sumRes] = await Promise.all([
        Api.request('GET', '/recipes').catch(() => ({ data: [] })),
        Api.request('GET', '/recipes/cost-summary').catch(() => ({ data: [] })),
      ]);
      recipes = recRes.data || [];
      costSummary = sumRes.data || [];
    } catch (err) {
      this._error('No se pueden cargar las recetas: ' + (err.message || err));
    }
    const calcBtn = this._btn('Calcular margen', '', 'fa-calculator', "window.AdminView._showMarginCalc()");
    const newBtn = this._btn('Nueva receta', 'kds-btn--primary', 'fa-plus', "window.AdminView._newRecipe()");

    // Tabla principal: recetas existentes con costo, precio, margen
    let recipesHtml;
    if (recipes.length === 0) {
      recipesHtml = '<p class="admin-empty">No hay recetas definidas todavía. Usá "Nueva receta" o "Editar receta" en la lista inferior.</p>';
    } else {
      const rows = recipes.map(r => {
        const marginClass = Number(r.marginPct) < 30 ? 'admin-num--danger'
          : Number(r.marginPct) < 60 ? 'admin-num--warning'
          : 'admin-num--success';
        return `
          <tr>
            <td data-label="Producto">${this._escape(r.menuItemName)}</td>
            <td data-label="Porción">${this._escape(r.portionName)}</td>
            <td data-label="Costo" class="admin-num">${this._formatMoney(r.cost)}</td>
            <td data-label="Precio" class="admin-num">${this._formatMoney(r.price)}</td>
            <td data-label="Margen" class="admin-num">${this._formatMoney(r.margin)}</td>
            <td data-label="% Margen" class="admin-num ${marginClass}">${this._formatPercent(r.marginPct)}</td>
            <td data-label="Acciones" class="admin-row-actions">
              ${this._btn('Editar receta', '', 'fa-pen', `window.AdminView._openRecipeEditor(${r.menuItemPortionId})`)}
              ${this._btn('Calcular', 'kds-btn--primary', 'fa-calculator',
                `window.AdminView._showMarginCalc(${r.cost || 0}, ${r.price || 0})`)}
            </td>
          </tr>
        `;
      }).join('');
      recipesHtml = this._table(['Producto', 'Porción', 'Costo', 'Precio', 'Margen', '% Margen', 'Acciones'], rows);
    }

    // Resumen por producto (incluye los que no tienen receta)
    let summaryHtml = '';
    if (costSummary.length > 0) {
      const rows = costSummary.map(s => {
        const portions = s.portions || [];
        if (portions.length === 0) {
          return `
            <tr>
              <td data-label="Producto">${this._escape(s.menuItemName)}</td>
              <td data-label="Grupo">${this._escape(s.groupCode || '—')}</td>
              <td data-label="Porciones" class="admin-num">—</td>
              <td data-label="Estado"><span class="admin-tag admin-tag--info">Sin receta</span></td>
              <td data-label="Acciones" class="admin-row-actions">
                ${this._btn('Crear receta', 'kds-btn--primary', 'fa-plus',
                  `window.AdminView._openRecipeEditorForMenuItem(${s.menuItemId})`)}
              </td>
            </tr>
          `;
        }
        const firstPortion = portions[0];
        const hasRecipe = firstPortion.hasRecipe;
        const marginPct = firstPortion.marginPct;
        const marginClass = !hasRecipe ? ''
          : Number(marginPct) < 30 ? 'admin-num--danger'
          : Number(marginPct) < 60 ? 'admin-num--warning'
          : 'admin-num--success';
        const portionId = firstPortion.portionId || firstPortion.Id;
        return `
          <tr>
            <td data-label="Producto">${this._escape(s.menuItemName)}</td>
            <td data-label="Grupo">${this._escape(s.groupCode || '—')}</td>
            <td data-label="Porciones" class="admin-num">${portions.length}</td>
            <td data-label="Estado">
              ${hasRecipe
                ? `<span class="admin-tag admin-tag--success">Con receta</span>`
                : `<span class="admin-tag admin-tag--info">Sin receta</span>`}
            </td>
            <td data-label="Acciones" class="admin-row-actions">
              ${hasRecipe && portionId
                ? this._btn('Editar receta', '', 'fa-pen', `window.AdminView._openRecipeEditor(${portionId})`)
                : this._btn('Crear receta', 'kds-btn--primary', 'fa-plus', `window.AdminView._openRecipeEditorForMenuItem(${s.menuItemId})`)}
            </td>
          </tr>
        `;
      }).join('');
      summaryHtml = `
        <h3 class="admin-section-title">Resumen de costos por producto</h3>
        ${this._table(['Producto', 'Grupo', 'Porciones', 'Estado', 'Acciones'], rows)}
      `;
    }

    this._setContent(
      this._header('Recetas y costos', calcBtn + newBtn) +
      '<h3 class="admin-section-title">Recetas definidas</h3>' +
      recipesHtml +
      summaryHtml
    );
  },

  /**
   * Abre el editor de receta para una porción específica.
   * Si la porción ya tiene receta, carga los items existentes; si no, abre en blanco.
   */
  async _openRecipeEditor(menuItemPortionId) {
    this._showModal('Editar receta', '<p class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando receta...</p>');
    let recipeData = null, ingredients = [], units = [];
    try {
      const [recRes, ingRes, unitRes] = await Promise.all([
        Api.request('GET', '/recipes/by-portion/' + menuItemPortionId),
        Api.request('GET', '/inventory/ingredients').catch(() => ({ data: [] })),
        Api.request('GET', '/inventory/units').catch(() => ({ data: [] })),
      ]);
      recipeData = recRes.data;
      ingredients = ingRes.data || [];
      units = unitRes.data || [];
      this._ingredientsCache = ingredients;
      this._unitsCache = units;
    } catch (err) {
      this._error('No se puede cargar la receta: ' + (err.message || err));
      this._closeModal();
      return;
    }
    const menuItemName = recipeData?.menuItem?.Name || '(producto)';
    const portionName = recipeData?.portion?.Name || '(porción)';
    const price = Number(recipeData?.price || 0);
    const items = recipeData?.items || [];
    const fixedCost = Number(recipeData?.recipe?.FixedCost || 0);

    const ingOpts = ingredients
      .map(i => `<option value="${i.Id}" data-unit="${this._escape(i.BaseUnitCode || '')}">${this._escape(i.Name)} (${this._escape(i.Code || '—')})</option>`)
      .join('');
    const unitOpts = units
      .map(u => `<option value="${u.Id}">${this._escape(u.Code || u.Name || '')}</option>`)
      .join('');

    const itemsHtml = items.length === 0
      ? this._recipeRowHtml(ingOpts, unitOpts, '', '1', '')
      : items.map(it => this._recipeRowHtml(ingOpts, unitOpts, it.IngredientId, it.Quantity, it.UnitCode)).join('');

    const html = `
      <div class="admin-recipe-header">
        <strong>${this._escape(menuItemName)}</strong> · Porción: ${this._escape(portionName)} · Precio: ${this._formatMoney(price)}
      </div>
      <form id="recipe-form" onsubmit="return false;">
        <div class="admin-recipe-items" id="recipe-items">${itemsHtml}</div>
        ${this._btn('Agregar ingrediente', '', 'fa-plus', "window.AdminView._addRecipeRow()")}
        <label class="admin-field admin-field--inline">
          <span>Costo fijo:</span>
          <input type="number" id="recipe-fixed-cost" step="0.01" min="0" value="${fixedCost}">
        </label>
        <p class="admin-note">
          <i class="fa-solid fa-circle-info"></i> El costo total se calcula al guardar.
          ${recipeData?.cost !== undefined ? `Costo actual: <strong>${this._formatMoney(recipeData.cost)}</strong>` : ''}
        </p>
        <div class="admin-modal-actions">
          ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
          ${this._btn('Guardar receta', 'kds-btn--primary', 'fa-check', `window.AdminView._saveRecipe(${menuItemPortionId})`)}
        </div>
      </form>
    `;
    this._showModal('Editar receta · ' + menuItemName, html);
  },

  _recipeRowHtml(ingOpts, unitOpts, selectedIng, qty, selectedUnitCode) {
    const ingSelect = ingOpts.replace(`value="${selectedIng}"`,
      `value="${selectedIng}" selected`);
    // Para las unidades, intentamos preseleccionar por código; si no, dejamos la primera
    let unitSelect = unitOpts;
    if (selectedUnitCode) {
      unitSelect = unitSelect.replace(`>${selectedUnitCode}<`,
        ` selected>${selectedUnitCode}<`);
    }
    return `
      <div class="admin-recipe-row">
        <select class="recipe-ing">${ingSelect}</select>
        <input type="number" class="recipe-qty" step="0.001" min="0" value="${qty || ''}" placeholder="Cantidad">
        <select class="recipe-unit">${unitSelect}</select>
        ${this._btn('Quitar', 'kds-btn--void', 'fa-xmark', "this.parentElement.remove()")}
      </div>
    `;
  },

  _addRecipeRow() {
    const container = document.getElementById('recipe-items');
    if (!container) return;
    const ingredients = this._ingredientsCache || [];
    const units = this._unitsCache || [];
    const ingOpts = ingredients
      .map(i => `<option value="${i.Id}">${this._escape(i.Name)} (${this._escape(i.Code || '—')})</option>`)
      .join('');
    const unitOpts = units
      .map(u => `<option value="${u.Id}">${this._escape(u.Code || u.Name || '')}</option>`)
      .join('');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this._recipeRowHtml(ingOpts, unitOpts, '', '', '');
    container.appendChild(tempDiv.firstElementChild);
  },

  async _saveRecipe(menuItemPortionId) {
    const rows = document.querySelectorAll('#recipe-items .admin-recipe-row');
    const items = [];
    for (const r of rows) {
      const ingredientId = parseInt(r.querySelector('.recipe-ing').value, 10);
      const quantity = parseFloat(r.querySelector('.recipe-qty').value);
      const unitId = parseInt(r.querySelector('.recipe-unit').value, 10);
      if (isNaN(ingredientId)) continue; // fila vacía
      if (isNaN(quantity) || quantity <= 0) {
        this._toast('Cantidad inválida para un ingrediente', 'warn');
        return;
      }
      if (isNaN(unitId)) {
        this._toast('Unidad inválida para un ingrediente', 'warn');
        return;
      }
      items.push({ ingredientId, quantity, unitId });
    }
    const fixedCost = parseFloat(document.getElementById('recipe-fixed-cost').value) || 0;
    try {
      await Api.request('POST', '/recipes/by-portion/' + menuItemPortionId, {
        items,
        fixedCost,
      });
      this._toast('Receta guardada', 'success');
      this._closeModal();
      await this._renderRecipes();
    } catch (err) {
      this._error('No se puede guardar la receta: ' + (err.message || err));
    }
  },

  /**
   * Atajo: cuando un producto no tiene receta, abrimos un selector de porción
   * antes de invocar al editor.
   */
  async _openRecipeEditorForMenuItem(menuItemId) {
    this._showModal('Cargando porciones...', '<p class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando porciones...</p>');
    try {
      const res = await Api.request('GET', '/recipes/by-menu-item/' + menuItemId);
      const data = res.data;
      const portions = data?.portions || [];
      if (portions.length === 0) {
        this._toast('El producto no tiene porciones definidas', 'warn');
        this._closeModal();
        return;
      }
      if (portions.length === 1) {
        this._closeModal();
        this._openRecipeEditor(portions[0].portion.Id);
        return;
      }
      const opts = portions.map(p => {
        const portionId = p.portion.Id;
        const hasRecipe = p.hasRecipe;
        const tag = hasRecipe ? '<span class="admin-tag admin-tag--success">con receta</span>' : '<span class="admin-tag admin-tag--info">nueva</span>';
        return `<option value="${portionId}">${this._escape(p.portion.Name)} ${tag}</option>`;
      }).join('');
      const html = `
        <p class="admin-note">El producto tiene varias porciones. Elegí cuál editar:</p>
        <label class="admin-field">
          <span>Porción *</span>
          <select id="rec-portion">${opts}</select>
        </label>
        <div class="admin-modal-actions">
          ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
          ${this._btn('Editar receta', 'kds-btn--primary', 'fa-pen', "window.AdminView._openRecipeEditorFromPicker()")}
        </div>
      `;
      this._showModal('Elegir porción · ' + (data?.menuItem?.Name || ''), html);
    } catch (err) {
      this._error('No se pueden cargar las porciones: ' + (err.message || err));
      this._closeModal();
    }
  },

  _openRecipeEditorFromPicker() {
    const portionId = parseInt(document.getElementById('rec-portion').value, 10);
    if (!isNaN(portionId)) this._openRecipeEditor(portionId);
  },

  _newRecipe() {
    // Pide al usuario el ID del producto para el cual crear la receta.
    const html = `
      <p class="admin-note">Ingresá el ID del producto para el cual querés crear o editar la receta:</p>
      <label class="admin-field">
        <span>ID del producto *</span>
        <input type="number" id="new-rec-menuItemId" min="1" placeholder="Ej: 1">
      </label>
      <div class="admin-modal-actions">
        ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
        ${this._btn('Continuar', 'kds-btn--primary', 'fa-arrow-right', "window.AdminView._newRecipeContinue()")}
      </div>
    `;
    this._showModal('Nueva receta', html);
  },

  _newRecipeContinue() {
    const menuItemId = parseInt(document.getElementById('new-rec-menuItemId').value, 10);
    if (isNaN(menuItemId) || menuItemId <= 0) {
      this._toast('Ingresá un ID válido', 'warn');
      return;
    }
    this._openRecipeEditorForMenuItem(menuItemId);
  },

  /**
   * Muestra el cálculo de margen. Si recibe cost+price, los usa; si no,
   * pide al usuario que los ingrese manualmente.
   */
  _showMarginCalc(cost, price) {
    const c = cost === undefined ? '' : cost;
    const p = price === undefined ? '' : price;
    const html = `
      <form id="margin-form" onsubmit="return false;">
        <div class="admin-row">
          <label class="admin-field">
            <span>Costo</span>
            <input type="number" id="mar-cost" step="0.01" min="0" value="${c}" placeholder="0.00">
          </label>
          <label class="admin-field">
            <span>Precio</span>
            <input type="number" id="mar-price" step="0.01" min="0" value="${p}" placeholder="0.00">
          </label>
        </div>
        <div class="admin-modal-actions">
          ${this._btn('Calcular', 'kds-btn--primary', 'fa-calculator', "window.AdminView._doMarginCalc()")}
        </div>
        <div id="margin-result"></div>
      </form>
    `;
    this._showModal('Calcular margen', html);
    if (c !== '' && p !== '') this._doMarginCalc();
  },

  async _doMarginCalc() {
    const cost = parseFloat(document.getElementById('mar-cost').value);
    const price = parseFloat(document.getElementById('mar-price').value);
    if (isNaN(cost) || isNaN(price)) {
      this._toast('Ingresá costo y precio válidos', 'warn');
      return;
    }
    let result;
    try {
      const res = await Api.request('POST', '/recipes/calc-margin', { cost, price });
      result = res.data;
    } catch (err) {
      // Cálculo local si la API no está disponible
      const margin = price - cost;
      const marginPct = price > 0 ? (margin / price) * 100 : 0;
      const markupPct = cost > 0 ? (margin / cost) * 100 : 0;
      result = { cost, price, margin, marginPct, markupPct };
    }
    const marginClass = result.marginPct < 30 ? 'admin-num--danger'
      : result.marginPct < 60 ? 'admin-num--warning'
      : 'admin-num--success';
    const html = `
      <div class="admin-margin-result">
        <div class="admin-margin-row"><span>Costo:</span><span>${this._formatMoney(result.cost)}</span></div>
        <div class="admin-margin-row"><span>Precio:</span><span>${this._formatMoney(result.price)}</span></div>
        <div class="admin-margin-row"><span>Margen:</span><span class="admin-num">${this._formatMoney(result.margin)}</span></div>
        <div class="admin-margin-row"><span>% Margen:</span><span class="admin-num ${marginClass}">${this._formatPercent(result.marginPct)}</span></div>
        <div class="admin-margin-row"><span>% Markup:</span><span class="admin-num">${this._formatPercent(result.markupPct)}</span></div>
      </div>
    `;
    const resEl = document.getElementById('margin-result');
    if (resEl) resEl.innerHTML = html;
  },

  // ===================================================================
  // Tab 4: IMPRESORAS
  // ===================================================================

  async _renderPrinters() {
    this._loading('Cargando impresoras...');
    let printers = [], areas = [], rules = [];
    try {
      const [pRes, aRes, rRes] = await Promise.all([
        Api.request('GET', '/printers').catch(() => ({ data: [] })),
        Api.request('GET', '/print/areas/list').catch(() => ({ data: [] })),
        Api.request('GET', '/print/routing-rules/list').catch(() => ({ data: [] })),
      ]);
      printers = pRes.data || [];
      areas = aRes.data || [];
      rules = rRes.data || [];
    } catch (err) {
      this._error('No se pueden cargar las impresoras: ' + (err.message || err));
    }
    const newBtn = this._btn('Nueva impresora', 'kds-btn--primary', 'fa-plus', "window.AdminView._newPrinter()");
    const areaName = (id) => {
      const a = areas.find(x => x.Id === id);
      return a ? (a.DisplayName || a.Name) : '—';
    };
    // Tabla de impresoras
    let printersHtml;
    if (printers.length === 0) {
      printersHtml = '<p class="admin-empty">No hay impresoras configuradas. Hacé clic en "Nueva impresora" para crear una.</p>';
    } else {
      const rows = printers.map(pr => {
        const isActive = pr.IsActive === 1 || pr.IsActive === true;
        const statusTag = isActive
          ? '<span class="admin-tag admin-tag--success">Activa</span>'
          : '<span class="admin-tag admin-tag--danger">Inactiva</span>';
        const share = pr.ShareName || '—';
        return `
          <tr>
            <td data-label="Nombre">${this._escape(pr.Name)}</td>
            <td data-label="Conexión (IP:puerto)"><code>${this._escape(share)}</code></td>
            <td data-label="Área">${this._escape(areaName(pr.PrintAreaId))}</td>
            <td data-label="Estado">${statusTag}</td>
            <td data-label="Acciones" class="admin-row-actions">
              ${this._btn('Probar', 'kds-btn--primary', 'fa-print', `window.AdminView._testPrinter(${pr.Id})`)}
              ${this._btn('Estado', '', 'fa-signal', `window.AdminView._checkPrinterStatus(${pr.Id})`)}
              ${isActive
                ? this._btn('Desactivar', 'kds-btn--void', 'fa-power-off', `window.AdminView._togglePrinter(${pr.Id}, false)`)
                : this._btn('Activar', '', 'fa-power-off', `window.AdminView._togglePrinter(${pr.Id}, true)`)}
            </td>
          </tr>
        `;
      }).join('');
      printersHtml = this._table(['Nombre', 'Conexión (IP:puerto)', 'Área', 'Estado', 'Acciones'], rows);
    }

    // Áreas de impresión
    let areasHtml;
    if (areas.length === 0) {
      areasHtml = '<p class="admin-empty">Sin áreas de impresión configuradas.</p>';
    } else {
      const arows = areas.map(a => `
        <tr>
          <td data-label="Nombre">${this._escape(a.DisplayName || a.Name)}</td>
          <td data-label="Código">${this._escape(a.Name)}</td>
          <td data-label="Tipo">${this._escape(a.AreaType || '—')}</td>
          <td data-label="Color"><span class="admin-color-swatch" style="background:${this._escape(a.Color || '#2196f3')}"></span> ${this._escape(a.Color || '—')}</td>
          <td data-label="Estado">${a.IsActive ? '<span class="admin-tag admin-tag--success">Activa</span>' : '<span class="admin-tag admin-tag--danger">Inactiva</span>'}</td>
        </tr>
      `).join('');
      areasHtml = this._table(['Nombre', 'Código', 'Tipo', 'Color', 'Estado'], arows);
    }

    // Reglas de routing
    let rulesHtml;
    if (rules.length === 0) {
      rulesHtml = '<p class="admin-empty">Sin reglas de routing configuradas. Las impresiones usarán la regla DEFAULT.</p>';
    } else {
      const rrows = rules.map(r => `
        <tr>
          <td data-label="Tipo">${this._escape(r.RuleType)}</td>
          <td data-label="Match">${this._escape(r.MatchValue || '—')}</td>
          <td data-label="Área destino">${this._escape(areaName(r.PrintAreaId))}</td>
          <td data-label="Impresora">${this._escape(printers.find(p => p.Id === r.PrinterId)?.Name || '—')}</td>
          <td data-label="Prioridad" class="admin-num">${r.Priority || 0}</td>
        </tr>
      `).join('');
      rulesHtml = this._table(['Tipo de regla', 'Match', 'Área destino', 'Impresora', 'Prioridad'], rrows);
    }

    this._setContent(
      this._header('Impresoras', newBtn) +
      '<h3 class="admin-section-title">Impresoras configuradas</h3>' +
      printersHtml +
      '<h3 class="admin-section-title">Áreas de impresión</h3>' +
      areasHtml +
      '<h3 class="admin-section-title">Reglas de routing</h3>' +
      rulesHtml
    );
  },

  _newPrinter() {
    const html = `
      <form id="printer-form" onsubmit="return false;">
        <label class="admin-field">
          <span>Nombre *</span>
          <input type="text" id="prn-name" required placeholder="Ej: Cocina Barra" autocomplete="off">
        </label>
        <label class="admin-field">
          <span>Conexión (host:puerto) *</span>
          <input type="text" id="prn-share" required placeholder="192.168.1.50:9100" autocomplete="off">
        </label>
        <div class="admin-row">
          <label class="admin-field">
            <span>Caracteres/línea</span>
            <input type="number" id="prn-cpl" value="42" min="1" max="80">
          </label>
          <label class="admin-field">
            <span>Code page</span>
            <input type="number" id="prn-codepage" value="857" min="0" max="9999">
          </label>
        </div>
        <label class="admin-field admin-field--inline">
          <input type="checkbox" id="prn-active" checked>
          <span>Activa</span>
        </label>
        <p class="admin-note"><i class="fa-solid fa-circle-info"></i> Para asignar área e impresora a reglas de routing, editá la base de datos o usá la API de áreas después de crear la impresora.</p>
        <div class="admin-modal-actions">
          ${this._btn('Cancelar', '', '', "window.AdminView._closeModal()")}
          ${this._btn('Crear impresora', 'kds-btn--primary', 'fa-check', "window.AdminView._savePrinter()")}
        </div>
      </form>
    `;
    this._showModal('Nueva impresora', html);
  },

  async _savePrinter() {
    const name = document.getElementById('prn-name').value.trim();
    const shareName = document.getElementById('prn-share').value.trim();
    const charsPerLine = parseInt(document.getElementById('prn-cpl').value, 10) || 42;
    const codePage = parseInt(document.getElementById('prn-codepage').value, 10) || 857;
    const isActive = document.getElementById('prn-active').checked;
    if (!name) { this._toast('El nombre es obligatorio', 'warn'); return; }
    if (!shareName) { this._toast('La conexión (host:puerto) es obligatoria', 'warn'); return; }
    try {
      await Api.request('POST', '/printers', {
        name, shareName, charsPerLine, codePage, isActive,
      });
      this._toast('Impresora creada', 'success');
      this._closeModal();
      await this._renderPrinters();
    } catch (err) {
      this._error('No se puede crear la impresora: ' + (err.message || err));
    }
  },

  async _testPrinter(id) {
    this._toast('Enviando test print...', 'info');
    try {
      const res = await Api.request('POST', '/printers/' + id + '/test');
      const job = res.data;
      this._toast('Test print enviado (job #' + job.jobId + ', estado: ' + job.status + ')', 'success');
    } catch (err) {
      this._error('No se pudo enviar el test: ' + (err.message || err));
    }
  },

  async _checkPrinterStatus(id) {
    try {
      const res = await Api.request('GET', '/printers/' + id + '/status');
      const s = res.data;
      const online = s.online;
      const msg = online
        ? 'Impresora "' + (s.printerName || id) + '" ONLINE — ' + (s.latency || 0) + 'ms'
        : 'Impresora "' + (s.printerName || id) + '" OFFLINE — ' + (s.error || 'sin respuesta');
      this._toast(msg, online ? 'success' : 'warn');
    } catch (err) {
      this._error('No se puede verificar el estado: ' + (err.message || err));
    }
  },

  async _togglePrinter(id, makeActive) {
    try {
      await Api.request('PATCH', '/printers/' + id, { IsActive: makeActive ? 1 : 0 });
      this._toast(makeActive ? 'Impresora activada' : 'Impresora desactivada', 'success');
      await this._renderPrinters();
    } catch (err) {
      this._error('No se puede cambiar el estado: ' + (err.message || err));
    }
  },

  // ===================================================================
  // Tab: PLANTILLAS (BLOQUE F — Fase 6: editor de templates)
  // ===================================================================

  async _renderTemplates() {
    this._loading('Cargando plantillas de impresión...');
    let templates = [];
    try {
      const res = await Api.request('GET', '/print/templates/list?includeInactive=true');
      templates = res.data || [];
    } catch (err) {
      this._error('No se pueden cargar las plantillas: ' + (err.message || err));
      return;
    }

    const newBtn = this._btn('Nueva plantilla', 'kds-btn--primary', 'fa-plus', "window.AdminView._newTemplate()");

    const typeLabels = {
      RECEIPT: 'Recibo',
      KITCHEN_ORDER: 'Comanda cocina',
      TEST: 'Prueba',
      CUSTOM: 'Personalizada',
    };
    const typeBadge = (t) => `<span class="admin-tag admin-tag--info">${this._escape(typeLabels[t] || t)}</span>`;

    let html;
    if (templates.length === 0) {
      html = `<p class="admin-empty">No hay plantillas configuradas. Hacé clic en "Nueva plantilla" para crear una.</p>`;
    } else {
      const rows = templates.map(t => {
        const isActive = t.IsActive === 1 || t.IsActive === true;
        const statusTag = isActive
          ? '<span class="admin-tag admin-tag--success">Activa</span>'
          : '<span class="admin-tag admin-tag--danger">Inactiva</span>';
        return `
          <tr>
            <td data-label="Nombre">${this._escape(t.Name)}</td>
            <td data-label="Tipo">${typeBadge(t.TemplateType)}</td>
            <td data-label="Descripción">${this._escape(t.Description || '—')}</td>
            <td data-label="Estado">${statusTag}</td>
            <td data-label="Acciones" class="admin-row-actions">
              ${this._btn('Editar', 'kds-btn--primary', 'fa-edit', `window.AdminView._editTemplate(${t.Id})`)}
              ${this._btn('Vista previa', '', 'fa-eye', `window.AdminView._previewTemplate(${t.Id})`)}
              ${isActive
                ? this._btn('Desactivar', 'kds-btn--void', 'fa-power-off', `window.AdminView._toggleTemplate(${t.Id}, false)`)
                : this._btn('Activar', '', 'fa-power-off', `window.AdminView._toggleTemplate(${t.Id}, true)`)}
            </td>
          </tr>
        `;
      }).join('');
      const tableHtml = this._table(['Nombre', 'Tipo', 'Descripción', 'Estado', 'Acciones'], rows);
      html = `
        <div class="admin-section">
          <div class="admin-section__header">
            <h2><i class="fa-solid fa-file-lines"></i> Plantillas de impresión</h2>
            ${newBtn}
          </div>
          <p class="admin-help">
            Las plantillas definen cómo se formatean los recibos y comandas de cocina antes de enviarse a la impresora.
            Tipos: <strong>Recibo</strong> (ticket cliente), <strong>Comanda cocina</strong> (KDS), <strong>Prueba</strong> (test), <strong>Personalizada</strong>.
          </p>
          ${tableHtml}
        </div>
      `;
    }
    this._setContent(html);
  },

  _newTemplate() {
    this._showTemplateModal(null);
  },

  async _editTemplate(id) {
    try {
      const res = await Api.request('GET', `/print/templates/${id}`);
      this._showTemplateModal(res.data);
    } catch (err) {
      this._error('No se pudo cargar la plantilla: ' + (err.message || err));
    }
  },

  _showTemplateModal(existing) {
    const isEdit = !!existing;
    const t = existing || { Name: '', TemplateType: 'RECEIPT', Description: '', Template: '', MergeLines: 0 };
    const body = `
      <div class="admin-form">
        <label class="admin-field">
          <span>Nombre</span>
          <input type="text" id="tpl-name" value="${this._escape(t.Name)}" placeholder="Ej: Recibo con logo">
        </label>
        <label class="admin-field">
          <span>Tipo</span>
          <select id="tpl-type">
            <option value="RECEIPT" ${t.TemplateType === 'RECEIPT' ? 'selected' : ''}>Recibo (cliente)</option>
            <option value="KITCHEN_ORDER" ${t.TemplateType === 'KITCHEN_ORDER' ? 'selected' : ''}>Comanda de cocina</option>
            <option value="TEST" ${t.TemplateType === 'TEST' ? 'selected' : ''}>Prueba de impresora</option>
            <option value="CUSTOM" ${t.TemplateType === 'CUSTOM' ? 'selected' : ''}>Personalizada</option>
          </select>
        </label>
        <label class="admin-field">
          <span>Descripción</span>
          <input type="text" id="tpl-desc" value="${this._escape(t.Description || '')}" placeholder="Notas internas">
        </label>
        <label class="admin-field">
          <span>Plantilla (texto con marcadores)</span>
          <textarea id="tpl-body" rows="10" style="font-family: monospace; font-size: 12px;" placeholder="Marcadores disponibles:&#10;{header} {ticket_number} {date} {separator}&#10;{orders} {items} {totals} {footer}">${this._escape(t.Template || '')}</textarea>
        </label>
        <div class="admin-form-actions">
          <button class="kds-btn kds-btn--primary" onclick="window.AdminView._saveTemplate(${isEdit ? existing.Id : 'null'})">
            <i class="fa-solid fa-save"></i> Guardar
          </button>
          <button class="kds-btn" onclick="window.AdminView._closeModal()">Cancelar</button>
        </div>
      </div>
    `;
    this._showModal(isEdit ? 'Editar plantilla' : 'Nueva plantilla', body);
  },

  async _saveTemplate(id) {
    const name = document.getElementById('tpl-name').value.trim();
    const templateType = document.getElementById('tpl-type').value;
    const description = document.getElementById('tpl-desc').value.trim();
    const template = document.getElementById('tpl-body').value;
    if (!name) {
      this._error('El nombre es obligatorio');
      return;
    }
    try {
      if (id) {
        await Api.request('PATCH', `/print/templates/${id}`, { name, templateType, description, template });
        this.toast('Plantilla actualizada', 'success');
      } else {
        await Api.request('POST', '/print/templates', { name, templateType, description, template });
        this.toast('Plantilla creada', 'success');
      }
      this._closeModal();
      await this._renderTemplates();
    } catch (err) {
      this._error('No se pudo guardar: ' + (err.message || err));
    }
  },

  async _previewTemplate(id) {
    try {
      const res = await Api.request('POST', `/print/templates/${id}/preview`);
      const data = res.data;
      const hex = data.bytesHex || '';
      const previewHex = hex.slice(0, 400);
      const body = `
        <div class="admin-form">
          <p><strong>Tipo:</strong> ${this._escape(data.templateType)}</p>
          <p><strong>Bytes generados:</strong> ${data.bytesLength}</p>
          <p><strong>Datos de muestra:</strong></p>
          <pre style="background: var(--lba-bg-hover); padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto;">${this._escape(JSON.stringify(data.sampleData, null, 2))}</pre>
          <p><strong>ESC/POS (hex, primeros 200 bytes):</strong></p>
          <pre style="background: var(--lba-bg-hover); padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto; word-break: break-all;">${this._escape(previewHex)}${hex.length > 400 ? '...' : ''}</pre>
          <div class="admin-form-actions">
            <button class="kds-btn" onclick="window.AdminView._closeModal()">Cerrar</button>
          </div>
        </div>
      `;
      this._showModal('Vista previa de plantilla', body);
    } catch (err) {
      this._error('No se pudo generar la vista previa: ' + (err.message || err));
    }
  },

  async _toggleTemplate(id, makeActive) {
    try {
      await Api.request('PATCH', `/print/templates/${id}`, { isActive: makeActive });
      this.toast(makeActive ? 'Plantilla activada' : 'Plantilla desactivada', 'success');
      await this._renderTemplates();
    } catch (err) {
      this._error('No se pudo cambiar el estado: ' + (err.message || err));
    }
  },

  // ===================================================================
  // Tab: CAJA (BLOQUE L — Fase 12: UI de caja con apertura/cierre/payout)
  // ===================================================================

  async _renderCash() {
    this._loading('Cargando estado de caja…');
    let sessions = [];
    try {
      const res = await Api.request('GET', '/api/cash-sessions?limit=10');
      sessions = res.data || [];
    } catch (err) {
      this._error('No se pueden cargar las sesiones de caja: ' + (err.message || err));
      return;
    }

    const openSession = sessions.find(s => s.Status === 'OPEN');
    const newBtn = openSession
      ? ''
      : this._btn('Abrir caja', 'kds-btn--primary', 'fa-cash-register', "window.AdminView._openCash()");

    let html = `
      <div class="admin-section">
        <div class="admin-section__header">
          <h2><i class="fa-solid fa-cash-register"></i> Sesiones de Caja</h2>
          ${newBtn}
        </div>
    `;

    if (openSession) {
      html += `
        <div class="admin-card" style="border-left: 4px solid var(--lba-success, #4CAF50);">
          <h3><i class="fa-solid fa-circle-check"></i> Caja Abierta</h3>
          <div class="admin-card-grid">
            <div><span>Sesión:</span> <strong>#${openSession.Id}</strong></div>
            <div><span>Apertura:</span> <strong>${this._escape(openSession.OpenedAt || '—')}</strong></div>
            <div><span>Monto inicial:</span> <strong>$${Number(openSession.OpeningAmount || 0).toFixed(2)}</strong></div>
            <div><span>Usuario:</span> <strong>${this._escape(openSession.OpenedByName || '—')}</strong></div>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            ${this._btn('Cerrar caja', 'kds-btn--void', 'fa-lock', `window.AdminView._closeCash(${openSession.Id})`)}
          </div>
        </div>
      `;
    } else {
      html += '<p class="admin-empty">No hay sesión de caja abierta. Hacé clic en "Abrir caja" para comenzar.</p>';
    }

    // Tabla de sesiones recientes
    if (sessions.length > 0) {
      const rows = sessions.map(s => {
        const statusBadge = s.Status === 'OPEN'
          ? '<span class="admin-tag admin-tag--success">Abierta</span>'
          : s.Status === 'CLOSED'
          ? '<span class="admin-tag admin-tag--info">Cerrada</span>'
          : '<span class="admin-tag admin-tag--danger">' + this._escape(s.Status) + '</span>';
        return `
          <tr>
            <td data-label="ID">#${s.Id}</td>
            <td data-label="Estado">${statusBadge}</td>
            <td data-label="Apertura">${this._escape(s.OpenedAt || '—')}</td>
            <td data-label="Cierre">${this._escape(s.ClosedAt || '—')}</td>
            <td data-label="Inicial">$${Number(s.OpeningAmount || 0).toFixed(2)}</td>
            <td data-label="Final">${s.ClosingAmount != null ? '$' + Number(s.ClosingAmount).toFixed(2) : '—'}</td>
          </tr>
        `;
      }).join('');
      html += this._table(['ID', 'Estado', 'Apertura', 'Cierre', 'Inicial', 'Final'], rows);
    }

    html += '</div>';
    this._setContent(html);
  },

  async _openCash() {
    const amount = prompt('Monto inicial de caja:', '0');
    if (amount === null) return;
    try {
      await Api.request('POST', '/api/cash-sessions', { openingAmount: parseFloat(amount) || 0 });
      this._toast('Caja abierta', 'success');
      await this._renderCash();
    } catch (err) {
      this._error('No se pudo abrir la caja: ' + (err.message || err));
    }
  },

  async _closeCash(sessionId) {
    const amount = prompt('Monto final contado:', '0');
    if (amount === null) return;
    try {
      await Api.request('POST', `/api/cash-sessions/${sessionId}/close`, { closingAmount: parseFloat(amount) || 0 });
      this._toast('Caja cerrada', 'success');
      await this._renderCash();
    } catch (err) {
      this._error('No se pudo cerrar la caja: ' + (err.message || err));
    }
  },

  // ===================================================================
  // Tab: REPORTES (BLOQUE L — Fase 12: UI de reportes con selector de período)
  // ===================================================================

  async _renderReports() {
    this._loading('Cargando reportes…');

    // Default: today
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = this._reportFromDate || today;
    const toDate = this._reportToDate || today;

    // Fetch summary report
    let reportData = null;
    try {
      const res = await Api.request('GET', `/reports/sales-summary?from=${fromDate}&to=${toDate}`);
      reportData = res.data;
    } catch (err) {
      // If endpoint not available, show placeholder
      console.warn('[reports] No se pudo cargar el reporte:', err.message);
    }

    const dateSelector = `
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
        <label>Desde: <input type="date" id="rpt-from" value="${fromDate}" onchange="window.AdminView._setReportDates()"></label>
        <label>Hasta: <input type="date" id="rpt-to" value="${toDate}" onchange="window.AdminView._setReportDates()"></label>
        ${this._btn('Generar', 'kds-btn--primary', 'fa-magnifying-glass', "window.AdminView._renderReports()")}
      </div>
    `;

    let reportCard;
    if (reportData) {
      const r = reportData;
      reportCard = `
        <div class="admin-card">
          <h3><i class="fa-solid fa-chart-line"></i> Resumen de Ventas (${fromDate} → ${toDate})</h3>
          <div class="admin-stats-grid">
            <div class="admin-stat admin-stat--success">
              <div class="admin-stat__num">$${Number(r.totalSales || 0).toFixed(2)}</div>
              <div class="admin-stat__label">Ventas totales</div>
            </div>
            <div class="admin-stat">
              <div class="admin-stat__num">${r.ticketCount || 0}</div>
              <div class="admin-stat__label">Tickets cerrados</div>
            </div>
            <div class="admin-stat">
              <div class="admin-stat__num">$${Number(r.averageTicket || 0).toFixed(2)}</div>
              <div class="admin-stat__label">Ticket promedio</div>
            </div>
            <div class="admin-stat admin-stat--danger">
              <div class="admin-stat__num">${r.voidedCount || 0}</div>
              <div class="admin-stat__label">Tickets anulados</div>
            </div>
            <div class="admin-stat admin-stat--warn">
              <div class="admin-stat__num">${r.refundedCount || 0}</div>
              <div class="admin-stat__label">Tickets reembolsados</div>
            </div>
          </div>
        </div>
      `;
    } else {
      reportCard = `
        <div class="admin-card">
          <h3><i class="fa-solid fa-chart-line"></i> Resumen de Ventas</h3>
          <p class="admin-empty">Selecciona un rango de fechas y haz clic en "Generar" para ver el reporte.</p>
        </div>
      `;
    }

    // Fetch top products
    let topProductsCard = '';
    try {
      const res = await Api.request('GET', `/reports/top-products?from=${fromDate}&to=${toDate}&limit=10`);
      const products = res.data || [];
      if (products.length > 0) {
        const rows = products.map(p => `
          <tr>
            <td data-label="Producto">${this._escape(p.name || p.Name || '—')}</td>
            <td data-label="Cantidad">${p.quantity || p.Quantity || 0}</td>
            <td data-label="Total">$${Number(p.total || p.Total || 0).toFixed(2)}</td>
          </tr>
        `).join('');
        topProductsCard = `
          <div class="admin-card">
            <h3><i class="fa-solid fa-trophy"></i> Top 10 Productos</h3>
            ${this._table(['Producto', 'Cantidad', 'Total'], rows)}
          </div>
        `;
      }
    } catch {}

    this._setContent(
      this._header('Reportes', '') +
      `<div class="admin-section">${dateSelector}${reportCard}${topProductsCard}</div>`
    );
  },

  _setReportDates() {
    const fromEl = document.getElementById('rpt-from');
    const toEl = document.getElementById('rpt-to');
    if (fromEl) this._reportFromDate = fromEl.value;
    if (toEl) this._reportToDate = toEl.value;
  },

  // ===================================================================
  // Tab 5: CONFIGURACIÓN
  // ===================================================================

  async _renderConfig() {
    this._loading('Cargando estado del sistema...');

    // Versión (endpoint raíz, no /api/version → fetch directo)
    let version = null;
    try {
      const r = await fetch('/version');
      if (r.ok) version = await r.json();
    } catch { /* ignora */ }

    // Estadísticas de cola de impresión
    let printStats = null;
    try {
      const res = await Api.request('GET', '/print/stats/list');
      printStats = res.data;
    } catch (err) {
      this._toast('No se pueden cargar estadísticas de cola: ' + (err.message || err), 'warn');
    }

    // Impresoras (para mostrar estado online/offline)
    let printers = [];
    try {
      const res = await Api.request('GET', '/printers');
      printers = res.data || [];
    } catch { /* ignora */ }

    // WebSocket desde el store
    const wsConnected = !!(window.store && window.store.state && window.store.state.wsConnected);
    const wsState = wsConnected
      ? '<span class="admin-tag admin-tag--success">Conectado</span>'
      : '<span class="admin-tag admin-tag--danger">Desconectado</span>';

    // Tarjeta de versión
    const versionCard = version ? `
      <div class="admin-card">
        <h3><i class="fa-solid fa-server"></i> Estado del sistema</h3>
        <div class="admin-card-grid">
          <div><span>Aplicación:</span> <strong>${this._escape(version.name)}</strong></div>
          <div><span>Versión:</span> <strong>${this._escape(version.version)}</strong></div>
          <div><span>Node.js:</span> <code>${this._escape(version.node)}</code></div>
          <div><span>Uptime:</span> <strong>${this._formatUptime(version.uptime)}</strong></div>
        </div>
      </div>
    ` : `
      <div class="admin-card">
        <h3><i class="fa-solid fa-server"></i> Estado del sistema</h3>
        <p class="admin-empty">No se pudo obtener la información de versión del backend.</p>
      </div>
    `;

    // Tarjeta WebSocket
    const wsCard = `
      <div class="admin-card">
        <h3><i class="fa-solid fa-tower-broadcast"></i> WebSocket (tiempo real)</h3>
        <div class="admin-card-grid">
          <div><span>Estado:</span> ${wsState}</div>
          <div><span>Indicador:</span>
            <span id="cfg-conn-indicator">${wsConnected ? 'Conectado' : 'Desconectado'}</span>
          </div>
        </div>
      </div>
    `;

    // Tarjeta de impresoras (estado)
    let printersCard;
    if (printers.length === 0) {
      printersCard = `
        <div class="admin-card">
          <h3><i class="fa-solid fa-print"></i> Estado de impresoras</h3>
          <p class="admin-empty">No hay impresoras configuradas.</p>
        </div>
      `;
    } else {
      const rows = printers.map(pr => {
        const isActive = pr.IsActive === 1 || pr.IsActive === true;
        return `
          <tr>
            <td data-label="Nombre">${this._escape(pr.Name)}</td>
            <td data-label="Conexión"><code>${this._escape(pr.ShareName || '—')}</code></td>
            <td data-label="Activación">${isActive
              ? '<span class="admin-tag admin-tag--success">Activa</span>'
              : '<span class="admin-tag admin-tag--danger">Inactiva</span>'}</td>
            <td data-label="En línea" id="prn-status-${pr.Id}">
              <span class="admin-tag admin-tag--info">Verificando…</span>
            </td>
            <td data-label="Acción">
              ${this._btn('Revisar', '', 'fa-signal', `window.AdminView._checkPrinterStatusInline(${pr.Id})`)}
            </td>
          </tr>
        `;
      }).join('');
      printersCard = `
        <div class="admin-card">
          <h3><i class="fa-solid fa-print"></i> Estado de impresoras (${printers.length})</h3>
          ${this._table(['Nombre', 'Conexión', 'Activación', 'En línea', 'Acción'], rows)}
        </div>
      `;
    }

    // Tarjeta de cola de impresión
    let queueCard;
    if (!printStats) {
      queueCard = `
        <div class="admin-card">
          <h3><i class="fa-solid fa-list-check"></i> Cola de impresión</h3>
          <p class="admin-empty">No se pudo cargar el estado de la cola.</p>
        </div>
      `;
    } else {
      const byStatus = printStats.byStatus || {};
      const pending = printStats.pending || 0;
      const retryReady = printStats.retryReady || 0;
      const failed = byStatus.FAILED || 0;
      const retrying = byStatus.RETRYING || 0;
      const printed = byStatus.PRINTED || 0;
      const cancelled = byStatus.CANCELLED || 0;
      const printing = byStatus.PRINTING || 0;
      queueCard = `
        <div class="admin-card">
          <h3><i class="fa-solid fa-list-check"></i> Cola de impresión</h3>
          <div class="admin-stats-grid">
            <div class="admin-stat${pending > 0 ? ' admin-stat--warn' : ''}">
              <div class="admin-stat__num">${pending}</div>
              <div class="admin-stat__label">Pendientes</div>
            </div>
            <div class="admin-stat${retrying > 0 ? ' admin-stat--warn' : ''}">
              <div class="admin-stat__num">${retrying}</div>
              <div class="admin-stat__label">Reintentando</div>
            </div>
            <div class="admin-stat${retryReady > 0 ? ' admin-stat--info' : ''}">
              <div class="admin-stat__num">${retryReady}</div>
              <div class="admin-stat__label">Listos para reintentar</div>
            </div>
            <div class="admin-stat${printing > 0 ? ' admin-stat--info' : ''}">
              <div class="admin-stat__num">${printing}</div>
              <div class="admin-stat__label">Imprimiendo</div>
            </div>
            <div class="admin-stat admin-stat--success">
              <div class="admin-stat__num">${printed}</div>
              <div class="admin-stat__label">Impresos</div>
            </div>
            <div class="admin-stat${failed > 0 ? ' admin-stat--danger' : ''}">
              <div class="admin-stat__num">${failed}</div>
              <div class="admin-stat__label">Fallidos</div>
            </div>
            <div class="admin-stat">
              <div class="admin-stat__num">${cancelled}</div>
              <div class="admin-stat__label">Cancelados</div>
            </div>
          </div>
        </div>
      `;
    }

    const refreshBtn = this._btn('Actualizar', 'kds-btn--primary', 'fa-rotate', "window.AdminView._renderConfig()");

    // Tarjeta PWA (BLOQUE G — Fase 7: install prompt visible)
    const pwaCard = this._renderPwaCard();

    // Tarjeta Push (BLOQUE H — Fase 8: UX activación)
    const pushCard = await this._renderPushCard();

    this._setContent(
      this._header('Configuración', refreshBtn) +
      versionCard + wsCard + pwaCard + pushCard + printersCard + queueCard
    );

    // Verificación asíncrona del estado online de cada impresora
    for (const pr of printers) {
      this._checkPrinterStatusInline(pr.Id);
    }
  },

  /**
   * Renderiza la tarjeta Push con información de suscripción.
   * BLOQUE H — Fase 8: P0 gap "Tab Notificaciones en Admin/Config con botón activar".
   *
   * Usa window.PushClient (cargado por push.js) para:
   *   - Mostrar el botón "Activar notificaciones" si no está suscrito
   *   - Mostrar el estado de suscripción (activo/inactivo)
   *   - Enviar una notificación de prueba
   *   - Listar suscripciones y historial de notificaciones
   */
  async _renderPushCard() {
    // Obtener el estado de suscripción del usuario actual
    let pushStatus = null;
    try {
      const res = await Api.request('GET', '/push/status');
      pushStatus = res.data;
    } catch (err) {
      // Si falla, mostrar error pero no bloquear el render
      console.warn('[push] No se pudo obtener el estado:', err.message);
    }

    if (!pushStatus) {
      return `
        <div class="admin-card">
          <h3><i class="fa-solid fa-bell"></i> Notificaciones Push</h3>
          <p class="admin-empty">No se pudo cargar el estado de notificaciones.</p>
        </div>
      `;
    }

    let statusBadge;
    if (pushStatus.subscribed) {
      statusBadge = '<span class="admin-tag admin-tag--success">Activada ✓</span>';
    } else if (!pushStatus.vapidConfigured) {
      statusBadge = '<span class="admin-tag admin-tag--danger">VAPID no configurado</span>';
    } else {
      statusBadge = '<span class="admin-tag admin-tag--warn">No activada</span>';
    }

    let actionButton = '';
    if (pushStatus.vapidConfigured && !pushStatus.subscribed) {
      actionButton = `
        <div style="margin-top: 12px;">
          ${this._btn('Activar notificaciones', 'kds-btn--primary', 'fa-bell', "window.AdminView._pushActivate()")}
        </div>
      `;
    } else if (pushStatus.subscribed) {
      actionButton = `
        <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
          ${this._btn('Enviar test', '', 'fa-paper-plane', "window.AdminView._pushTest()")}
          ${this._btn('Desactivar', 'kds-btn--void', 'fa-bell-slash', "window.AdminView._pushDeactivate()")}
        </div>
      `;
    }

    return `
      <div class="admin-card">
        <h3><i class="fa-solid fa-bell"></i> Notificaciones Push</h3>
        <div class="admin-card-grid">
          <div><span>Estado:</span> ${statusBadge}</div>
          <div><span>Suscripciones activas:</span> <strong>${pushStatus.subscriptionCount || 0}</strong></div>
          <div><span>VAPID:</span> <code>${pushStatus.vapidConfigured ? 'Configurado' : 'No configurado'}</code></div>
          <div><span>Categorías:</span> <code>${pushStatus.categories || '—'}</code></div>
        </div>
        ${actionButton}
        <p class="admin-help" style="margin-top: 8px;">
          Las notificaciones push permiten recibir alertas (pedidos nuevos, stock bajo, impresión fallida)
          incluso cuando la pestaña del navegador está cerrada. Requiere permiso del navegador.
        </p>
      </div>
    `;
  },

  /**
   * Activa las notificaciones push para el usuario actual.
   * Llama a PushClient.requestPermission() que solicita permiso + suscribe.
   */
  async _pushActivate() {
    const pushClient = window.PushClient;
    if (!pushClient) {
      this._toast('Módulo push no disponible', 'error');
      return;
    }
    if (!('Notification' in window)) {
      this._toast('Este navegador no soporta notificaciones', 'error');
      return;
    }
    this._toast('Solicitando permiso de notificaciones…', 'info');
    try {
      const granted = await pushClient.requestPermission();
      if (granted) {
        this._toast('Notificaciones activadas', 'success');
      } else {
        this._toast('Permiso denegado por el usuario', 'warn');
      }
    } catch (err) {
      this._toast('Error al activar: ' + (err.message || err), 'error');
    }
    // Re-render para actualizar el estado
    await this._renderConfig();
  },

  /**
   * Desactiva las notificaciones push para el usuario actual.
   */
  async _pushDeactivate() {
    try {
      const pushClient = window.PushClient;
      if (pushClient && pushClient._subscription) {
        await pushClient.unsubscribe();
      }
      this._toast('Notificaciones desactivadas', 'info');
    } catch (err) {
      this._toast('Error al desactivar: ' + (err.message || err), 'error');
    }
    await this._renderConfig();
  },

  /**
   * Envía una notificación push de prueba al usuario actual.
   */
  async _pushTest() {
    this._toast('Enviando notificación de prueba…', 'info');
    try {
      const res = await Api.request('POST', '/push/test', {});
      if (res.sent > 0) {
        this._toast(`Notificación enviada (${res.sent} enviadas, ${res.failed} fallidas)`, 'success');
      } else if (res.expired > 0) {
        this._toast(`Suscripción expirada (${res.expired})`, 'warn');
      } else {
        this._toast('No se pudo enviar (0 enviadas)', 'warn');
      }
    } catch (err) {
      this._toast('Error: ' + (err.message || err), 'error');
    }
  },

  _renderPwaCard() {
    const pwa = window.SambaPWA;
    if (!pwa) {
      return `
        <div class="admin-card">
          <h3><i class="fa-solid fa-mobile-screen"></i> Aplicación (PWA)</h3>
          <p class="admin-empty">El módulo PWA no está cargado.</p>
        </div>
      `;
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    let swStatus = '<span class="admin-tag admin-tag--info">Verificando…</span>';
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        const el = document.getElementById('pwa-sw-status');
        if (!el) return;
        if (!reg) {
          el.innerHTML = '<span class="admin-tag admin-tag--danger">No registrado</span>';
        } else if (reg.waiting) {
          el.innerHTML = '<span class="admin-tag admin-tag--warn">Actualización disponible</span>';
        } else {
          el.innerHTML = '<span class="admin-tag admin-tag--success">Registrado</span>';
        }
      }).catch(() => {
        const el = document.getElementById('pwa-sw-status');
        if (el) el.innerHTML = '<span class="admin-tag admin-tag--danger">Error</span>';
      });
    }

    let installButtonHtml;
    if (isStandalone) {
      installButtonHtml = `
        <div class="admin-card-grid">
          <div><span>Estado:</span> <strong>Instalada como PWA ✓</strong></div>
          <div><span>Modo:</span> <code>standalone</code></div>
        </div>
      `;
    } else if (pwa.canInstall) {
      installButtonHtml = `
        <div class="admin-card-grid">
          <div><span>Estado:</span> <strong>Listo para instalar</strong></div>
          <div><span>Modo:</span> <code>navegador</code></div>
        </div>
        <div style="margin-top: 12px;">
          ${this._btn('Instalar app', 'kds-btn--primary', 'fa-download', "window.AdminView._pwaInstall()")}
        </div>
      `;
    } else {
      installButtonHtml = `
        <div class="admin-card-grid">
          <div><span>Estado:</span> <strong>Ejecutándose en navegador</strong></div>
          <div><span>Modo:</span> <code>browser</code></div>
        </div>
        <p class="admin-help" style="margin-top: 8px;">
          Para instalar la app como PWA: en Chrome/Edge, abre el menú
          <i class="fa-solid fa-ellipsis-vertical"></i> → "Instalar SambaPos…".
          El botón "Instalar app" aparecerá aquí automáticamente cuando el
          navegador lo permita.
        </p>
      `;
    }

    return `
      <div class="admin-card">
        <h3><i class="fa-solid fa-mobile-screen"></i> Aplicación (PWA)</h3>
        ${installButtonHtml}
        <div class="admin-card-grid" style="margin-top: 12px;">
          <div><span>Service Worker:</span> <span id="pwa-sw-status">${swStatus}</span></div>
          <div><span>Manifest:</span> <code>/manifest.webmanifest</code></div>
        </div>
      </div>
    `;
  },

  async _pwaInstall() {
    const pwa = window.SambaPWA;
    if (!pwa) {
      this._toast('Módulo PWA no disponible', 'error');
      return;
    }
    this._toast('Iniciando instalación…', 'info');
    const installed = await pwa.promptInstall();
    if (installed) {
      this._toast('App instalada correctamente', 'success');
    } else {
      this._toast('Instalación cancelada o no disponible', 'warn');
    }
    await this._renderConfig();
  },

  /**
   * Verifica el estado de una impresora y actualiza la celda correspondiente
   * en la tabla de la pestaña de configuración.
   */
  async _checkPrinterStatusInline(id) {
    const cell = document.getElementById('prn-status-' + id);
    if (!cell) return;
    cell.innerHTML = '<span class="admin-tag admin-tag--info">Verificando…</span>';
    try {
      const res = await Api.request('GET', '/printers/' + id + '/status');
      const s = res.data;
      if (s.online) {
        cell.innerHTML = `<span class="admin-tag admin-tag--success">ONLINE · ${(s.latency || 0)}ms</span>`;
      } else {
        cell.innerHTML = `<span class="admin-tag admin-tag--danger">OFFLINE</span>`;
      }
    } catch (err) {
      cell.innerHTML = `<span class="admin-tag admin-tag--danger">Error</span>`;
    }
  },
};

// =====================================================================
// Bootstrap: inicializa AdminView al cargar el DOM y se registra en
// window.App.views para que los onclick inline del HTML funcionen.
// Usa setTimeout(0) para asegurarse de que App.init() ya haya corrido
// (app.js se carga después de admin.js y reemplaza this.views).
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    AdminView.init();
    if (window.App) {
      if (!window.App.views) window.App.views = {};
      window.App.views.admin = AdminView;
      // Auto-cargar la pestaña por defecto cuando se entra a la vista admin
      if (window.store) {
        window.store.subscribe((state, prev) => {
          if (state.currentView === 'admin' && prev && prev.currentView !== 'admin') {
            AdminView.load();
          }
        });
      }
    }
  }, 0);
});

window.AdminView = AdminView;
