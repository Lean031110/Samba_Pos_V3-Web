// scripts/audit-admin-ui.js — Audit admin.js for UI completeness per section
const fs = require('fs');
const path = require('path');

const adminCode = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'views', 'admin.js'), 'utf8');

const sections = [
  { name: 'Productos', render: '_renderProducts', methods: ['_newProduct', '_editProduct', '_saveProduct', '_deleteProduct'] },
  { name: 'Inventario', render: '_renderInventory', methods: ['_openStockAdjustment', '_saveStockMovement'] },
  { name: 'Recetas', render: '_renderRecipes', methods: ['_newRecipe', '_openRecipeEditor', '_saveRecipe'] },
  { name: 'Impresoras', render: '_renderPrinters', methods: ['_newPrinter', '_savePrinter', '_testPrinter', '_togglePrinter'] },
  { name: 'Plantillas', render: '_renderTemplates', methods: ['_newTemplate', '_editTemplate', '_toggleTemplate'] },
  { name: 'Caja', render: '_renderCash', methods: ['_openCash', '_closeCash', '_cashPayout', '_cashTransfer', '_cashEvents'] },
  { name: 'Reportes', render: '_renderReports', methods: ['_setReportDates'] },
  { name: 'Configuración', render: '_renderConfig', methods: [] },
  { name: 'Usuarios', render: '_renderUsers', methods: ['_newUser', '_editUser', '_saveUser', '_deleteUser'] },
  { name: 'Roles', render: '_renderRoles', methods: ['_newRole', '_saveRole', '_editRolePerms', '_togglePerm'] },
  { name: 'Clientes', render: '_renderCustomers', methods: ['_newCustomer', '_editCustomer', '_saveCustomer', '_toggleCustomer', '_customerCredit', '_customerDebit'] },
  { name: 'Estaciones', render: '_renderStations', methods: ['_newStation', '_editStation', '_saveStation', '_toggleStation', '_editStationAreas', '_toggleStationArea', '_editStationKDS', '_saveStationKDS'] },
  { name: 'Áreas', render: '_renderAreas', methods: ['_newArea', '_editArea', '_saveArea', '_deleteArea', '_editAreaProducts', '_toggleAreaProduct'] },
  { name: 'Combos', render: '_renderCombos', methods: ['_newCombo', '_editCombo', '_saveCombo', '_deleteCombo'] },
  { name: 'Transferencias', render: '_renderTransfers', methods: ['_newTransfer', '_saveTransfer'] },
  { name: 'Sistema', render: '_renderSystem', methods: [] },
  { name: 'Errores', render: '_renderErrors', methods: ['_viewError', '_clearErrors'] },
  { name: 'Auditoría', render: '_renderAuditLogs', methods: [] },
  { name: 'Departamentos', render: '_renderDepartments', methods: ['_newDepartment', '_saveDepartment'] },
  { name: 'Tipos de Pago', render: '_renderPaymentTypes', methods: ['_newPaymentType', '_savePaymentType'] },
  { name: 'Settings', render: '_renderSettings', methods: ['_newSetting', '_editSetting', '_saveSetting', '_updateSetting'] },
];

