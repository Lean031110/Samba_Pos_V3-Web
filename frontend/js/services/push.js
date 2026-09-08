// =====================================================================
// push.js — Web Push notification client (frontend)
// =====================================================================
// FASE 9 — Web Push notifications.
//
// This module:
//   - Requests notification permission from the user
//   - Subscribes to the PushManager with the VAPID public key
//   - Sends the subscription to the backend via /api/push/subscribe
//   - Polls /api/push/pending as a fallback when Web Push is not available
//   - Shows notifications via the Notifications API
//
// Usage:
//   PushClient.init();          // on app load
//   PushClient.requestPermission();  // on user gesture (button tap)
//   PushClient.subscribe();     // after permission granted
//   PushClient.startPolling();  // fallback if Push API not available
// =====================================================================

const PushClient = {
  _vapidPublicKey: null,
  _subscription: null,
  _pollInterval: null,

  async init() {
    // Check if Notifications API is available
    if (!('Notification' in window)) {
      console.log('[push] Notifications API not available');
      return;
    }

    // Check if Service Worker Push API is available
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[push] Push API not available — will use polling fallback');
      this.startPolling();
      return;
    }

    // If permission already granted, auto-subscribe
    if (Notification.permission === 'granted') {
      await this.subscribe();
    }
  },

  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await this.subscribe();
      return true;
    }
    return false;
  },

  async getVAPIDKey() {
    if (this._vapidPublicKey) return this._vapidPublicKey;
    try {
      const res = await fetch('/api/push/vapid-public-key', {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('samba_jwt') || '') },
      });
      if (!res.ok) return null;
      const json = await res.json();
      this._vapidPublicKey = json.data?.publicKey;
      return this._vapidPublicKey;
    } catch (err) {
      console.warn('[push] Could not get VAPID key:', err.message);
      return null;
    }
  },

  async subscribe() {
    try {
      const vapidKey = await this.getVAPIDKey();
      if (!vapidKey) {
        console.warn('[push] No VAPID key — using polling fallback');
        this.startPolling();
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Convert VAPID key to Uint8Array for subscribe()
        const key = this._urlBase64ToUint8Array(vapidKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        console.log('[push] New subscription created');
      } else {
        console.log('[push] Existing subscription found');
      }

      this._subscription = subscription;

      // Send subscription to backend
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('samba_jwt') || ''),
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
          categories: 'kitchen,printer,inventory,system',
        }),
      });
      console.log('[push] Subscription registered with backend');
    } catch (err) {
      console.warn('[push] Subscribe failed, using polling fallback:', err.message);
      this.startPolling();
    }
  },

  async unsubscribe() {
    if (this._subscription) {
      try {
        await this._subscription.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('samba_jwt') || ''),
          },
          body: JSON.stringify({ endpoint: this._subscription.endpoint }),
        });
        this._subscription = null;
        console.log('[push] Unsubscribed');
      } catch (err) {
        console.warn('[push] Unsubscribe failed:', err.message);
      }
    }
    this.stopPolling();
  },

  /**
   * Polling fallback — checks /api/push/pending every 30s for
   * notifications when the Push API is not available (e.g., iOS Safari).
   */
  startPolling() {
    if (this._pollInterval) return;
    console.log('[push] Starting polling fallback (30s interval)');
    this._pollInterval = setInterval(() => this._pollPending(), 30000);
    // Also poll immediately
    this._pollPending();
  },

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  async _pollPending() {
    if (!localStorage.getItem('samba_jwt')) return;
    try {
      const res = await fetch('/api/push/pending', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('samba_jwt') },
      });
      if (!res.ok) return;
      const json = await res.json();
      const notifications = json.data || [];
      for (const n of notifications) {
        this._showNotification(n.Title, n.Body, n.Icon, n.Url, n.Tag);
      }
    } catch (err) {
      // Silently fail — polling is best-effort
    }
  },

  _showNotification(title, body, icon, url, tag) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const n = new Notification(title, {
      body: body || '',
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/favicon.png',
      tag: tag || 'sambapos',
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      n.close();
    };
    // Auto-close after 10s
    setTimeout(() => n.close(), 10000);
  },

  /**
   * Convert base64url string to Uint8Array (for applicationServerKey).
   */
  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },
};

window.PushClient = PushClient;
