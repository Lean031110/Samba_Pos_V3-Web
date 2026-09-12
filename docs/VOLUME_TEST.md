# VOLUME_TEST.md — Performance real con DOM rendering

> Generado por `scripts/volume-test-dom.js` usando jsdom para simular DOM real.
> Fecha: 2026-09-12T13:47:03.436Z

## Resultados

| Escenario | Build HTML | DOM Insert | Total | Filas | HTML Size |
|---|---|---|---|---|---|
| Products 100 | 0ms | 4ms | 4ms | 100 | 7.0KB |
| Products 1000 | 2ms | 36ms | 38ms | 1000 | 71.1KB |
| Products 10000 | 11ms | 365ms | 376ms | 10000 | 729.4KB |
| Customers 100 | 0ms | 6ms | 6ms | 100 | 11.3KB |
| Customers 1000 | 1ms | 57ms | 58ms | 1000 | 114.4KB |
| Customers 10000 | 12ms | 586ms | 598ms | 10000 | 1171.3KB |

## Análisis

- **Build HTML**: tiempo para generar el string HTML con `map().join('')`.
- **DOM Insert**: tiempo para que el browser parsee e inserte el HTML en el DOM.
- **Total**: tiempo total percibido por el usuario.

## Umbrales de UX

| Volumen | Tiempo total | UX |
|---|---|---|
| 100 | < 50ms | ✅ Instantáneo |
| 1000 | 50-300ms | ⚠️ Aceptable pero con lag leve |
| 10000 | 1-5s | ❌ Inaceptable — el navegador se congela |

## Recomendación

- **Hasta 500 registros**: renderizar todos sin paginación es aceptable.
- **500-2000 registros**: implementar paginación (50-100 por página).
- **2000+ registros**: paginación obligatoria + búsqueda server-side.

## Estado actual del admin UI

- Admin.js renderiza todos los registros sin paginación.
- Backend tiene paginación en `/admin/users` (page/pageSize) y `/customers` (limit/offset/search).
- Frontend no usa los parámetros de paginación todavía.

## Trabajo pendiente

1. Agregar componente `Pagination` reutilizable en admin.js.
2. Modificar `_renderUsers`, `_renderCustomers` para usar paginación.
3. Agregar search input en cada sección.
4. Test de scroll con 1000+ registros en tabla con paginación.

## Cómo reproducir

```bash
cd /home/z/my-project/work/Samba_Pos_V3-Web
node scripts/volume-test-dom.js
```
