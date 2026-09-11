# Arquitectura

## Visión general

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTES (misma UI)                     │
│  Navegador/PWA        Android (Capacitor)      Pages demo   │
│  http://LAN:8080      https://localhost shell  DEMO_MODE    │
└──────────────┬──────────────┬──────────────┬────────────────┘
               │              │              │
        frontend/ (vanilla JS, sin build step)  ← webDir de Capacitor
               │ fetch /api/*  │ WebSocket    │ Mock API (demo)
               ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND Node.js 20 · Express · Socket.io · JWT             │
│  Arquitectura hexagonal: api / application / domain /        │
│  infrastructure                                             │
└──────────────┬──────────────────────────────────────────────┘
               │ Knex (query builder)
               ▼
   SQLite (default, archivo) ⇄ PostgreSQL (EXPERIMENTAL)
```

El frontend es **estático puro** (HTML + CSS + JS vanilla, sin bundler):
`git clone` + servidor de archivos = app corriendo. Esa misma carpeta
`frontend/` es el `webDir` de Capacitor, por lo que el APK y el
navegador ejecutan **exactamente el mismo código**.

## Frontend (`frontend/`)

```
frontend/
├── index.html          ← shell: carga config.js primero, luego app.js
├── css/odoo19.css      ← design system completo (~2100 líneas, marca #044392)
├── js/
│   ├── config.js       ← LBA_CONFIG (APP_BASE_PATH, DEMO_MODE...) ★
│   ├── app.js          ← bootstrap, router de vistas, navegación por rol
│   ├── components/     ← toasts, modales, numpad, etc.
│   ├── services/       │
│   │   ├── api.js           ← REST client (API_BASE lazy, offline-aware)
│   │   ├── server-config.js ← ServerConfig: pantalla bienvenida Android ★
│   │   ├── websocket-client.js ← Socket.io: reconnect + heartbeat + resync
│   │   ├── offlineQueue.js  ← IndexedDB outbox (orden garantizado)
│   │   ├── push.js          ← Web Push (subscribe/unsubscribe, VAPID)
│   │   └── demo-data.js     ← Mock API COMPLETO (solo DEMO_MODE)
│   ├── store/          ← estado global + persistencia offline
│   └── views/          ← login, areas, pos, payment, kitchen (KDS),
│                         dashboard, cash, reports, inventory, config
├── manifest.webmanifest · sw.js · offline.html   ← PWA
├── icons/ · assets/    ← íconos PWA, logos por densidad
└── vendor/             ← FontAwesome (CSS local, sin CDN runtime)
```

**Cascada de carga** (orden estricto en `index.html`):
1. `js/config.js` — define `LBA_CONFIG`, resuelve `window.LBA_BASE`
2. `sw.js` registration (scope = base path)
3. `js/app.js` — inicializa store, servicios, router

### Navegación por rol (post-login)

```
login → ÁREAS (mesas por zona)
          ├─ Administrador → dashboard  (KPIs, administración)
          ├─ Mesero        → pos        (mesas · pedido · envío a cocina)
          ├─ Cocina        → kitchen    (KDS full-screen por estación)
          └─ Cajero        → cash       (apertura/cierre de caja)
```

El destino lo decide `app.js::_destForUser(user)`; el usuario puede
navegar libremente dentro de los permisos de su rol (ver
[Roles-y-Flujos](Roles-y-Flujos)).

## Backend (`backend/src/`) — arquitectura hexagonal

```
backend/src/
├── api/                ← capa de entrada (adaptadores)
│   ├── server.js       ← Express, CORS, puerto (PORT, default 3001)
│   ├── routes/         ← /api/auth, /api/tickets, /api/kitchen...
│   ├── middleware/     ← auth (JWT), errorHandler, requirePermission
│   └── services/       │  pushService (VAPID), printerService (TCP)...
├── application/        ← casos de uso (orquestación)
├── domain/             ← NÚCLEO: entidades, reglas de negocio, RBAC
│   └── services/       ← lógica pura, sin dependencias de framework
└── infrastructure/     ← adaptadores de salida
    ├── db/             ← knexfile.js (SQLite/PG dual) · migrations · seeds
    └── printers/       ← transporte TCP ESC/POS, cola persistente
```

**Regla de oro**: `domain/` no conoce Express ni Knex. Las rutas
traducen HTTP → casos de uso; los repositorios traducen entidades →
tablas. Esta separación es la que mantiene 533 tests de dominio
estables ante cambios de infraestructura.

### Tiempo real (Socket.io)

- Auth por JWT en handshake; rooms por rol/estación
- Reconnect con **exponential backoff + heartbeat + resync** de estado
  al reconectar (los KDS no pierden órdenes durante caídas de red)
- Eventos clave: nueva orden, cambio de estado KDS, void propagation,
  actualización de mesas

### Offline (frontend)

- Outbox en **IndexedDB** con orden garantizado:
  `ticket → orders → payment → close` (nunca se envía un pago antes
  que su ticket)
- Detección de expiración JWT antes de intentar reenvíos
- Shell offline (`offline.html`) servida por el service worker

## Base de datos

- **SQLite** (default): archivo en la ruta de `SAMBA_DB_PATH` (ver
  [Configuración](Configuración-de-parámetros#variables-de-entorno-del-backend)).
  Migrations + seed con datos del restaurante (áreas, productos,
  recetas, usuarios/roles, métodos de pago).
- **PostgreSQL** (EXPERIMENTAL): el mismo knexfile cambia de cliente
  si `DATABASE_URL` empieza con `postgres://`. ⚠️ La migración PG
  tiene un problema conocido (constraint duplicado) — ver
  [Troubleshooting](Troubleshooting#postgresql).

## Android (Capacitor)

- `capacitor.config.json` en la RAÍZ: `appId com.sambapos.lba`,
  `appName LBApos`, `webDir frontend` (ver
  [Configuración](Configuración-de-parámetros#capacitorconfigjson))
- `android/` está **versionado en git** (no se genera en CI) —
  reproducible desde `git clone` + `npm ci`
- El proyecto Android consume `frontend/` vía `npx cap sync android`
- Splash + íconos por densidad viven en `android/app/src/main/res/`
  (generados por `scripts/generate-android-resources.py`)

## GitHub Pages (demo pública)

- La MISMA build del frontend, con UN solo overlay de configuración:
  `frontend/config.demo.js` → `_site/js/config.js` (`DEMO_MODE: true`)
- `APP_BASE_PATH` se autodetecta en runtime → la build funciona en `/`
  y en `/Samba_Pos_V3-Web/` sin parches
- El Mock API (`demo-data.js`) intercepta todas las llamadas — la demo
  **nunca** toca un backend real
- Detalle completo en [GitHub-Pages](GitHub-Pages)

## Decisiones de arquitectura (y su porqué)

| Decisión | Alternativa | Por qué se eligió |
|----------|-------------|-------------------|
| Vanilla JS sin bundler | React/Vue/Vite | Tablets viejas del restaurante, red LAN, cero toolchain: abrir y funcionar. El APK y el navegador ejecutan idéntico código |
| SQLite default | PostgreSQL desde el día 1 | Cero administración en un NAS/mini-PC de local; PG queda como camino de escala (experimental) |
| Hexagonal en backend | MVC plano | El dominio (dinero, inventario, cocina) merece tests sin HTTP ni DB |
| `android/` versionado | `cap add` en CI | Reproducibilidad y diffs auditables; `cap add` es solo bootstrap documentado |
| Mock API como overlay | Backend de demo en Pages | Pages solo sirve estáticos; la demo con mock queda 100% aislada y gratis |
| APP_BASE_PATH runtime | sed en CI | Un mecanismo, cero parches, misma build en todos los destinos |
