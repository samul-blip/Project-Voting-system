const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function migrate() {
  const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '20261020_account_profiles.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(migration);
}

module.exports = migrate;
