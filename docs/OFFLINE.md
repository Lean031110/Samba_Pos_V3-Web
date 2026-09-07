# OFFLINE.md — Offline and LAN Support

## Current State

### What Works Offline (LAN without Internet)

- **All POS operations**: create tickets, add orders, payments, close, void, refund
- **KDS**: view orders, bump, serve, void, recall
- **Inventory**: stock balances, movements, recipes
- **Authentication**: JWT login (no external auth provider)
- **Realtime**: WebSocket sync between terminals
- **Printing**: TCP to network printers
- **Assets**: Font Awesome, Socket.io — all vendored locally

### What Does NOT Work Offline

- **Browser print fallback** to `window.print()` works but is not the primary method
- **No PWA service worker** — browser refresh loses state (except JWT in localStorage)
- **No offline queue** — if the server is down, operations fail immediately

## Assets (Vendored Locally)

All frontend assets are served from the same origin (no CDN):

| Asset | Path | Size |
|-------|------|------|
| Font Awesome 6.5.1 CSS | /vendor/css/fontawesome.min.css | 100 KB |
| Font Awesome webfonts | /vendor/webfonts/*.woff2, *.ttf | 600 KB |
| Socket.io 4.7.5 client | /vendor/js/socket.io.min.js | 49 KB |

No external dependencies. The system works on a completely isolated LAN.

## Connection Indicator

The header shows a colored dot:
- **Green** (is-connected): WebSocket connected
- **Orange pulsing** (is-reconnecting): Attempting reconnect
- **Red** (default): Disconnected

## Reconnection

Socket.io handles reconnection automatically:
- Initial delay: 1 second
- Max delay: 30 seconds
- Randomization factor: 0.3 (30% jitter)
- Infinite attempts

## Resync on Reconnect

When the WebSocket reconnects:
1. Client emits `resync` event
2. Server responds with current state:
   - Open tickets
   - Tables
3. Client updates the store
4. Client re-joins role rooms (`role:pos`, `role:admin`, `role:kitchen`)
5. Real-time events resume

## Future: PWA (Not Yet Implemented)

Planned but not implemented:
- Service worker for app shell caching
- Web App Manifest (`manifest.webmanifest`)
- Offline operation queue (for payments when server is down)
- Conflict resolution when syncing queued operations

**Important**: Payments should NEVER be processed offline. A payment requires server-side validation, ledger updates, and inventory deduction. Offline payments would risk double-charging and inconsistent state.
