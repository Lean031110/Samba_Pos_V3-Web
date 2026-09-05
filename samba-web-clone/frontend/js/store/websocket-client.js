// =====================================================================
// websocket-client.js — Socket.io client with exponential backoff
// =====================================================================
// Per Architect's directive:
//   "La conexión WebSocket debe establecerse automáticamente al cargar la
//    página y reconectarse si se cae (con backoff exponencial)."
//
// Subscribes to events from the backend's eventBus bridge:
//   - TicketCreated, TicketOpened, TicketClosing, TicketClosed
//   - TicketTotalChanged, OrderAdded, PaymentProcessed, EntityUpdated
//
// Each event updates the Store singleton, which then notifies subscribers.
// =====================================================================

// Load socket.io client from CDN
(function loadSocketIo(cb) {
  if (window.io) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js';
  s.onload = cb;
  s.onerror = () => console.error('[ws] Failed to load socket.io client');
  document.head.appendChild(s);
})(initWebSocket);

function initWebSocket() {
  const socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,        // 1s initial
    reconnectionDelayMax: 30000,    // cap at 30s
    randomizationFactor: 0.3,       // 30% jitter to avoid thundering herd
  });

  const connIndicator = document.getElementById('conn-indicator');
  const connLabel = document.getElementById('conn-label');

  function setConnState(state, label) {
    connIndicator.classList.remove('is-connected', 'is-reconnecting');
    if (state === 'connected') connIndicator.classList.add('is-connected');
    else if (state === 'reconnecting') connIndicator.classList.add('is-reconnecting');
    connLabel.textContent = label;
    window.store.setState({ wsConnected: state === 'connected' });
  }

  // === Connection lifecycle ===
  socket.on('connect',    () => { setConnState('connected', 'Connected');   console.log('[ws] connected'); });
  socket.on('disconnect', () => { setConnState('reconnecting', 'Reconnecting…'); console.warn('[ws] disconnected'); });
  socket.on('connect_error', (err) => { setConnState('reconnecting', 'Conn. error'); console.error('[ws] connect_error', err.message); });
  socket.on('reconnect_attempt', (n) => { setConnState('reconnecting', `Reconnect #${n}…`); });
  socket.on('reconnect', (n) => { setConnState('connected', `Reconnected (#${n})`); });

  // === Event handlers (bridge → Store) ===
  socket.on('TicketCreated',      (payload) => { window.store.setState({ openTickets: [...window.store.openTickets, payload.Ticket] }, 'TicketCreated'); });
  socket.on('TicketOpened',       (payload) => { console.log('[ws] TicketOpened', payload); });
  socket.on('TicketClosing',      (payload) => { console.log('[ws] TicketClosing', payload); });

  socket.on('TicketClosed', (payload) => {
    const closedId = payload?.Ticket?.Id;
    const newList = window.store.openTickets.filter(t => t.Id !== closedId);
    const isCurrent = window.store.currentTicket?.Id === closedId;
    window.store.setState({
      openTickets: newList,
      currentTicket: isCurrent ? null : window.store.currentTicket,
    }, 'TicketClosed');
    window.App.toast('Ticket #' + (payload?.Ticket?.TicketNumber || closedId) + ' closed', 'success');
  });

  socket.on('TicketTotalChanged', (payload) => {
    const t = payload?.Ticket;
    if (!t) return;
    // Update openTickets list
    const newList = window.store.openTickets.map(o => o.Id === t.Id ? t : o);
    // Update currentTicket if it's the one that changed
    const isCurrent = window.store.currentTicket?.Id === t.Id;
    window.store.setState({
      openTickets: newList,
      currentTicket: isCurrent ? t : window.store.currentTicket,
    }, 'TicketTotalChanged');
  });

  socket.on('OrderAdded', (payload) => {
    console.log('[ws] OrderAdded', payload);
    // The TicketTotalChanged event will follow with the updated ticket
  });

  socket.on('PaymentProcessed', (payload) => {
    console.log('[ws] PaymentProcessed', payload);
    window.App.toast('Payment processed: $' + (payload?.ProcessedAmount || 0).toFixed(2), 'success');
  });

  socket.on('EntityUpdated', (payload) => {
    // A table's state changed (e.g. another terminal opened a ticket on it)
    console.log('[ws] EntityUpdated', payload);
    // Reload tables list
    if (window.App?.views?.dashboard) {
      window.App.views.dashboard.refresh();
    }
  });

  // Expose for debugging
  window.socket = socket;
}
