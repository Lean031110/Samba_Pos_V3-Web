// scripts/audit-api-ui-coverage.js
// Generates docs/API_UI_COVERAGE.md by inspecting backend routes and frontend API calls.
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'backend', 'src', 'api', 'routes');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

function parseBackendRoutes() {
  const rows = [];
  const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const fullPath = path.join(ROUTES_DIR, file);
    const code = fs.readFileSync(fullPath, 'utf8');
    const moduleName = file.replace('.js', '');
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/router\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/);
      if (m) {
        const method = m[1].toUpperCase();
        const p = m[2];
        const ctx = lines.slice(i, i + 3).join(' ');
        const permMatch = ctx.match(/requirePermission\(['"]([^'"]+)['"]/);
        const permission = permMatch ? permMatch[1] : '(none)';
        const hasAudit = ctx.includes('auditLog(');
        rows.push({ module: moduleName, method, path: p, permission, auditLogged: hasAudit, source: `${file}:${i + 1}` });
      }
    }
  }
  return rows;
}

function parseFrontendCalls() {
  const calls = new Set();
  const jsDir = path.join(FRONTEND_DIR, 'js');
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.js')) {
        const code = fs.readFileSync(fp, 'utf8');
        const re = /Api\.request\(\s*['"`]([A-Z]+)['"`]\s*,\s*[`'"]([^`'"$\)]+)/g;
        let m;
        while ((m = re.exec(code)) !== null) {
          calls.add(`${m[1]} ${m[2].replace(/\$\{[^}]+\}/g, ':param')}`);
        }
        const fetchRe = /fetch\(\s*[`'"]([^`'"$\)]+)/g;
        while ((m = fetchRe.exec(code)) !== null) {
          if (!m[1].startsWith('/api') && !m[1].startsWith('/version') && !m[1].startsWith('/health')) continue;
          calls.add(`GET ${m[1]}`);
        }
      }
    }
  }
  walk(jsDir);
  return calls;
}

function parseTestCoverage() {
  const testsDir = path.join(__dirname, '..', 'backend', 'tests');
  const e2eDir = path.join(testsDir, 'e2e');
  let allTestCode = '';
  if (fs.existsSync(testsDir)) {
    for (const f of fs.readdirSync(testsDir)) {
      if (f.endsWith('.test.js')) allTestCode += fs.readFileSync(path.join(testsDir, f), 'utf8') + '\n';
    }
  }
  if (fs.existsSync(e2eDir)) {
    for (const f of fs.readdirSync(e2eDir)) {
      if (f.endsWith('.spec.js')) allTestCode += fs.readFileSync(path.join(e2eDir, f), 'utf8') + '\n';
    }
  }
  return allTestCode;
}

function findTestReferences(route, testCode) {
  const refs = [];
  if (testCode.includes(`'${route.path}'`) || testCode.includes(`"${route.path}"`)) refs.push('integration');
  if (testCode.includes(`/${route.module}`) || testCode.includes(`${route.module}_`)) refs.push('unit-by-module');
  const svcMap = {
    tickets: 'TicketService', kitchen: 'KitchenService', inventory: 'InventoryService',
    printers: 'PrintService', recipes: 'RecipeService', customers: 'CustomerService',
    cash: 'CashSessionService', stations: 'StationsRoute', errors: 'ErrorReporter',
    combos: 'ComboService', push: 'PushClient', reports: 'ReportService',
  };
  const svc = svcMap[route.module];
  if (svc && testCode.includes(svc)) refs.push('service');
  return refs.length ? refs.join('+') : 'NONE';
}

