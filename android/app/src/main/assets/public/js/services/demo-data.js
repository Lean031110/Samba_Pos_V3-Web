// =====================================================================
// demo-data.js — Mock data + Mock API para GitHub Pages (sin backend)
// =====================================================================
// BLOQUE N: FIX crítico — los paths que llegan a DEMO_API.handle() NO
// incluyen el prefijo '/api' (api.js llama request('GET','/products')).
// El matcher anterior comparaba '/api/products' y NUNCA coincidía, por
// lo que el login demo estaba roto. Ahora se normaliza el path.
//
// Demo multi-usuario (para probar flujo por rol):
//   Administrador → dashboard · Mesero → POS · Cocinero → KDS · Cajero → Caja
//   (PIN 1234 para todos — solo demo, sin credenciales reales)
// =====================================================================

window.DEMO_DATA = {
  token: 'demo-token-not-real',
  users: {
    'Administrador': { userId: 1, id: 1, name: 'Administrador', isAdmin: true, roleId: 1, roleName: 'Administrador' },
    'Mesero': { userId: 2, id: 2, name: 'Mesero', isAdmin: false, roleId: 2, roleName: 'Mesero' },
    'Cocinero': { userId: 3, id: 3, name: 'Cocinero', isAdmin: false, roleId: 3, roleName: 'Cocinero' },
    'Cajero': { userId: 4, id: 4, name: 'Cajero', isAdmin: false, roleId: 4, roleName: 'Cajero' },
  },

  tables: [
    { Id: 1, Name: '01', EntityName: 'Mesa 01', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 2, Name: '02', EntityName: 'Mesa 02', TicketId: 10, EntityStates: [{ StateName: 'Status', State: 'New Orders' }] },
    { Id: 3, Name: '03', EntityName: 'Mesa 03', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 4, Name: '04', EntityName: 'Mesa 04', TicketId: 11, EntityStates: [{ StateName: 'Status', State: 'Bill Requested' }] },
    { Id: 5, Name: '05', EntityName: 'Mesa 05', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 6, Name: '06', EntityName: 'Mesa 06', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 7, Name: '07', EntityName: 'Mesa 07', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 8, Name: '08', EntityName: 'Mesa 08', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 9, Name: 'B1', EntityName: 'Barra 1', TicketId: 12, EntityStates: [{ StateName: 'Status', State: 'New Orders' }] },
    { Id: 10, Name: 'B2', EntityName: 'Barra 2', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 11, Name: 'T1', EntityName: 'Terraza 1', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
    { Id: 12, Name: 'T2', EntityName: 'Terraza 2', TicketId: null, EntityStates: [{ StateName: 'Status', State: 'Available' }] },
  ],

  products: [
    { Id: 1, Name: 'Hamburguesa Clásica', GroupCode: 'Hamburguesas', Price: 5.00, Barcode: 'HBG001', Portions: [{ Prices: [{ Price: 5.00 }] }] },
    { Id: 2, Name: 'Doble Cheese', GroupCode: 'Hamburguesas', Price: 7.50, Barcode: 'HBG002', Portions: [{ Prices: [{ Price: 7.50 }] }] },
    { Id: 3, Name: 'Bacon BBQ', GroupCode: 'Hamburguesas', Price: 8.00, Barcode: 'HBG003', Portions: [{ Prices: [{ Price: 8.00 }] }] },
    { Id: 4, Name: 'Veggie', GroupCode: 'Hamburguesas', Price: 6.50, Barcode: 'HBG004', Portions: [{ Prices: [{ Price: 6.50 }] }] },
    { Id: 5, Name: 'Pizza Margarita', GroupCode: 'Pizza', Price: 9.00, Barcode: 'PZA001', Portions: [{ Prices: [{ Price: 9.00 }] }] },
    { Id: 6, Name: 'Pizza Pepperoni', GroupCode: 'Pizza', Price: 11.00, Barcode: 'PZA002', Portions: [{ Prices: [{ Price: 11.00 }] }] },
    { Id: 7, Name: 'Pizza 4 Quesos', GroupCode: 'Pizza', Price: 12.00, Barcode: 'PZA003', Portions: [{ Prices: [{ Price: 12.00 }] }] },
    { Id: 8, Name: 'Coca Cola 500ml', GroupCode: 'Bebidas', Price: 2.00, Barcode: 'BEB001', Portions: [{ Prices: [{ Price: 2.00 }] }] },
    { Id: 9, Name: 'Agua 500ml', GroupCode: 'Bebidas', Price: 1.50, Barcode: 'BEB002', Portions: [{ Prices: [{ Price: 1.50 }] }] },
    { Id: 10, Name: 'Limonada', GroupCode: 'Bebidas', Price: 2.50, Barcode: 'BEB003', Portions: [{ Prices: [{ Price: 2.50 }] }] },
    { Id: 11, Name: 'Cerveza Nacional', GroupCode: 'Bebidas', Price: 3.50, Barcode: 'BEB004', Portions: [{ Prices: [{ Price: 3.50 }] }] },
    { Id: 12, Name: 'Café Americano', GroupCode: 'Cafeteria', Price: 1.80, Barcode: 'CAF001', Portions: [{ Prices: [{ Price: 1.80 }] }] },
    { Id: 13, Name: 'Cappuccino', GroupCode: 'Cafeteria', Price: 2.50, Barcode: 'CAF002', Portions: [{ Prices: [{ Price: 2.50 }] }] },
    { Id: 14, Name: 'Latte', GroupCode: 'Cafeteria', Price: 2.80, Barcode: 'CAF003', Portions: [{ Prices: [{ Price: 2.80 }] }] },
    { Id: 15, Name: 'Batido de Mango', GroupCode: 'Batidos', Price: 3.20, Barcode: 'BAT001', Portions: [{ Prices: [{ Price: 3.20 }] }] },
    { Id: 16, Name: 'Batido de Fresa', GroupCode: 'Batidos', Price: 3.20, Barcode: 'BAT002', Portions: [{ Prices: [{ Price: 3.20 }] }] },
    { Id: 17, Name: 'Helado de Vainilla', GroupCode: 'Helados', Price: 2.00, Barcode: 'HEL001', Portions: [{ Prices: [{ Price: 2.00 }] }] },
    { Id: 18, Name: 'Papas Fritas', GroupCode: 'Entrantes', Price: 2.50, Barcode: 'ENT001', Portions: [{ Prices: [{ Price: 2.50 }] }] },
  ],

  paymentTypes: [
    { Id: 1, Name: 'Efectivo CUP', SortOrder: 10, ButtonColor: 'Gainsboro' },
    { Id: 2, Name: 'USD', SortOrder: 20, ButtonColor: 'Gainsboro' },
    { Id: 3, Name: 'MLC', SortOrder: 30, ButtonColor: 'Gainsboro' },
    { Id: 4, Name: 'Transfermóvil', SortOrder: 40, ButtonColor: 'Gainsboro' },
  ],

  calculationTypes: [
    { Id: 1, Name: 'Discount', DecreaseAmount: true, CalculationMethod: 0 },
    { Id: 2, Name: 'Round', DecreaseAmount: false, CalculationMethod: 2 },
  ],

  kitchenOrders: [
    {
      Id: 1, TicketId: 10, TicketNumber: '102', TableName: 'Mesa 02', StationId: 1,
      State: 'PREPARING', Priority: 0, CreatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
      Items: [
        { Quantity: 2, MenuItemName: 'Hamburguesa Clásica', PortionName: 'Normal', Notes: 'Sin cebolla' },
        { Quantity: 1, MenuItemName: 'Pizza Pepperoni', PortionName: 'Mediana', Notes: '' },
      ],
    },
    {
      Id: 2, TicketId: 11, TicketNumber: '103', TableName: 'Mesa 04', StationId: 2,
      State: 'READY', Priority: 0, CreatedAt: new Date(Date.now() - 12 * 60000).toISOString(),
      Items: [
        { Quantity: 1, MenuItemName: 'Doble Cheese', PortionName: 'Normal', Notes: 'Extra queso' },
        { Quantity: 2, MenuItemName: 'Coca Cola 500ml', PortionName: '', Notes: '' },
      ],
    },
    {
      Id: 3, TicketId: 12, TicketNumber: '104', TableName: 'Barra 1', StationId: 3,
      State: 'NEW', Priority: 0, CreatedAt: new Date(Date.now() - 60000).toISOString(),
      Items: [
        { Quantity: 2, MenuItemName: 'Cappuccino', PortionName: '', Notes: '' },
        { Quantity: 1, MenuItemName: 'Café Americano', PortionName: '', Notes: 'Doble' },
      ],
    },
    {
      Id: 4, TicketId: 13, TicketNumber: '105', TableName: 'Mesa 06', StationId: 1,
      State: 'NEW', Priority: 1, CreatedAt: new Date(Date.now() - 300000).toISOString(),
      Items: [
        { Quantity: 3, MenuItemName: 'Pizza Margarita', PortionName: 'Grande', Notes: 'Una sin aceitunas' },
        { Quantity: 2, MenuItemName: 'Batido de Mango', PortionName: '', Notes: '' },
      ],
    },
    {
      Id: 5, TicketId: 14, TicketNumber: '106', TableName: 'Terraza 1', StationId: 4,
      State: 'SERVED', Priority: 0, CreatedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      Items: [{ Quantity: 1, MenuItemName: 'Pizza 4 Quesos', PortionName: '', Notes: '' }],
    },
  ],

  stations: [
    { Id: 1, Code: 'KITCHEN', Name: 'Cocina', DisplayName: 'Cocina', IsDefault: 1, IsActive: 1, Color: '#4f9cf9' },
    { Id: 2, Code: 'PIZZA', Name: 'Pizzería', DisplayName: 'Pizzería', IsDefault: 0, IsActive: 1, Color: '#ff9f43' },
    { Id: 3, Code: 'BAR', Name: 'Barra', DisplayName: 'Barra', IsDefault: 0, IsActive: 1, Color: '#2ecc71' },
    { Id: 4, Code: 'EXPO', Name: 'Despacho', DisplayName: 'Despacho', IsDefault: 0, IsActive: 1, Color: '#9b59b6' },
  ],

  stockBalances: [
    { IngredientId: 1, IngredientName: 'Pan de hamburguesa', Quantity: 85, UnitCode: 'unit', MinimumStock: 20 },
    { IngredientId: 2, IngredientName: 'Carne de res', Quantity: 12, UnitCode: 'kg', MinimumStock: 15 },
    { IngredientId: 3, IngredientName: 'Queso cheddar', Quantity: 45, UnitCode: 'slice', MinimumStock: 30 },
    { IngredientId: 4, IngredientName: 'Masa de pizza', Quantity: 30, UnitCode: 'unit', MinimumStock: 10 },
    { IngredientId: 5, IngredientName: 'Salsa de tomate', Quantity: 5, UnitCode: 'l', MinimumStock: 8 },
    { IngredientId: 6, IngredientName: 'Coca Cola', Quantity: 48, UnitCode: 'unit', MinimumStock: 24 },
  ],

  cashSessions: [
    { Id: 1, Status: 'OPEN', OpenedAt: new Date(Date.now() - 3 * 3600000).toISOString(), OpeningAmount: 100.00, ClosedAt: null, ClosingAmount: null, OpenedByName: 'Administrador', Events: [] },
    { Id: 2, Status: 'CLOSED', OpenedAt: new Date(Date.now() - 27 * 3600000).toISOString(), OpeningAmount: 100.00, ClosedAt: new Date(Date.now() - 24 * 3600000).toISOString(), ClosingAmount: 345.50, OpenedByName: 'Administrador', Events: [] },
  ],

  salesSummary: {
    totalSales: 12450.00,
    totalTickets: 84,
    avgTicket: 148.21,
    totalVoided: 2,
    voidedAmount: 58.00,
    totalRefunded: 1,
    refundedAmount: 15.00,
  },

  topProducts: [
    { name: 'Pizza Pepperoni', quantity: 38, total: 418.00 },
    { name: 'Hamburguesa Clásica', quantity: 35, total: 175.00 },
    { name: 'Coca Cola 500ml', quantity: 32, total: 64.00 },
    { name: 'Cappuccino', quantity: 24, total: 60.00 },
    { name: 'Doble Cheese', quantity: 18, total: 135.00 },
    { name: 'Batido de Mango', quantity: 15, total: 48.00 },
    { name: 'Papas Fritas', quantity: 14, total: 35.00 },
  ],

  printers: [
    { Id: 1, Name: 'Cocina', ShareName: '192.168.1.100:9100', IsActive: 1, PrintAreaId: 1 },
    { Id: 2, Name: 'Caja', ShareName: '192.168.1.101:9100', IsActive: 1, PrintAreaId: 5 },
  ],

  templates: [
    { Id: 1, Name: 'Recibo (default)', TemplateType: 'RECEIPT', IsActive: 1, Description: 'Ticket para cliente' },
    { Id: 2, Name: 'Comanda cocina (default)', TemplateType: 'KITCHEN_ORDER', IsActive: 1, Description: 'Comanda KDS' },
    { Id: 3, Name: 'Test print (default)', TemplateType: 'TEST', IsActive: 1, Description: 'Prueba de impresora' },
  ],

  version: { name: 'lbapos', version: '0.5.0-demo', node: 'browser', uptime: 0 },
};

// ---------------------------------------------------------------------
// Estado mutable del demo (tickets vivos para probar el flujo completo)
// ---------------------------------------------------------------------
window.DEMO_STATE = {
  nextTicketId: 100,
  tickets: {},
};

(function seedDemoTickets() {
  const D = window.DEMO_DATA;
  D.tickets = D.tickets || {};
  const mk = (id, num, table, orders) => {
    let subtotal = 0;
    for (const o of orders) if (o.CalculatePrice) subtotal += o.Price * o.Quantity;
    const total = subtotal;
    D.tickets[id] = {
      Id: id, TicketNumber: num, Date: new Date().toISOString(),
      TicketEntities: [{ EntityId: table.Id, EntityName: table.EntityName }],
      Orders: orders, Calculations: [],
      TotalAmount: total, RemainingAmount: total,
      IsClosed: 0, IsVoided: 0, IsRefunded: 0, Note: '',
    };
  };
  const t2 = D.tables[1], t4 = D.tables[3], t9 = D.tables[8];
  mk(10, '102', t2, [
    { Id: 1, MenuItemId: 1, MenuItemName: 'Hamburguesa Clásica', PortionName: 'Normal', Quantity: 2, Price: 5.00, CalculatePrice: true, Notes: 'Sin cebolla' },
    { Id: 2, MenuItemId: 6, MenuItemName: 'Pizza Pepperoni', PortionName: 'Mediana', Quantity: 1, Price: 11.00, CalculatePrice: true, Notes: '' },
  ]);
  mk(11, '103', t4, [
    { Id: 3, MenuItemId: 2, MenuItemName: 'Doble Cheese', PortionName: 'Normal', Quantity: 1, Price: 7.50, CalculatePrice: true, Notes: 'Extra queso' },
    { Id: 4, MenuItemId: 8, MenuItemName: 'Coca Cola 500ml', PortionName: '', Quantity: 2, Price: 2.00, CalculatePrice: true, Notes: '' },
  ]);
  mk(12, '104', t9, [
    { Id: 5, MenuItemId: 13, MenuItemName: 'Cappuccino', PortionName: '', Quantity: 2, Price: 2.50, CalculatePrice: true, Notes: '' },
    { Id: 6, MenuItemId: 12, MenuItemName: 'Café Americano', PortionName: '', Quantity: 1, Price: 1.80, CalculatePrice: true, Notes: 'Doble' },
  ]);
})();

// ---------------------------------------------------------------------
// Mock API — intercepta las llamadas cuando DEMO_MODE === true
// ---------------------------------------------------------------------
window.DEMO_API = {
  // El backend real devuelve JSON fresco en cada respuesta (nueva referencia).
  // El mock muta objetos internos: si devolvemos la misma referencia, el store
  // (que compara referencias para re-renderizar) no detecta cambios. Por eso
  // TODA respuesta del mock se clona en profundidad.
  _clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  },

  handle(method, rawPath, body) {
    return this._clone(this._handle(method, rawPath, body));
  },

  _handle(method, rawPath, body) {
    const D = window.DEMO_DATA;
    const S = window.DEMO_STATE;
    // FIX: normalizar prefijo — request() llama sin '/api'
    const path = String(rawPath || '').replace(/^\/api(?=\/)/, '');
    const qIdx = path.indexOf('?');
    const clean = qIdx >= 0 ? path.slice(0, qIdx) : path;

    // ---------- Auth ----------
    if (clean === '/auth/login' && method === 'POST') {
      const user = D.users[body?.username];
      if (!user || String(body?.pin) !== '1234') {
        return { error: 'Unauthorized', message: 'Usuario o PIN incorrecto (demo: PIN 1234)' };
      }
      return { token: D.token, user };
    }

    // ---------- Products ----------
    if (clean === '/products' && method === 'GET') {
      return { data: D.products, count: D.products.length };
    }

    // ---------- Tables ----------
    if (clean === '/tables' && method === 'GET') {
      return { data: D.tables, count: D.tables.length };
    }

    // ---------- Tickets ----------
    if (clean === '/tickets' && method === 'GET') {
      const open = Object.values(D.tickets).filter(t => !t.IsClosed && !t.IsVoided);
      return { data: open, count: open.length };
    }

    const ticketMatch = clean.match(/^\/tickets\/(\d+)(?:\/(.*))?$/);
    if (ticketMatch) {
      const id = parseInt(ticketMatch[1], 10);
      const sub = ticketMatch[2] || '';

      // GET /tickets/:id
      if (!sub && method === 'GET') {
        if (D.tickets[id]) return { data: D.tickets[id] };
        return { error: 'NotFound', message: 'Ticket no encontrado' };
      }

      // POST /tickets (create) — manejado abajo; aquí sub === '' POST no existe

      // POST /tickets/:id/orders
      if (sub === 'orders' && method === 'POST') {
        const t = D.tickets[id];
        if (!t) return { error: 'NotFound', message: 'Ticket no encontrado' };
        const product = D.products.find(p => p.Id === body.menuItemId);
        if (!product) return { error: 'ValidationError', message: 'Producto no encontrado' };
        if (body.orderId) {
          const order = t.Orders.find(o => o.Id === body.orderId);
          if (order && Number(body.quantity) === 0) {
            t.Orders = t.Orders.filter(o => o.Id !== body.orderId);
          } else if (order) {
            order.Quantity = Number(body.quantity);
          }
        } else if (Number(body.quantity) === 0) {
          // nothing
        } else {
          const newId = Math.max(0, ...t.Orders.map(o => o.Id)) + 1;
          t.Orders.push({
            Id: newId, MenuItemId: product.Id, MenuItemName: product.Name,
            PortionName: '', Quantity: Number(body.quantity || 1),
            Price: Number(product.Price), CalculatePrice: true, Notes: body.note || '',
          });
        }
        this._recalc(t);
        return { data: t };
      }

      // POST /tickets/:id/payments
      if (sub === 'payments' && method === 'POST') {
        const t = D.tickets[id];
        if (!t) return { error: 'NotFound', message: 'Ticket no encontrado' };
        const amount = Math.min(Number(body.amount || 0), t.RemainingAmount);
        t.RemainingAmount = Math.max(0, t.RemainingAmount - amount);
        if (t.RemainingAmount <= 0) { t.IsClosed = 0; } // close aparte
        return { data: t };
      }

      // POST /tickets/:id/close
      if (sub === 'close' && method === 'POST') {
        const t = D.tickets[id];
        if (!t) return { error: 'NotFound', message: 'Ticket no encontrado' };
        t.IsClosed = 1;
        t.RemainingAmount = 0;
        // liberar mesa si existía
        for (const tb of D.tables) {
          if (tb.TicketId === t.Id) { tb.TicketId = null; tb.EntityStates = [{ StateName: 'Status', State: 'Available' }]; }
        }
        delete D.tickets[id];
        return { data: t };
      }

      // POST /tickets/:id/note
      if (sub === 'note' && method === 'POST') {
        const t = D.tickets[id];
        if (t) { t.Note = body.note || ''; return { data: t }; }
        return { error: 'NotFound', message: 'Ticket no encontrado' };
      }

      // POST /tickets/:id/gift
      if (sub === 'gift' && method === 'POST') {
        const t = D.tickets[id];
        if (t) {
          for (const oid of (body.orderIds || [])) {
            const o = t.Orders.find(x => x.Id === oid);
            if (o) o.CalculatePrice = false;
          }
          this._recalc(t);
          return { data: t };
        }
        return { error: 'NotFound', message: 'Ticket no encontrado' };
      }

      // POST /tickets/:id/void
      if (sub === 'void' && method === 'POST') {
        const t = D.tickets[id];
        if (t) {
          t.IsVoided = 1;
          for (const tb of D.tables) {
            if (tb.TicketId === t.Id) { tb.TicketId = null; tb.EntityStates = [{ StateName: 'Status', State: 'Available' }]; }
          }
          return { data: t };
        }
        return { error: 'NotFound', message: 'Ticket no encontrado' };
      }

      // POST /tickets/:id/calculations
      if (sub === 'calculations' && method === 'POST') {
        const t = D.tickets[id];
        if (t) {
          const ct = D.calculationTypes.find(c => c.Id === body.calculationTypeId);
          const amount = Number(body.amount || 0);
          const disc = ct && ct.CalculationMethod === 0 ? (t.TotalAmount * amount / 100) : amount;
          t.Calculations.push({ Id: t.Calculations.length + 1, Name: ct?.Name || 'Descuento', CalculationAmount: disc });
          this._recalc(t);
          return { data: t };
        }
        return { error: 'NotFound', message: 'Ticket no encontrado' };
      }

      // GET /tickets/:id/print
      if (sub === 'print' && method === 'GET') {
        const t = D.tickets[id];
        if (!t) return { error: 'NotFound', message: 'Ticket no encontrado' };
        const lines = [
          '      LBApos — Restaurante',
          '      ====================',
          `Ticket: #${t.TicketNumber}`,
          `Mesa:   ${t.TicketEntities?.[0]?.EntityName || '—'}`,
          '--------------------------------',
          ...t.Orders.map(o => `${o.Quantity} x ${o.MenuItemName}${o.CalculatePrice ? '' : ' (REGALO)'} $${(o.Price * o.Quantity).toFixed(2)}`),
          '--------------------------------',
          `TOTAL: $${t.TotalAmount.toFixed(2)}`,
          '        ¡Gracias por su visita!',
        ];
        const formatted = lines.join('\n');
        return { data: { formatted, escposBase64: btoa(unescape(encodeURIComponent(formatted))), escposBytesCount: formatted.length } };
      }
    }

    // POST /tickets (crear)
    if (clean === '/tickets' && method === 'POST') {
      const id = S.nextTicketId++;
      const t = {
        Id: id, TicketNumber: String(id), Date: new Date().toISOString(),
        TicketEntities: [], Orders: [], Calculations: [],
        TotalAmount: 0, RemainingAmount: 0,
        IsClosed: 0, IsVoided: 0, IsRefunded: 0, Note: '',
      };
      if (body?.tableId) {
        const tb = D.tables.find(x => x.Id === body.tableId);
        if (tb) {
          t.TicketEntities = [{ EntityId: tb.Id, EntityName: tb.EntityName }];
          tb.TicketId = id;
          tb.EntityStates = [{ StateName: 'Status', State: 'New Orders' }];
        }
      }
      D.tickets[id] = t;
      return { data: t };
    }

    // ---------- Payment types ----------
    if (clean === '/admin/payment-types' && method === 'GET') {
      return { data: D.paymentTypes, count: D.paymentTypes.length };
    }

    // ---------- Calculation types ----------
    if (clean === '/config/calculation-types' && method === 'GET') {
      return { data: D.calculationTypes, count: D.calculationTypes.length };
    }

    // ---------- Kitchen ----------
    if (clean === '/kitchen/stations' && method === 'GET') {
      return { data: D.stations, count: D.stations.length };
    }
    if (clean === '/kitchen/orders' && method === 'GET') {
      let orders = D.kitchenOrders;
      if (qIdx >= 0) {
        const sid = new URLSearchParams(path.slice(qIdx + 1)).get('stationId');
        if (sid) orders = orders.filter(o => o.StationId === Number(sid));
      }
      return { data: orders, count: orders.length };
    }
    const kMatch = clean.match(/^\/kitchen\/orders\/(\d+)\/(state|bump|serve|void|recall)$/);
    if (kMatch && method === 'POST') {
      const order = D.kitchenOrders.find(o => o.Id === parseInt(kMatch[1], 10));
      if (!order) return { error: 'NotFound', message: 'Pedido no encontrado' };
      const action = kMatch[2];
      if (action === 'state') order.State = body.state;
      else if (action === 'bump') order.State = 'READY';
      else if (action === 'serve') order.State = 'SERVED';
      else if (action === 'void') order.State = 'VOIDED';
      else if (action === 'recall') order.State = 'PREPARING';
      return { data: order };
    }

    // ---------- Inventory ----------
    if (clean.startsWith('/inventory/stock') && method === 'GET') {
      return { data: D.stockBalances, count: D.stockBalances.length };
    }
    if (clean.startsWith('/inventory/ingredients') && method === 'GET') {
      return { data: D.stockBalances.map(s => ({ Id: s.IngredientId, Name: s.IngredientName, Code: 'ING' + s.IngredientId, BaseUnitId: 1, MinimumStock: s.MinimumStock, CostPerUnit: 0.5 })), count: D.stockBalances.length };
    }
    if (clean.startsWith('/inventory/units') && method === 'GET') {
      return { data: [{ Id: 1, Code: 'unit', Name: 'Unidad', Type: 'count', SortOrder: 10 }, { Id: 2, Code: 'kg', Name: 'Kilo', Type: 'weight', SortOrder: 30 }], count: 2 };
    }
    if (clean.startsWith('/inventory/movements') && method === 'GET') {
      return { data: [], count: 0 };
    }

    // ---------- Recipes ----------
    if (clean.startsWith('/recipes/by-menu-item') && method === 'GET') {
      return { data: { menuItem: { Id: 1, Name: 'Clásica' }, portions: [{ portion: { Id: 1, Name: 'Normal' }, price: 5.00, cost: 2.50, margin: 2.50, marginPct: 50, hasRecipe: true }] } };
    }
    if (clean.startsWith('/recipes/cost-summary') && method === 'GET') {
      return { data: [] };
    }
    if (clean.startsWith('/recipes') && method === 'GET') {
      return { data: [], count: 0 };
    }

    // ---------- Cash sessions ----------
    if (clean === '/cash-sessions/current' && method === 'GET') {
      const cur = D.cashSessions.find(s => s.Status === 'OPEN') || null;
      return { data: cur };
    }
    if (clean === '/cash-sessions' && method === 'GET') {
      return { data: D.cashSessions, count: D.cashSessions.length };
    }
    if (clean === '/cash-sessions/open' && method === 'POST') {
      const id = Math.max(...D.cashSessions.map(s => s.Id)) + 1;
      const s = { Id: id, Status: 'OPEN', OpenedAt: new Date().toISOString(), OpeningAmount: Number(body?.openingAmount || 0), ClosedAt: null, ClosingAmount: null, OpenedByName: 'Demo', Events: [] };
      D.cashSessions.unshift(s);
      return { data: s };
    }
    const csMatch = clean.match(/^\/cash-sessions\/(\d+)\/close$/);
    if (csMatch && method === 'POST') {
      const s = D.cashSessions.find(x => x.Id === parseInt(csMatch[1], 10));
      if (s) {
        s.Status = 'CLOSED';
        s.ClosedAt = new Date().toISOString();
        s.ClosingAmount = Number(s.OpeningAmount) + 245.50;
        return { data: s };
      }
      return { error: 'NotFound', message: 'Sesión no encontrada' };
    }
    if (clean === '/cash-sessions/work-periods/current' && method === 'GET') {
      return { data: { Id: 1, Status: 'OPEN', OpenedAt: new Date().toISOString() } };
    }
    if (clean === '/cash-sessions/work-periods/open' && method === 'POST') {
      return { data: { Id: 1, Status: 'OPEN', OpenedAt: new Date().toISOString() } };
    }

    // ---------- Reports ----------
    if (clean.startsWith('/reports/sales') && method === 'GET') {
      return { data: D.salesSummary };
    }
    if (clean.startsWith('/reports/top-products') && method === 'GET') {
      return { data: D.topProducts };
    }

    // ---------- Printers / print ----------
    if (clean === '/printers' && method === 'GET') {
      return { data: D.printers, count: D.printers.length };
    }
    if (clean.startsWith('/printers/') && method === 'GET') {
      return { data: D.printers[0] };
    }
    if (clean === '/print/areas/list' && method === 'GET') {
      return { data: [{ Id: 1, Name: 'kitchen', DisplayName: 'Cocina', AreaType: 'KITCHEN' }, { Id: 5, Name: 'cashier', DisplayName: 'Caja', AreaType: 'CASHIER' }], count: 2 };
    }
    if (clean === '/print/routing-rules/list' && method === 'GET') {
      return { data: [], count: 0 };
    }
    if (clean === '/print/stats/list' && method === 'GET') {
      return { data: { byStatus: { PENDING: 0, PRINTING: 0, PRINTED: 5, FAILED: 0 }, pending: 0, retryReady: 0 } };
    }
    if (clean.startsWith('/print/templates') && method === 'GET') {
      return { data: D.templates, count: D.templates.length };
    }
    const psMatch = clean.match(/^\/print\/tickets\/(\d+)\/send$/);
    if (psMatch && method === 'POST') {
      return { data: { ok: true, demo: true, jobId: 1 } };
    }

    // ---------- Combos ----------
    if (clean === '/combos' && method === 'GET') {
      return { data: [], count: 0 };
    }

    // ---------- Departments / admin ----------
    if (clean === '/departments' || clean.startsWith('/departments') && method === 'GET') {
      return { data: [{ Id: 1, Name: 'Restaurante' }], count: 1 };
    }
    if (clean === '/admin/users' && method === 'GET') {
      return { data: Object.values(D.users).map(u => ({ Id: u.id, Name: u.name, UserRoleId: u.roleId, RoleName: u.roleName })), count: 4 };
    }
    if (clean === '/admin/roles' && method === 'GET') {
      return { data: [
        { Id: 1, Name: 'Administrador', IsAdmin: true },
        { Id: 2, Name: 'Mesero', IsAdmin: false },
        { Id: 3, Name: 'Cocinero', IsAdmin: false },
        { Id: 4, Name: 'Cajero', IsAdmin: false },
      ], count: 4 };
    }

    // ---------- Version / push / pwa / health ----------
    if (clean === '/version' && method === 'GET') {
      return D.version;
    }
    if (clean === '/push/status' && method === 'GET') {
      return { data: { subscribed: false, subscriptionCount: 0, vapidConfigured: true, pushApiSupported: true } };
    }
    if (clean === '/pwa/install-status' && method === 'GET') {
      return { data: { manifestReachable: true, manifestValid: true, manifestErrors: [], serviceWorkerExists: true, installPromptSupported: true } };
    }
    if (clean === '/health' && method === 'GET') {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }

    // ---------- Default ----------
    if (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
      return { data: { ok: true, demo: true } };
    }

    console.warn('[demo] Unhandled API call:', method, path);
    return { data: [], count: 0 };
  },

  _recalc(ticket) {
    let subtotal = 0;
    for (const o of ticket.Orders) {
      if (o.CalculatePrice) subtotal += Number(o.Price || 0) * Number(o.Quantity || 0);
    }
    let discount = 0;
    for (const c of (ticket.Calculations || [])) discount += Number(c.CalculationAmount || 0);
    ticket.TotalAmount = Math.max(0, subtotal - discount);
    ticket.RemainingAmount = ticket.IsClosed ? 0 : ticket.TotalAmount;
  },
};
