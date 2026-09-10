// =====================================================================
// demo-data.js — Mock data for GitHub Pages demo (no backend needed)
// =====================================================================
// This module provides realistic demo data so the frontend can render
// without a running backend. Used when window.DEMO_MODE === true.
// =====================================================================

window.DEMO_DATA = {
  // Auth
  token: 'demo-token-not-real',
  user: { userId: 1, name: 'Administrator', isAdmin: true, roleId: 1 },

  // Tables / Dashboard
  tables: [
    { Id: 1, Name: 'Mesa 1', EntityName: 'Mesa 1', TicketId: null, State: 'available' },
    { Id: 2, Name: 'Mesa 2', EntityName: 'Mesa 2', TicketId: 10, State: 'occupied' },
    { Id: 3, Name: 'Mesa 3', EntityName: 'Mesa 3', TicketId: null, State: 'available' },
    { Id: 4, Name: 'Mesa 4', EntityName: 'Mesa 4', TicketId: 11, State: 'occupied' },
    { Id: 5, Name: 'Mesa 5', EntityName: 'Mesa 5', TicketId: null, State: 'available' },
    { Id: 6, Name: 'Barra 1', EntityName: 'Barra 1', TicketId: 12, State: 'occupied' },
    { Id: 7, Name: 'Barra 2', EntityName: 'Barra 2', TicketId: null, State: 'available' },
    { Id: 8, Name: 'Terraza 1', EntityName: 'Terraza 1', TicketId: null, State: 'available' },
  ],

  // Products (grouped by category)
  products: [
    // Hamburguesas
    { Id: 1, Name: 'Clásica', GroupCode: 'Hamburguesas', Price: 5.00, Barcode: 'HBG001' },
    { Id: 2, Name: 'Doble Cheese', GroupCode: 'Hamburguesas', Price: 7.50, Barcode: 'HBG002' },
    { Id: 3, Name: 'Bacon BBQ', GroupCode: 'Hamburguesas', Price: 8.00, Barcode: 'HBG003' },
    { Id: 4, Name: 'Veggie', GroupCode: 'Hamburguesas', Price: 6.50, Barcode: 'HBG004' },
    // Pizza
    { Id: 5, Name: 'Margarita', GroupCode: 'Pizza', Price: 9.00, Barcode: 'PZA001' },
    { Id: 6, Name: 'Pepperoni', GroupCode: 'Pizza', Price: 11.00, Barcode: 'PZA002' },
    { Id: 7, Name: 'Cuatro Quesos', GroupCode: 'Pizza', Price: 12.00, Barcode: 'PZA003' },
    // Bebidas
    { Id: 8, Name: 'Coca Cola 500ml', GroupCode: 'Bebidas', Price: 2.00, Barcode: 'BEB001' },
    { Id: 9, Name: 'Agua 500ml', GroupCode: 'Bebidas', Price: 1.50, Barcode: 'BEB002' },
    { Id: 10, Name: 'Limonada', GroupCode: 'Bebidas', Price: 2.50, Barcode: 'BEB003' },
    { Id: 11, Name: 'Cerveza', GroupCode: 'Bebidas', Price: 3.50, Barcode: 'BEB004' },
    // Cafetería
    { Id: 12, Name: 'Café Americano', GroupCode: 'Cafeteria', Price: 1.80, Barcode: 'CAF001' },
    { Id: 13, Name: 'Cappuccino', GroupCode: 'Cafeteria', Price: 2.50, Barcode: 'CAF002' },
    { Id: 14, Name: 'Latte', GroupCode: 'Cafeteria', Price: 2.80, Barcode: 'CAF003' },
    { Id: 15, Name: 'Té', GroupCode: 'Cafeteria', Price: 1.50, Barcode: 'CAF004' },
  ],

  // Kitchen orders
  kitchenOrders: [
    {
      Id: 1, TicketId: 10, TicketNumber: 'T-001', TableName: 'Mesa 2',
      State: 'PREPARING', CreatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
      Items: [
        { Quantity: 2, MenuItemName: 'Clásica', PortionName: 'Normal', Notes: 'Sin cebolla' },
        { Quantity: 1, MenuItemName: 'Pepperoni', PortionName: 'Mediana', Notes: '' },
      ],
    },
    {
      Id: 2, TicketId: 11, TicketNumber: 'T-002', TableName: 'Mesa 4',
      State: 'READY', CreatedAt: new Date(Date.now() - 12 * 60000).toISOString(),
      Items: [
        { Quantity: 1, MenuItemName: 'Doble Cheese', PortionName: 'Normal', Notes: 'Extra queso' },
        { Quantity: 2, MenuItemName: 'Coca Cola 500ml', PortionName: '', Notes: '' },
      ],
    },
    {
      Id: 3, TicketId: 12, TicketNumber: 'T-003', TableName: 'Barra 1',
      State: 'NEW', CreatedAt: new Date(Date.now() - 1 * 60000).toISOString(),
      Items: [
        { Quantity: 2, MenuItemName: 'Cappuccino', PortionName: '', Notes: '' },
        { Quantity: 1, MenuItemName: 'Café Americano', PortionName: '', Notes: 'Doble' },
      ],
    },
  ],

  // Inventory
  stockBalances: [
    { IngredientId: 1, IngredientName: 'Pan de hamburguesa', Quantity: 85, UnitCode: 'unit', MinimumStock: 20 },
    { IngredientId: 2, IngredientName: 'Carne de res', Quantity: 12, UnitCode: 'kg', MinimumStock: 15 },
    { IngredientId: 3, IngredientName: 'Queso cheddar', Quantity: 45, UnitCode: 'slice', MinimumStock: 30 },
    { IngredientId: 4, IngredientName: 'Masa de pizza', Quantity: 30, UnitCode: 'unit', MinimumStock: 10 },
    { IngredientId: 5, IngredientName: 'Salsa de tomate', Quantity: 5, UnitCode: 'l', MinimumStock: 8 },
    { IngredientId: 6, IngredientName: 'Coca Cola', Quantity: 48, UnitCode: 'unit', MinimumStock: 24 },
  ],

  // Cash sessions
  cashSessions: [
    { Id: 1, Status: 'OPEN', OpenedAt: new Date(Date.now() - 3 * 3600000).toISOString(), OpeningAmount: 100.00, ClosedAt: null, ClosingAmount: null, OpenedByName: 'Administrator' },
    { Id: 2, Status: 'CLOSED', OpenedAt: new Date(Date.now() - 27 * 3600000).toISOString(), OpeningAmount: 100.00, ClosedAt: new Date(Date.now() - 24 * 3600000).toISOString(), ClosingAmount: 345.50, OpenedByName: 'Administrator' },
  ],

  // Reports — sales summary
  salesSummary: {
    totalSales: 1250.75,
    totalTickets: 42,
    avgTicket: 29.78,
    totalVoided: 2,
    voidedAmount: 58.00,
    totalRefunded: 1,
    refundedAmount: 15.00,
  },

  // Top products
  topProducts: [
    { name: 'Clásica', quantity: 28, total: 140.00 },
    { name: 'Coca Cola 500ml', quantity: 35, total: 70.00 },
    { name: 'Pepperoni', quantity: 15, total: 165.00 },
    { name: 'Cappuccino', quantity: 22, total: 55.00 },
    { name: 'Doble Cheese', quantity: 18, total: 135.00 },
  ],

  // Printers
  printers: [
    { Id: 1, Name: 'Cocina', ShareName: '192.168.1.100:9100', IsActive: 1, PrintAreaId: 1 },
    { Id: 2, Name: 'Caja', ShareName: '192.168.1.101:9100', IsActive: 1, PrintAreaId: 5 },
  ],

  // Print templates
  templates: [
    { Id: 1, Name: 'Recibo (default)', TemplateType: 'RECEIPT', IsActive: 1, Description: 'Ticket para cliente' },
    { Id: 2, Name: 'Comanda cocina (default)', TemplateType: 'KITCHEN_ORDER', IsActive: 1, Description: 'Comanda KDS' },
    { Id: 3, Name: 'Test print (default)', TemplateType: 'TEST', IsActive: 1, Description: 'Prueba de impresora' },
  ],

  // Version info
  version: { name: 'sambapos-lba', version: '0.4.0-demo', node: 'browser', uptime: 0 },
};

