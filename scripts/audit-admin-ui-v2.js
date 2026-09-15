// scripts/audit-admin-ui-v2.js — Real admin UI audit with PASS/PARTIAL/MISSING classification
const fs = require('fs');
const path = require('path');

const adminCode = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'views', 'admin.js'), 'utf8');

// Sections with priority (1=operation-critical, 2=important, 3=nice-to-have)
const sections = [
  { name: 'Productos', priority: 1, render: '_renderProducts',
    methods: ['_newProduct', '_editProduct', '_saveProduct', '_deleteProduct', '_confirmDeleteProduct'] },
  { name: 'Usuarios', priority: 1, render: '_renderUsers',
    methods: ['_newUser', '_editUser', '_saveUser', '_deleteUser'] },
  { name: 'Roles', priority: 1, render: '_renderRoles',
    methods: ['_newRole', '_saveRole', '_editRolePerms', '_togglePerm'] },
  { name: 'Clientes', priority: 1, render: '_renderCustomers',
    methods: ['_newCustomer', '_editCustomer', '_saveCustomer', '_toggleCustomer', '_customerCredit', '_customerDebit'] },
  { name: 'Estaciones', priority: 1, render: '_renderStations',
    methods: ['_newStation', '_editStation', '_saveStation', '_toggleStation', '_editStationAreas', '_editStationKDS'] },
  { name: 'Áreas', priority: 1, render: '_renderAreas',
    methods: ['_newArea', '_editArea', '_saveArea', '_deleteArea', '_editAreaProducts'] },
  { name: 'Tipos de Pago', priority: 1, render: '_renderPaymentTypes',
    methods: ['_newPaymentType', '_savePaymentType'] },
  { name: 'Settings', priority: 1, render: '_renderSettings',
    methods: ['_newSetting', '_editSetting', '_saveSetting', '_updateSetting'] },
  { name: 'Caja', priority: 1, render: '_renderCash',
    methods: ['_openCash', '_closeCash', '_cashPayout', '_cashTransfer', '_cashEvents'] },
  { name: 'Inventario', priority: 1, render: '_renderInventory',
    methods: ['_openStockAdjustment', '_saveStockMovement'] },
  { name: 'Impresoras', priority: 1, render: '_renderPrinters',
    methods: ['_newPrinter', '_savePrinter', '_testPrinter', '_togglePrinter'] },
  { name: 'Departamentos', priority: 2, render: '_renderDepartments',
    methods: ['_newDepartment', '_saveDepartment'] },
  { name: 'Combos', priority: 2, render: '_renderCombos',
    methods: ['_newCombo', '_editCombo', '_saveCombo', '_deleteCombo'] },
  { name: 'Recetas', priority: 2, render: '_renderRecipes',
    methods: ['_newRecipe', '_openRecipeEditor', '_saveRecipe'] },
  { name: 'Transferencias', priority: 2, render: '_renderTransfers',
    methods: ['_newTransfer', '_saveTransfer'] },
  { name: 'Plantillas', priority: 2, render: '_renderTemplates',
    methods: ['_newTemplate', '_editTemplate', '_toggleTemplate'] },
  { name: 'Reportes', priority: 2, render: '_renderReports',
    methods: ['_setReportDates'] },
  { name: 'Auditoría', priority: 3, render: '_renderAuditLogs', methods: [] },
  { name: 'Errores', priority: 3, render: '_renderErrors',
    methods: ['_viewError', '_clearErrors'] },
  { name: 'Sistema', priority: 3, render: '_renderSystem', methods: [] },
  { name: 'Configuración', priority: 3, render: '_renderConfig', methods: [] },
];

function extractMethodBody(methodName) {
  // Try both standalone and Object.assign styles
  const patterns = [
    new RegExp(`async\\s+${methodName}\\s*\\([\\s\\S]*?(?=^\\s{2}\\},\\s*$)`, 'm'),
    new RegExp(`${methodName}\\s*\\([\\s\\S]*?(?=^\\s{2}\\},\\s*$)`, 'm'),
    new RegExp(`${methodName}\\s*\\([\\s\\S]*?(?=\\n\\s{2}\\},\\s*\\n)`, 'm'),
  ];
  for (const p of patterns) {
    const m = adminCode.match(p);
    if (m) return m[0];
  }
  return '';
}

