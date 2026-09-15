# GitHub Pages — demo pública

**URL**: https://lean031110.github.io/Samba_Pos_V3-Web/
Usuarios: `Administrador` / `Mesero` / `Cocinero` / `Cajero` · PIN `1234`

## Qué es (y qué NO es)

La demo sirve la **misma UI del producto** con datos ficticios:
- ✅ Para: mostrar el producto, probar flujos, capturas, onboarding.
- ❌ NO es producción: no hay backend, no persiste nada real, cada
  recarga parte de datos frescos (el Mock API resetea).

El aislamiento es **estructural** (no un flag de runtime que alguien
pueda olvidar):

```
pages.yml → node scripts/build-pages-demo.js
          → copia frontend/ → _site/
          → UNA sola modificación: cp frontend/config.demo.js _site/js/config.js
          → _site se publica (todo lo demás es byte-idéntico al repo)
```

`config.demo.js` fija `DEMO_MODE: true`. El mock
(`frontend/js/services/demo-data.js`) **solo se activa** con ese flag
explícito — una build de producción (`config.js` con `DEMO_MODE:
false`) no puede caer en datos ficticios ni por accidente. Gates de CI
que lo garantizan:

- `grep 'DEMO_MODE: true' _site/js/config.js` (overlay activo)
- El mock intercepta `/api/*` y WS; **ninguna llamada sale del
  navegador** (verificado en el smoke).

## Base path (`APP_BASE_PATH`) sin parches

La demo vive bajo `/Samba_Pos_V3-Web/`, producción bajo `/`. La app
resuelve su base **en runtime** desde `location.pathname`
(`frontend/js/config.js`), y todos los recursos son relativos:

- assets CSS/JS → funcionan en ambos orígenes
- `manifest.webmanifest` + íconos → URLs resueltas con `window.LBA_BASE`
- service worker → scope bajo el sub-path; `sw.js` es base-path aware
- navegación interna → rutas relativas

Gates de CI: `index.html` sin `href="/..."` absolutos · `sw.js`
contiene `BASE`. Si alguien rompe esto, el workflow falla antes de
publicar.

## Smoke test (antes de publicar)

`pages.yml` no publica a ciegas. Antes del deploy:

1. Gates de existencia: index, app.js, config.js, api.js, manifest, sw,
   offline.html, css, fontawesome, íconos, logo — todos presentes en
   `_site/`.
2. Overlay demo activo + sin rutas absolutas + sw base-path aware.
3. **Playwright contra un preview local del artifact** servido bajo el
   sub-path REAL (`scripts/serve-pages.js`): login demo → selector de
   áreas → POS → KDS → Admin (4 tests).
4. Solo entonces `deploy-pages` publica desde `main` (en PRs se corre
   build+smoke sin publicar).

> El smoke acepta `text/javascript` y `application/javascript` (MIME
   del CDN de GitHub varía) — fix de portabilidad documentado en
   [Troubleshooting](Troubleshooting#mime-javascript-en-pages).

## Reproducir el deploy localmente

```bash
npm run pages:demo    # construye _site/ (overlay demo)
npm run pages:preview # + servidor en http://localhost:8080/Samba_Pos_V3-Web/
npm run pages:smoke   # + suite Playwright contra el sub-path real
```

Útil para depurar problemas de la demo sin esperar a CI.

## Cambiar cosas de la demo

| Quiero cambiar | Dónde |
|----------------|-------|
| Datos (productos, mesas, usuarios) | `frontend/js/services/demo-data.js` |
| Comportamiento del mock (respuestas) | idem — clona respuestas para no mutar el estado |
| Config exclusiva de demo | `frontend/config.demo.js` (solo overlay) |
| Qué gates se verifican | `.github/workflows/pages.yml` + `scripts/build-pages-demo.js` |
| Trigger del deploy | `pages.yml` (push a main en `frontend/**`...) |

> La demo hereda TODA la UI del repo — para cambiarla, cambias el
> frontend (con sus tests) y Pages la publica en el siguiente merge.

## Worklog de la demo (estado verificado)

- CI de Pages: build + 5 grupos de gates + smoke 4/4 ✓
- Deploy a producción de Pages verificado con curl (200 en todos los
  recursos) ✓
- Flujo completo verificado con Playwright contra la demo LIVE:
  login → áreas → POS → KDS → Admin ✓
