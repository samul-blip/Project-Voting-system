const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function migrate() {
  const migrationDir = path.join(__dirname, '..', 'db', 'migrations');
  const migrationFiles = [
    '20261020_account_profiles.sql',
    '20261021_local_image_uploads.sql'
  ];
  for (const file of migrationFiles) {
    const migration = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    await pool.query(migration);
  }
}

module.exports = migrate;