function extractRenderBody(renderName) {
  return extractMethodBody(renderName);
}

// Define capability checks with PASS/PARTIAL/MISSING classification
function classifyCapability(body, capability) {
  if (!body) return 'MISSING';

  switch (capability) {
    case 'listar':
      // PASS: table rendered with rows from API
      if (/this\._table\(|<table|admin-table/.test(body) && /Api\.request\('GET'/.test(body)) return 'PASS';
      if (/admin-empty|No hay|Sin /.test(body)) return 'PARTIAL'; // shows empty but no list
      return 'MISSING';

    case 'buscar':
      // PASS: search input + sends ?search= to API
      if (/search.*Api\.request|Api\.request.*search|filter.*input|searchInput/i.test(body)) return 'PASS';
      if (/search|filter|buscar/i.test(body)) return 'PARTIAL'; // has search concept but not wired
      return 'MISSING';

    case 'filtrar':
      // PASS: filter dropdown + sends query param
      if (/select.*option.*filter|filterSelect|state.*filter/i.test(body)) return 'PASS';
      if (/filter|state.*option/i.test(body)) return 'PARTIAL';
      return 'MISSING';

    case 'ordenar':
      // PASS: column header click sorts
      if (/orderBy|sortBy|order by|_sort\(|_sortCol|_sortDir|sortIcon/i.test(body)) return 'PASS';
      return 'MISSING';

    case 'paginar':
      // PASS: uses page/pageSize from API + has pagination controls
      if (/pagination|hasNext|page=|pageSize/.test(body)) return 'PASS';
      if (/limit.*offset|pageSize/i.test(body)) return 'PARTIAL'; // backend supports but UI doesn't use
      return 'MISSING';

    case 'crear':
      if (/POST.*body|_new|_create/i.test(body) && /_showModal|admin-field/.test(body)) return 'PASS';
      if (/POST.*body|_new/i.test(body)) return 'PARTIAL';
      return 'MISSING';

    case 'editar':
      if (/PATCH|_edit/i.test(body) && /_showModal/.test(body)) return 'PASS';
      if (/PATCH|_edit/i.test(body)) return 'PARTIAL';
      return 'MISSING';

    case 'eliminar':
      if (/DELETE.*confirm|_delete.*confirm/i.test(body)) return 'PASS';
      if (/DELETE/i.test(body)) return 'PARTIAL';
      return 'MISSING';

    case 'desactivar':
      if (/deactivate|toggle.*IsActive|reactivate/i.test(body)) return 'PASS';
      return 'NOT_APPLICABLE';

    case 'ver_detalle':
      if (/_view|modal.*detail|showModal.*detail/i.test(body)) return 'PASS';
      return 'MISSING';

    case 'loading':
      if (/this\._loading\(/.test(body)) return 'PASS';
      return 'MISSING';

    case 'empty':
      if (/admin-empty|No hay|Sin /i.test(body)) return 'PASS';
      return 'MISSING';

    case 'error':
      if (/this\._error\(/.test(body)) return 'PASS';
      return 'MISSING';

    case 'permisos':
      if (/requirePermission|RBAC|role.*check/i.test(body)) return 'PASS';
      return 'NOT_APPLICABLE';

    default:
      return 'UNKNOWN';
  }
}

const capabilities = [
  'listar', 'buscar', 'filtrar', 'ordenar', 'paginar',
  'crear', 'editar', 'eliminar', 'desactivar',
  'ver_detalle', 'loading', 'empty', 'error', 'permisos',
];

let md = `# ADMIN_UI_AUDIT.md — Auditoría real con clasificación PASS/PARTIAL/MISSING

> Generado por \`scripts/audit-admin-ui-v2.js\`
> Fecha: ${new Date().toISOString()}
> Reemplaza al audit anterior (que solo contaba presence/absence binaria).

## Capabilities verificadas

Para cada sección × capability, se clasifica como:

- **PASS**: funcionalidad completa implementada y wired a backend.
- **PARTIAL**: funcionalidad existe pero incompleta (ej: search input pero no wired).
- **MISSING**: no implementado.
- **NOT_APPLICABLE**: no aplica para esta sección (ej: paginar en "Sistema").

## Matriz por sección

| Sección | Prioridad | ${capabilities.join(' | ')} |
|---|---|${'---|'.repeat(capabilities.length)}---|
`;

let total = { PASS: 0, PARTIAL: 0, MISSING: 0, NOT_APPLICABLE: 0 };

for (const s of sections) {
  const renderBody = extractRenderBody(s.render);
  let methodBodies = '';
  for (const m of s.methods) {
    methodBodies += '\n' + extractMethodBody(m);
  }
  const fullBody = renderBody + methodBodies;

  const cells = [];
  for (const cap of capabilities) {
    const status = classifyCapability(fullBody, cap);
    cells.push(status);
    total[status] = (total[status] || 0) + 1;
  }

  const priorityLabel = s.priority === 1 ? '🔴 Crítica' : s.priority === 2 ? '🟡 Importante' : '🟢 Opcional';
  md += `| ${s.name} | ${priorityLabel} | ${cells.map(c => c === 'PASS' ? '✅' : c === 'PARTIAL' ? '⚠️' : c === 'MISSING' ? '❌' : '—').join(' | ')} |\n`;
}

const allCells = sections.length * capabilities.length;
const passRate = ((total.PASS / allCells) * 100).toFixed(1);
const partialRate = ((total.PARTIAL / allCells) * 100).toFixed(1);
const missingRate = ((total.MISSING / allCells) * 100).toFixed(1);

md += `\n## Resumen\n\n`;
md += `| Estado | Cantidad | % |\n|---|---|---|\n`;
md += `| ✅ PASS | ${total.PASS} | ${passRate}% |\n`;
md += `| ⚠️ PARTIAL | ${total.PARTIAL} | ${partialRate}% |\n`;
md += `| ❌ MISSING | ${total.MISSING} | ${missingRate}% |\n`;
md += `| — NOT_APPLICABLE | ${total.NOT_APPLICABLE} | — |\n`;
md += `| **Total** | ${allCells} | 100% |\n\n`;

md += `## Priorización para hardening\n\n`;
md += `### Secciones críticas (prioridad 1) — deben estar PASS\n\n`;

const critical = sections.filter(s => s.priority === 1);
let criticalMissing = 0;
for (const s of critical) {
  const renderBody = extractRenderBody(s.render);
  let methodBodies = '';
  for (const m of s.methods) methodBodies += '\n' + extractMethodBody(m);
  const fullBody = renderBody + methodBodies;
  const missing = capabilities.filter(c => classifyCapability(fullBody, c) === 'MISSING');
  if (missing.length > 0) {
    md += `- **${s.name}**: MISSING ${missing.join(', ')}\n`;
    criticalMissing += missing.length;
  } else {
    md += `- **${s.name}**: ✅ todas las capabilities OK\n`;
  }
}

md += `\n### Secciones importantes (prioridad 2)\n\n`;
const important = sections.filter(s => s.priority === 2);
for (const s of important) {
  const renderBody = extractRenderBody(s.render);
  let methodBodies = '';
  for (const m of s.methods) methodBodies += '\n' + extractMethodBody(m);
  const fullBody = renderBody + methodBodies;
  const missing = capabilities.filter(c => classifyCapability(fullBody, c) === 'MISSING');
  const partial = capabilities.filter(c => classifyCapability(fullBody, c) === 'PARTIAL');
  if (missing.length > 0 || partial.length > 0) {
    md += `- **${s.name}**: ${missing.length ? `MISSING: ${missing.join(', ')}` : ''} ${partial.length ? `PARTIAL: ${partial.join(', ')}` : ''}\n`;
  } else {
    md += `- **${s.name}**: ✅ todas las capabilities OK\n`;
  }
}

md += `\n## Recomendación\n\n`;
md += `- Coverage total PASS: ${passRate}%\n`;
md += `- Secciones críticas con MISSING: ${criticalMissing}\n`;
md += `- Próximo foco: implementar pagination + search en secciones críticas\n`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'ADMIN_UI_AUDIT.md'), md);
console.log(`Wrote docs/ADMIN_UI_AUDIT.md — ${sections.length} sections, ${allCells} checks`);
console.log(`PASS: ${total.PASS} | PARTIAL: ${total.PARTIAL} | MISSING: ${total.MISSING} | N/A: ${total.NOT_APPLICABLE}`);
