// =====================================================================
// Migration 20240908000001_create_rbac_module.js
// =====================================================================
// Creates Role-Based Access Control tables:
//   - Permissions (catalog of all possible permissions)
//   - RolePermissions (which roles have which permissions)
// Seeds the Admin role with ALL permissions.
// =====================================================================

exports.up = async function(knex) {
  // Drop the old Permissions table from the original SambaPOS migration
  // (it was empty and had a different schema)
  await knex.schema.dropTableIfExists('RolePermissions');
  await knex.schema.dropTableIfExists('Permissions');

  // Permissions catalog
  await knex.schema.createTable('Permissions', (table) => {
    table.increments('Id').primary();
    table.string('Code', 50).notNullable().unique();  // e.g. 'pos.open_ticket'
    table.string('Name', 100).notNullable();           // e.g. 'Open Ticket'
    table.string('Category', 50);                       // e.g. 'POS', 'Kitchen', 'Admin'
    table.string('Description');
    table.integer('SortOrder').notNullable().defaultTo(0);
  });

  // Role-Permission mapping
  await knex.schema.createTable('RolePermissions', (table) => {
    table.increments('Id').primary();
    table.integer('UserRoleId').notNullable();
    table.integer('PermissionId').notNullable();
    table.foreign('UserRoleId').references('UserRoles.Id').onDelete('CASCADE');
    table.foreign('PermissionId').references('Permissions.Id').onDelete('CASCADE');
    table.unique(['UserRoleId', 'PermissionId'], 'UX_RolePermissions_Role_Permission');
  });

  // Seed all permissions
  const permissions = [
    // POS
    { Code: 'pos.login', Name: 'Login', Category: 'POS', SortOrder: 10 },
    { Code: 'pos.open_ticket', Name: 'Open Ticket', Category: 'POS', SortOrder: 20 },
    { Code: 'pos.add_order', Name: 'Add Order', Category: 'POS', SortOrder: 30 },
    { Code: 'pos.modify_order', Name: 'Modify Order', Category: 'POS', SortOrder: 40 },
    { Code: 'pos.discount', Name: 'Apply Discount', Category: 'POS', SortOrder: 50 },
    { Code: 'pos.gift', Name: 'Gift Order', Category: 'POS', SortOrder: 60 },
    { Code: 'pos.void', Name: 'Void Ticket', Category: 'POS', SortOrder: 70 },
    { Code: 'pos.refund', Name: 'Refund', Category: 'POS', SortOrder: 80 },
    { Code: 'pos.split', Name: 'Split Ticket', Category: 'POS', SortOrder: 90 },
    { Code: 'pos.merge', Name: 'Merge Tickets', Category: 'POS', SortOrder: 100 },
    { Code: 'pos.payment', Name: 'Process Payment', Category: 'POS', SortOrder: 110 },
    { Code: 'pos.close_ticket', Name: 'Close Ticket', Category: 'POS', SortOrder: 120 },
    { Code: 'pos.reopen_ticket', Name: 'Reopen Ticket', Category: 'POS', SortOrder: 130 },
    { Code: 'pos.print', Name: 'Print', Category: 'POS', SortOrder: 140 },
    { Code: 'pos.change_table', Name: 'Change Table', Category: 'POS', SortOrder: 150 },
    // Kitchen
    { Code: 'kitchen.view', Name: 'View KDS', Category: 'Kitchen', SortOrder: 200 },
    { Code: 'kitchen.bump', Name: 'Bump Order', Category: 'Kitchen', SortOrder: 210 },
    { Code: 'kitchen.serve', Name: 'Serve Order', Category: 'Kitchen', SortOrder: 220 },
    { Code: 'kitchen.void', Name: 'Void Kitchen Order', Category: 'Kitchen', SortOrder: 230 },
    { Code: 'kitchen.recall', Name: 'Recall Order', Category: 'Kitchen', SortOrder: 240 },
    // Management
    { Code: 'manage.products', Name: 'Manage Products', Category: 'Admin', SortOrder: 300 },
    { Code: 'manage.users', Name: 'Manage Users', Category: 'Admin', SortOrder: 310 },
    { Code: 'manage.inventory', Name: 'Manage Inventory', Category: 'Admin', SortOrder: 320 },
    { Code: 'manage.printers', Name: 'Manage Printers', Category: 'Admin', SortOrder: 330 },
    { Code: 'manage.kitchen', Name: 'Manage Kitchen Config', Category: 'Admin', SortOrder: 340 },
    { Code: 'reports.view', Name: 'View Reports', Category: 'Admin', SortOrder: 350 },
    { Code: 'admin.all', Name: 'Admin Access', Category: 'Admin', SortOrder: 999 },
  ];

  await knex('Permissions').insert(permissions);

  // Grant ALL permissions to the Admin role (the seeded role)
  const adminRole = await knex('UserRoles').where({ IsAdmin: 1 }).first();
  if (adminRole) {
    const allPermissions = await knex('Permissions');
    for (const perm of allPermissions) {
      await knex('RolePermissions').insert({
        UserRoleId: adminRole.Id,
        PermissionId: perm.Id,
      });
    }
  }

  // Grant basic POS permissions to any non-admin role
  const nonAdminRoles = await knex('UserRoles').where({ IsAdmin: 0 });
  for (const role of nonAdminRoles) {
    const posPerms = await knex('Permissions').where('Code', 'like', 'pos.%');
    for (const perm of posPerms) {
      await knex('RolePermissions').insert({
        UserRoleId: role.Id,
        PermissionId: perm.Id,
      });
    }
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('RolePermissions');
  await knex.schema.dropTableIfExists('Permissions');
};
