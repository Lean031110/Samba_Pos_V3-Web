// =====================================================================
// websocket-client.js — Socket.io client with JWT auth + room management
// =====================================================================
// Per FASE 8: WebSocket must authenticate with JWT, join role-based
// rooms, and recover missed events on reconnect.
// =====================================================================

(function loadSocketIo(cb) {
  if (window.io) { cb(); return; }
  const s = document.createElement('script');
  s.src = '/vendor/js/socket.io.min.js';
  s.onload = cb;
  s.onerror = () => console.error('[ws] Failed to load socket.io client from local vendor');
  document.head.appendChild(s);
})(initWebSocket);

function initWebSocket() {
  const token = localStorage.getItem('samba_jwt') || '';
  if (!token) {
    console.warn('[ws] No JWT token — WebSocket will not connect until login');
    // Set up a retry: check every 3s for a token
    setTimeout(() => {
      if (localStorage.getItem('samba_jwt')) {
        initWebSocket();
      } else {
        // Try again in 3s
        setTimeout(initWebSocket, 3000);
      }
    }, 3000);
    return;
  }

  const socket = io({
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.3,
  });

  const connIndicator = document.getElementById('conn-indicator');
  const connLabel = document.getElementById('conn-label');

  function setConnState(state, label) {
    if (!connIndicator) return;
    connIndicator.classList.remove('is-connected', 'is-reconnecting');
    if (state === 'connected') connIndicator.classList.add('is-connected');
    else if (state === 'reconnecting') connIndicator.classList.add('is-reconnecting');
    connLabel.textContent = label;
    window.store.setState({ wsConnected: state === 'connected' });
  }

  // === Connection lifecycle ===
  socket.on('connect', () => {
    setConnState('connected', 'Connected');
    console.log('[ws] connected');

    // Join role-based rooms based on user info
    const user = window.store.state.currentUser;
    if (user) {
      // Join POS room by default (all logged-in terminals get POS events)
      socket.emit('subscribe:role', 'pos');
      // If admin, join admin room
      if (user.isAdmin) {
        socket.emit('subscribe:role', 'admin');
      }
      // Kitchen role is set explicitly when navigating to KDS view
    }

    // Request missed events / state resync
    socket.emit('resync', { lastEventId: window.store.state.lastEventId || null });
  });

  socket.on('disconnect', () => {
    setConnState('reconnecting', 'Reconnecting…');
    console.warn('[ws] disconnected');
  });
  socket.on('connect_error', (err) => {
    setConnState('reconnecting', 'Auth error');
    console.error('[ws] connect_error', err.message);
    // If auth failed (401), the token might be expired — redirect to login
    if (err.message?.includes('Invalid or expired')) {
      localStorage.removeItem('samba_jwt');
      if (window.App) window.App.navigate('login');
    }
  });
  socket.on('reconnect_attempt', (n) => { setConnState('reconnecting', `Reconnect #${n}…`); });
  socket.on('reconnect', (n) => {
    setConnState('connected', `Reconnected (#${n})`);
    // Re-join rooms after reconnect
    const user = window.store.state.currentUser;
    if (user) {
      socket.emit('subscribe:role', 'pos');
      if (user.isAdmin) socket.emit('subscribe:role', 'admin');
    }
    // Request state resync
    socket.emit('resync', {});
  });

  // === Resync response: server sends current state snapshot ===
  socket.on('resync:state', (snapshot) => {
    console.log('[ws] Received state resync:', snapshot);
    if (snapshot?.openTickets) {
      window.store.setState({ openTickets: snapshot.openTickets }, 'resync');
    }
    if (snapshot?.tables) {
      window.store.setState({ tables: snapshot.tables }, 'resync');
    }
  });

  // === Ticket events (POS terminals) ===
  socket.on('TicketCreated', (payload) => {
    window.store.setState({
      openTickets: [...(window.store.openTickets || []), payload.Ticket].filter((t, i, arr) => arr.findIndex(x => x.Id === t.Id) === i),
    }, 'TicketCreated');
  });

  socket.on('TicketClosed', (payload) => {
    const closedId = payload?.Ticket?.Id;
    const newList = (window.store.openTickets || []).filter(t => t.Id !== closedId);
    const isCurrent = window.store.currentTicket?.Id === closedId;
    window.store.setState({
      openTickets: newList,
      currentTicket: isCurrent ? null : window.store.currentTicket,
    }, 'TicketClosed');
    if (window.App?.toast) {
      window.App.toast('Ticket #' + (payload?.Ticket?.TicketNumber || closedId) + ' closed', 'success');
    }
  });

  socket.on('TicketTotalChanged', (payload) => {
    const t = payload?.Ticket;
    if (!t) return;
    const newList = (window.store.openTickets || []).map(o => o.Id === t.Id ? t : o);
    const isCurrent = window.store.currentTicket?.Id === t.Id;
    window.store.setState({
      openTickets: newList,
      currentTicket: isCurrent ? t : window.store.currentTicket,
    }, 'TicketTotalChanged');
  });

  socket.on('OrderAdded', (payload) => {
    // The TicketTotalChanged event will follow with the updated ticket
  });

  socket.on('PaymentProcessed', (payload) => {
    // Only show toast if this is NOT the current terminal's payment
    // (the current terminal already shows its own toast via the HTTP response)
    if (payload?.fromTerminal !== window.store.state.terminalId) {
      if (window.App?.toast) {
        window.App.toast('Payment processed: $' + (payload?.ProcessedAmount || 0).toFixed(2), 'info');
      }
    }
  });

  socket.on('EntityUpdated', (payload) => {
    if (window.App?.views?.dashboard) {
      window.App.views.dashboard.refresh();
    }
  });

  // === Kitchen events ===
  socket.on('KitchenOrderAdded', (payload) => {
    if (window.App?.views?.kitchen) {
      window.App.views.kitchen.addOrder(payload);
    }
  });

  socket.on('KitchenOrderUpdated', (payload) => {
    if (window.App?.views?.kitchen) {
      window.App.views.kitchen.updateOrder(payload);
    }
  });

  // Expose for debugging and for KDS view to use
  window.socket = socket;
}
