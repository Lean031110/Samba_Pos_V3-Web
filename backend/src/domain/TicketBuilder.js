// =====================================================================
// TicketBuilder.js — Fluent builder for Ticket
// =====================================================================
// Mirrors: Samba.Domain/Builders/TicketBuilder.cs (151 lines)
//
// Usage:
//   const ticket = TicketBuilder.create(ticketType, department)
//     .withExchangeRate(1)
//     .withCalculations(autoCalculationTypes)
//     .addOrder(orderBuilder)
//     .build();
// =====================================================================

const { Ticket } = require('./Ticket');
const engine = require('./CalculationEngine');
const { recalculateTicket } = require('./TicketRecalculator');

class TicketBuilder {
  constructor() {
    this._ticketType = null;
    this._department = null;
    this._exchangeRate = 1;
    this._calculations = [];
    this._orders = [];   // array of { order, taxTemplates, saleTemplate, userName }
    this._ticketEntities = [];
  }

  static create(ticketType = null, department = null) {
    const b = new TicketBuilder();
    b._ticketType = ticketType;
    b._department = department;
    return b;
  }

  withTicketType(tt) { this._ticketType = tt; return this; }
  withDepartment(d) { this._department = d; return this; }
  withExchangeRate(rate) { this._exchangeRate = rate || 1; return this; }
  withCalculations(calcs) { this._calculations = calcs || []; return this; }
  addCalculation(c) { this._calculations.push(c); return this; }
  withTicketEntities(entities) { this._ticketEntities = entities || []; return this; }

  /**
   * Add an order (built via OrderBuilder) to the ticket.
   * Source: TicketBuilder.AddOrder  [TicketBuilder.cs:99]
   *
   * @param {Object|Function} orderBuilderOrOrder  - OrderBuilder instance, an Order object,
   *        or a function that receives OrderBuilder and returns it (fluent continuation).
   * @param {Array} taxTemplates
   * @param {Object} saleTemplate
   * @param {string} userName
   */
  addOrder(orderBuilderOrOrder, taxTemplates = [], saleTemplate = null, userName = null) {
    let order;
    if (typeof orderBuilderOrOrder === 'function') {
      const { OrderBuilder } = require('./OrderBuilder');
      const ob = OrderBuilder.create();
      orderBuilderOrOrder(ob);
      order = ob.build();
    } else if (orderBuilderOrOrder.build) {
      order = orderBuilderOrOrder.build();
    } else {
      order = orderBuilderOrOrder;
    }
    this._orders.push({ order, taxTemplates, saleTemplate, userName });
    return this;
  }

  /**
   * Convenience: add an order for a menu item directly.
   * Source: TicketBuilder.AddOrderFor  [TicketBuilder.cs:113]
   */
  addOrderFor(menuItem, taxTemplates = [], saleTemplate = null, userName = null, quantity = 1) {
    const { OrderBuilder } = require('./OrderBuilder');
    return this.addOrder(
      OrderBuilder.create().forMenuItem(menuItem).withTaxTemplates(taxTemplates)
        .withAccountTransactionType(saleTemplate).withUserName(userName).withQuantity(quantity),
      taxTemplates, saleTemplate, userName
    );
  }

  /**
   * Build the Ticket entity.
   * Source: TicketBuilder.Build()  [TicketBuilder.cs:33]
   */
  build() {
    if (!this._ticketType) throw new Error('TicketType is required');
    if (!this._department) throw new Error('Department is required');

    const ticket = new Ticket({
      TicketTypeId: this._ticketType.Id,
      DepartmentId: this._department.Id,
      ExchangeRate: this._exchangeRate,
      TaxIncluded: this._ticketType.TaxIncluded ? true : false,
      Date: new Date().toISOString(),
      LastOrderDate: new Date().toISOString(),
      LastPaymentDate: new Date().toISOString(),
      LastUpdateTime: new Date().toISOString(),
      IsClosed: false,
      IsLocked: false,
      RemainingAmount: 0,
      TotalAmount: 0,
      TicketStates: JSON.stringify([{ StateName: 'Status', State: 'New', Quantity: 0 }]),
      TicketEntities: this._ticketEntities,
    });

    // Add all orders (this triggers addOrder → recalc per order)
    for (const { order, taxTemplates, saleTemplate, userName } of this._orders) {
      ticket.addOrder(order, taxTemplates, saleTemplate, userName || 'System');
    }

    // Add all calculations (auto-applied; user-discount ones come later via addCalculation)
    for (const calcType of this._calculations) {
      // For auto-applied calcs, amount comes from the CalculationType itself
      ticket.addCalculation(calcType, Number(calcType.Amount) || 0, calcType.AccountTransactionType);
    }

    // Final recalc to ensure totals are correct
    recalculateTicket(ticket, null, ticket._getTicketAccounts());

    return ticket;
  }
}

module.exports = { TicketBuilder };