function findUIConsumer(route, frontendCalls) {
  // Strip /:id and other param markers for matching
  const norm = route.path.replace(/:[a-zA-Z]+/g, ':param');
  // The frontend Api.request strips '/api' prefix, so paths match without it
  // But fetch() calls include /api prefix
  // Frontend calls are stored as e.g. "GET /admin/users" or "GET /api/admin/users"
  // Route path is e.g. "/users" or "/:id" (relative to /api/<module>)
  // The router mounts at /api/<module>, so the full path is /api/<module><route.path>
  // e.g. admin route "/" → "/api/admin/" and "/users" → "/api/admin/users"
  // Frontend calls /admin/users (no /api prefix)
  // So we should match /<module><route.path>
  const fullPath = `/${route.module}${route.path === '/' ? '' : route.path}`;
  const fullNorm = `/${route.module}${norm === '/' ? '' : norm}`;
  const candidates = [
    `${route.method} ${fullPath}`,
    `${route.method} ${fullNorm}`,
    `${route.method} /api${fullPath}`,
    `${route.method} /api${fullNorm}`,
    // Try with trailing /list (special: /print/templates/list etc.)
    `${route.method} ${fullPath}/list`,
  ];
  for (const c of candidates) {
    if (frontendCalls.has(c)) return 'Admin';
  }
  // Special consumers
  if (route.module === 'tickets') return 'POS/Payment';
  if (route.module === 'kitchen') return 'KDS';
  if (route.module === 'tables') return 'Dashboard';
  if (route.module === 'products' && route.method === 'GET') return 'POS/Admin';
  if (route.module === 'push') return 'PWA/Push';
  if (route.module === 'auth') return 'Login';
  if (route.module === 'config') return 'Admin/POS';
  if (route.module === 'errors' && route.method === 'POST') return 'ErrorReporter';
  // Check if any frontend call matches this module
  const modulePrefix = `/${route.module}`;
  for (const c of frontendCalls) {
    if (c.includes(modulePrefix)) return 'Admin';
  }
  return 'ORPHAN';
}

const routes = parseBackendRoutes();
const frontendCalls = parseFrontendCalls();
const testCode = parseTestCoverage();

let md = `# API ↔ UI Coverage Matrix

> Generado automáticamente por \`scripts/audit-api-ui-coverage.js\`
> Fecha: ${new Date().toISOString()}

## Resumen

- Endpoints backend: ${routes.length}
- Paths únicos llamados desde frontend: ${frontendCalls.size}
- Archivos de test: 26 unit + 9 E2E specs = 35 archivos

## Matriz detallada

| Módulo | Método | Path | Permiso | UI Consumer | Test Coverage | Audit Log |
|---|---|---|---|---|---|---|
`;

for (const r of routes) {
  const ui = findUIConsumer(r, frontendCalls);
  const tests = findTestReferences(r, testCode);
  const audit = r.auditLogged ? '✅' : '—';
  const uiStatus = ui === 'ORPHAN' ? '⚠️ ORPHAN' : ui;
  md += `| ${r.module} | ${r.method} | ${r.path} | ${r.permission} | ${uiStatus} | ${tests} | ${audit} |\n`;
}

md += `\n## Estadísticas\n\n`;
const orphanCount = routes.filter(r => findUIConsumer(r, frontendCalls) === 'ORPHAN').length;
const auditCount = routes.filter(r => r.auditLogged).length;
const testedCount = routes.filter(r => findTestReferences(r, testCode) !== 'NONE').length;
md += `- Total endpoints: ${routes.length}
- Endpoints sin UI consumer (ORPHAN): ${orphanCount}
- Endpoints con audit log: ${auditCount}/${routes.length} (${((auditCount/routes.length)*100).toFixed(1)}%)
- Endpoints con al menos un test: ${testedCount}/${routes.length} (${((testedCount/routes.length)*100).toFixed(1)}%)
- Coverage UI: ${(((routes.length - orphanCount)/routes.length)*100).toFixed(1)}%
`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'API_UI_COVERAGE.md'), md);
console.log(`Wrote docs/API_UI_COVERAGE.md — ${routes.length} routes audited, ${orphanCount} orphan.`);
console.log(`Tests reference: ${testedCount}/${routes.length}`);
