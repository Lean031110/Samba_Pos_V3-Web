# DEPLOYMENT.md — Guía de instalación en máquina nueva

**SambaPos_LBA — POS web para restaurantes**
**Versión:** Ver `backend/package.json`

---

## Requisitos

| Componente | Versión mínima | Notas |
|-----------|---------------|-------|
| Node.js | 20.x+ | Recomendado 22.x LTS |
| npm | 10.x+ | Incluido con Node.js |
| SQLite | 3.35+ | Incluido via `sqlite3` npm package |
| PostgreSQL (opcional) | 14+ | Solo para producción multi-terminal |
| Navegador | Chrome/Edge 100+ | Para PWA + Push + WebSocket |

## Instalación rápida (SQLite — single terminal)

```bash
# 1. Clonar el repositorio
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web

# 2. Instalar dependencias del backend
cd backend
npm install

# 3. Copiar .env.example a .env y configurar
cp ../.env.example ../.env
# Editar .env:
#   JWT_SECRET=tu-clave-secreta-de-al-menos-32-caracteres
#   ADMIN_PIN=1234
#   CORS_ORIGIN=http://localhost:3001

# 4. Ejecutar migraciones + seed
npm run migrate
npm run seed

# 5. Iniciar el servidor
npm start
# El servidor escucha en http://localhost:3001
```

## Instalación con PostgreSQL (multi-terminal)

```bash
# 1-4. Mismos pasos que arriba

# 5. Crear base de datos en PostgreSQL
psql -U postgres -c "CREATE DATABASE sambapos_lba;"

# 6. Configurar DATABASE_URL en .env
echo 'DATABASE_URL=postgres://user:pass@localhost:5432/sambapos_lba' >> ../.env

# 7. Instalar el driver pg
npm install pg

# 8. Ejecutar migraciones (crea tablas en PostgreSQL)
npm run migrate

# 9. Ejecutar seed
npm run seed

# 10. Iniciar el servidor
npm start
```

## Docker

```bash
# Construir y ejecutar
docker-compose up -d

# El servidor escucha en http://localhost:3001
```

## Verificación post-instalación

```bash
# Health check
curl http://localhost:3001/health

# Version
curl http://localhost:3001/version

# Login (PIN default: 1234)
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"Administrator","pin":"1234"}'
```

## Backup y restore

```bash
# Crear backup
cd backend
npm run backup
# Backup en data/backups/samba-backup-YYYY-MM-DDTHH-MM-SS.db

# Restaurar
npm run restore -- --file=data/backups/samba-backup-YYYY-MM-DDTHH-MM-SS.db --confirm

# Restore drill (backup → destroy → restore → verify)
node scripts/restore-drill.js

# Configurar retención (default: 30 backups)
export BACKUP_RETENTION=60
```

## Producción

### PM2 (recomendado)

```bash
npm install -g pm2
cd backend
pm2 start src/api/server.js --name sambapos-lba
pm2 save
pm2 startup  # auto-start on boot
```

### Variables de entorno para producción

```env
NODE_ENV=production
JWT_SECRET=<32+ chars aleatorio>
ADMIN_PIN=<PIN seguro>
CORS_ORIGIN=https://pos.tudominio.com
# Opcional: PostgreSQL
DATABASE_URL=postgres://user:pass@host:5432/dbname
# Opcional: Push notifications
VAPID_SUBJECT=mailto:admin@tudominio.com
VAPID_PUBLIC_KEY=<generar con web-push>
VAPID_PRIVATE_KEY=<generar con web-push>
```

### Cron job para backups automáticos

```bash
# Editar crontab
crontab -e

# Backup diario a las 2 AM
0 2 * * * cd /path/to/Samba_Pos_V3-Web/backend && npm run backup >> /var/log/sambapos-backup.log 2>&1
```
