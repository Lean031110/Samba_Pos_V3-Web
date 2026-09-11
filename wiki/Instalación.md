# Instalación (entorno local)

## Requisitos

| Herramienta | Versión mínima | Uso |
|-------------|----------------|-----|
| Node.js | **20+** | backend, tests, Capacitor CLI |
| npm | incluido con Node | dependencias |
| Python 3 | cualquiera | servidor estático del frontend (o cualquier static server) |
| Git | cualquiera | clonar |
| Java JDK 17+ | solo para APK/AAB local | `keytool`, Gradle |
| Android SDK | solo para APK/AAB local | `ANDROID_HOME` configurado |
| Docker | opcional | despliegue contenerizado |
| Pillow (pip) | opcional | regenerar íconos Android |

## 1) Clonar e instalar

```bash
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web

# Backend
cd backend
npm ci                 # instala exactamente package-lock.json
npm run migrate        # crea la BD SQLite + tablas
npm run seed           # datos iniciales del restaurante

# Frontend: es estático, no hay nada que instalar.
# Capacitor (raíz del repo, solo si vas a tocar Android):
cd .. && npm ci
```

> `npm ci` (no `npm install`) garantiza la misma resolución de
> dependencias que usa CI — los lockfiles son la fuente de verdad.

## 2) Levantar el backend

```bash
cd backend
npm run dev            # node --watch → reinicia al guardar
# API en http://localhost:3001
# Health check: http://localhost:3001/health
```

Variables útiles (todas opcionales, con defaults razonables — ver
[Configuración de parámetros](Configuración-de-parámetros)):

```bash
PORT=3001 JWT_SECRET=dev-secret npm run dev
```

## 3) Servir el frontend

El frontend es estático. Cualquiera de estas opciones funciona:

```bash
cd frontend
python3 -m http.server 8080          # → http://localhost:8080
# o
npx serve .                          # si prefieres Node
```

**Login**: usuario `Administrador` · PIN `1234` (seed local).
Otros usuarios del seed: `Mesero`, `Cocinero`, `Cajero` (PIN 1234).

> En el navegador la app usa la API relativa `/api` contra el mismo
> host que sirve la página si abres el frontend desde el backend, o la
> pantalla **ServerConfig** (URL del servidor + Probar) si abres el
> frontend desde otro origen. Ver
> [Configuración de parámetros](Configuración-de-parámetros#serverconfig-pantalla-de-bienvenida).

## 4) Probar la demo de GitHub Pages (sin instalar nada)

**https://lean031110.github.io/Samba_Pos_V3-Web/** — usuarios demo
`Administrador` / `Mesero` / `Cocinero` / `Cajero`, PIN `1234`. Es la
misma UI con datos ficticios (Mock API); ver [Modo-Demo](Modo-Demo).

## 5) Build de Android en local (opcional)

```bash
# desde la RAÍZ del repo (los scripts de Capacitor viven ahí)
npm ci                          # deps de Capacitor (root package.json)
npm run test:android:config     # gate de identidad/branding
npm run cap:sync                # copia frontend/ dentro de android/
npm run build:android:debug     # gradle assembleDebug

# APK resultante:
android/app/build/outputs/apk/debug/app-debug.apk
```

Requisitos: JDK 17+ y `ANDROID_HOME` apuntando al SDK. Detalle
completo (incl. firma release) en [Android](Android).

## 6) Docker (opcional)

```bash
docker build -t sambapos-lba .
docker run -p 3001:3001 sambapos-lba
# smoke: curl http://localhost:3001/ready
```

Ver [Despliegue-Producción](Despliegue-Producción#docker).

## Scripts de referencia

**Raíz del repo** (Capacitor/Pages):

| Script | Qué hace |
|--------|----------|
| `npm run cap:add` | Bootstrap del proyecto Android (**solo si no existe** `android/`) |
| `npm run cap:copy` | Copia `frontend/` → `android/app/src/main/assets/public` |
| `npm run cap:sync` | copy + plugins |
| `npm run cap:open` | Abre Android Studio |
| `npm run test:android:config` | Gate: identidad, branding, wrapper (lo mismo que CI) |
| `npm run build:android:debug` | config-check + sync + `assembleDebug` |
| `npm run build:android:release` | config-check + sync + `bundleRelease` (necesita firma) |
| `npm run pages:demo` | Construye `_site/` (overlay demo) como el deploy de Pages |
| `npm run pages:preview` | `_site/` + servidor local en el sub-path real |
| `npm run pages:smoke` | preview + suite Playwright contra el sub-path |

**`backend/`**:

| Script | Qué hace |
|--------|----------|
| `npm start` | Servidor en producción (`node src/api/server.js`) |
| `npm run dev` | Servidor con `--watch` |
| `npm run migrate` / `migrate:rollback` | Migraciones Knex (latest / rollback) |
| `npm run seed` | Datos iniciales |
| `npm test` | Suite de integración API |
| `npm run test:unit` | Los 533 unit (listado explícito de suites) |
| `npm run test:all` | Todo: unit + E2E + screenshots (como CI) |
| `npm run test:e2e` | 61 E2E Playwright funcionales |
| `npm run test:visual` | Regresión visual (5 pantallas) |
| `npm run test:visual:update` | Regenera baselines (cuidado — ver [Pruebas](Pruebas)) |
| `npm run screenshots` | 18 capturas documentales |
| `npm run backup` / `restore` | Backup/restore de la BD |

## Problemas frecuentes de instalación

| Síntoma | Solución |
|---------|----------|
| `EADDRINUSE :3001` | `PORT=3002 npm run dev` y ajusta la URL en ServerConfig |
| Login rechaza el PIN | ¿Corriste `npm run seed`? La BD sin seed no tiene usuarios |
| `cap:sync` no ve cambios | Borra `android/app/src/main/assets/public` y re-sincroniza |
| Tests E2E flakean | Asegúrate de que no haya otro backend en 3001 (los tests resetean la BD) |
| Más casos | [Troubleshooting](Troubleshooting) |
