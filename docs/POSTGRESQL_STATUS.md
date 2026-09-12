# PostgreSQL Status — SambaPos_LBA

> **Estado actual: EXPERIMENTAL — NO PRODUCTION READY**

## Situación real

PostgreSQL está soportado a nivel de código (knexfile.js) pero NO está validado end-to-end.

### Lo que SÍ funciona

1. **knexfile.js** detecta `DATABASE_URL=postgres://...` y usa `client: 'pg'`.
2. **Migraciones** están escritas con el patrón `isSQLite` para usar `PRAGMA` en SQLite e `information_schema` en PostgreSQL.
3. **CI** levanta un contenedor PostgreSQL 16-alpine en los tests.
4. **package.json** incluye `pg` como dependencia.

### Lo que NO funciona

1. **CI workflow** tiene `continue-on-error: true` en el paso "PostgreSQL integration test":
   ```yaml
   - name: PostgreSQL integration test
     continue-on-error: true  # PG migrations may have constraint issues — don't block
   ```
2. **Migraciones antiguas** (las 13 originales de `2024*`) NO fueron escritas con el patrón `isSQLite` y pueden fallar en PG:
   - Tabla `Tickets` con columnas tipo `bit` que PG no soporta nativamente.
   - Constraints con `ON DELETE NO ACTION` vs `CASCADE`.
   - Tipos `nvarchar` (deben ser `text` en PG).
3. **No hay tests de integración real** corriendo contra PostgreSQL.
4. **No hay smoke test** que valide el stack completo (Express + Knex + PG + WS) en producción.

### Cómo PG debería arreglarse (trabajo pendiente)

1. Auditar las 13 migraciones originales y agregar el patrón `isSQLite` a cada una.
2. Correr migraciones contra PG localmente y resolver errores uno por uno.
3. Agregar tests que corran exclusivamente contra PostgreSQL.
4. Quitar `continue-on-error: true` solo cuando PG esté verde.

### Decisión de release

**Para producción v0.6.1: SOLO SQLite es oficialmente soportado.**

PostgreSQL queda como trabajo futuro. La documentación de deployment debe mencionar esto explícitamente. No se debe ocultar este estado en el release gate.

## SQLite (estado: PRODUCTION READY)

- ✅ 533 unit tests corren contra SQLite.
- ✅ Migraciones funcionan.
- ✅ Seed funciona.
- ✅ Docker image usa SQLite por defecto (`SAMBA_DB_PATH=/app/data/samba.db`).
- ✅ docker-compose.yml listo para producción con SQLite.
