# Contribuir

## Reglas base

1. **CI es la verdad**: nada está "listo" hasta que el pipeline lo
   verifica. Los conteos de tests que ves en el README salen de la
   ejecución real del job (Summary del run).
2. **`backend/src/` es territorio protegido** — ver protocolo abajo.
3. **Secrets jamás en git** (gitleaks gatea cada push).
4. **Sin rediseños visuales no solicitados**: la UI Odoo 19 es la base
   establecida (PR #9); cambios visuales = PR propio + capturas +
   visual regression actualizada vía workflow.
5. Commits atómicos: `tipo(área): descripción` —
   `fix(ci): pipefail en pasos con tee`.

## Flujo de trabajo

```bash
git checkout main && git pull --ff-only
git checkout -b feature/mi-cosa        # o fix/, chore/, test/
# ... cambios + tests ...
git add -p                             # revisa TU propio diff
git commit -m "feat(pos): soporta propina fija por mesa"
git push -u origin feature/mi-cosa
# PR a main (template) → CI corre TODO el pipeline
```

### Checklist del PR

- [ ] CI verde completo (533 unit + 61 E2E + screenshots + visual +
      docker + android build)
- [ ] Si toca frontend: artifact `ui-redesign-screenshots` revisado
- [ ] Si toca Pages: smoke 4/4
- [ ] Si toca Android: `test:android:config` local OK
- [ ] Si toca backend/src: protocolo cumplido (abajo)
- [ ] Nuevo comportamiento cubierto por tests NUEVOS
- [ ] README/docs/wiki actualizados si cambia comportamiento

## Cambios en `backend/src/` (protocolo obligatorio)

La lógica de negocio (dinero, inventario, cocina) vive ahí y se
protege con:

1. **Documentar**: issue/PR describiendo el defecto o cambio exacto
   (qué regla de negocio, por qué).
2. **Test primero**: test que falla reproduciendo el bug (o que define
   el comportamiento nuevo).
3. **Fix mínimo**: sin refactors oportunistas en el mismo diff.
4. **Reportar**: en el PR, sección "cambios en backend/src" con
   archivos tocados y por qué era inevitable.

`git diff --stat main...HEAD -- backend/src` debe poder explicarse
línea a línea.

## Convenciones de código

- **Frontend**: vanilla JS (ES2020), sin bundler, sin framework.
  Estilo Odoo 19 (`css/odoo19.css`), clases utilitarias del design
  system antes que CSS ad-hoc. Touch targets ≥48–52px.
- **Backend**: hexagonal (api/application/domain/infrastructure), el
  dominio no conoce Express/Knex. `node --test` para unit.
- **Tests**: nombres descriptivos en español o inglés pero consistentes
  dentro del archivo.
- **Docs**: markdown, español para docs de producto, inglés aceptable
  en comentarios de código.

## Cambios visuales (UI)

1. Antes de diseñar: revisa `wiki/Arquitectura` (design system) y las
   capturas actuales (`docs/screenshots/`).
2. Implementa con las clases del design system.
3. La **visual regression** va a fallar → revisa que el diff sea
   EXACTAMENTE tu cambio (artifact `visual-regression-diff`).
4. Actualiza la baseline vía **Actions → Visual Baseline → Run
   workflow** (nunca commits silenciosos de capturas).
5. Screenshots documentales (`npm run screenshots`) se regeneran en CI.

## Activar la wiki de GitHub

La documentación vive versionada en **`wiki/`** del repo (la estás
leyendo). Para publicarla como GitHub Wiki nativa (una vez):

1. Visita `https://github.com/Lean031110/Samba_Pos_V3-Web/wiki` y crea
   la primera página (cualquier contenido: "bootstrap").
2. Con un **PAT clásico** (scope `repo`) o SSH key con acceso al repo:

```bash
bash scripts/publish-wiki.sh   # usa scripts/publish-wiki.sh del repo
```

> El PAT fine-grained NO puede pushear a `*.wiki.git` (no existe
> permiso wiki para ese tipo de token — documentado en
> [Troubleshooting](Troubleshooting#9-api-404-en-actionspublic-key-secrets-por-api)).

## Estructura de ramas históricas

- `feature/bloque-x` — los 13 bloques funcionales originales
- `feature/ui-odoo19-redesign` — BLOQUE N (rediseño + hardening, PR #9)
- `fix/pages-smoke-mime-portability` — PR #10
- `chore/release-signing-secrets` — PR #11 (firma + esta wiki)

## Protocolo de worklog

El proyecto mantiene un worklog por tarea (formato: Task ID / Agent /
Work Log / Stage Summary). Si ejecutas una tarea multi-paso, deja
registro al final del PR: qué se hizo, qué se rompió y se arregló
(los bugs encontrados por los gates son valiosos: alimentan
[Troubleshooting](Troubleshooting)).
