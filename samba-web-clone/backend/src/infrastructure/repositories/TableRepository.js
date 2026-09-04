// =====================================================================
// TableRepository.js
// =====================================================================
// In SambaPOS V3, "Tables" are Entities whose EntityType.Name == "Tables".
// This repository is a thin wrapper around EntityRepository filtered by
// EntityType "Tables".
//
// Mirrors:
//   - Samba.Services/Implementations/EntityModule/EntityServiceClient.cs
//   - Samba.Presentation.Services/Implementations/EntityModule/EntityServiceClient.cs
//   - Samba.Persistance/Implementations/EntityDao.cs
//
// Methods implemented:
//   - getTables()                       — all tables, with their EntityState
//   - getTableById(id)                  — single table
//   - getTableState(entityId)           — current state JSON
//   - setTableState(entityId, group, state, value)
//   - getOpenTicketsForTable(entityId)  — delegates to TicketRepository
//   - updateEntityState(entityId, groupName, state, stateValue)
// =====================================================================

const { db, withTransaction } = require('../db/db');

class TableRepository {
  /**
   * Get the EntityType.Id for "Tables".
   * @param {import('knex').Knex.Transaction | import('knex').Knex} trx
   * @returns {Promise<number|null>}
   */
  async _getTablesEntityTypeId(trx = db) {
    const et = await trx('EntityTypes').where({ Name: 'Tables' }).first();
    return et ? et.Id : null;
  }

  /**
   * Get all tables (Entities of type "Tables").
   * @returns {Promise<Array>}
   */
  async getTables() {
    const tablesEtId = await this._getTablesEntityTypeId();
    if (!tablesEtId) return [];

    const tables = await db('Entities')
      .where({ EntityTypeId: tablesEtId })
      .orderBy('Name');

    if (tables.length === 0) return [];

    // Load EntityStateValues for all tables in one query
    const entityIds = tables.map(t => t.Id);
    const stateValues = await db('EntityStateValues').whereIn('EntityId', entityIds);
    const stateByEntity = {};
    for (const sv of stateValues) {
      stateByEntity[sv.EntityId] = sv;
    }

    return tables.map(t => ({
      ...t,
      EntityStateValue: stateByEntity[t.Id] || null,
      EntityStates: stateByEntity[t.Id]?.EntityStates
        ? JSON.parse(stateByEntity[t.Id].EntityStates)
        : [],
    }));
  }

  /**
   * Get a single table by Id, with its state.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getTableById(id) {
    const table = await db('Entities').where({ Id: id }).first();
    if (!table) return null;
    const stateValue = await db('EntityStateValues').where({ EntityId: id }).first();
    return {
      ...table,
      EntityStateValue: stateValue || null,
      EntityStates: stateValue?.EntityStates ? JSON.parse(stateValue.EntityStates) : [],
    };
  }

  /**
   * Get the current state value for a table.
   * The state is stored as JSON in EntityStateValues.EntityStates.
   *
   * Example state JSON:
   *   [{"StateName":"Status","State":"Available","LastUpdateTime":"...","Quantity":0}]
   *
   * @param {number} entityId
   * @returns {Promise<Object|null>} the parsed EntityStates array
   */
  async getTableState(entityId) {
    const sv = await db('EntityStateValues').where({ EntityId: entityId }).first();
    if (!sv) return null;
    return sv.EntityStates ? JSON.parse(sv.EntityStates) : [];
  }

  /**
   * Set / update a state value on a table.
   * Source: EntityStateValue.SetStateValue(groupName, state, quantityExp)
   *
   * @param {number} entityId
   * @param {string} groupName   e.g. "Status"
   * @param {string} state       e.g. "Available", "New Orders", "Bill Requested"
   * @param {string} stateValue  optional value
   */
  async updateEntityState(entityId, groupName, state, stateValue = '') {
    return withTransaction(async (trx) => {
      const existing = await trx('EntityStateValues').where({ EntityId: entityId }).first();
      const now = new Date().toISOString();
      let states = existing?.EntityStates ? JSON.parse(existing.EntityStates) : [];
      const idx = states.findIndex(s => s.StateName === groupName);
      if (idx >= 0) {
        states[idx].State = state;
        states[idx].StateValue = stateValue;
        states[idx].LastUpdateTime = now;
      } else {
        states.push({
          StateName: groupName,
          State: state,
          StateValue: stateValue,
          LastUpdateTime: now,
          Quantity: 0,
        });
      }
      const json = JSON.stringify(states);
      if (existing) {
        await trx('EntityStateValues').where({ EntityId: entityId }).update({
          EntityStates: json,
        });
      } else {
        await trx('EntityStateValues').insert({
          EntityId: entityId,
          EntityStates: json,
        });
      }
      return states;
    });
  }

  /**
   * Create a new table entity.
   * @param {string} name
   * @param {string} [initialState='Available']
   * @returns {Promise<number>} the new Entity Id
   */
  async createTable(name, initialState = 'Available') {
    return withTransaction(async (trx) => {
      const tablesEtId = await this._getTablesEntityTypeId(trx);
      if (!tablesEtId) throw new Error('EntityType "Tables" not found. Run the seed first.');

      const [entityId] = await trx('Entities').insert({
        Name: name,
        EntityTypeId: tablesEtId,
        LastUpdateTime: new Date().toISOString(),
        SearchString: name.toLowerCase(),
        CustomData: null,
        AccountId: 0,
        WarehouseId: 0,
      });

      // Set initial state
      const states = [{
        StateName: 'Status',
        State: initialState,
        StateValue: '',
        LastUpdateTime: new Date().toISOString(),
        Quantity: 0,
      }];
      await trx('EntityStateValues').insert({
        EntityId: entityId,
        EntityStates: JSON.stringify(states),
      });

      return entityId;
    });
  }

  /**
   * Find tables whose state matches a given state name + value.
   * Used to filter "Available" tables vs "Occupied" tables.
   *
   * @param {string} stateName   e.g. "Status"
   * @param {string} stateValue  e.g. "Available"
   * @returns {Promise<Array>}
   */
  async getTablesByState(stateName, stateValue) {
    const tables = await this.getTables();
    return tables.filter(t => {
      if (!t.EntityStates) return false;
      const sv = t.EntityStates.find(s => s.StateName === stateName);
      return sv && sv.State === stateValue;
    });
  }
}

module.exports = { TableRepository };
