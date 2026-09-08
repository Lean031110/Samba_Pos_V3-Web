// =====================================================================
// Migration: 20260908000003_add_granular_permissions.js
// =====================================================================
// Adds missing business permissions required by the guide:
//   - tickets.create (was pos.open_ticket)
//   - tickets.void (was pos.void)
//   - tickets.discount (was pos.discount)
//   - tickets.refund (was pos.refund)
//   - payments.process (was pos.payment)
//   - payments.refund (new — separate from ticket refund)
//   - inventory.adjust (was manage.inventory)
//   - recipes.edit (new — separate from manage.inventory)
//   - printers.manage (was manage.printers)
//   - reports.view (already exists)
//   - users.manage (was manage.users)
//   - settings.manage (new)
//   - customers.manage (new)
//   - cash.manage (new — cash sessions)
//
// These are ADDED (not replacing the old ones) for backward compatibility.
// Old permissions remain valid; new ones provide finer granularity.
// =====================================================================

exports.up = async function (knex) {
  const newPermissions = [
    // Tickets (granular)
    { Code: 'tickets.create',      Name: 'Create Ticket',         Category: 'Tickets',    SortOrder: 15 },
    { Code: 'tickets.void',        Name: 'Void Ticket',           Category: 'Tickets',    SortOrder: 75 },
    { Code: 'tickets.discount',    Name: 'Apply Discount',        Category: 'Tickets',    SortOrder: 55 },
    { Code: 'tickets.refund',      Name: 'Refund Ticket',         Category: 'Tickets',    SortOrder: 85 },
    // Payments (granular)
    { Code: 'payments.process',    Name: 'Process Payment',       Category: 'Payments',   SortOrder: 115 },
    { Code: 'payments.refund',     Name: 'Refund Payment',        Category: 'Payments',   SortOrder: 116 },
    // Inventory (granular)
    { Code: 'inventory.adjust',    Name: 'Adjust Inventory',     Category: 'Inventory',  SortOrder: 321 },
    { Code: 'inventory.view',      Name: 'View Inventory',        Category: 'Inventory',  SortOrder: 322 },
    { Code: 'inventory.transfer', Name: 'Transfer Stock',        Category: 'Inventory',  SortOrder: 323 },
    // Recipes
    { Code: 'recipes.edit',        Name: 'Edit Recipes',         Category: 'Recipes',    SortOrder: 331 },
    { Code: 'recipes.view',        Name: 'View Recipes',          Category: 'Recipes',    SortOrder: 332 },
    // Printers
    { Code: 'printers.manage',     Name: 'Manage Printers',       Category: 'Printers',   SortOrder: 341 },
    // Admin
    { Code: 'users.manage',        Name: 'Manage Users',          Category: 'Admin',      SortOrder: 311 },
    { Code: 'settings.manage',     Name: 'Manage Settings',       Category: 'Admin',      SortOrder: 360 },
    { Code: 'customers.manage',    Name: 'Manage Customers',      Category: 'Admin',      SortOrder: 361 },
    { Code: 'cash.manage',         Name: 'Manage Cash Sessions',   Category: 'Admin',      SortOrder: 362 },
  ];

  // Insert only permissions that don't already exist
  for (const perm of newPermissions) {
    const existing = await knex('Permissions').where({ Code: perm.Code }).first();
    if (!existing) {
      await knex('Permissions').insert(perm);
      console.log(`[migration] Added permission: ${perm.Code}`);
    }
  }

  // Grant ALL new permissions to the Admin role
  const adminRole = await knex('UserRoles').where({ IsAdmin: 1 }).first();
  if (adminRole) {
    const allPerms = await knex('Permissions');
    for (const perm of allPerms) {
      const existing = await knex('RolePermissions')
        .where({ UserRoleId: adminRole.Id, PermissionId: perm.Id })
        .first();
      if (!existing) {
        await knex('RolePermissions').insert({
          UserRoleId: adminRole.Id,
          PermissionId: perm.Id,
        });
      }
    }
  }
};

exports.down = async function (knex) {
  await knex('Permissions')
    .whereIn('Code', [
      'tickets.create', 'tickets.void', 'tickets.discount', 'tickets.refund',
      'payments.process', 'payments.refund',
      'inventory.adjust', 'inventory.view', 'inventory.transfer',
      'recipes.edit', 'recipes.view',
      'printers.manage',
      'users.manage', 'settings.manage', 'customers.manage', 'cash.manage',
    ])
    .del();
};
