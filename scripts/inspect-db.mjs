import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://genura:genura_dev_only@127.0.0.1:5432/postgres?schema=public",
});

await client.connect();
const migrations = await client.query('SELECT name, checksum FROM "_genura_local_migrations" ORDER BY name');
console.log("migrations:", migrations.rows);
const columns = await client.query(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'FinancialTransaction' ORDER BY ordinal_position",
);
console.log("transaction columns:", columns.rows);
const tables = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
);
console.log("tables:", tables.rows.map((row) => row.table_name));
await client.end();