// Define UI capability checks
const capabilities = [
  { name: 'Listar', regex: /this\._table\(|<table/g },
  { name: 'Buscar', regex: /search|filter|buscar/i },
  { name: 'Filtrar', regex: /filter|state|status.*option/i },
  { name: 'Ordenar', regex: /sort|orderBy|order by/i },
  { name: 'Crear', regex: /POST.*body|_new|_create/i },
  { name: 'Editar', regex: /PATCH|_edit/i },
  { name: 'Eliminar', regex: /DELETE|_delete/i },
  { name: 'Desactivar', regex: /deactivate|toggle.*IsActive|desactivar/i },
  { name: 'Ver detalle', regex: /_view|modal|showModal.*detail/i },
  { name: 'Paginación', regex: /pagination|page=|pageSize|hasNext|nextPage/i },
  { name: 'Loading state', regex: /_loading\(/ },
  { name: 'Empty state', regex: /admin-empty|No hay|Sin /i },
  { name: 'Error handling', regex: /this\._error\(/ },
];

let md = `# ADMIN_UI_AUDIT.md — Auditoría de secciones administrativas

> Generado automáticamente por \`scripts/audit-admin-ui.js\`
> Fecha: ${new Date().toISOString()}

## Capabilities verificadas por sección

Para cada sección se verifica la presencia de:
- **Listar** — tabla de datos
- **Buscar** — input de búsqueda
- **Filtrar** — filtros por estado/tipo
- **Ordenar** — ordenamiento de columnas
- **Crear** — botón "Nuevo"
- **Editar** — edición de registros
- **Eliminar/Desactivar** — eliminación o desactivación
- **Ver detalle** — modal de detalle
- **Paginación** — controles de paginación
- **Loading state** — estado de carga
- **Empty state** — estado vacío
- **Error handling** — manejo de errores

| Sección | ${capabilities.map(c => c.name).join(' | ')} |
|---|---|${'---|'.repeat(capabilities.length - 1)}---|
`;

for (const s of sections) {
  // Extract function body for _render{Section}
  const re = new RegExp(`async\\s+${s.render}\\s*\\([\\s\\S]*?(?=^\\s*\\},\\s*$)`, 'm');
  const m = adminCode.match(re);
  const body = m ? m[0] : '';
  // Also include methods
  let methodBodies = '';
  for (const meth of s.methods) {
    const mr = new RegExp(`${meth}\\s*\\(?[\\s\\S]*?(?=^\\s{2}\\},\\s*$)`, 'm');
    const mm = adminCode.match(mr);
    if (mm) methodBodies += '\n' + mm[0];
  }
  const fullBody = body + methodBodies;

  const cells = [];
  for (const cap of capabilities) {
    const has = cap.regex.test(fullBody);
    cells.push(has ? '✅' : '❌');
  }
  md += `| ${s.name} | ${cells.join(' | ')} |\n`;
}

md += `\n## Resumen de completitud\n\n`;
let totalChecks = 0;
let passedChecks = 0;
for (const s of sections) {
  const re = new RegExp(`async\\s+${s.render}\\s*\\([\\s\\S]*?(?=^\\s*\\},\\s*$)`, 'm');
  const m = adminCode.match(re);
  const body = m ? m[0] : '';
  let methodBodies = '';
  for (const meth of s.methods) {
    const mr = new RegExp(`${meth}\\s*\\(?[\\s\\S]*?(?=^\\s{2}\\},\\s*$)`, 'm');
    const mm = adminCode.match(mr);
    if (mm) methodBodies += '\n' + mm[0];
  }
  const fullBody = body + methodBodies;
  for (const cap of capabilities) {
    totalChecks++;
    if (cap.regex.test(fullBody)) passedChecks++;
  }
}
md += `- Secciones auditadas: ${sections.length}
- Capabilities verificadas: ${capabilities.length} por sección
- Total checks: ${totalChecks}
- ✅ Pasados: ${passedChecks} (${((passedChecks/totalChecks)*100).toFixed(1)}%)
- ❌ Faltantes: ${totalChecks - passedChecks}

## Sections sin paginación real

Las siguientes secciones NO implementan paginación en la UI (aunque el backend la soporte parcialmente):

${sections.map(s => {
  const re = new RegExp(`async\\s+${s.render}\\s*\\([\\s\\S]*?(?=^\\s*\\},\\s*$)`, 'm');
  const m = adminCode.match(re);
  const body = m ? m[0] : '';
  return `- ${s.name}: ${/pagination|page=|pageSize|hasNext/i.test(body) ? '✅' : '❌ sin paginación'}`;
}).join('\n')}
`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'ADMIN_UI_AUDIT.md'), md);
console.log(`Wrote docs/ADMIN_UI_AUDIT.md — ${sections.length} sections, ${passedChecks}/${totalChecks} capabilities OK`);
