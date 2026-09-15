// scripts/audit-pg-compat.js — Audit migrations for PostgreSQL compatibility
// Static analysis of each migration to detect PG-incompatible patterns
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'backend', 'src', 'infrastructure', 'db', 'migrations');

const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.js'));

const results = [];
const PG_INCOMPATIBLE_PATTERNS = [
  // SQLite-only functions
  { pattern: /datetime\(['"]now['"]/gi, reason: "datetime('now') is SQLite-only; use NOW() or CURRENT_TIMESTAMP for PG" },
  { pattern: /date\(['"]now['"]/gi, reason: "date('now') is SQLite-only" },
  { pattern: /strftime\(/gi, reason: "strftime() syntax differs between SQLite and PG" },
  // SQLite-only PRAGMA without isSQLite guard
  { pattern: /knex\.raw\(['"]PRAGMA\s+table_info/gi, reason: "PRAGMA table_info is SQLite-only — needs isSQLite guard" },
  // SQLite-specific AUTOINCREMENT (knex handles it, but raw SQL would not)
  { pattern: /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, reason: "AUTOINCREMENT is SQLite-specific; knex.increments() handles it" },
  // Boolean as 0/1 (SQLite) vs true/false (PG)
  { pattern: /\.defaultTo\(0\).*boolean|boolean.*defaultTo\(0\)/gi, reason: "Boolean default 0 may need true/false in PG" },
];

for (const file of files) {
  const code = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const lines = code.split('\n');
  const issues = [];

  // Strip comments (// ... and /* ... */) before checking
  const codeNoComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const linesNoComments = codeNoComments.split('\n');

  // Check for PG-incompatible patterns (only in non-comment code)
  PG_INCOMPATIBLE_PATTERNS.forEach(({ pattern, reason }) => {
    linesNoComments.forEach((line, i) => {
      if (!line.trim()) return;
      if (pattern.test(line)) {
        // Check if there's an isSQLite guard in the same or previous 20 lines (wider context for if-blocks)
        const context = linesNoComments.slice(Math.max(0, i - 20), i + 1).join('\n');
        const hasGuard = /if\s*\(isSQLite\)|isSQLite\s*\?|knex\.client\.config\.client\s*===\s*['"]sqlite3['"]/.test(context);
        if (!hasGuard) {
          issues.push({ line: i + 1, code: line.trim().slice(0, 100), reason, guarded: false });
        } else {
          issues.push({ line: i + 1, code: line.trim().slice(0, 100), reason, guarded: true });
        }
      }
    });
  });

  // Check if migration uses knex.schema API (portable)
  const usesKnexSchema = /knex\.schema\.|table\.\w+\(/i.test(code);
  // Check for isSQLite declaration
  const hasIsSQLite = /isSQLite\s*=\s*knex\.client\.config\.client\s*===\s*['"]sqlite3['"]/.test(code);
  // Check for raw SQL
  const rawSqlCount = (code.match(/knex\.raw\(/g) || []).length;

  results.push({
    file: file.replace('.js', ''),
    usesKnexSchema,
    hasIsSQLite,
    rawSqlCount,
    issues: issues.filter(i => !i.guarded),  // only unguarded issues
    totalIssues: issues.length,
    guardedIssues: issues.filter(i => i.guarded).length,
  });
}

// Generate markdown
let md = `# PG_COMPATIBILITY_AUDIT.md — Auditoría estática de compatibilidad PostgreSQL

> Generado por \`scripts/audit-pg-compat.js\`
> Fecha: ${new Date().toISOString()}
> Auditoría estática (sin ejecución contra PG real).

## Resumen

- Migraciones analizadas: ${results.length}
- Migraciones con knex.schema (portable): ${results.filter(r => r.usesKnexSchema).length}
- Migraciones con isSQLite guard: ${results.filter(r => r.hasIsSQLite).length}
- Migraciones con raw SQL: ${results.filter(r => r.rawSqlCount > 0).length}
- Migraciones con issues NO guardados: ${results.filter(r => r.issues.length > 0).length}

## Detalle por migración

| Migración | knex.schema (portable) | isSQLite guard | Raw SQL count | Issues sin guardar | Estado |
|---|---|---|---|---|---|
`;

for (const r of results) {
  const status = r.issues.length === 0 ? '✅ PG-compatible' : '⚠️ REVISAR';
  md += `| ${r.file.replace('2024','').replace('2026','').slice(0,50)} | ${r.usesKnexSchema ? '✅' : '❌'} | ${r.hasIsSQLite ? '✅' : '—'} | ${r.rawSqlCount} | ${r.issues.length} | ${status} |\n`;
}

md += `\n## Issues sin guardar (potential PG incompatibility)\n\n`;

const allIssues = results.filter(r => r.issues.length > 0);
if (allIssues.length === 0) {
  md += `*No se encontraron issues sin guardar.*\n\n`;
} else {
  for (const r of allIssues) {
    md += `### ${r.file}\n\n`;
    for (const issue of r.issues) {
      md += `- **Línea ${issue.line}**: ${issue.reason}\n  \`${issue.code}\`\n`;
    }
    md += `\n`;
  }
}

md += `## Conclusión\n\n`;
md += `**Auditoría estática**: ${results.filter(r => r.issues.length === 0).length}/${results.length} migraciones son PG-compatible a nivel de código.\n\n`;
md += `**Validación ejecutable pendiente**: instalar PostgreSQL y correr \`knex migrate:latest --env production\` para validar.\n\n`;
md += `### Próximos pasos\n\n`;
md += `1. Instalar PostgreSQL localmente (o usar Docker).\n`;
md += `2. Setear \`DATABASE_URL=postgres://user:pass@localhost:5432/sambapos\`.\n`;
md += `3. Correr \`npx knex migrate:latest --knexfile backend/src/infrastructure/db/knexfile.js --env production\`.\n`;
md += `4. Resolver cualquier error que aparezca (puede haber issues de tipos, constraints, etc.).\n`;
md += `5. Quitar \`continue-on-error: true\` del paso PG en CI.\n`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'PG_COMPATIBILITY_AUDIT.md'), md);
console.log(`Wrote docs/PG_COMPATIBILITY_AUDIT.md`);
console.log(`Migraciones PG-compatible: ${results.filter(r => r.issues.length === 0).length}/${results.length}`);
console.log(`Issues sin guardar: ${results.reduce((s, r) => s + r.issues.length, 0)}`);
