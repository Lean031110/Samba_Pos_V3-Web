# Contribuir a SambaPos_LBA

¡Gracias por tu interés en contribuir! Este documento describe cómo hacerlo
de forma ordenada. Por favor léelo completo antes de abrir tu primer PR.

También respeta nuestro [Código de Conducta](./CODE_OF_CONDUCT.md) en todas
las interacciones del proyecto.

---

## Tabla de contenidos

- [Cómo reportar bugs](#cómo-reportar-bugs)
- [Cómo proponer features](#cómo-proponer-features)
- [Setup del entorno de desarrollo](#setup-del-entorno-de-desarrollo)
- [Convención de commits](#convención-de-commits)
- [Branching](#branching)
- [Code style](#code-style)
- [Antes de abrir un PR](#antes-de-abrir-un-pr)

---

## Cómo reportar bugs

1. Verifica que el bug no esté ya reportado en
   [Issues](https://github.com/Lean031110/Samba_Pos_V3-Web/issues).
2. Abre un nuevo issue usando la plantilla
   **Bug report** (`.github/ISSUE_TEMPLATE/bug_report.md`).
3. Completa todas las secciones: descripción, pasos para reproducir,
   resultado esperado, resultado actual, entorno (OS, Node, navegador),
   capturas y logs.
4. Si puedes, adjunta el output de `bash scripts/run-all-tests.sh` y de
   `npm audit`.

Mientras más reproducible sea el reporte, más rápido lo podremos atender.

---

## Cómo proponer features

1. Abre un issue con la plantilla **Feature request**
   (`.github/ISSUE_TEMPLATE/feature_request.md`).
2. Describe el problema que querés resolver y la solución que proponés.
3. Mencioná alternativas que hayas considerado.
4. Si el cambio es grande (nuevo módulo, cambio de arquitectura), abrí
   primero una discusión para alinear el diseño antes de codear.

---

## Setup del entorno de desarrollo

```bash
# 1. Fork & clone
git clone https://github.com/<tu-usuario>/Samba_Pos_V3-Web.git
cd Samba_Pos_V3-Web/backend

# 2. Instalar dependencias (reproducible desde package-lock.json)
npm ci

# 3. Variables de entorno
cp ../.env.example ../.env
# edita .env — set JWT_SECRET (>=32 chars), CORS_ORIGIN, ADMIN_PIN
#   JWT_SECRET=$(openssl rand -hex 32)

# 4. Migraciones + seed
npm run migrate
npm run seed

# 5. Levantar el server (modo watch)
npm run dev

# 6. Correr toda la suite de tests
bash scripts/run-all-tests.sh
```

> **Requisitos:** Node.js 20+, npm 10+. En CI usamos Node 20 sobre
> `ubuntu-latest`.

---

## Convención de commits

Usamos [**Conventional Commits**](https://www.conventionalcommits.org/).
Cada commit debe empezar con un *type* seguido de dos puntos y una
descripción en imperativo, en minúsculas, sin punto final:

```
<type>(<scope>): <descripción corta>

[cuerpo opcional, separado por línea en blanco]

[footer(s) opcional(es)]
```

### Types permitidos

| Type | Cuándo usarlo |
|------|---------------|
| `feat` | Nueva funcionalidad visible para el usuario |
| `fix` | Corrección de un bug |
| `docs` | Cambios en documentación (README, CHANGELOG, docs/*) |
| `test` | Agregar o modificar tests (sin cambiar código de producción) |
| `refactor` | Reescritura que no cambia comportamiento ni arregla bugs |
| `security` | Endurecimiento de seguridad (CORS, RBAC, validación, etc.) |
| `chore` | Tareas de mantenimiento (bump de deps, CI, scripts) |
| `perf` | Mejora de performance |
| `style` | Formato-only (sin cambio lógico) |
| `ci` | Cambios en `.github/workflows/` o pipeline |

### Ejemplos

```
feat(kds): propagar voids a estaciones hijas al anular ticket
fix(tickets): validar monto positivo en POST /:id/payments
docs(readme): añadir diagrama Mermaid de arquitectura
test(security): cubrir bypass de auth en /api/printers
security(auth): rate-limit estricto en login (5/15min)
chore(deps): bump sqlite3 5.1.7 -> 6.0.1 (7 vulns -> 0)
```

---

## Branching

- **`main`** — rama de release. Siempre verde (CI passing, 0 vulns).
- **`feat/<nombre>`** — nuevas funcionalidades.
- **`fix/<nombre>`** — corrección de bugs.
- **`phase-N/<nombre>`** — trabajo asociado a una fase concreta del roadmap
  (por ejemplo `phase-2/idempotency-keys`).
- **`security/<nombre>`** — parches de seguridad.
- **`docs/<nombre>`** — sólo documentación.

Las ramas se borran después del merge.

---

## Code style

- **Indentación:** 2 espacios.
- **Comillas:** simples (`'`) en JS, dobles (`"`) en JSON/HTML.
- **Sin trailing whitespace.**
- **Línea final con un solo `\n`.**
- **Sin `;` al final de statements** (según el estilo existente del repo).
- **Nombres de archivo en `kebab-case`** para assets, `PascalCase` para
  clases (entidades de dominio y servicios).
- **Sin `console.log` en código de producción** — usá el middleware de
  logging existente.
- Cada commit debe ser **pequeño y reversible**. Si el cambio es grande,
  dividí en varios commits atómicos.

El CI corre `node --check` sobre todos los archivos `.js` de `src/`,
`tests/` y `scripts/`. Si hay un error de sintaxis, el build falla.

---

## Antes de abrir un PR

Checklist obligatorio (el PR template te lo recordará):

- [ ] `bash scripts/run-all-tests.sh` pasa (165/165).
- [ ] `npm audit --audit-level=low` reporta **0 vulnerabilidades**.
- [ ] No agregaste warnings nuevos.
- [ ] Actualizaste la documentación relevante (README, docs/*, CHANGELOG).
- [ ] El mensaje de commit sigue **Conventional Commits**.
- [ ] No commiteaste `.env`, `*.db`, `node_modules/`, ni artefactos de tests
      (`.gitignore` ya los excluye, pero verificá con `git status`).

### Proceso de revisión

1. Un maintainer revisa el PR.
2. Si hay cambios solicitados, se hacen en la misma rama (push más commits).
3. Una vez aprobado, se hace **squash-and-merge** a `main`.
4. El CI corre de nuevo sobre `main` tras el merge.

¡Gracias por contribuir!
