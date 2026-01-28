const { Pool } = require("pg");

function createDb(databaseUrl) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  pool.on("error", () => {});
  return pool;
}

async function insertSnapshot(pool, fullName, data) {
  await pool.query(
    "INSERT INTO repo_snapshots(full_name, data) VALUES($1, $2::jsonb)",
    [fullName, JSON.stringify(data)]
  );
}

async function getLatestSnapshot(pool, fullName) {
  const { rows } = await pool.query(
    "SELECT full_name, fetched_at, data FROM repo_snapshots WHERE full_name=$1 ORDER BY fetched_at DESC LIMIT 1",
    [fullName]
  );
  if (!rows.length) return null;
  return rows[0];
}

module.exports = { createDb, insertSnapshot, getLatestSnapshot };
