// scripts/audit-css-hidden.js — Audit CSS for hidden elements that may break UI
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const cssFiles = [
  'reset.css', 'design-system.css', 'variables.css', 'layout.css',
  'components.css', 'mobile.css', 'android-shell.css', 'tablet-layout.css',
];

const findings = [];

for (const f of cssFiles) {
  const fp = path.join(FRONTEND_DIR, 'css', f);
  if (!fs.existsSync(fp)) continue;
  const code = fs.readFileSync(fp, 'utf8');
  const lines = code.split('\n');

  // Track rule blocks and find display:none, visibility:hidden, opacity:0
  let currentSelector = '';
  let braceDepth = 0;
  let ruleStart = 0;
  let ruleBody = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find selector lines (before { )
    if (braceDepth === 0 && line.includes('{')) {
      currentSelector = line.split('{')[0].trim();
      ruleStart = i + 1;
      ruleBody = '';
      braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (line.includes('}')) {
        // single-line rule
        ruleBody = line.substring(line.indexOf('{') + 1, line.lastIndexOf('}'));
        braceDepth = 0;
        checkRule(currentSelector, ruleBody, f, ruleStart);
      } else {
        ruleBody = line.substring(line.indexOf('{') + 1);
      }
    } else if (braceDepth > 0) {
      ruleBody += '\n' + line;
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        checkRule(currentSelector, ruleBody, f, ruleStart);
        braceDepth = 0;
      }
    }
  }
}

function checkRule(selector, body, file, line) {
  // Skip @media, @keyframes (pseudo-selectors)
  if (selector.startsWith('@')) return;

  // Check for display: none
  if (/display\s*:\s*none/i.test(body)) {
    // Is it inside a conditional like :hover, .is-hidden, .hidden, [hidden]?
    const isIntentional = /(\.hidden|\.is-hidden|\.ds-hidden|\[hidden\]|:hover|:focus|:checked|@media|is-active|modal)/i.test(selector);
    findings.push({
      file, line, selector: selector.slice(0, 100),
      property: 'display: none',
      intentional: isIntentional,
    });
  }
  // visibility: hidden
  if (/visibility\s*:\s*hidden/i.test(body)) {
    const isIntentional = /(\.hidden|\.is-hidden|:hover|@media|skeleton|shimmer)/i.test(selector);
    findings.push({ file, line, selector: selector.slice(0, 100), property: 'visibility: hidden', intentional: isIntentional });
  }
  // opacity: 0
  if (/opacity\s*:\s*0(\s|;|$)/i.test(body)) {
    const isIntentional = /(\.hidden|transition|fade|shimmer|skeleton|@keyframes)/i.test(selector);
    findings.push({ file, line, selector: selector.slice(0, 100), property: 'opacity: 0', intentional: isIntentional });
  }
  // z-index very high
  const zMatch = body.match(/z-index\s*:\s*(\d+)/i);
  if (zMatch) {
    const z = parseInt(zMatch[1], 10);
    if (z > 1000) {
      findings.push({ file, line, selector: selector.slice(0, 100), property: `z-index: ${z}`, intentional: true });
    }
  }
  // pointer-events: none
  if (/pointer-events\s*:\s*none/i.test(body)) {
    const isIntentional = /(\.no-select|\.disabled|overlay|@media|backdrop)/i.test(selector);
    findings.push({ file, line, selector: selector.slice(0, 100), property: 'pointer-events: none', intentional: isIntentional });
  }
}

// Write report
let md = `# CSS Hidden Elements Audit

> Generado automáticamente por \`scripts/audit-css-hidden.js\`
> Fecha: ${new Date().toISOString()}

## Resumen

- Total findings: ${findings.length}
- Intentional (with .hidden, :hover, @media context): ${findings.filter(f => f.intentional).length}
- Potentially problematic (need manual review): ${findings.filter(f => !f.intentional).length}

## Hallazgos

| Archivo | Línea | Selector | Propiedad | ¿Intencional? |
|---|---|---|---|---|
`;

for (const f of findings) {
  const emoji = f.intentional ? '✅' : '⚠️';
  md += `| ${f.file} | ${f.line} | \`${f.selector}\` | ${f.property} | ${emoji} ${f.intentional ? 'SÍ' : 'REVISAR'} |\n`;
}

md += `\n## Análisis\n\n`;
md += `Las propiedades que ocultan elementos (\`display: none\`, \`visibility: hidden\`, \`opacity: 0\`, \`pointer-events: none\`) son legítimas cuando:\n\n`;
md += `- Están dentro de \`@media\` queries (responsive design)\n`;
md += `- Están en selectores que se activan condicionalmente (\`.is-hidden\`, \`.hidden\`, \`[hidden]\`)\n`;
md += `- Son parte de animaciones (\`@keyframes\`, transiciones)\n`;
md += `- Se aplican a overlay/backdrop con \`pointer-events: none\` para clicks\n\n`;
md += `Los marcados como **REVISAR** pueden ser problemas si bloquean clicks o contenido sin razón aparente.\n`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'CSS_HIDDEN_AUDIT.md'), md);
console.log(`Wrote docs/CSS_HIDDEN_AUDIT.md — ${findings.length} findings (${findings.filter(f => !f.intentional).length} to review)`);
