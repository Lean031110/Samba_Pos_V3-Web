# SambaPos_LBA — FASE 1: Seguridad y Limpieza

**Fecha:** 2026-09-07
**Repositorio:** https://github.com/Lean031110/Samba_Pos_V3-Web
**Commits en esta fase:** 6 commits pequeños y reversibles sobre `main` (rama de trabajo local).

---

## FASE: 1 — SEGURIDAD Y LIMPIEZA
## ESTADO: PASS

---

## CAMBIOS

| # | Cambio | Commit | Archivos |
|---|---|---|---|
| 1.0 | Backup completo (tar.gz 16 MB) + snapshot de `data/samba.db` antes de tocar nada | (no commit) | `backups/sambapos_lba_pre_fase1_*.tar.gz` |
| 1.1 | B1 resultó FALSO POSITIVO — el YAML del CI ya estaba correcto (`branches: [main]`); el terminal interpretaba `[m` como escape ANSI | (sin commit, sólo nota en BASELINE_REPORT.md) | `docs/BASELINE_REPORT.md` |
| 1.2 | `git rm --cached data/samba.db` y `data/backups/*.meta.json`; ampliar `.gitignore` con `data/backups/`, `data/snapshots/`, `backend/tests/e2e/report/`, `backend/tests/e2e/results.xml`; permitir `.env.example` con `!.env.example` | `28f4e64` | `.gitignore`, `data/backups/.gitkeep`, `data/samba.db` (eliminado), `data/backups/samba-backup-*.meta.json` (eliminado), `docs/BASELINE_REPORT.md` |
| 1.3 | Bump `sqlite3 5.1.7 → 6.0.1` — resuelve 7 vulnerabilidades (1 crítica en `tar` por cadena `sqlite3→node-gyp→make-fetch-happen→tar`); 0 vulnerabilidades tras el bump | `12215ac` | `backend/package.json`, `backend/package-lock.json` |
| 1.4 | Crear `.env.example` documentado con todas las variables de la app (`PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `SAMBA_DB_PATH`, `ADMIN_PIN`, `BACKUP_DIR`) | `90fcf91` (combinado) | `.env.example` |
| 1.5 | Endurecer CORS: si `NODE_ENV=production` y `CORS_ORIGIN` es `*` o vacío, el server aborta con exit code != 0 y mensaje claro | `90fcf91` (combinado) | `backend/src/api/server.js` |
| 1.6 | Añadir `requirePermission()` a 11 rutas que sólo tenían `authenticate()` (config 5, products 4, tables 3, printers 3, kitchen 2); añadir `auditLog()` a `product.create` y `table.changeState` | `4b66627` | `backend/src/api/routes/config.js`, `products.js`, `tables.js`, `printers.js`, `kitchen.js` |
| 1.7 | Añadir validación de payload con Zod en todos los handlers críticos: `auth.login`, `tickets POST /, /:id/payments, /:id/close, /:id/note, /:id/tags, /:id/split, /:id/refund, /merge`. Módulo central `schemas.js` con 17 schemas (strict mode, rejects unknown keys). | `8d480e2` | `backend/src/api/middleware/schemas.js` (nuevo), `backend/src/api/middleware/auth.js`, `backend/src/api/routes/tickets.js`, `backend/package.json` |
| 1.8 | Secret scan automatizado con `gitleaks/gitleaks-action@v2` en CI + gate `npm audit --audit-level=low` que falla el build si hay vulnerabilidades; nuevo job `security` corre ANTES que `test` | `ce9e8a4` | `.gitleaks.toml` (nuevo), `.github/workflows/ci.yml` |
| 1.9 | Tests de seguridad: 21 tests cubriendo CORS hardening (3), auth bypass (10), fuzzing en login (8) | `90fcf91` (combinado) | `backend/tests/security-verification.test.js` (nuevo) |

---

## ARCHIVOS MODIFICADOS

```
.gitleaks.toml                                        (nuevo, 38 líneas)
.github/workflows/ci.yml                              (modificado, +52 -6)
.gitignore                                             (modificado, +4 -0)
.env.example                                          (nuevo, 41 líneas)
backend/package.json                                  (modificado, sqlite3 5.1.7 -> 6.0.1, +zod 4.5.4)
backend/package-lock.json                             (modificado, -857 +169)
backend/src/api/server.js                             (modificado, +10 -1, CORS guard)
backend/src/api/middleware/auth.js                    (modificado, +5 -3, loginSchema)
backend/src/api/middleware/schemas.js                 (nuevo, 191 líneas)
backend/src/api/routes/config.js                     (modificado, +6 -0, requirePermission)
backend/src/api/routes/products.js                    (modificado, +6 -2, requirePermission + auditLog)
backend/src/api/routes/tables.js                      (modificado, +5 -2, requirePermission + auditLog)
backend/src/api/routes/printers.js                    (modificado, +3 -0, requirePermission)
backend/src/api/routes/kitchen.js                    (modificado, +5 -1, requirePermission)
backend/src/api/routes/tickets.js                    (modificado, +14 -10, parseOrThrow en 8 handlers)
backend/tests/security-verification.test.js           (nuevo, 320 líneas, 21 tests)
backend/scripts/run-all-tests.sh                      (nuevo, helper de prueba)
docs/BASELINE_REPORT.md                               (correcciones menores tras falso positivo B1)
data/samba.db                                         (eliminado del repo)
data/backups/samba-backup-2026-09-05T23-26-40.meta.json  (eliminado del repo)
data/backups/.gitkeep                                 (nuevo, preserva el dir)
```

---

## MIGRACIONES

- Ninguna (no se modificó el esquema de base de datos).
- Las 5 migraciones existentes siguen aplicándose correctamente en `npm run migrate`.

---

## TESTS

| Suite | Antes (FASE 0) | Después (FASE 1) | Δ |
|---|---|---|---|
| api-integration | 47 | 47 | 0 |
| kds-verification | 49 | 49 | 0 |
| inventory-verification | 13 | 13 | 0 |
| concurrency-verification | 8 | 8 | 0 |
| **security-verification** | 0 (no existía) | 21 | +21 |
| Playwright E2E | 27 | 27 | 0 |
| **TOTAL** | **144** | **165** | **+21** |

- **Unit: 138/138 PASS**
- **Integration: 138/138** (incluidos en unit)
- **E2E: 27/27 PASS** (chromium 1243)
- **Visual: 0/0** (pendiente FASE 17)
- **Security: 21/21 PASS** (nuevos en esta fase)
- **Failure: 0/0** (pendiente FASE 17)

---

## RIESGOS (resueltos en esta fase)

- ✅ `data/samba.db` commiteada → resuelto (git rm --cached + .gitignore)
- ✅ Vulnerabilidad crítica en `tar@<=7.5.20` → resuelto (sqlite3 6.0.1, 0 vulns)
- ✅ CORS `*` peligroso en producción → resuelto (server aborta)
- ✅ Rutas sin RBAC → resuelto (11 rutas con requirePermission)
- ✅ Validación manual sin schema → resuelto (Zod en todos los handlers críticos)
- ✅ Sin secret scan en CI → resuelto (gitleaks + npm audit gate)
- ✅ Sin tests de seguridad → resuelto (21 tests)

## RIESGOS (pendientes de fases posteriores)

- ⚠️ Sin impresión con hardware real verificado (FASE 7)
- ⚠️ Sin PWA (FASE 10)
- ⚠️ Sin Web Push (FASE 9)
- ⚠️ Sin PostgreSQL (FASE 12)
- ⚠️ Sin offline real (FASE 11)
- ⚠️ Sin Android (FASE 15)
- ⚠️ Sin admin panel UI (FASE 4)
- ⚠️ Sin tests visuales / failure / security avanzados (FASE 17)
- ⚠️ Sin HTTPS/TLS — el server escucha HTTP plano (FASE 18, reverse proxy)

---

## DEUDA PENDIENTE (heredada)

- 3 TODOs sin cerrar en el código (2 en `server.js`, 1 en `CalculationEngine.js`) — se cierran en FASE 2
- 2 mocks legacy en `TicketService.js` (`generateMockEscPos`, `generatePrintPreview`) — se migrarán en FASE 7

---

## VERIFICACIÓN MANUAL POST-FASE 1

```bash
# 1. Limpiar DB
rm -f data/samba.db data/samba.db-wal data/samba.db-shm

# 2. Arrancar el server en modo producción con CORS estricto
NODE_ENV=production \
  JWT_SECRET=$(openssl rand -hex 32) \
  CORS_ORIGIN=https://pos.example.com \
  PORT=3001 \
  node backend/src/api/server.js
# Resultado: server arranca, /health y /ready devuelven 200

# 3. Probar que CORS='*' falla en producción
NODE_ENV=production JWT_SECRET=x CORS_ORIGIN='*' node backend/src/api/server.js
# Resultado: exit code != 0, mensaje: "In production, CORS_ORIGIN must be set..."

# 4. Ejecutar gitleaks
gitleaks detect --source . --config .gitleaks.toml --no-banner
# Resultado: 31 commits scanned, no leaks found

# 5. Ejecutar npm audit
cd backend && npm audit
# Resultado: found 0 vulnerabilities

# 6. Ejecutar toda la suite
bash scripts/run-all-tests.sh
# Resultado: 138 unit PASS + 27 E2E PASS = 165/165 PASS
```

---

## SIGUIENTE FASE

**FASE 2 — DOMINIO**

Objetivos (según prompt maestro):
- Auditar y completar los agregados faltantes: `Customer`, `Account` (como aggregate), `CashSession`, `WorkPeriod`, `PrintJob`, `Notification`, `AuditLog` (modelo dominio, no sólo middleware)
- Introducir idempotency keys formales para operaciones críticas (pagos, impresiones, voids)
- Toda operación monetaria debe ejecutarse en transacción explícita
- Definir formalmente las transiciones de estado del ticket en una máquina de estados verificable

Plan de commits pequeños (orden tentativo):
1. Audit del dominio actual + identificación de gaps
2. `WorkPeriod` + `CashSession` aggregates
3. `PrintJob` aggregate (prepara FASE 7)
4. `Notification` + `AuditLog` aggregates
5. Idempotency keys formales en `addPayment`, `closeTicket`, `voidTicket`, `refundTicket`
6. State machine formal del ticket (tests de transiciones inválidas)
7. Re-run suite + reporte FASE 2
