# Modo Demo — datos ficticios, aislamiento total

## Activación

El modo demo NO es un flag que se activa en runtime: es **una build
distinta** producida por el deploy de GitHub Pages:

```
frontend/js/config.js         → DEMO_MODE: false   (producción, SIEMPRE)
frontend/config.demo.js       → DEMO_MODE: true    (fuente del overlay)
pages.yml: cp config.demo.js → _site/js/config.js  (única diferencia)
```

Cuando `LBA_CONFIG.DEMO_MODE === true`:
1. `api.js` enruta cada llamada al **Mock API** (`demo-data.js`)
2. El topbar muestra el badge naranja **DEMO**
3. La consola imprime un banner de advertencia (irreconocible para QA)

Una build de producción **no tiene forma** de activar el mock: no hay
query-param, no hay localStorage, no hay env var. El único camino es
el overlay de deploy.

## Usuarios demo

| Usuario | Rol | A dónde entra | Qué puede probar |
|---------|-----|---------------|------------------|
| `Administrador` | admin | Dashboard | KPIs, áreas, configuración, todos los flujos |
| `Mesero` | mesero | POS | Mesas, pedido, envío a cocina, pago |
| `Cocinero` | cocina | KDS | Estaciones Cocina/Pizzería/Barra, SLA URGENTE |
| `Cajero` | cajero | Caja | Apertura/cierre, arqueos, payout |

**PIN: `1234`** para todos.

## Qué cubre el Mock API

`frontend/js/services/demo-data.js` intercepta todo lo que la UI pide:

- **Catálogo**: productos con imágenes placeholder, precios, categorías
- **Mesas y áreas**: por zona (Salón, Terrace…, Cocina…), estados
  (libre/ocupada/cuenta pedida)
- **Pedidos y KDS**: órdenes con estados y tiempos simulados, routing
  por estación
- **Pagos**: Efectivo CUP · USD · MLC (los métodos del seed)
- **Caja**: sesión abierta con apertura/cierre y eventos
- **Reportes**: ventas, top productos, tickets cerrados/anulados
- WS: eventos simulados de cocina (no hay Socket.io real)

El mock **clona** las respuestas antes de entregarlas (la UI puede
mutar objetos sin corromper el estado base).

## Verificación en CI (por qué puedes confiar)

El smoke de Pages ejecuta contra el artifact real, bajo el sub-path
real: login → áreas → POS → KDS → Admin. Además:

- Gate: `_site/js/config.js` contiene `DEMO_MODE: true` (overlay activo)
- La demo nunca llama a un backend: no existe endpoint al que llamar
  (el mock intercepta en el cliente)

## Demo vs producción — tabla de decisión

| Build | config | Datos | Backend | Uso |
|-------|--------|-------|---------|-----|
| GitHub Pages | overlay demo | ficticios, reset al recargar | NINGUNO | mostrar/probar UI |
| Navegador LAN | `config.js` | reales (SQLite/PG) | Express local | operación del restaurante |
| Android APK | `config.js` | reales + offline | LAN del local | tablets |
| Capacitor dev | `config.js` | reales | LAN/local | desarrollo Android |

## Modificar la demo

- **Datos**: `frontend/js/services/demo-data.js` (todo centralizado)
- **Comportamiento del mock**: idem (patrón: `mockHandlers` por endpoint)
- **Config demo**: `frontend/config.demo.js`
- Recuerda: cambiar esto cambia lo que el mundo ve en
  https://lean031110.github.io/Samba_Pos_V3-Web/ — el smoke de CI
  validará los flujos principales antes de publicar.
