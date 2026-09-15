# 🍽️ LBApos (SambaPOS_LBA) — Wiki del proyecto

**POS de restaurante moderno, táctil, instalable y offline-capable — UI estilo Odoo 19.**

Stack: **Node.js · Express · Knex · Socket.io · Vanilla JS · Capacitor (Android) · PWA**
Marca: **LBA** · Azul corporativo `#044392` · App Android: `LBApos` (`com.sambapos.lba`)

| Métrica | Valor |
|---------|-------|
| Tests unitarios | **533** (gate obligatorio en CI) |
| Tests E2E funcionales | **61** (gate obligatorio en CI) |
| Screenshots documentales | **18** |
| Regresión visual | **5 pantallas base** (tolerancia 2%) |
| Pages smoke (demo) | **4** (sub-path real) |
| Vulnerabilidades npm | **0** (gate) |
| Versión actual | **0.4.0** |

---

## 🚀 Inicio rápido (desarrollo local)

```bash
git clone https://github.com/Lean031110/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web

# Backend (API + BD)
cd backend && npm ci
npm run migrate && npm run seed
npm run dev            # → http://localhost:3001

# Frontend (estático — abrir en navegador)
cd ../frontend
python3 -m http.server 8080   # → http://localhost:8080

# Login demo local: Administrador / PIN 1234
```

> Android (APK), firma release, GitHub Pages y CI: ver las páginas
> específicas de esta wiki (índice abajo).

---

## 📑 Índice de la wiki

| Página | Contenido |
|--------|-----------|
| **[Arquitectura](Arquitectura)** | Capas, hexagonal, frontend vanilla, tiempo real, datos |
| **[Instalación](Instalación)** | Requisitos, entorno local, scripts npm, primera ejecución |
| **[Configuración de parámetros](Configuración-de-parámetros)** | ⭐ **Referencia completa**: cada parámetro y TODAS las formas de configurarlo |
| **[CI-CD](CI-CD)** | Los 4 workflows, gates, artifacts, cómo leer fallos |
| **[Android](Android)** | APK/AAB, identidad, firma + secrets, emulator smoke, Play Store |
| **[GitHub-Pages](GitHub-Pages)** | Demo pública, base path, aislamiento DEMO_MODE |
| **[Pruebas](Pruebas)** | Todas las suites, cómo correrlas, cómo actualizar la baseline visual |
| **[Modo-Demo](Modo-Demo)** | Usuarios demo, Mock API, aislamiento con producción |
| **[Roles-y-Flujos](Roles-y-Flujos)** | RBAC (27 permisos), navegación por rol, flujos de negocio |
| **[Despliegue-Producción](Despliegue-Producción)** | LAN, Docker, PM2, HTTPS, backups |
| **[Seguridad](Seguridad)** | Secrets, JWT, gitleaks, política de credenciales |
| **[Troubleshooting](Troubleshooting)** | Problemas conocidos y sus soluciones exactas |
| **[Contribuir](Contribuir)** | Ramas, PRs, checklist de merge, protocolo de worklog |

---

## 🧭 Mapa rápido: "¿qué quiero hacer?"

- **Instalar y probar en local** → [Instalación](Instalación)
- **Cambiar un puerto / URL / modo / color** → [Configuración de parámetros](Configuración-de-parámetros)
- **Generar el APK para una tablet** → [Android](Android) § Build local
- **Firmar y publicar en Play Store** → [Android](Android) § Firma y publicación
- **Entender por qué falló un CI** → [CI-CD](CI-CD) § Cómo leer fallos + [Troubleshooting](Troubleshooting)
- **Administrar los secrets de GitHub** → [Android](Android) § Secrets + [Seguridad](Seguridad)
- **Ver la demo sin instalar nada** → https://lean031110.github.io/Samba_Pos_V3-Web/ (PIN `1234`)
- **Actualizar las capturas de la regresión visual** → [Pruebas](Pruebas) § Baseline visual
- **Desplegar en el restaurante** → [Despliegue-Producción](Despliegue-Producción)

---

## 📊 Estado real del proyecto

Etiquetas: **IMPLEMENTADO** (funciona y verificado en CI) · **CONFIGURADO**
(existe la configuración) · **PROBADO** (verificación parcial) ·
**EXPERIMENTAL** (con problemas conocidos) · **PENDIENTE**.

| Componente | Estado |
|------------|--------|
| API REST + lógica de negocio | ✅ IMPLEMENTADO (533 unit + 61 E2E) |
| UI Odoo 19 (POS/KDS/Admin/login) | ✅ IMPLEMENTADO (E2E + visual regression) |
| SQLite (producción) | ✅ IMPLEMENTADO (migrations + seed + backup drill) |
| PWA instalable + offline shell | ✅ IMPLEMENTADO |
| GitHub Pages demo (aislada) | ✅ IMPLEMENTADO (smoke Playwright) |
| Android APK debug (gate CI) | ✅ IMPLEMENTADO (identity gates aapt2) |
| Android firma release (AAB) | ⚙️ CONFIGURADO (secrets activos, `jarsigner` verify) |
| Android emulator smoke | 🧪 EXPERIMENTAL (best-effort) |
| Impresión ESC/POS | ✅ PROBADO (transporte mock; impresora física = manual) |
| Push notifications (Web Push) | ✅ PROBADO (VAPID; entrega depende de servicio/permisos) |
| PostgreSQL | 🧪 EXPERIMENTAL (migración PG falla en CI — constraint duplicado) |

La lista completa con evidencia audit está en el `README.md` del repositorio.

---

## 🏷️ Convenciones del proyecto

- **Ramas**: `feature/*`, `fix/*`, `chore/*`, `bloque-x/*` → PR a `main`
- **Nada se considera hecho hasta que CI lo verifica** — los números de
  tests del badge salen de la ejecución real, no de estimaciones.
- **`backend/src/` es territorio protegido**: cambios solo con
  documentación → tests → fix → reporte (ver [Contribuir](Contribuir)).
- **Secrets NUNCA en git**: `gitleaks` escanea cada push (gate CI).
- Los idiomas del código/comentarios son inglés/español mixto; la UI y
  esta wiki están en español.
