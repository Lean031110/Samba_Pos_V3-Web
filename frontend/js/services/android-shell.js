// =====================================================================
// android-shell.js — Capacitor Android shell detector + bridge
// =====================================================================
// Bloque 6 — Provides:
//
//   1. Device form-factor detection (phone | tablet | desktop)
//   2. OS detection (android | ios | web)
//   3. Orientation tracking (portrait | landscape)
//   4. Safe-area insets broadcast via CSS variables
//   5. Capacitor bridge integration (when window.Capacitor is available):
//        - Status bar color = brand blue
//        - Back button → window.App.navigate('back')
//        - Haptic feedback (vibrate on key POS actions)
//        - Network status (online/offline → store)
//   6. Boot splash handling (body.app-ready class)
//   7. Kiosk mode flag (for self-service kiosks)
//
// No external dependencies — falls back gracefully on web.
// =====================================================================

(function () {
  'use strict';

  const ANDROID_SHELL = {
    platform: 'web',          // web | android | ios
    formFactor: 'desktop',    // phone | tablet | desktop
    orientation: 'landscape',// portrait | landscape
    isKiosk: false,
    capacitor: null,          // Capacitor instance if available
    _initialized: false,
  };

  // -----------------------------------------------------------------
  // Detection
  // -----------------------------------------------------------------
  function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    if (window.Capacitor && window.Capacitor.isNative) {
      return window.Capacitor.getPlatform() === 'android' ? 'android' :
             window.Capacitor.getPlatform() === 'ios' ? 'ios' : 'web';
    }
    if (/android/.test(ua) && !window.MSStream) return 'android';
    if (/ipad|iphone|ipod/.test(ua) && !window.MSStream) return 'ios';
    return 'web';
  }

  function detectFormFactor() {
    const w = window.innerWidth;
    if (w < 600) return 'phone';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function detectOrientation() {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  // -----------------------------------------------------------------
  // Apply class flags to <html>
  // -----------------------------------------------------------------
  function applyFlags() {
    const html = document.documentElement;
    html.classList.toggle('is-android', ANDROID_SHELL.platform === 'android');
    html.classList.toggle('is-ios', ANDROID_SHELL.platform === 'ios');
    html.classList.toggle('is-tablet', ANDROID_SHELL.formFactor === 'tablet');
    html.classList.toggle('is-phone', ANDROID_SHELL.formFactor === 'phone');
    html.classList.toggle('is-desktop', ANDROID_SHELL.formFactor === 'desktop');
    html.classList.toggle('is-portrait', ANDROID_SHELL.orientation === 'portrait');
    html.classList.toggle('is-landscape', ANDROID_SHELL.orientation === 'landscape');
    html.classList.toggle('is-kiosk', ANDROID_SHELL.isKiosk);
    // Expose state
    window.ANDROID_SHELL = ANDROID_SHELL;
  }

  // -----------------------------------------------------------------
  // Capacitor integration
  // -----------------------------------------------------------------
  async function initCapacitor() {
    if (!window.Capacitor || !window.Capacitor.isNative) return;
    ANDROID_SHELL.capacitor = window.Capacitor;
    try {
      // StatusBar — brand blue
      const { StatusBar, Style } = await importCapacitorPlugin('@capacitor/status-bar');
      if (StatusBar) {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#044392' });
      }
    } catch (e) { /* StatusBar plugin not available */ }

    try {
      // App — back button
      const { App } = await importCapacitorPlugin('@capacitor/app');
      if (App) {
        App.addListener('backButton', ({ canGoBack }) => {
          // If user is in POS/KDS with an open ticket/modal, close that first
          const overlay = document.getElementById('modal-overlay');
          if (overlay && overlay.classList.contains('is-open')) {
            if (window.AdminView && typeof window.AdminView._closeModal === 'function') {
              window.AdminView._closeModal();
              return;
            }
          }
          if (window.App && typeof window.App.navigate === 'function') {
            // Try to go back to dashboard; if already there, exit
            const current = window.App._currentView;
            if (current === 'dashboard' || current === 'login') {
              if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
                window.Capacitor.Plugins.App.exitApp();
              }
            } else {
              window.App.navigate('dashboard');
            }
          }
        });
      }
    } catch (e) { /* App plugin not available */ }

    try {
      // Haptics
      const { Haptics, ImpactStyle } = await importCapacitorPlugin('@capacitor/haptics');
      if (Haptics) {
        ANDROID_SHELL.haptics = {
          light: () => Haptics.impact({ style: ImpactStyle.Light }),
          medium: () => Haptics.impact({ style: ImpactStyle.Medium }),
          success: () => Haptics.notification({ type: 'SUCCESS' }),
          error: () => Haptics.notification({ type: 'ERROR' }),
        };
        window.Haptics = ANDROID_SHELL.haptics;
      }
    } catch (e) { /* Haptics plugin not available */ }

    try {
      // Network status
      const { Network } = await importCapacitorPlugin('@capacitor/network');
      if (Network) {
        const status = await Network.getStatus();
        window.dispatchEvent(new CustomEvent('network:status', { detail: status }));
        Network.addListener('networkStatusChange', (s) => {
          window.dispatchEvent(new CustomEvent('network:status', { detail: s }));
        });
      }
    } catch (e) { /* Network plugin not available */ }
  }

  // Wrap dynamic import to suppress errors when plugin not installed
  function importCapacitorPlugin(name) {
    return new Promise((resolve) => {
      try {
        // Capacitor plugins are registered on window.Capacitor.Plugins
        if (window.Capacitor && window.Capacitor.Plugins) {
          const parts = name.replace('@capacitor/', '').split('/');
          let p = window.Capacitor.Plugins;
          for (const part of parts) {
            p = p && p[part.charAt(0).toUpperCase() + part.slice(1)];
          }
          resolve(p || {});
        } else {
          resolve({});
        }
      } catch (e) { resolve({}); }
    });
  }

  // -----------------------------------------------------------------
  // Resize listener — re-detect form factor on rotation/resize
  // -----------------------------------------------------------------
  function setupResize() {
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newForm = detectFormFactor();
        const newOrient = detectOrientation();
        if (newForm !== ANDROID_SHELL.formFactor || newOrient !== ANDROID_SHELL.orientation) {
          ANDROID_SHELL.formFactor = newForm;
          ANDROID_SHELL.orientation = newOrient;
          applyFlags();
          window.dispatchEvent(new CustomEvent('shell:form-change', {
            detail: { formFactor: newForm, orientation: newOrient },
          }));
        }
      }, 150);
    });
  }

  // -----------------------------------------------------------------
  // Boot splash
  // -----------------------------------------------------------------
  function markReady() {
    document.body.classList.add('app-ready');
  }

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------
  ANDROID_SHELL.init = async function () {
    if (this._initialized) return;
    this._initialized = true;
    this.platform = detectPlatform();
    this.formFactor = detectFormFactor();
    this.orientation = detectOrientation();
    applyFlags();
    setupResize();
    await initCapacitor();
    // Mark ready on next tick (after first paint)
    requestAnimationFrame(() => markReady());
    console.log('[AndroidShell] init:', this.platform, this.formFactor, this.orientation);
  };

  ANDROID_SHELL.setKiosk = function (enabled) {
    this.isKiosk = !!enabled;
    applyFlags();
  };

  // Vibrate wrapper — uses Haptics if available, falls back to navigator.vibrate
  ANDROID_SHELL.vibrate = function (pattern) {
    if (this.haptics && this.haptics.light) {
      this.haptics.light();
    } else if (navigator.vibrate) {
      navigator.vibrate(Array.isArray(pattern) ? pattern : 30);
    }
  };

  window.ANDROID_SHELL = ANDROID_SHELL;

  // Auto-init on DOMContentLoaded (or immediately if already loaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ANDROID_SHELL.init());
  } else {
    ANDROID_SHELL.init();
  }
})();
