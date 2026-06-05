import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseDir = join(__dirname, "../../database");
const dbName = process.env.DB_NAME || "carbon_go";

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeDatabaseName(statement) {
  return statement
    .replace(/CREATE DATABASE IF NOT EXISTS\s+`?carbon_go`?/i, `CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
    .replace(/^USE\s+`?carbon_go`?/i, `USE \`${dbName}\``);
}

async function runSqlFile(connection, filePath) {
  const sql = await readFile(filePath, "utf8");
  const statements = splitSqlStatements(sql).map(normalizeDatabaseName);

  console.log(`Running ${basename(filePath)} (${statements.length} statements)`);

  for (const statement of statements) {
    await connection.query(statement);
  }
}

let connection;

try {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: false
  });

  await runSqlFile(connection, join(databaseDir, "schema.sql"));

  const migrationFiles = (await readdir(databaseDir))
    .filter((file) => /^migrate_.*\.sql$/i.test(file))
    .sort();

  for (const file of migrationFiles) {
    await runSqlFile(connection, join(databaseDir, file));
  }

  console.log(`Database migration completed for ${dbName}.`);
} catch (error) {
  if (["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ENOTFOUND"].includes(error.code)) {
    console.error("Database migration failed to connect.");
    console.error(`Host: ${process.env.DB_HOST || "localhost"}`);
    console.error(`Port: ${process.env.DB_PORT || 3306}`);
    console.error(`User: ${process.env.DB_USER || "root"}`);
    console.error("Check that MySQL is running and .env matches your MySQL/phpMyAdmin setup.");
  }
  throw error;
} finally {
  if (connection) await connection.end();
}
