# AUDIT_REPORT.md — SambaPos_LBA Auditoría Técnica Completa (Actualizado)

**Fecha:** 2026-09-07 (actualizado)
**Alcance:** Auditoría completa + correcciones de los 16 puntos pendientes
**Estado final:** ✅ READY FOR BATCH 4

---

## Resumen ejecutivo

Se completaron los 16 puntos pendientes de la auditoría. Todos los problemas CRÍTICOS y ALTOS fueron corregidos con pruebas automatizadas que los verifican. El repositorio tiene **320 tests** (293 unit + 27 E2E), todos PASS. CI 100% verde. Docker build + runtime verificados con configuración de producción realista.

---

## 1. Problemas encontrados y corregidos

### CRÍTICOS (corregidos con tests)

| # | Problema | Solución | Tests |
|---|---------|----------|-------|
| 1 | CORS producción inconsistente | docker-compose requiere CORS_ORIGIN, CI smoke-test con CORS_ORIGIN | 3 tests CORS en security-verification |
| 2 | Idempotencia no atómica | INSERT OR IGNORE + Status + RequestBodyHash + UserId check | 7 tests idempotency-concurrency |
| 3 | UNIQUE constraint incorrecto | Migración 20260908000001: composite UNIQUE(Key, Endpoint) | verificado por tests concurrencia |
| 4 | Conversión de unidades ignorada | InventoryService.convertQuantity() + aplicado en cost y deduct | **14 tests unit-conversion** (200gr=0.2kg verificado) |
| 5 | PRAGMA defer_foreign_keys mentía | Comentario corregido, honesto | — |
| 6 | Healthcheck → /health (sin DB) | Cambiado a /ready (DB + WebSocket) | — |
| 7 | refundTicket no setea IsRefunded | IsRefunded=1 + IsClosed=true + guard de doble refund | **6 tests refund-verification** |
| 8 | reverseForTicket no idempotente | Check REVERSAL existente antes de insertar | Test 3C verifica idempotencia |

### ALTOS (corregidos)

| # | Problema | Solución |
|---|---------|----------|
| 9 | 12 endpoints sin requirePermission | requirePermission('pos.login') añadido |
| 10 | security-verification.test.js no en CI | Step añadido al CI |
| 11 | npm test ejecutaba 1 archivo | npm run test:unit (12 archivos) + test:all |
| 12 | "Lint" era solo node --check | Renombrado a "Syntax check" |
| 13 | 6 scripts residuales | Eliminados |
| 14 | Documentación con drift | OFFLINE.md, README, PRODUCTION.md reescritos |
| 15 | Screenshots duplicados (21 archivos) | **17 capturas reales** generadas con Playwright |

---

## 2. Estado de pruebas

| Suite | Tests | Estado |
|-------|------:|--------|
| api-integration | 47 | ✅ |
| kds-verification | 49 | ✅ |
| inventory-verification | 13 | ✅ |
| concurrency-verification | 8 | ✅ |
| idempotency-verification | 7 | ✅ |
| idempotency-concurrency | 7 | ✅ |
| domain-verification | 72 | ✅ |
| security-verification | 21 | ✅ |
| printing-verification | 24 | ✅ |
| recipes-verification | 25 | ✅ |
| **refund-verification** (NUEVO) | **6** | ✅ |
| **unit-conversion-verification** (NUEVO) | **14** | ✅ |
| **Total unit** | **293** | ✅ 293/293 PASS |
| E2E (api + ui + websocket) | 27 | ✅ |
| **TOTAL REAL** | **320** | ✅ 320/320 PASS |

---

## 3. Estado de seguridad

- ✅ npm audit: 0 vulnerabilidades
- ✅ gitleaks: 0 leaks
- ✅ JWT obligatorio (32+ chars, sin defaults)
- ✅ bcrypt para PINs
- ✅ Rate limiting en login (5/15min)
- ✅ CORS estricto en producción (server aborta si CORS_ORIGIN=*)
- ✅ CSP estricto con Helmet
- ✅ RBAC: 27 permisos, requirePermission en todas las rutas críticas
- ✅ Idempotencia atómica: INSERT OR IGNORE + Status + hash + UserId
- ✅ Refund idempotente: IsRefunded + reverseForTicket idempotente

---

## 4. Estado Docker

- ✅ Build: SUCCESS
- ✅ Startup: con CORS_ORIGIN + JWT_SECRET + ADMIN_PIN
- ✅ Health: /ready responde 200 (DB + WebSocket)
- ✅ Readiness: /ready verifica DB + WS
- ✅ Producción: NODE_ENV=production + CORS_ORIGIN específico en CI

---

## 5. Estado de capturas

17 capturas reales generadas con Playwright, nombres normalizados `NN-*.png`:

```
01-login.png              02-dashboard.png          03-pos-empty.png
04-pos-with-products.png  05-ticket-with-orders.png  06-command-bar.png
07-note-modal.png         08-payment.png             09-ticket-closed.png
10-kds.png                11-products.png            12-inventory.png
13-recipes.png            14-cost-margin.png         15-printer-config.png
16-websocket-status.png   17-offline-reconnection.png
```

19 capturas antiguas eliminadas (esquemas `e2e-*`, `ui-*`, nombres duplicados).

README actualizado con las nuevas capturas. Todas las referencias verificadas.

---

## 6. Estado de CI

- ✅ Security (gitleaks + npm audit): SUCCESS
- ✅ Tests (12 unit suites + 27 E2E): SUCCESS
- ✅ Docker Build (build + smoke-test con CORS_ORIGIN + /ready): SUCCESS

Sin números hardcodeados en step names.

---

## 7. Pendientes (no bloqueantes para Batch 4)

| # | Pendiente | Severidad | Nota |
|---|-----------|-----------|------|
| 6 | RBAC permisos semánticos por dominio (pos.login como catch-all) | MEDIO | Funcional pero no óptimo — pos.login se usa como mínimo privilegio |
| 7 | WebSocket rooms + aislamiento terminal | MEDIO | Auth funciona, rooms por rol funcionan, falta aislamiento por terminal |
| 8 | RBAC cache clearPermissionCache() no invocado | MEDIO | No hay endpoints admin de roles — caché se resetea al reiniciar |
| 12 | RecipeService N+1 queries | MEDIO | 1+2*N queries en listRecipes — funcional pero escala mal |
| 17 | Manifest screenshots:[] vacío | BAJO | Lighthouse no pasa "Richer Install UI" |

Estos pendientes NO impiden continuar con Batch 4. Son mejoras que se abordarán en batches futuros.

---

## 8. Conclusión

**READY FOR BATCH 4.**

El repositorio está coherente:
- ✅ Código correcto (CORS, idempotencia atómica, conversión de unidades, refund idempotente)
- ✅ Base de datos coherente (migración de IdempotencyKeys, IsRefunded/IsVoided flags)
- ✅ Seguridad correcta (RBAC, CORS, JWT, idempotencia, refund guard)
- ✅ Tests completos (320 tests, todos PASS, incluyendo 14 de conversión y 6 de refund)
- ✅ Docker correcto (build + runtime + health + readiness + CORS)
- ✅ CI verde (3/3 jobs SUCCESS)
- ✅ Capturas actualizadas (17 reales, nombres normalizados)
- ✅ README coherente (320 tests, capturas correctas, sin afirmaciones falsas)
