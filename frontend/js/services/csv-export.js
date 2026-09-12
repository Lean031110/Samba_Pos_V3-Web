// services/csv-export.js — CSV export utility for admin tables
// Bloque 12 FASE D — Export CSV for Users, Customers, Sales, Inventory, Movements
(function () {
  const CSVExport = {
    /**
     * Export an array of objects to CSV and trigger download.
     * @param {Array<Object>} rows - data rows
     * @param {Array<{key: string, label: string}>} columns - column definitions
     * @param {string} filename - e.g. "users-2026-09-12.csv"
     */
    export(rows, columns, filename) {
      if (!rows || rows.length === 0) {
        alert('No hay datos para exportar.');
        return;
      }
      // Build CSV header
      const header = columns.map(c => this._escape(c.label)).join(',');
      // Build CSV rows
      const body = rows.map(row =>
        columns.map(c => this._escape(row[c.key])).join(',')
      ).join('\n');
      const csv = header + '\n' + body;
      // Add BOM for Excel UTF-8 compatibility
      const bom = '\uFEFF';
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /**
     * Escape a value for CSV (wrap in quotes if contains comma, quote, or newline).
     */
    _escape(value) {
      if (value === null || value === undefined) return '';
      const s = String(value);
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    },
  };

  window.CSVExport = CSVExport;
})();
