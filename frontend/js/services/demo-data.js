// =====================================================================
// demo-data.js — Mock data for GitHub Pages demo (no backend needed)
// =====================================================================
// This module provides realistic demo data so the frontend can render
// without a running backend. Used when window.DEMO_MODE === true.
// =====================================================================

window.DEMO_DATA = {
  // Auth
  token: 'demo-token-not-real',
  user: { userId: 1, name: 'Administrator', isAdmin: true, roleId: 1, roleName: 'Administrator' },

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

  // Production Areas (Bloque 4)
  productionAreas: [
    { Id: 1, Name: 'Cocina',   Code: 'KITCHEN', DisplayName: 'Cocina',   Color: '#dc3545', Icon: 'fa-utensils',              SortOrder: 1, IsActive: 1, WarehouseId: 2, WarehouseName: 'Almacén Cocina' },
    { Id: 2, Name: 'Pizzería', Code: 'PIZZA',   DisplayName: 'Pizzería', Color: '#fd7e14', Icon: 'fa-pizza-slice',           SortOrder: 2, IsActive: 1, WarehouseId: 3, WarehouseName: 'Almacén Pizzería' },
    { Id: 3, Name: 'Barra',     Code: 'BAR',     DisplayName: 'Barra',    Color: '#198754', Icon: 'fa-martini-glass-citrus',  SortOrder: 3, IsActive: 1, WarehouseId: 4, WarehouseName: 'Almacén Barra' },
    { Id: 4, Name: 'Salón',     Code: 'SALON',   DisplayName: 'Salón',    Color: '#0d6efd', Icon: 'fa-bell-concierge',        SortOrder: 4, IsActive: 1, WarehouseId: 1, WarehouseName: 'Almacén Principal' },
    { Id: 5, Name: 'Cafetería', Code: 'CAFE',    DisplayName: 'Cafetería', Color: '#6610f2', Icon: 'fa-mug-hot',               SortOrder: 5, IsActive: 1, WarehouseId: 4, WarehouseName: 'Almacén Barra' },
  ],

  // Stations (Bloque 4)
  stations: [
    { Id: 1, Name: 'POS Mostrador 01', Code: 'POS-01',  StationType: 'POS',      FormFactor: 'DESKTOP', AutoLogoutSeconds: 300, IsActive: 1, IpAddress: '192.168.1.10', HardwareId: 'HW-POS-01', DefaultRole: 'mesero' },
    { Id: 2, Name: 'POS Mesa 01',      Code: 'POS-02',   StationType: 'POS',      FormFactor: 'TABLET',  AutoLogoutSeconds: 600, IsActive: 1, IpAddress: '192.168.1.11', HardwareId: 'HW-POS-02', DefaultRole: 'mesero' },
    { Id: 3, Name: 'KDS Cocina',       Code: 'KDS-01',   StationType: 'KDS',      FormFactor: 'DESKTOP', AutoLogoutSeconds: 0,   IsActive: 1, IpAddress: '192.168.1.20', HardwareId: 'HW-KDS-01', DefaultRole: 'cocinero' },
    { Id: 4, Name: 'KDS Pizzería',     Code: 'KDS-02',   StationType: 'KDS',      FormFactor: 'TABLET',  AutoLogoutSeconds: 0,   IsActive: 1, IpAddress: '192.168.1.21', HardwareId: 'HW-KDS-02', DefaultRole: 'cocinero' },
    { Id: 5, Name: 'Caja Principal',   Code: 'CAJA-01',  StationType: 'CASHIER', FormFactor: 'DESKTOP', AutoLogoutSeconds: 300, IsActive: 1, IpAddress: '192.168.1.30', HardwareId: 'HW-CAJ-01', DefaultRole: 'cajero' },
  ],

  // Warehouses (Bloque 5)
  warehouses: [
    { Id: 1, Name: 'Almacén Principal', Code: 'MAIN',    WarehouseTypeId: 1, SortOrder: 1 },
    { Id: 2, Name: 'Almacén Cocina',    Code: 'KITCHEN', WarehouseTypeId: 2, SortOrder: 2 },
    { Id: 3, Name: 'Almacén Pizzería',   Code: 'PIZZA',   WarehouseTypeId: 2, SortOrder: 3 },
    { Id: 4, Name: 'Almacén Barra',      Code: 'BAR',     WarehouseTypeId: 2, SortOrder: 4 },
  ],

  // Users
  users: [
    { Id: 1, Name: 'Administrator', UserRoleId: 1, RoleName: 'Administrator', IsAdmin: 1 },
    { Id: 2, Name: 'Carlos Mesero', UserRoleId: 2, RoleName: 'Mesero', IsAdmin: 0 },
    { Id: 3, Name: 'Ana Cajera',    UserRoleId: 3, RoleName: 'Cajero', IsAdmin: 0 },
    { Id: 4, Name: 'Luigi Cocina',  UserRoleId: 4, RoleName: 'Cocinero', IsAdmin: 0 },
    { Id: 5, Name: 'María Pizzería',UserRoleId: 4, RoleName: 'Cocinero', IsAdmin: 0 },
  ],

  // Roles
  roles: [
    { Id: 1, Name: 'Administrator', IsAdmin: 1 },
    { Id: 2, Name: 'Mesero',        IsAdmin: 0 },
    { Id: 3, Name: 'Cajero',        IsAdmin: 0 },
    { Id: 4, Name: 'Cocinero',      IsAdmin: 0 },
  ],

  // Customers (Bloque 11)
  customers: [
    { Id: 1, Name: 'Juan Pérez',     Phone: '+53555111100', Email: 'juan@example.com', AccountBalance: 25.50, IsActive: 1, Address: 'Calle 1 #2-3' },
    { Id: 2, Name: 'María Gómez',    Phone: '+53555222200', Email: 'maria@example.com', AccountBalance: 0,    IsActive: 1, Address: 'Av 5 #6-7' },
    { Id: 3, Name: 'Restaurante La Esquina', Phone: '+53555333300', Email: 'laesquina@example.com', AccountBalance: 150.00, IsActive: 1, Address: 'Calle 8 #9-10' },
    { Id: 4, Name: 'Carlos Invitado', Phone: null, Email: null, AccountBalance: 0, IsActive: 0, Address: null },
  ],

  // Audit logs (Bloque 11)
  auditLogs: [
    { Id: 1, Action: 'ticket.open',     EntityType: 'Ticket',  EntityId: 10, UserId: 2, CreatedAt: new Date(Date.now() - 3600000).toISOString(), Details: '{"table":"Mesa 2"}' },
    { Id: 2, Action: 'ticket.close',    EntityType: 'Ticket',  EntityId: 10, UserId: 3, CreatedAt: new Date(Date.now() - 1800000).toISOString(), Details: '{"total":22.50}' },
    { Id: 3, Action: 'admin.user.create', EntityType: 'User',  EntityId: 5,  UserId: 1, CreatedAt: new Date(Date.now() - 7200000).toISOString(), Details: '{"name":"María Pizzería"}' },
    { Id: 4, Action: 'inventory.transfer', EntityType: 'WarehouseTransfer', EntityId: 1, UserId: 1, CreatedAt: new Date(Date.now() - 86400000).toISOString(), Details: '{"from":1,"to":2}' },
    { Id: 5, Action: 'print.job',       EntityType: 'PrintJob', EntityId: 12, UserId: 3, CreatedAt: new Date().toISOString(), Details: '{"printer":"Cocina"}' },
  ],

  // Departments (Bloque 11)
  departments: [
    { Id: 1, Name: 'Restaurante', WarehouseId: 1, SortOrder: 1, PriceTag: 'normal' },
    { Id: 2, Name: 'Barra',       WarehouseId: 4, SortOrder: 2, PriceTag: 'bar' },
    { Id: 3, Name: 'Delivery',    WarehouseId: 1, SortOrder: 3, PriceTag: 'delivery' },
  ],

  // Payment Types (Bloque 11)
  paymentTypes: [
    { Id: 1, Name: 'Efectivo',          AccountTransactionTypeId: 1 },
    { Id: 2, Name: 'Tarjeta de Crédito',AccountTransactionTypeId: 2 },
    { Id: 3, Name: 'Tarjeta de Débito', AccountTransactionTypeId: 2 },
    { Id: 4, Name: 'Transferencia',     AccountTransactionTypeId: 3 },
    { Id: 5, Name: 'Cuenta Corriente',  AccountTransactionTypeId: 4 },
  ],

  // Program Settings (Bloque 11)
  settings: [
    { Name: 'tax_rate',         Value: '0.21' },
    { Name: 'currency',         Value: 'USD' },
    { Name: 'service_charge',   Value: '0.10' },
    { Name: 'max_open_tickets', Value: '20' },
    { Name: 'auto_logout_min', Value: '5' },
  ],

  // Combos with full CRUD (Bloque 11)
  combos: [
    { Id: 1, Name: 'Combo Hamburguesa + Bebida', UseCustomPrice: true,  ComboPrice: 6.50, IsActive: 1 },
    { Id: 2, Name: 'Combo Pizza Familiar',       UseCustomPrice: true,  ComboPrice: 15.00, IsActive: 1 },
    { Id: 3, Name: 'Combo Café + Croissant',     UseCustomPrice: false, ComboPrice: 0,    IsActive: 1 },
  ],

  // Report data (Bloque 11 expanded)
  reportData: {
    sales: { totalSales: 1245.50, ticketCount: 47, averageTicket: 26.50, voidedCount: 2, refundedCount: 1, refundedAmount: 15.00, grossSales: 1245.50 },
    topProducts: [
      { name: 'Clásica', quantity: 28, total: 140.00 },
      { name: 'Coca Cola 500ml', quantity: 35, total: 70.00 },
      { name: 'Pepperoni', quantity: 15, total: 165.00 },
      { name: 'Cappuccino', quantity: 22, total: 55.00 },
      { name: 'Doble Cheese', quantity: 18, total: 135.00 },
    ],
    byCategory: [
      { category: 'Hamburguesas', quantity: 50, total: 350.00 },
      { category: 'Pizza',        quantity: 20, total: 220.00 },
      { category: 'Bebidas',      quantity: 70, total: 140.00 },
      { category: 'Cafeteria',    quantity: 35, total: 87.50 },
    ],
    byUser: [
      { userName: 'Carlos Mesero', ticketCount: 25, total: 625.00 },
      { userName: 'Ana Cajera',    ticketCount: 12, total: 380.50 },
      { userName: 'Administrator', ticketCount: 10, total: 240.00 },
    ],
    byPayment: [
      { paymentType: 'Efectivo',           count: 30, total: 750.00 },
      { paymentType: 'Tarjeta de Crédito',  count: 12, total: 380.50 },
      { paymentType: 'Tarjeta de Débito',   count: 5,  total: 115.00 },
    ],
    voidsRefunds: { voidsCount: 2, refundsCount: 1, voidsAmount: 45.00, refundsAmount: 15.00 },
    inventory: { totalIngredients: 24, lowStockCount: 3, outOfStockCount: 1, totalValue: 1850.75 },
    cashSessions: { openCount: 1, closedCount: 4, totalCash: 1245.50 },
    dashboard: { openTickets: 3, activeTables: 4, kitchenOrders: 6, todaySales: 1245.50 },
  },

  // Version info
  version: { name: 'sambapos-lba', version: '0.4.0-demo', node: 'browser', uptime: 0 },
};

