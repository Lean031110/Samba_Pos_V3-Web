/* =====================================================================
 * pwa.js — SambaPos_LBA PWA install handler
 * =====================================================================
 * Captures the `beforeinstallprompt` event so the app can show a custom
 * "Install SambaPos_LBA" UI instead of relying on the browser's implicit
 * mini-infobar. Also surfaces a 'sw:update-available' banner to let the
 * user activate a Service Worker update on demand.
 *
 * Exposes window.SambaPWA with:
 *   .canInstall     (boolean) — true if install prompt is available
 *   .promptInstall  ()        — triggers the native install prompt
 *   .onInstallState (cb)      — subscribe to canInstall changes
 *   .checkUpdate    ()        — checks for SW updates
 * ===================================================================== */
(function () {
  'use strict';

  const PWA = {
    _deferredPrompt: null,
    _listeners: [],

    canInstall: false,
    installed: false,

    onInstallState(cb) {
      this._listeners.push(cb);
      cb(this.canInstall);
    },

    _setCanInstall(v) {
      if (this.canInstall !== v) {
        this.canInstall = v;
        this._listeners.forEach((cb) => cb(v));
      }
    },

    async promptInstall() {
      if (!this._deferredPrompt) return false;
      this._deferredPrompt.prompt();
      const { outcome } = await this._deferredPrompt.userChoice;
      console.log('[PWA] install outcome:', outcome);
      this._deferredPrompt = null;
      this._setCanInstall(false);
      this.installed = (outcome === 'accepted');
      return this.installed;
    },

    checkUpdate() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update();
        });
      }
    },

    _init() {
      // Capture install prompt.
      window.addEventListener('beforeinstallprompt', (e) => {
        console.log('[PWA] beforeinstallprompt fired');
        e.preventDefault();
        this._deferredPrompt = e;
        this._setCanInstall(true);
      });

      window.addEventListener('appinstalled', () => {
        console.log('[PWA] appinstalled — installed as PWA');
        this.installed = true;
        this._setCanInstall(false);
      });

      // SW update available banner.
      window.addEventListener('sw:update-available', () => {
        this._showUpdateBanner();
      });
    },

    _showUpdateBanner() {
      if (document.querySelector('.sw-update-banner')) return;
      const banner = document.createElement('div');
      banner.className = 'sw-update-banner';
      banner.innerHTML = `
        <span>Nueva versión de SambaPos_LBA disponible.</span>
        <button id="sw-update-btn">Actualizar</button>
        <button id="sw-dismiss-btn" style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.4);">Más tarde</button>
      `;
      document.body.appendChild(banner);
      document.getElementById('sw-update-btn').addEventListener('click', () => {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg && reg.waiting) {
              reg.waiting.postMessage('SKIP_WAITING');
              setTimeout(() => window.location.reload(), 500);
            }
          });
        }
      });
      document.getElementById('sw-dismiss-btn').addEventListener('click', () => {
        banner.remove();
      });
    },
  };

  window.SambaPWA = PWA;
  PWA._init();
})();
