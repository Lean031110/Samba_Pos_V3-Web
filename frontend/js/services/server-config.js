// =====================================================================
// server-config.js — Welcome + Server configuration for Android (LBApos)
// =====================================================================
// BLOQUE N redesign:
//   - null-safe from module load (FIX baseline §6: _config is loaded
//     immediately, so isConfigured()/getMode() never throw)
//   - Welcome screen (logo + LBApos + "POS de restaurante")
//   - Server URL + PROBAR + GUARDAR
//   - QR scan configuration (no credentials in QR — URL only)
//   - Device mode selection: POS / COCINA (KDS)
//   - Saved in localStorage ('samba_server_config')
// =====================================================================

const ServerConfig = {
  // Load config immediately at module creation (null-safe by design).
  _config: (function loadInitial() {
    try {
      const raw = localStorage.getItem('samba_server_config');
      return raw ? JSON.parse(raw) : { serverUrl: '', mode: '', configured: false };
    } catch (e) {
      return { serverUrl: '', mode: '', configured: false };
    }
  })(),

  DEFAULT_CONFIG: { serverUrl: '', mode: '', configured: false },

  init() {
    this._loadConfig();
    if (!this._config.configured) {
      this.show();
    }
  },

  _loadConfig() {
    try {
      const raw = localStorage.getItem('samba_server_config');
      this._config = raw ? JSON.parse(raw) : { ...this.DEFAULT_CONFIG };
    } catch (e) {
      this._config = { ...this.DEFAULT_CONFIG };
    }
  },

  _saveConfig() {
    localStorage.setItem('samba_server_config', JSON.stringify(this._config));
  },

  getConfig() { return this._config || { ...this.DEFAULT_CONFIG }; },
  getServerUrl() { return (this._config && this._config.serverUrl) || ''; },

  // FIX baseline: never throws when _config is null/undefined
  getMode() { return (this._config && this._config.mode) || 'pos'; },

  isConfigured() {
    return !!(this._config && this._config.configured && this._config.serverUrl);
  },

  // -------------------------------------------------------------------
  // Welcome + configuration screen
  // -------------------------------------------------------------------
  show() {
    const existing = document.getElementById('server-config-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'server-config-overlay';
    overlay.className = 'sc-overlay';

    overlay.innerHTML = `
      <div class="sc-card">
        <div class="sc-brand">
          <img src="/assets/logo-login.png" alt="LBApos" class="sc-logo"
               onerror="this.style.display='none'">
          <h1 class="sc-title">LBApos</h1>
          <p class="sc-subtitle">POS de restaurante</p>
        </div>

        <div class="sc-section">
          <label class="sc-label" for="sc-server-url">Servidor</label>
          <input type="text" id="sc-server-url" class="sc-input"
                 placeholder="http://192.168.1.104:3001" inputmode="url" autocomplete="off"
                 value="${this._escapeAttr(this._config.serverUrl || '')}">
          <div class="sc-row">
            <button type="button" id="sc-test-btn" class="sc-btn sc-btn--secondary">
              <i class="fa-solid fa-plug"></i> Probar
            </button>
            <button type="button" id="sc-qr-btn" class="sc-btn sc-btn--secondary">
              <i class="fa-solid fa-qrcode"></i> Escanear QR
            </button>
          </div>
          <div id="sc-test-result" class="sc-result" aria-live="polite"></div>
        </div>

        <div class="sc-section">
          <span class="sc-label">Tipo de dispositivo</span>
          <div class="sc-row sc-modes">
            <button type="button" id="sc-mode-pos" class="sc-mode is-active">
              <i class="fa-solid fa-cash-register"></i>
              <span class="sc-mode__name">POS</span>
              <span class="sc-mode__desc">Mesas · Pedidos · Cobro</span>
            </button>
            <button type="button" id="sc-mode-kitchen" class="sc-mode">
              <i class="fa-solid fa-utensils"></i>
              <span class="sc-mode__name">COCINA</span>
              <span class="sc-mode__desc">KDS · Pantalla de preparación</span>
            </button>
          </div>
        </div>

        <button type="button" id="sc-save-btn" class="sc-btn sc-btn--primary sc-btn--block">
          <i class="fa-solid fa-check"></i> Guardar y continuar
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedMode = this.getMode() === 'kitchen' ? 'kitchen' : 'pos';
    const posBtn = overlay.querySelector('#sc-mode-pos');
    const kitchenBtn = overlay.querySelector('#sc-mode-kitchen');
    const resultDiv = overlay.querySelector('#sc-test-result');

    const paintModes = () => {
      posBtn.classList.toggle('is-active', selectedMode === 'pos');
      kitchenBtn.classList.toggle('is-active', selectedMode === 'kitchen');
    };
    posBtn.addEventListener('click', () => { selectedMode = 'pos'; paintModes(); });
    kitchenBtn.addEventListener('click', () => { selectedMode = 'kitchen'; paintModes(); });

    const getUrl = () => overlay.querySelector('#sc-server-url').value.trim().replace(/\/$/, '');

    // Test connection
    overlay.querySelector('#sc-test-btn').addEventListener('click', async () => {
      const url = getUrl();
      if (!url) { resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-triangle-exclamation"></i> Ingresá una URL</span>'; return; }
      resultDiv.innerHTML = '<span class="sc-result--muted"><i class="fa-solid fa-spinner fa-spin"></i> Conectando…</span>';
      try {
        const res = await fetch(url + '/health', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          let status = 'ok';
          try { status = (await res.json()).status || 'ok'; } catch (e) { /* ignore */ }
          resultDiv.innerHTML = `<span class="sc-result--ok"><i class="fa-solid fa-circle-check"></i> Servidor disponible (${this._escapeHtml(status)})</span>`;
        } else {
          resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-circle-xmark"></i> Servidor responde con error</span>';
        }
      } catch (err) {
        resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-circle-xmark"></i> Servidor desconectado</span>';
      }
    });

    // QR scan
    overlay.querySelector('#sc-qr-btn').addEventListener('click', () => this._showQRScanner(overlay, resultDiv));

    // Save
    overlay.querySelector('#sc-save-btn').addEventListener('click', () => {
      const url = getUrl();
      if (!url) { resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-triangle-exclamation"></i> Ingresá una URL</span>'; return; }
      this._config.serverUrl = url;
      this._config.mode = selectedMode;
      this._config.configured = true;
      this._saveConfig();
      overlay.remove();
      window.location.reload();
    });
  },

  /**
   * QR scanner — reads the server URL (ONLY the URL; credentials are never
   * embedded in the QR, per spec §25).
   */
  _showQRScanner(overlay, resultDiv) {
    const applyUrl = (url) => {
      overlay.querySelector('#sc-server-url').value = url;
      resultDiv.innerHTML = `<span class="sc-result--ok"><i class="fa-solid fa-qrcode"></i> QR leído: ${this._escapeHtml(url)}</span>`;
    };

    if ('BarcodeDetector' in window) {
      this._scanWithBarcodeDetector(overlay, resultDiv, applyUrl);
      return;
    }

    // Fallback: paste the QR payload manually (URL or JSON {serverUrl})
    const raw = prompt('Pegá la URL del servidor o el contenido del QR:');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.serverUrl) return applyUrl(parsed.serverUrl);
    } catch (e) { /* not JSON — treat as plain URL */ }
    if (raw.startsWith('http')) applyUrl(raw.trim().replace(/\/$/, ''));
    else resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-circle-xmark"></i> QR no válido</span>';
  },

  async _scanWithBarcodeDetector(overlay, resultDiv, applyUrl) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.className = 'sc-video';
      video.srcObject = stream;
      video.autoplay = true;
      resultDiv.innerHTML = '';
      resultDiv.appendChild(video);
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const scan = async () => {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const text = codes[0].rawValue;
          stream.getTracks().forEach(t => t.stop());
          let url = text;
          try {
            const parsed = JSON.parse(text);
            if (parsed.serverUrl) url = parsed.serverUrl;
          } catch (e) { /* plain URL */ }
          if (String(url).startsWith('http')) { applyUrl(String(url).trim().replace(/\/$/, '')); return; }
          resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-circle-xmark"></i> El QR no contiene una URL de servidor</span>';
          return;
        }
        requestAnimationFrame(scan);
      };
      video.addEventListener('loadedmetadata', () => scan());
    } catch (err) {
      resultDiv.innerHTML = '<span class="sc-result--err"><i class="fa-solid fa-circle-xmark"></i> No se pudo acceder a la cámara. Usá entrada manual.</span>';
    }
  },

  /**
   * QR payload for admins to display (server URL only — no credentials).
   */
  generateQRData() {
    return JSON.stringify({ serverUrl: window.location.origin, version: 2 });
  },

  hide() {
    const overlay = document.getElementById('server-config-overlay');
    if (overlay) overlay.remove();
  },

  async checkConnection() {
    const url = this.getServerUrl();
    if (!url) return { online: false, error: 'No server configured' };
    try {
      const res = await fetch(url + '/health', { signal: AbortSignal.timeout(5000) });
      return { online: res.ok, status: res.status };
    } catch (err) {
      return { online: false, error: err.message };
    }
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  _escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },
};

window.ServerConfig = ServerConfig;
