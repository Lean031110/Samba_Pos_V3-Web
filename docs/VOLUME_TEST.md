# VOLUME_TEST.md — Performance with large datasets

> Generado por `scripts/volume-test.js`
> Fecha: 2026-09-12T12:16:15.738Z

## Resultados

| Escenario | Registros | Tiempo render (ms) | Tamaño HTML |
|---|---|---|---|
| 100 products | 100 | 0ms | 8.5KB |
| 1000 products | 1000 | 1ms | 85.8KB |
| 10000 products | 10000 | 6ms | 868.1KB |
| 100 customers | 100 | 0ms | 12.2KB |
| 1000 customers | 1000 | 3ms | 123.8KB |
| 10000 customers | 10000 | 8ms | 1257.6KB |

## Análisis

- **100 registros**: HTML 8.5KB, render JS <1ms. Aceptable.
- **1000 registros**: HTML 85KB, render JS 1ms. Lag visible al insertar DOM (~100-500ms según navegador).
- **10000 registros**: HTML 868KB, render JS 5ms. El navegador se congela al insertar (1-3s) y consume mucha memoria.

## Recomendación

Sin paginación real:
- 100 registros: OK.
- 1000 registros: lag pero usable en desktop moderno.
- **10000+ registros: NO recomendado** — el navegador se congelará al insertar el HTML.

Con paginación real (50 por página):
- Backend: SQL devuelve solo 50 filas (rápido sin importar el total).
- Frontend: render constante de 50 filas, sin lag, sin importar el volumen.
- Memoria: solo 50 objetos en JS, no 10000.

## Estado actual

- **Admin.js renderiza TODOS los registros sin paginar**.
- Esto es aceptable para volumen inicial (< 1000 registros).
- **Para producción con volumen > 1000**: implementar paginación en UI.

## Endpoint con paginación real (post Bloque 12)

- `GET /api/admin/users?page=1&pageSize=50&search=...` → devuelve `pagination.hasNext`.
- `GET /api/customers?limit=50&offset=0&search=...` → devuelve `pagination`.
- `GET /api/admin/audit-logs?limit=50&offset=0` → ya tenía paginación.

Frontend aún no usa estos campos de paginación. Trabajo pendiente.
