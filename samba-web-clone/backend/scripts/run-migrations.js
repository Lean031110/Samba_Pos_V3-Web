// Run migrations + seeds programmatically
const knex = require('knex');
const config = require('../src/infrastructure/db/knexfile.js');
const env = process.env.NODE_ENV || 'development';

(async () => {
  const db = knex(config[env] || config.development);
  console.log('Running migrations...');
  const [batchNo, log] = await db.migrate.latest();
  console.log(`Migrations done. Batch ${batchNo}, ${log.length} migrations.`);
  console.log('Running seeds...');
  const [seedLog] = await db.seed.run();
  console.log(`Seeds done. ${seedLog.length} seeds run.`);
  await db.destroy();
})().catch(e => { console.error('ERR:', e.message, e.stack); process.exit(1); });
