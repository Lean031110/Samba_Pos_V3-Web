# PWA — SambaPos_LBA

**Estado:** ✅ Manifest + Service Worker + icons + offline shell (Fase 4 — batch 1)
**Última actualización:** 2026-09-07

---

## Resumen

SambaPos_LBA es una **PWA instalable**. Esto significa que el navegador (Chrome, Edge, Samsung Internet, Safari iOS 16.4+) puede ofrecer "Agregar a pantalla de inicio" / "Instalar", y la aplicación funciona como una app nativa:

- Sin barra de navegador (modo *standalone*).
- Icono propio en el lanzador de aplicaciones.
- Splash screen al iniciar.
- Funciona *offline* (con limitaciones — ver [Offline](#offline)).
- Recibe *push notifications* del sistema operativo (cuando el usuario otorga permiso).

---

## Cómo instalar

### En Android (Chrome / Samsung Internet / Edge)

1. Abrir la URL de SambaPos_LBA en el navegador.
2. Iniciar sesión (es necesario para que la PWA considere el contexto de uso).
3. El navegador mostrará un mini-infobar con "Instalar app" — o abrir el menú ⋮ y tocar **"Agregar a pantalla de inicio"** / **"Instalar aplicación"**.
4. Confirmar. El icono aparecerá en el lanzador.

Alternativamente, SambaPos_LBA captura el evento `beforeinstallprompt` y puede mostrar un **banner personalizado** dentro de la app con un botón "Instalar" más visible (configurable en `frontend/js/services/pwa.js`).

### En desktop (Chrome / Edge)

1. Abrir la URL.
2. Aparecerá un icono de "Instalar" (⊕) en la barra de URL, junto al bookmark.
3. Click → "Instalar".
4. Se abre en su propia ventana sin pestañas.

### En iOS (Safari 16.4+)

1. Abrir la URL en Safari.
2. Tocar el botón **Compartir** (cuadrado con flecha arriba).
3. Tocar **"Añadir a inicio"**.
4. El icono aparecerá en el *home screen*.

> **Nota iOS:** Safari iOS solo soporta Service Worker desde 16.4 (marzo 2023). Versiones anteriores no permitirán instalación.

---

## Manifiesto

Archivo: `frontend/manifest.webmanifest`

```json
{
  "name": "SambaPos_LBA",
  "short_name": "SambaPos",
  "description": "POS web moderno, táctil, instalable y offline-capable para restaurantes.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "fullscreen", "minimal-ui"],
  "orientation": "any",
  "background_color": "#044392",
  "theme_color": "#044392",
  "lang": "es",
  "icons": [
    { "src": "icons/icon-192.png",            "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png",            "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-192-maskable.png",   "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-512-maskable.png",   "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "POS",        "url": "/#pos" },
    { "name": "Cocina (KDS)", "url": "/#kitchen" },
    { "name": "Dashboard",  "url": "/#dashboard" }
  ]
}
```

### Detalles

- **`display: standalone`** — sin barra de navegador. Es el modo recomendado para POS.
- **`display_override: ["standalone", "fullscreen", "minimal-ui"]`** — intenta primero *standalone*, luego *fullscreen* (sin status bar — útil para quioscos), finalmente *minimal-ui* como fallback.
- **`orientation: any`** — permite rotación libre. SambaPos_LBA está diseñado para funcionar tanto en portrait como landscape.
- **`theme_color: #044392`** — azul profundo de marca. Define el color de la barra de estado en Android.
- **`background_color: #044392`** — color del splash screen al iniciar.
- **`shortcuts`** — accesos rápidos en el menú contextual del icono (long-press en Android).
- **`icons` con `purpose: maskable`** — iconos que Android recorta automáticamente a la forma del sistema (circular, cuadrado, etc.) sin perder información importante (gracias al 10% de safe padding en el diseño).

---

## Service Worker

Archivo: `frontend/sw.js`

### Estrategia de cache

| Tipo de request        | Estrategia                  | Razón                                                     |
|------------------------|-----------------------------|-----------------------------------------------------------|
| Navegación (HTML)      | Network-first, fallback cache | Siempre muestra lo más reciente, pero offline usa cache. |
| Assets estáticos (CSS, JS, fonts, manifest) | Cache-first | Son inmutables por versión.                              |
| Imágenes               | Stale-while-revalidate      | Muestra la versión cacheada al instante y actualiza en background. |
| `/api/*`, `/health`, `/ready`, `/version`, `/socket.io/*` | Nunca cachear | Deben ir siempre a red. |

### Versionado

El SW se versiona con `sambapos-lba-v0.4.0`. En cada release que cambia assets precacheados, este string debe actualizarse para forzar una nueva activación de SW y limpiar caches viejos automáticamente.

### Comandos

- `self.skipWaiting()` en `install` — el SW nuevo toma control inmediatamente (sin esperar a que se cierren todas las pestañas).
- `self.clients.claim()` en `activate` — el SW toma control de clientes ya abiertos.
- Limpieza: en `activate`, elimina todos los caches cuyo prefijo no coincida con la versión actual.

### Update flow

1. La página carga el SW actual.
2. El navegador descubre un SW nuevo (byte-for-byte diferente en `sw.js`).
3. Lo instala en background y emite `updatefound`.
4. El SW nuevo entra en estado `installed` pero `waiting` (no toma control todavía).
5. El SW viejo emite `controllerchange` cuando el nuevo toma control.
6. La página puede escuchar `updatefound` y mostrar un banner "Nueva versión disponible — Actualizar".

SambaPos_LBA implementa esto en `frontend/js/services/pwa.js` con un banner superior verde que ofrece "Actualizar" / "Más tarde". Al clickar "Actualizar", se envía `SKIP_WAITING` al SW y se recarga la página.

---

## Offline

### Qué funciona offline

- **Login** — el formulario HTML y CSS están en el offline shell, pero el login real requiere red (valida contra la base de datos del backend). El usuario verá la pantalla de error "Sin conexión".
- **Pantalla de offline** — `frontend/offline.html` muestra un mensaje branded "Sin conexión" con botón "Reintentar".
- **KDS** — si la PWA ya estaba abierta y se pierde la red, el KDS sigue mostrando los pedidos que ya recibió vía WebSocket. Los nuevos pedidos no llegarán hasta reconectar.

### Qué NO funciona offline (pendiente — Fase 11)

- Crear tickets nuevos.
- Procesar pagos.
- Modificar inventario.
- Cualquier acción POST/PUT/DELETE.

La Fase 11 (offline real con outbox + sync) está pendiente. Requiere:

1. Local queue de operaciones en IndexedDB.
2. Operation UUID (idempotency key).
3. Server ACK antes de marcar como synced.
4. Conflict policy (last-write-wins vs. server-wins).
5. Resync tras reconexión.

---

## Push Notifications (Web Push + VAPID)

**Estado:** ⏳ Pendiente — Fase 9.

Implementación futura requiere:

- Claves VAPID generadas con `web-push` library.
- Endpoint `POST /api/push/subscribe` para registrar suscripciones por dispositivo.
- Endpoint `POST /api/push/unsubscribe` para baja.
- Service Worker handler `push` event para mostrar la notificación.
- Service Worker handler `notificationclick` para deep-link a la pantalla relevante.
- Categorías de notificación: `kitchen.new-order`, `kitchen.ready`, `printer.offline`, `inventory.low`, `cash.close-pending`.
- Limpieza automática de suscripciones expiradas (HTTP 410 Gone).

Lo que Sí funciona hoy:

- **Web Notifications API** básico: SambaPos_LBA puede pedir permiso y mostrar notificaciones locales (no push). Esto se usa en el KDS para alertar de nuevos pedidos incluso si la pestaña está en background.
- **Vibración** (`navigator.vibrate`) en Android.
- **Sonido** (AudioContext) para alertas audibles.

---

## Android nativo (Capacitor)

**Estado:** ⏳ Pendiente — Fase 15.

Cuando se requiera acceso a hardware que el navegador no controla (impresoras USB, escáneres de código de barras, impresoras térmicas Bluetooth), se envolverá la PWA con [Capacitor](https://capacitorjs.com/) para generar un APK/AAB nativo.

Beneficios del enfoque Capacitor:

- **Misma API y reglas de dominio** — la lógica de negocio no se duplica.
- **Mismo frontend** — el HTML/CSS/JS se sirve sin cambios dentro del WebView de Capacitor.
- **Plugins nativos** para acceder a USB, Bluetooth, NFC.
- **Distribución vía Play Store** con package id `com.sambapos.lba`.

Limitaciones:

- Requiere build con Android Studio.
- Requiere firma del APK.
- Requiere permisos declarados en `AndroidManifest.xml`.
- Las notificaciones push nativas requieren Firebase Cloud Messaging (FCM).

---

## Verificación de instalación

Para verificar que la PWA está correctamente instalable:

1. **Lighthouse audit** — en Chrome DevTools > Lighthouse > PWA category. Debe pasar todos los checks.
2. **Chrome DevTools > Application > Manifest** — debe mostrar todos los campos parseados correctamente.
3. **Chrome DevTools > Application > Service Workers** — debe mostrar el SW registrado y activo.
4. **Android real device** — instalar y verificar:
   - Icono aparece en launcher.
   - Sin barra de navegador al abrir.
   - Splash screen con color de marca.
   - Sobrevive reinicio del navegador.
   - Funciona en *airplane mode* (offline shell).

---

## Troubleshooting

### "No aparece el botón Instalar"

Causas comunes:

- **Sin HTTPS** — el SW solo se registra en HTTPS o `localhost`.
- **Service Worker fallido** — revisar DevTools > Console por errores de registro del SW.
- **Manifest inválido** — DevTools > Application > Manifest debe mostrar todos los campos sin warnings.
- **Sin interacción del usuario** — Chrome requiere que el usuario haya interactuado con la página antes de ofrecer instalación.
- **`start_url` no es alcanzable** — debe retornar 200.
- **Faltan icons maskable** — Android requiere al menos 192 y 512 con `purpose: maskable`.

### "La app no actualiza"

- El SW está cacheado. Forzar `Update` desde DevTools > Application > Service Workers.
- Borrar cache manualmente desde DevTools > Application > Cache Storage.
- Incrementar `SW_VERSION` en `frontend/sw.js` para forzar nueva activación.

### "El icono se ve mal en Android"

- Probablemente el `purpose: maskable` no tiene el 10% de safe padding. Regenerar con `node backend/scripts/generate-icons.js` después de ajustar `drawIcon()` para dejar más margen.

---

## Próximos pasos (Fase 4 — pendiente)

- [ ] Add Lighthouse PWA CI check en GitHub Actions.
- [ ] Generar íconos con calidad real (no placeholder canvas — usar SVG hand-drawn o comisión de diseño).
- [ ] Add "Instalar app" button visible en el dashboard para descubrir la feature.
- [ ] Pedir permiso de notificaciones en el primer login del KDS.
- [ ] Add atajos de teclado en desktop (F1=POS, F2=KDS, F3=Dashboard, Esc=Logout).
- [ ] Add orientation hint para tablets — si la app se abre en portrait y un flujo crítico requiere landscape, mostrar prompt "Rota tu tablet para mejor experiencia".