// Mock API handler — intercepts fetch calls when DEMO_MODE is true
window.DEMO_API = {
  handle(method, path, body) {
    const data = window.DEMO_DATA;

    // Auth
    if (path === '/api/auth/login' && method === 'POST') {
      return { token: data.token, user: data.user };
    }

    // Products
    if (path === '/api/products' && method === 'GET') {
      return { data: data.products, count: data.products.length };
    }

    // Tables
    if (path.startsWith('/api/tables') && method === 'GET') {
      return { data: data.tables, count: data.tables.length };
    }

    // Kitchen
    if (path.startsWith('/api/kitchen/orders') && method === 'GET') {
      return { data: data.kitchenOrders, count: data.kitchenOrders.length };
    }
    if (path.startsWith('/api/kitchen/stations') && method === 'GET') {
      return {
        data: [
          { Id: 1, Code: 'KITCHEN', Name: 'Cocina', DisplayName: 'Cocina', IsDefault: 1, IsActive: 1 },
          { Id: 2, Code: 'BAR', Name: 'Barra', DisplayName: 'Barra', IsDefault: 0, IsActive: 1 },
        ],
        count: 2,
      };
    }

    // Inventory
    if (path.startsWith('/api/inventory/stock') && method === 'GET') {
      return { data: data.stockBalances, count: data.stockBalances.length };
    }

    // Cash sessions
    if (path === '/api/cash-sessions' && method === 'GET') {
      return { data: data.cashSessions, count: data.cashSessions.length };
    }

    // Reports
    if (path.startsWith('/api/reports/sales') && method === 'GET') {
      return { data: data.salesSummary };
    }
    if (path.startsWith('/api/reports/top-products') && method === 'GET') {
      return { data: data.topProducts };
    }

    // Printers
    if (path === '/api/printers' && method === 'GET') {
      return { data: data.printers, count: data.printers.length };
    }
    if (path === '/api/print/templates' && method === 'GET') {
      return { data: data.templates, count: data.templates.length };
    }

    // Version
    if (path === '/version' && method === 'GET') {
      return data.version;
    }

    // Push status
    if (path === '/api/push/status' && method === 'GET') {
      return { data: { subscribed: false, subscriptionCount: 0, vapidConfigured: true, pushApiSupported: true } };
    }

    // PWA install status
    if (path === '/api/pwa/install-status' && method === 'GET') {
      return { data: { manifestReachable: true, manifestValid: true, manifestErrors: [], serviceWorkerExists: true, installPromptSupported: true } };
    }

    // Default — empty response for writes
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      return { data: { ok: true, demo: true } };
    }

    // Default empty
    return { data: [], count: 0 };
  },
};
