# Seguridad

## Modelo de amenazas asumido

Red LAN cerrada de un restaurante + demo pública en GitHub Pages. No
manejamos tarjetas directamente (métodos de pago locales) ni datos
personales sensibles más allá de usuarios/PIN del personal.

## Gates automáticos (en cada push/PR)

| Gate | Qué detecta | Dónde |
|------|-------------|-------|
| **gitleaks** | secretos/keys commiteados (patrones + entropía) | `ci.yml` job security |
| **npm audit** | dependencias vulnerables (0 toleradas) | idem |
| Syntax check | código roto en archivos .js | job tests |
| RBAC tests | endpoints sin permiso / escaladas | suite security-verification |
| JWT tests | expiración, firma, re-auth | idem |
| Demo isolation | config de producción en demo (o viceversa) | `pages.yml` gates |
| jarsigner | AAB sin firmar | `android.yml` job release |

## Secretos: dónde vive cada cosa

| Material | Dónde | NUNCA |
|----------|-------|-------|
| Keystore de firma Android | GitHub **Secrets** (`ANDROID_KEYSTORE_BASE64`) + respaldo privado del dueño | git, vars, wiki, issues |
| Contraseñas keystore | GitHub Secrets | git |
| `JWT_SECRET` de producción | env del servidor (systemd/PM2/Docker) | git, wiki |
| `ADMIN_PIN` | env al seedear | git, código |
| VAPID keys | env del servidor | git |
| PAT de GitHub | SOLO local del operador (`GITHUB_TOKEN` export) | git, logs, scripts commiteados |

**Regla de los PAT**: cualquier token va en variable de entorno del
 proceso, nunca hardcodeado en un script (así funciona
 `scripts/set-android-secrets.py`: `GITHUB_TOKEN` se exporta antes).

### Si se filtró un secreto

1. **Rótalo YA** (nuevo valor) — filtrado ≠ peligroso si ya no vale.
   - GitHub: Settings → Secrets → update (o re-ejecuta el script).
   - JWT: nuevo `JWT_SECRET` + restart (invalida sesiones).
   - Keystore: regenerar + re-publicar como app nueva (último recurso).
2. Purga la historia SOLO si es imprescindible (filter-repo) — en repo
   público con forks, asumir que está comprometido para siempre.
3. gitleaks de todos modos lo habría cazado en el push — si llegó a
   main, revisa por qué el gate no corrió sobre ese commit.

## Autenticación y autorización

- **JWT** con expiración; el cliente detecta expiración y re-autentica
  (importante para el offline: no re-envía outbox con token muerto).
- **PIN de 4 dígitos** por usuario del personal (no contraseñas — es un
  POS de restaurante; compensado con RBAC granular + audit log).
- **RBAC de 27 permisos** discrecionales por rol (ver
  [Roles-y-Flujos](Roles-y-Flujos)); middleware `requirePermission()`
  en cada endpoint crítico.
- **Audit log** de acciones sensibles (void, refund, payouts, cambios
  de rol) con usuario + timestamp.
- WebSocket: JWT en handshake, rooms por rol/estación.

## CORS y cleartext

- `CORS_ORIGIN` en producción **no puede ser `*`** — el servidor se
  niega a arrancar (fail-fast diseñado).
- `cleartext`/`allowMixedContent` de Capacitor existen para la LAN
  HTTP; con TLS se desactivan (ver
  [Android](Android#cleartext--https-rationale)).
- La demo de Pages está 100% client-side (mock): sin backend al que
  proteger.

## Hardening adicional disponible

- Rate limiting de login (protección anti-fuerza bruta del PIN): el
  dominio lo soporta; si el local lo pide, es un cambio en
  `backend/src` → seguir el protocolo de [Contribuir](Contribuir)
  (doc → test → fix).
- Fail2ban / VPN para acceso remoto al servidor: configuración del
  host, no del repo.
- TLS interno con Caddy: ver [Despliegue-Producción](Despliegue-Producción#tls--cleartext).

## Reporte de vulnerabilidades

Issue privado al dueño del repo (o security advisory de GitHub:
Security → Report a vulnerability). No abras issues públicos con
detalles explotables.
