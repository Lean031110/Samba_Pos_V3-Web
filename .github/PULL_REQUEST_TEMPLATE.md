## Resumen

<!-- Descripción clara del cambio. ¿Qué problema resuelve o qué feature
agrega? Si cierra un issue, usá "Closes #N". -->

Closes #

## Tipo de cambio

<!-- Marcá con una `x` la opción que corresponda. -->

- [ ] Bug fix (cambio que arregla un bug — no rompe nada existente)
- [ ] Feature (nueva funcionalidad visible para el usuario)
- [ ] Refactor (reescritura sin cambio de comportamiento)
- [ ] Docs (sólo documentación)
- [ ] Test (sólo tests)
- [ ] Chore (deps, CI, scripts, configuración)
- [ ] Security (endurecimiento de seguridad)
- [ ] Breaking change (fix o feature que rompe compatibilidad)

## Checklist

<!-- Marcá con una `x` cada item. Todos deben estar marcados antes
de pedir revisión. -->

- [ ] `bash scripts/run-all-tests.sh` pasa (165/165 tests)
- [ ] `npm audit --audit-level=low` reporta 0 vulnerabilidades
- [ ] No agregué warnings nuevos
- [ ] No commiteé `.env`, `*.db`, `node_modules/` ni artefactos de tests
      (verificá con `git status`)
- [ ] Actualicé la documentación relevante (README, docs/*, CHANGELOG)
- [ ] El mensaje de commit sigue **Conventional Commits**
      (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`,
      `security:`)
- [ ] Cada commit es pequeño y reversible
- [ ] Respeté el *Code style* (2-space indent, single quotes, no trailing
      whitespace)

## Notas para el revisor

<!-- Cualquier cosa que el revisor deba saber antes de leer el código:
decisiones de diseño, *trade-offs*, áreas delicadas, etc. -->

## Capturas / screenshots

<!-- Si el cambio es visual, incluí capturas *before/after*. -->