// Mock API handler — intercepts fetch calls when DEMO_MODE is true
window.DEMO_API = {
  handle(method, pathIn, body) {
    const data = window.DEMO_DATA;
    // Normalize path: api.js passes paths like '/admin/users' but handlers expect '/api/admin/users'.
    // Add '/api' prefix if missing so both forms work.
    const path = pathIn.startsWith('/api/') ? pathIn : ('/api' + pathIn);

    // Auth
    if (path === '/api/auth/login' && method === 'POST') {
      return { token: data.token, user: data.user };
    }

    // Products
    if (path.startsWith('/api/products') && method === 'GET') {
      return { data: data.products, count: data.products.length };
    }

    // Tables / Dashboard
    if (path.startsWith('/api/tables') && method === 'GET') {
      return { data: data.tables, count: data.tables.length };
    }

    // Open tickets (dashboard)
    if (path === '/api/tickets' && method === 'GET') {
      // Return a few open tickets
      return {
        data: [
          { Id: 10, TicketNumber: 'T-001', Date: new Date().toISOString(), RemainingAmount: 22.50, IsClosed: 0, IsVoided: 0, IsRefunded: 0, TicketEntities: [{ EntityName: 'Mesa 2' }] },
          { Id: 11, TicketNumber: 'T-002', Date: new Date().toISOString(), RemainingAmount: 15.50, IsClosed: 0, IsVoided: 0, IsRefunded: 0, TicketEntities: [{ EntityName: 'Mesa 4' }] },
          { Id: 12, TicketNumber: 'T-003', Date: new Date().toISOString(), RemainingAmount: 5.60, IsClosed: 0, IsVoided: 0, IsRefunded: 0, TicketEntities: [{ EntityName: 'Barra 1' }] },
        ],
        count: 3,
      };
    }

    // Departments
    if (path === '/api/departments' || path.startsWith('/api/departments') && method === 'GET') {
      return { data: [{ Id: 1, Name: 'Restaurante' }], count: 1 };
    }

    // Kitchen
    if (path.startsWith('/api/kitchen/orders') && method === 'GET') {
      return { data: data.kitchenOrders, count: data.kitchenOrders.length };
    }
    if (path.startsWith('/api/kitchen/stations') && method === 'GET') {
      return {
        data: [
          { Id: 1, Code: 'KITCHEN', Name: 'Cocina', DisplayName: 'Cocina', IsDefault: 1, IsActive: 1, Color: '#FF6B6B' },
          { Id: 2, Code: 'BAR', Name: 'Barra', DisplayName: 'Barra', IsDefault: 0, IsActive: 1, Color: '#4ECDC4' },
          { Id: 3, Code: 'DRINKS', Name: 'Bebidas', DisplayName: 'Bebidas', IsDefault: 0, IsActive: 1, Color: '#45B7D1' },
          { Id: 4, Code: 'EXPO', Name: 'Despacho', DisplayName: 'Despacho', IsDefault: 0, IsActive: 1, Color: '#96CEB4' },
        ],
        count: 4,
      };
    }

    // Inventory
    if (path.startsWith('/api/inventory/stock') && method === 'GET') {
      return { data: data.stockBalances, count: data.stockBalances.length };
    }
    if (path.startsWith('/api/inventory/ingredients') && method === 'GET') {
      return { data: data.stockBalances.map(s => ({ Id: s.IngredientId, Name: s.IngredientName, Code: 'ING' + s.IngredientId, BaseUnitId: 1, MinimumStock: s.MinimumStock, CostPerUnit: 0.5 })), count: data.stockBalances.length };
    }
    if (path.startsWith('/api/inventory/units') && method === 'GET') {
      return { data: [{ Id: 1, Code: 'unit', Name: 'Unidad', Type: 'count', SortOrder: 10 }, { Id: 2, Code: 'kg', Name: 'Kilo', Type: 'weight', SortOrder: 30 }], count: 2 };
    }
    if (path.startsWith('/api/inventory/movements') && method === 'GET') {
      return { data: [], count: 0 };
    }

    // Recipes
    if (path.startsWith('/api/recipes') && !path.includes('by-portion') && !path.includes('by-menu-item') && !path.includes('cost-summary') && method === 'GET') {
      return { data: [], count: 0 };
    }
    if (path.startsWith('/api/recipes/by-menu-item') && method === 'GET') {
      return { data: { menuItem: { Id: 1, Name: 'Clásica' }, portions: [{ portion: { Id: 1, Name: 'Normal' }, price: 5.00, cost: 2.50, margin: 2.50, marginPct: 50, hasRecipe: true }] } };
    }
    if (path.startsWith('/api/recipes/by-portion') && method === 'GET') {
      return { data: { recipe: { Id: 1, FixedCost: 0 }, items: [{ IngredientId: 1, IngredientName: 'Pan', Quantity: 1, UnitCode: 'unit' }], portion: { Id: 1, Name: 'Normal' }, menuItem: { Id: 1, Name: 'Clásica' }, price: 5.00, cost: 2.50, margin: 2.50, marginPct: 50 } };
    }
    if (path.startsWith('/api/recipes/cost-summary') && method === 'GET') {
      return { data: [] };
    }

    // Cash sessions
    if (path === '/api/cash-sessions' && method === 'GET') {
      return { data: data.cashSessions, count: data.cashSessions.length };
    }
    if (path.match(/^\/api\/cash-sessions\/\d+\/events$/) && method === 'GET') {
      return { data: [
        { Id: 1, EventType: 'OPEN',    Amount: 100.00, Note: 'Apertura inicial', UserId: 3, CreatedAt: new Date(Date.now() - 7200000).toISOString() },
        { Id: 2, EventType: 'SALE',    Amount: 22.50,  Note: 'Ticket T-001',     UserId: 2, CreatedAt: new Date(Date.now() - 3600000).toISOString() },
        { Id: 3, EventType: 'SALE',    Amount: 15.00,  Note: 'Ticket T-002',     UserId: 2, CreatedAt: new Date(Date.now() - 1800000).toISOString() },
        { Id: 4, EventType: 'PAYOUT',  Amount: -20.00, Note: 'Compra insumos',   UserId: 3, CreatedAt: new Date().toISOString() },
      ], count: 4 };
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
    if (path.startsWith('/api/printers/') && method === 'GET') {
      return { data: data.printers[0] };
    }

    // Print areas
    if (path === '/api/print/areas/list' && method === 'GET') {
      return { data: [{ Id: 1, Name: 'kitchen', DisplayName: 'Cocina', AreaType: 'KITCHEN' }, { Id: 5, Name: 'cashier', DisplayName: 'Caja', AreaType: 'CASHIER' }], count: 2 };
    }

    // Print routing rules
    if (path === '/api/print/routing-rules/list' && method === 'GET') {
      return { data: [], count: 0 };
    }

    // Print stats
    if (path === '/api/print/stats/list' && method === 'GET') {
      return { data: { byStatus: { PENDING: 0, PRINTING: 0, PRINTED: 5, FAILED: 0 }, pending: 0, retryReady: 0 } };
    }

    // Print templates
    if (path.startsWith('/api/print/templates') && method === 'GET') {
      return { data: data.templates, count: data.templates.length };
    }

    // Combos
    if (path === '/api/combos' && method === 'GET') {
      return { data: [], count: 0 };
    }

    // Stations (Bloque 4)
    if (path === '/api/stations' && method === 'GET') {
      return { data: data.stations, count: data.stations.length };
    }
    if (path === '/api/stations/areas' && method === 'GET') {
      return { data: data.productionAreas, count: data.productionAreas.length };
    }
    if (path.match(/^\/api\/stations\/\d+\/areas$/) && method === 'GET') {
      const id = parseInt(path.match(/\d+/)[0], 10);
      const bound = id === 3 ? [data.productionAreas[0]] : (id === 4 ? [data.productionAreas[1]] : []);
      return { data: bound, count: bound.length };
    }
    if (path.match(/^\/api\/stations\/\d+\/kds-config$/) && method === 'GET') {
      return { data: [{ Id: 1, StationId: parseInt(path.match(/\d+/)[0], 10), ColumnCount: 4, RefreshIntervalMs: 5000, AutoBumpSeconds: 0, SoundEnabled: 1, ColorCodingEnabled: 1, FontScale: 'MD', ShowPrepTime: 1, ShowAllergens: 0 }], count: 1 };
    }

    // Admin Users (Bloque 4) — supports pagination + search (Bloque 12)
    if (path.startsWith('/api/admin/users') && method === 'GET') {
      const qs = path.split('?')[1];
      let users = data.users;
      let pagination = null;
      if (qs) {
        const params = new URLSearchParams(qs);
        const s = params.get('search');
        const p = parseInt(params.get('page') || '1', 10);
        const ps = parseInt(params.get('pageSize') || '50', 10);
        let filtered = s ? data.users.filter(u => u.Name.toLowerCase().includes(s.toLowerCase())) : data.users;
        const total = filtered.length;
        const start = (p - 1) * ps;
        const paged = filtered.slice(start, start + ps);
        pagination = {
          page: p, pageSize: ps, total,
          totalPages: Math.ceil(total / ps),
          hasNext: start + paged.length < total,
          hasPrev: p > 1,
        };
        return { data: paged, count: paged.length, pagination };
      }
      return { data: users, count: users.length };
    }
    if (path === '/api/admin/roles' && method === 'GET') {
      return { data: data.roles, count: data.roles.length };
    }
    if (path.match(/^\/api\/admin\/roles\/\d+\/permissions$/) && method === 'GET') {
      return { data: [], count: 0 };
    }

    // Warehouses (Bloque 5)
    if (path === '/api/inventory/warehouses' && method === 'GET') {
      return { data: data.warehouses, count: data.warehouses.length };
    }
    if (path === '/api/inventory/transfers' && method === 'GET') {
      return { data: [
        { Id: 1, TransferNumber: 'TR-001', FromWarehouseId: 1, FromWarehouseName: 'Almacén Principal', ToWarehouseId: 2, ToWarehouseName: 'Almacén Cocina', Status: 'COMPLETED', CreatedAt: new Date(Date.now() - 86400000).toISOString(), ItemCount: 5 },
        { Id: 2, TransferNumber: 'TR-002', FromWarehouseId: 1, FromWarehouseName: 'Almacén Principal', ToWarehouseId: 3, ToWarehouseName: 'Almacén Pizzería', Status: 'PENDING', CreatedAt: new Date().toISOString(), ItemCount: 3 },
      ], count: 2 };
    }

    // Errors (Bloque 7)
    if (path === '/api/errors' && method === 'GET') {
      return { data: [
        { Id: 1, Type: 'uncaught', Message: 'Cannot read property "x" of undefined', View: 'pos', Platform: 'android', FormFactor: 'tablet', Orientation: 'landscape', ServerTimestamp: new Date(Date.now() - 3600000).toISOString(), EventTimestamp: new Date(Date.now() - 3600000).toISOString(), UserId: 2, Url: '/pos' },
        { Id: 2, Type: 'console.error', Message: 'API timeout: /api/tickets/123', View: 'dashboard', Platform: 'web', FormFactor: 'desktop', Orientation: 'landscape', ServerTimestamp: new Date(Date.now() - 7200000).toISOString(), EventTimestamp: new Date(Date.now() - 7200000).toISOString(), UserId: 1, Url: '/dashboard' },
      ], count: 2, total: 2 };
    }
    if (path === '/api/errors/stats' && method === 'GET') {
      return { data: { last24h: 2, total: 5, byType: { uncaught: 1, 'console.error': 1 }, byPlatform: { android: 1, web: 1 } } };
    }

    // Customers (Bloque 11)
    if (path.startsWith('/api/customers') && !path.includes('/customers/') && method === 'GET') {
      const qs = path.split('?')[1];
      let customers = data.customers;
      let pagination = null;
      if (qs) {
        const params = new URLSearchParams(qs);
        const s = params.get('search');
        const limit = parseInt(params.get('limit') || '50', 10);
        const offset = parseInt(params.get('offset') || '0', 10);
        let filtered = s ? data.customers.filter(c => c.Name.toLowerCase().includes(s.toLowerCase())) : data.customers;
        const total = filtered.length;
        const paged = filtered.slice(offset, offset + limit);
        pagination = {
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + paged.length < total,
          hasPrev: offset > 0,
        };
        return { data: paged, count: paged.length, pagination };
      }
      return { data: customers, count: customers.length };
    }
    if (path.match(/^\/api\/customers\/\d+$/) && method === 'GET') {
      const id = parseInt(path.match(/\d+/)[0], 10);
      return { data: data.customers.find(c => c.Id === id) || data.customers[0] };
    }

    // Audit Logs (Bloque 11)
    if (path.startsWith('/api/admin/audit-logs') && method === 'GET') {
      return { data: data.auditLogs, count: data.auditLogs.length, total: data.auditLogs.length };
    }

    // Departments (Bloque 11)
    if (path === '/api/admin/departments' && method === 'GET') {
      return { data: data.departments, count: data.departments.length };
    }

    // Payment Types (Bloque 11)
    if (path === '/api/admin/payment-types' && method === 'GET') {
      return { data: data.paymentTypes, count: data.paymentTypes.length };
    }

    // Settings (Bloque 11)
    if (path === '/api/admin/settings' && method === 'GET') {
      return { data: data.settings, count: data.settings.length };
    }

    // Combos by ID (Bloque 11)
    if (path.match(/^\/api\/combos\/\d+$/) && method === 'GET') {
      const id = parseInt(path.match(/\d+/)[0], 10);
      return { data: data.combos.find(c => c.Id === id) || data.combos[0] };
    }

    // Reports expanded (Bloque 11)
    if (path.startsWith('/api/reports/sales') && method === 'GET') {
      return { data: data.reportData.sales };
    }
    if (path.startsWith('/api/reports/categories') && method === 'GET') {
      return { data: data.reportData.byCategory };
    }
    if (path.startsWith('/api/reports/users') && method === 'GET') {
      return { data: data.reportData.byUser };
    }
    if (path.startsWith('/api/reports/payments') && method === 'GET') {
      return { data: data.reportData.byPayment };
    }
    if (path.startsWith('/api/reports/voids-refunds') && method === 'GET') {
      return { data: data.reportData.voidsRefunds };
    }
    if (path.startsWith('/api/reports/inventory') && method === 'GET') {
      return { data: data.reportData.inventory };
    }
    if (path.startsWith('/api/reports/cash-sessions') && method === 'GET') {
      return { data: data.reportData.cashSessions };
    }
    if (path.startsWith('/api/reports/dashboard') && method === 'GET') {
      return { data: data.reportData.dashboard };
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

    // Health
    if (path === '/health' && method === 'GET') {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }

    // Default — empty response for writes
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      return { data: { ok: true, demo: true } };
    }

    // Default empty
    console.warn('[demo] Unhandled API call:', method, path);
    return { data: [], count: 0 };
  },
};
