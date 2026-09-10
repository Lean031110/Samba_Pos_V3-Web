// =====================================================================
// server-config.js — Server configuration screen for Android POS
// =====================================================================
// Punto 7-9 del prompt de auditoría:
//   - Pantalla inicial de configuración de servidor
//   - Configuración por QR
//   - Modo POS / Modo Cocina
//   - Reconexión automática
//
// Esta pantalla aparece cuando no hay servidor configurado.
// Guarda la configuración en localStorage.
// =====================================================================

const ServerConfig = {
  _config: null,

  // Default config
  DEFAULT_CONFIG: {
    serverUrl: '',
    mode: '', // 'pos' | 'kitchen'
    configured: false,
  },

  init() {
    this._loadConfig();
    // If not configured, show config screen
    if (!this._config.configured) {
      this.show();
    }
  },

  _loadConfig() {
    try {
      const raw = localStorage.getItem('samba_server_config');
      this._config = raw ? JSON.parse(raw) : { ...this.DEFAULT_CONFIG };
    } catch {
      this._config = { ...this.DEFAULT_CONFIG };
    }
  },

  _saveConfig() {
    localStorage.setItem('samba_server_config', JSON.stringify(this._config));
  },

  getConfig() {
    return this._config;
  },

  getServerUrl() {
    return this._config.serverUrl || '';
  },

  getMode() {
    return this._config.mode || 'pos';
  },

  isConfigured() {
    return this._config.configured && !!this._config.serverUrl;
  },

  /**
   * Show the server configuration screen.
   * Renders a full-screen overlay with:
   *   - Server URL input
   *   - "Probar conexión" button
   *   - "Guardar" button
   *   - "Configurar por QR" button
   *   - Mode selector: POS / Cocina
   */
  show() {
    // Remove existing overlay
    const existing = document.getElementById('server-config-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'server-config-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: var(--lba-blue-900, #044392);
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: white; border-radius: 16px; padding: 32px;
      max-width: 480px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;

    card.innerHTML = `
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="/assets/logo-login.png" alt="SambaPos" style="max-width: 120px; margin-bottom: 16px;"
             onerror="this.style.display='none'">
        <h1 style="color: #044392; font-size: 24px; margin: 0;">SambaPos_LBA</h1>
        <p style="color: #666; margin: 8px 0 0;">Configuración inicial del dispositivo</p>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px;">
          Servidor
        </label>
        <input type="text" id="sc-server-url" placeholder="http://192.168.1.104:3001"
               value="${this._config.serverUrl || ''}"
               style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;
                      font-size: 16px; box-sizing: border-box;">
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 20px;">
        <button id="sc-test-btn"
                style="flex: 1; padding: 12px; background: #e0e0e0; color: #333;
                       border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
          Probar conexión
        </button>
        <button id="sc-qr-btn"
                style="flex: 1; padding: 12px; background: #044392; color: white;
                       border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
          Configurar por QR
        </button>
      </div>

      <div id="sc-test-result" style="margin-bottom: 20px; font-size: 14px; text-align: center;"></div>

      <div style="margin-bottom: 24px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px;">
          Modo del dispositivo
        </label>
        <div style="display: flex; gap: 8px;">
          <button id="sc-mode-pos"
                style="flex: 1; padding: 16px; border: 2px solid ${this._config.mode === 'pos' || !this._config.mode ? '#044392' : '#ddd'};
                       border-radius: 8px; background: ${this._config.mode === 'pos' || !this._config.mode ? '#044392' : 'white'};
                       color: ${this._config.mode === 'pos' || !this._config.mode ? 'white' : '#333'};
                       font-size: 14px; font-weight: 600; cursor: pointer;">
            POS / Dependiente
          </button>
          <button id="sc-mode-kitchen"
                style="flex: 1; padding: 16px; border: 2px solid ${this._config.mode === 'kitchen' ? '#044392' : '#ddd'};
                       border-radius: 8px; background: ${this._config.mode === 'kitchen' ? '#044392' : 'white'};
                       color: ${this._config.mode === 'kitchen' ? 'white' : '#333'};
                       font-size: 14px; font-weight: 600; cursor: pointer;">
            Cocina / KDS
          </button>
        </div>
      </div>

      <button id="sc-save-btn"
              style="width: 100%; padding: 16px; background: #044392; color: white;
                     border: none; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer;">
        Guardar y continuar
      </button>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // State for mode selection
    let selectedMode = this._config.mode || 'pos';

    // Mode buttons
    const posBtn = document.getElementById('sc-mode-pos');
    const kitchenBtn = document.getElementById('sc-mode-kitchen');
    posBtn.addEventListener('click', () => {
      selectedMode = 'pos';
      posBtn.style.borderColor = '#044392';
      posBtn.style.background = '#044392';
      posBtn.style.color = 'white';
      kitchenBtn.style.borderColor = '#ddd';
      kitchenBtn.style.background = 'white';
      kitchenBtn.style.color = '#333';
    });
    kitchenBtn.addEventListener('click', () => {
      selectedMode = 'kitchen';
      kitchenBtn.style.borderColor = '#044392';
      kitchenBtn.style.background = '#044392';
      kitchenBtn.style.color = 'white';
      posBtn.style.borderColor = '#ddd';
      posBtn.style.background = 'white';
      posBtn.style.color = '#333';
    });

    // Test connection
    const testBtn = document.getElementById('sc-test-btn');
    const resultDiv = document.getElementById('sc-test-result');
    testBtn.addEventListener('click', async () => {
      const url = document.getElementById('sc-server-url').value.trim().replace(/\/$/, '');
      if (!url) {
        resultDiv.innerHTML = '<span style="color: #d32f2f;">⚠️ Ingresa una URL</span>';
        return;
      }
      resultDiv.innerHTML = '<span style="color: #666;">⏳ Conectando…</span>';
      try {
        const res = await fetch(url + '/health', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          resultDiv.innerHTML = `<span style="color: #4caf50;">✅ Servidor conectado (${data.status})</span>`;
        } else {
          resultDiv.innerHTML = '<span style="color: #d32f2f;">❌ Servidor responde pero con error</span>';
        }
      } catch (err) {
        resultDiv.innerHTML = '<span style="color: #d32f2f;">❌ Servidor desconectado</span>';
      }
    });

    // QR config — uses browser camera API
    const qrBtn = document.getElementById('sc-qr-btn');
    qrBtn.addEventListener('click', () => {
      this._showQRScanner();
    });

    // Save
    const saveBtn = document.getElementById('sc-save-btn');
    saveBtn.addEventListener('click', () => {
      const url = document.getElementById('sc-server-url').value.trim().replace(/\/$/, '');
      if (!url) {
        resultDiv.innerHTML = '<span style="color: #d32f2f;">⚠️ Ingresa una URL</span>';
        return;
      }
      this._config.serverUrl = url;
      this._config.mode = selectedMode;
      this._config.configured = true;
      this._saveConfig();
      overlay.remove();
      // Reload to apply config
      window.location.reload();
    });
  },

  /**
   * QR scanner — reads server URL from QR code.
   * Uses the browser's camera API (available in Android via Capacitor).
   */
  _showQRScanner() {
    const resultDiv = document.getElementById('sc-test-result');
    resultDiv.innerHTML = '<span style="color: #666;">📷 Escanea el QR del servidor…</span>';

    // Try to use the browser's native BarcodeDetector API
    if ('BarcodeDetector' in window) {
      this._scanWithBarcodeDetector();
      return;
    }

    // Fallback: prompt for manual QR input
    const qrInput = prompt('Pega el código QR del servidor (o usa entrada manual):');
    if (qrInput) {
      try {
        const config = JSON.parse(qrInput);
        if (config.serverUrl) {
          document.getElementById('sc-server-url').value = config.serverUrl;
          resultDiv.innerHTML = '<span style="color: #4caf50;">✅ QR leído: ' + config.serverUrl + '</span>';
        }
      } catch {
        // Maybe it's a plain URL
        if (qrInput.startsWith('http')) {
          document.getElementById('sc-server-url').value = qrInput;
          resultDiv.innerHTML = '<span style="color: #4caf50;">✅ URL leída del QR</span>';
        } else {
          resultDiv.innerHTML = '<span style="color: #d32f2f;">❌ QR no válido</span>';
        }
      }
    }
  },

  async _scanWithBarcodeDetector() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.style.cssText = 'width: 100%; max-width: 400px; border-radius: 8px; margin-top: 16px;';
      const resultDiv = document.getElementById('sc-test-result');
      resultDiv.innerHTML = '';
      resultDiv.appendChild(video);

      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const scan = async () => {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const text = codes[0].rawValue;
          stream.getTracks().forEach(t => t.stop());
          try {
            const config = JSON.parse(text);
            if (config.serverUrl) {
              document.getElementById('sc-server-url').value = config.serverUrl;
              resultDiv.innerHTML = '<span style="color: #4caf50;">✅ QR leído: ' + config.serverUrl + '</span>';
              return;
            }
          } catch {
            if (text.startsWith('http')) {
              document.getElementById('sc-server-url').value = text;
              resultDiv.innerHTML = '<span style="color: #4caf50;">✅ URL leída del QR</span>';
              return;
            }
          }
          resultDiv.innerHTML = '<span style="color: #d32f2f;">❌ QR no contiene configuración válida</span>';
          return;
        }
        requestAnimationFrame(scan);
      };
      video.addEventListener('loadedmetadata', () => scan());
    } catch (err) {
      const resultDiv = document.getElementById('sc-test-result');
      resultDiv.innerHTML = '<span style="color: #d32f2f;">❌ No se pudo acceder a la cámara. Usa entrada manual.</span>';
    }
  },

  /**
   * Generate a QR code for the current server config.
   * Called from the admin config page — the admin scans this with the tablet.
   */
  generateQRData() {
    return JSON.stringify({
      serverUrl: window.location.origin,
      version: 1,
    });
  },

  /**
   * Hide the config screen.
   */
  hide() {
    const overlay = document.getElementById('server-config-overlay');
    if (overlay) overlay.remove();
  },

  /**
   * Check if the server is reachable.
   */
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
};

window.ServerConfig = ServerConfig;
