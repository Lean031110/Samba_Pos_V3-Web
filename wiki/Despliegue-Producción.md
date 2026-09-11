# Despliegue en producción

## Escenario objetivo

Un mini-PC/NAS en el local corriendo el backend + el frontend estático
servido desde el mismo Express o desde el WebView de las tablets
(Android APK). Red local (LAN), con opción de TLS mediante proxy.

## Topología LAN (recomendada)

```
            ┌────────────── WiFi del local ──────────────┐
            │                                            │
Tablets Android (APK LBApos)      Navegadores/PWA del personal
            │                            │
            │  http://192.168.1.104:3001 (o :8080 para estático)
            ▼                            ▼
      ┌──────────────────────────────────────┐
      │ mini-PC: Node backend + SQLite       │
      │ (opcional: Caddy/nginx TLS delante)  │
      │ (opcional: impresoras TCP ESC/POS)   │
      └──────────────────────────────────────┘
```

## Opción A — Node directo (PM2)

```bash
# 1. Código + dependencias
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web/backend && npm ci --omit=dev

# 2. BD + datos
npm run migrate && npm run seed

# 3. Variables de producción (¡obligatorias!)
export NODE_ENV=production
export PORT=3001
export CORS_ORIGIN=http://192.168.1.104:8080     # origen real del frontend
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PIN=<PIN-fuerte>                    # ANTES del seed

# 4. PM2 (auto-restart + arranque al boot)
npm i -g pm2
pm2 start src/api/server.js --name sambapos
pm2 save && pm2 startup

# 5. Frontend: sirve frontend/ con cualquier servidor estático
#    (o el mismo Express si configuras static) en :8080
```

Checklist: `curl http://localhost:3001/health` OK · login con el PIN
de producción OK · backup programado (abajo).

## Opción B — Docker

```bash
docker build -t sambapos-lba .
docker run -d --name sambapos \
  -p 3001:3001 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e CORS_ORIGIN=http://192.168.1.104:8080 \
  -v /srv/sambapos/data:/app/data \
  sambapos-lba
```

El Dockerfile es multi-stage; CI hace smoke del contenedor (`/ready` +
CORS). `SAMBA_DB_PATH=/app/data/samba.db` ya viene fijado — monta el
volumen para persistir.

## Opción C — systemd (sin PM2)

```ini
# /etc/systemd/system/sambapos.service
[Unit]
Description=LBApos backend
After=network.target

[Service]
WorkingDirectory=/opt/Samba_Pos_V3-Web/backend
ExecStart=/usr/bin/node src/api/server.js
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=CORS_ORIGIN=http://192.168.1.104:8080
EnvironmentFile=/etc/sambapos.env        # JWT_SECRET, ADMIN_PIN...
Restart=on-failure
User=sambapos

[Install]
WantedBy=multi-user.target
```

## TLS / cleartext

- **LAN HTTP (actual)**: `cleartext: true` en Capacitor permite que el
  WebView hable con `http://192.168.x.x`. Riesgo aceptado en red
  cerrada del negocio.
- **Con TLS (recomendado al exponer)**: Caddy delante
  (`reverse_proxy localhost:3001` con dominio o IP + cert interno) →
  pon `cleartext`/`allowMixedContent` en `false`. Ver
  [Android](Android#cleartext--https-rationale).
- **Nunca** expongas el 3001 directamente a Internet.

## PostgreSQL (EXPERIMENTAL — no production-ready)

`DATABASE_URL=postgres://...` activa el cliente `pg` del mismo
knexfile. ⚠️ Problema conocido: una migración duplica un constraint y
falla en CI. Hasta que se cierre (ver
[Troubleshooting](Troubleshooting#postgresql)), **SQLite es la BD de
producción soportada** — con backup/restore probados y drill en CI.

## Backups (obligatorio en operación)

```bash
cd backend
npm run backup                    # snapshot del SQLite
npm run restore backups/<file>    # restauración verificada
```

Cron diario sugerido (mantiene 14 días):

```bash
0 4 * * * cd /opt/Samba_Pos_V3-Web/backend && npm run backup -- --keep 14 >> /var/log/sambapos-backup.log 2>&1
```

CI ejecuta un **backup/restore drill** — la restauración está probada,
no solo teórica. Estrategia completa: `docs/BACKUP.md`.

## Actualizar la instalación

```bash
cd /opt/Samba_Pos_V3-Web
git fetch && git checkout main && git pull --ff-only
cd backend && npm ci --omit=dev && npm run migrate
pm2 restart sambapos   # (o docker compose pull && up -d)
```

Las migraciones Knex son incrementales y reversibles
(`npm run migrate:rollback`). Antes de actualizar en horario de
operación: `npm run backup`.

## Instalar el APK en las tablets

1. Descarga `LBApos-debug.apk` del último run de Actions (o compila el
   release firmado — ver [Android](Android)).
2. Copia al tablet y habilita "instalar de orígenes desconocidos".
3. Primera ejecución → ServerConfig: URL `http://<ip-servidor>:3001`
   → **Probar** → modo POS/COCINA → **Guardar**.
4. Para actualizar: instalar encima (misma firma) — el ServerConfig
   persiste.

## Checklist de puesta en producción

- [ ] `NODE_ENV=production` (CORS estricto activo)
- [ ] `JWT_SECRET` fuerte y respaldado
- [ ] `ADMIN_PIN` no-default ANTES de seedear
- [ ] `CORS_ORIGIN` = origen real del frontend
- [ ] Backup cron activo + restore probado una vez a mano
- [ ] Impresoras TCP alcanzables desde el servidor (cola reintentará)
- [ ] Tablets con APK + ServerConfig apuntando al servidor
- [ ] Push VAPID configurado (opcional — si lo quieres usar)
- [ ] Monitoreo básico: `pm2 monit` o healthcheck de Docker en `/health`
