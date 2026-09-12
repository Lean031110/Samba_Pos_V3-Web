# OFFLINE.md — SambaPos_LBA Offline Capabilities

**Estado:** Documentación honesta de capacidades offline reales (Fase 4 batch 1 + auditoría Fase 14)
**Última actualización:** 2026-09-07

---

## Resumen

SambaPos_LBA tiene **dos niveles** de capacidades offline:

1. **Offline shell (PWA)** — la aplicación HTML/CSS/JS se carga desde el Service Worker cache incluso sin red. El formulario de login se muestra, pero **no se puede iniciar sesión** sin servidor (la autenticación valida contra la DB del backend).

2. **LAN sin internet** — todas las operaciones POS funcionan en una red local sin acceso a internet, porque todos los assets (Font Awesome, Socket.io, JS, CSS) están vendored localmente y el backend es self-contained.

**Lo que NO funciona:** operaciones transaccionales offline real (crear tickets, procesar pagos, modificar inventario) sin servidor. Esto requiere una cola offline (outbox + sync) que está planificada para una fase futura.

---

## Capacidades offline reales (verificadas)

### LAN sin internet (full POS operation)

- ✅ **Todas las operaciones POS**: crear tickets, agregar órdenes, pagos, cerrar, void, refund.
- ✅ **KDS**: ver órdenes, bump, serve, void, recall.
- ✅ **Inventario**: stock balances, movimientos, recetas, deducción automática al cerrar ticket.
- ✅ **Autenticación**: JWT login (no depende de proveedores externos como Google OAuth).
- ✅ **Tiempo real**: WebSocket sync entre terminales.
- ✅ **Impresión**: TCP a impresoras térmicas en la LAN.
- ✅ **Assets**: Font Awesome, Socket.io — todos servidos desde el mismo origen (no CDN).

### PWA offline shell (sin red)

- ✅ **Service Worker** (`frontend/sw.js`) cachea el app shell: HTML, CSS, JS, vendor assets.
- ✅ **Manifest** (`frontend/manifest.webmanifest`) permite "Agregar a pantalla de inicio".
- ✅ **Página offline** (`frontend/offline.html`) muestra mensaje branded "Sin conexión" con botón reintentar.
- ✅ **Reconexión WebSocket**: el cliente detecta `navigator.onLine` y reconecta automáticamente con backoff exponencial + heartbeat.

### Lo que NO funciona offline (honesto)

- ❌ **Crear tickets nuevos** — requiere validar departamento, mesa, generación de TicketNumber en el servidor.
- ❌ **Procesar pagos** — requiere transacción atómica en DB + descuento de inventario.
- ❌ **Modificar inventario** — cualquier POST/PUT/DELETE requiere servidor.
- ❌ **Login** — el formulario HTML se muestra (offline shell), pero la validación del PIN requiere consultar la DB del backend.
- ❌ **KDS con pedidos nuevos** — si la PWA ya estaba abierta y se pierde la red, el KDS sigue mostrando los pedidos que ya recibió vía WebSocket, pero los nuevos pedidos no llegarán hasta reconectar.

---

## Arquitectura offline (futuro)

La cola offline real (outbox + sync) está planificada pero NO implementada. El diseño sería:

```text
ONLINE
  ↓
User taps "Pay"
  ↓
POS sends POST /api/tickets/:id/payments
  ↓
Server processes (atomic: payment + inventory deduction + print job enqueue)
  ↓
Server responds 200 OK
  ↓
POS shows "Payment successful"

OFFLINE (server unreachable)
  ↓
User taps "Pay"
  ↓
POS detects offline → stores operation in IndexedDB outbox
  ↓
POS shows "Payment queued (will sync when online)"
  ↓
... network recovers ...
  ↓
Service Worker sync event fires
  ↓
SW replays outbox operations to server
  ↓
Server processes (idempotent — uses IdempotencyKey to dedupe)
  ↓
Server responds 200 OK
  ↓
POS marks operation as synced in IndexedDB
```

