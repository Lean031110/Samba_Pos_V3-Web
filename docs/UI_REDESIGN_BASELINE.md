# UI Redesign Baseline — Auditoría previa al rediseño (BLOQUE N)

> Fecha: 2026-09-11 · Rama auditada: `main` · Commit: `1d6ef42` ("merge: UI redesign Odoo 19 style")
> Auditor ejecutado localmente contra el clon del repositorio + API de GitHub.
> **Regla**: nada se marca OK por el simple hecho de existir. Cada punto se verificó con evidencia real.

## 1. Estado de `main`

| Chequeo | Resultado | Evidencia |
|---|---|---|
| Estado git working tree | ✅ LIMPIO | `git status --short` vacío tras clonar |
| Último commit | ✅ `1d6ef42` | "merge: UI redesign Odoo 19 style (POS, KDS, Admin, Login)" (2026-09-10) |
| Ramas remotas | ✅ 11 ramas | `feature/ui-odoo-redesign` (intento previo), bloques D-M |

## 2. Tests unitarios

| Chequeo | Resultado | Evidencia |
|---|---|---|
| Migraciones + seed (SQLite) | ✅ OK | `node scripts/run-migrations.js` → 13 migraciones, seed completo |
| Suite completa unit tests | ✅ **533/533 pass** | `SKIP_E2E=1 bash scripts/run-all-tests.sh` → PASS: 533, FAIL: 0, 22 suites |

## 3. CI / GitHub

| Chequeo | Resultado | Evidencia |
|---|---|---|
| CI workflow (`ci.yml`) en `main@1d6ef42` | ✅ success | GitHub Actions API: `CI \| 1d6ef42 \| completed \| success` |
| **Advertencia crítica** | ⚠️ | El job de E2E tiene `continue-on-error: true` — un CI "verde" NO garantiza que la UI funcione (de hecho, ver §6) |
| PostgreSQL integration | ✅ corre | Paso presente en CI con migraciones sobre Postgres 16 (con `continue-on-error`) |
| Android Build workflow | ✅ success | `Android Build \| 1d6ef42 \| completed \| success` |
| GitHub Pages Demo workflow | ✅ success | `GitHub Pages Demo \| 1d6ef42 \| completed \| success` |

## 4. Servidor + frontend local

| Chequeo | Resultado | Evidencia |
|---|---|---|
| `GET /health` | ✅ 200 | `{"status":"ok","service":"sambapos-lba"}` |
| `GET /` (index.html) | ✅ 200 | HTML servido correctamente |
| Assets CSS/JS/logo | ✅ 200 | `/css/layout.css`, `/js/app.js`, `/assets/logo-header.png` → 200 |
| Rutas API principales | ✅ registradas | auth, tickets, kitchen, cash-sessions, reports, inventory, printers, admin… |

## 5. GitHub Pages (demo en vivo)

| Chequeo | Resultado | Evidencia |
|---|---|---|
| URL responde | ✅ HTTP 200 | `https://lean031110.github.io/Samba_Pos_V3-Web/` |
| **La demo funciona** | ❌ **NO — ROTA** | Diagnóstico Playwright en vivo: `window.DEMO_MODE=true`, pero `window.Api === false` (undefined) y el login **nunca se activa** (`loginActive: false`) |

## 6. Errores JavaScript detectados (reales, reproducibles)

Se ejecutó un diagnóstico Playwright contra el servidor local **y** contra la demo de Pages. Ambos entornos lanzan los mismos 2 errores en cada carga:

```
1) PAGEERROR: Cannot read properties of null (reading 'configured')
   → api.js línea 21: const API_BASE = (window.ServerConfig && ServerConfig.isConfigured())…
   El módulo api.js evalúa isConfigured() en parse-time, cuando ServerConfig._config
   aún es null (init() se llama después, en App.init). Resultado: api.js revienta,
   window.Api queda UNDEFINED y toda la app muere en carga.

2) PAGEERROR: Cannot read properties of null (reading 'mode')
   → app.js: ServerConfig.getMode() con _config === null.
```

**Consecuencia medida**: 16/47 tests E2E fallan en local (todas las suites de UI:
ui-isolated B1-B5, bloque-e E1, bloque-f F1-F2, bloque-g G1-G6, bloque-h H1-H6).
El CI no lo detecta porque E2E corre con `continue-on-error: true`.
La demo pública de GitHub Pages muestra una pantalla muerta.

## 7. APIs faltantes en el cliente (frontend llama métodos que no existen)

`PosView` y `PaymentView` invocan métodos **que no existen** en `api.js`:

- `Api.getTickets()` (pos.js usa `getTickets`, api.js solo define `getOpenTickets`)
- `Api.giftOrders()`, `Api.setNote()`, `Api.setTags()`, `Api.getCalculationTypes()`
- `Api.addCalculation()`, `Api.printTicket()`, `Api.printTicketSend()`
- `Api.getPaymentTypes()`

Estos métodos romperían en runtime (TypeError) al usar la barra de comandos del POS
y la pantalla de pago. Las rutas REST del backend **sí existen** (`/api/tickets/:id/gift`,
`/note`, `/tags`, `/calculations`, `/print`, `/api/admin/payment-types`…) — el defecto
es puramente del cliente.

## 8. Android / Capacitor

| Chequeo | Resultado | Evidencia |
|---|---|---|
| `capacitor.config.json` | ⚠️ appId OK (`com.sambapos.lba`) pero **appName = "SambaPos LBA"** (debe ser "LBApos" según spec) | |
| Splash config | ⚠️ Parcial (backgroundColor #044392, sin splash dedicado ni welcome screen) | |
| Workflow Android | ✅ Activo y verde | `android.yml` state: active |
| Modo POS/KDS | ✅ Existe `ServerConfig.getMode()` (pero roto por bug §6) | |

## 9. E2E actuales

| Chequeo | Resultado | Evidencia |
|---|---|---|
| 47 tests E2E | 31 pass / **16 fail** | Fallan todos los dependientes de UI por el bug §6 |

## 10. Conclusión del baseline

El backend y la lógica de negocio están **sólidos** (533/533 tests).
La capa frontend actual, en cambio, **no arranca** por 2 errores JS en parse-time,
la demo pública está rota y el cliente tiene 9 métodos API fantasma.
El rediseño de UI (BLOQUE N) parte de esta realidad y **debe**:

1. Corregir el bug de inicialización de `ServerConfig` (null-safety en parse-time).
2. Completar el cliente `api.js` con los métodos que las vistas ya invocan (mismo contrato REST, sin tocar backend).
3. Construir la nueva interfaz Odoo 19 (áreas, POS, KDS, payment, dashboard, caja, reportes, inventario, Android).
4. Restaurar la demo de GitHub Pages funcional.
5. Añadir E2E del rediseño + suite de screenshots.

**Baseline verificado. No se marca OK nada que no se haya ejecutado.**
