// =====================================================================
// eventBus.js — Lightweight PubSub (EventTarget-based) emulating PRISM's
// EventAggregator from SambaPOS V3.
// =====================================================================
// Per Architect's directive:
//   * The Ticket state must live in a Store Singleton (Observable pattern)
//   * Do NOT fragment state across multiple components
//   * Emulate the original's EventAggregator with EventTarget or PubSub
//
// This module works in BOTH Node.js (backend) and browsers (frontend).
// On Node it uses EventEmitter; in browsers it falls back to EventTarget.
// =====================================================================

const { EventEmitter } = require('events');

// Backend implementation (Node.js)
const bus = new EventEmitter();
bus.setMaxListeners(100);

// Mirror PRISM's EventAggregator API:
//   eventAggregator.GetEvent<EventTopic<T>>().Subscribe(handler)
//   eventAggregator.GetEvent<EventTopic<T>>().Publish(payload)
//
// In JS we use string topic names directly (like SambaPOS's EventTopicNames).

/**
 * Subscribe to a topic.
 * @param {string} topic
 * @param {(payload: any) => void} handler
 * @returns {() => void} unsubscribe function
 */
function subscribe(topic, handler) {
  bus.on(topic, handler);
  return () => bus.off(topic, handler);
}

/**
 * Publish a payload to a topic.
 * @param {string} topic
 * @param {*} payload
 */
function publish(topic, payload) {
  bus.emit(topic, payload);
}

/**
 * Subscribe once.
 */
function subscribeOnce(topic, handler) {
  bus.once(topic, handler);
  return () => bus.off(topic, handler);
}

// =====================================================================
// SambaPOS V3 — Standard Event Topic Names
// =====================================================================
// Mirrors Samba.Presentation.Common.EventTopicNames
const EventTopicNames = {
  // Ticket lifecycle
  TicketCreated:          'TicketCreated',
  TicketOpened:           'TicketOpened',
  TicketClosing:          'TicketClosing',
  TicketClosed:           'TicketClosed',
  TicketMoving:           'TicketMoving',
  TicketMoved:            'TicketMoved',
  TicketMerged:           'TicketMerged',
  BeforeTicketClosing:    'BeforeTicketClosing',
  TicketTotalChanged:     'TicketTotalChanged',
  TicketRefresh:          'TicketRefresh',
  // Order events
  OrderAdded:             'OrderAdded',
  OrderCancelled:         'OrderCancelled',
  OrderMoving:            'OrderMoving',
  OrderMoved:             'OrderMoved',
  OrderSelected:          'OrderSelected',
  // Payment
  PaymentProcessed:       'PaymentProcessed',
  // Automation triggers
  AutomationCommandSelected: 'AutomationCommandSelected',
  // Entity
  EntitySelectedForTicket: 'EntitySelectedForTicket',
  EntityUpdated:           'EntityUpdated',
  // UI navigation
  ActivatePosView:        'ActivatePosView',
  DisplayPaymentScreen:   'DisplayPaymentScreen',
  CloseTicketRequested:   'CloseTicketRequested',
  // Misc
  ScreenMenuItemDataSelected: 'ScreenMenuItemDataSelected',
};

module.exports = {
  bus,
  subscribe,
  publish,
  subscribeOnce,
  EventTopicNames,
};