**Requisitos para implementar offline real:**
1. IndexedDB local queue de operaciones.
2. Operation UUID (idempotency key) por cada operación encolada.
3. Server ACK antes de marcar como synced.
4. Conflict policy (last-write-wins vs. server-wins).
5. Resync tras reconexión.
6. UI para ver cola offline (pendientes / sincronizados / fallidos).

**Estado:** No implementado. La infraestructura de idempotencia atómica (Fase 4) ya está lista para soportarlo cuando se construya el outbox.

---

## Assets vendored localmente

Todos los assets frontend se sirven desde el mismo origen (no CDN):

| Asset | Path | Propósito |
|-------|------|----------|
| Font Awesome 6 CSS | `/vendor/css/fontawesome.min.css` | Iconos |
| Font Awesome webfonts | `/vendor/webfonts/*.woff2, *.ttf` | Iconos |
| Socket.io 4 client | `/vendor/js/socket.io.min.js` | WebSocket |
| CSS variables (azul) | `/css/variables.css` | Tema azul |
| CSS mobile-first | `/css/mobile.css` | Responsive |
| PWA manifest | `/manifest.webmanifest` | Instalación |
| Service Worker | `/sw.js` | Offline shell |
| Icons PWA | `/icons/icon-*.png` | Iconos instalables |

---

## Service Worker

Archivo: `frontend/sw.js`

**Estrategias de cache:**

| Tipo de request | Estrategia | Razón |
|----------------|------------|-------|
| Navegación (HTML) | Network-first, fallback cache | Muestra lo más reciente, offline usa cache |
| Assets estáticos (CSS, JS, fonts) | Cache-first | Son inmutables por versión |
| Imágenes | Stale-while-revalidate | Cache instantáneo + actualización en background |
| `/api/*`, `/health`, `/ready`, `/version`, `/socket.io/*` | Nunca cachear | Siempre van a red |

**Versionado:** `sambapos-lba-v0.4.0`. En cada release que cambia assets precacheados, este string debe actualizarse para forzar nueva activación de SW.

**Update flow:**
1. Página carga SW actual.
2. Navegador descubre SW nuevo (byte-for-byte diferente en `sw.js`).
3. Lo instala en background y emite `updatefound`.
4. SW nuevo entra en estado `installed` pero `waiting`.
5. La página puede escuchar `updatefound` y mostrar banner "Nueva versión disponible".
6. Usuario click "Actualizar" → SW.postmessage('SKIP_WAITING') → recarga.

---

## WebSocket reconexión

Archivo: `frontend/js/store/websocket-client.js`

**Características:**
- **Reconnect automático** con backoff exponencial + jitter (delegado a Socket.io).
- **Heartbeat**: ping cada 25s, force-reconnect si no ack en 10s.
- **Browser online/offline detection** via `navigator.onLine` events.
- **Resync tras reconexión**: el cliente emite `resync` y el servidor responde con un snapshot de estado (openTickets, tables).
- **Indicador visual**: verde (online), naranja (reconnecting), rojo (offline).
- **Toast** "Conexión restablecida" tras reconnect exitoso.

---

## Verificación

Para verificar las capacidades offline:

```bash
# 1. Iniciar servidor
JWT_SECRET=$(openssl rand -hex 32) ADMIN_PIN=1234 node backend/src/api/server.js &

# 2. Abrir http://localhost:3001 en Chrome
# 3. DevTools > Application > Service Workers — verificar SW registrado
# 4. DevTools > Application > Cache Storage — verificar 'sambapos-lba-v0.4.0-shell'
# 5. Detener el servidor (Ctrl+C)
# 6. Recargar la página — debe mostrar la offline shell (login form)
# 7. Intentar login — debe fallar con error de red
# 8. Navegar a /offline.html — debe mostrar página branded "Sin conexión"
```

**No afirmar que operaciones transaccionales funcionen offline** — solo el shell.
