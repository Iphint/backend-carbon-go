import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseDir = join(__dirname, "../../database");
const dbName = process.env.DB_NAME || "carbon_go";
const allowDestructiveMigrations = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "true";

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

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

function isDestructiveStatement(statement) {
  return /^(DROP|TRUNCATE|DELETE)\b/i.test(statement.trim());
}

async function ensureMigrationTable(connection) {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${dbName}\``);
  await connection.query(
    `CREATE TABLE IF NOT EXISTS database_migrations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function hasMigrationRun(connection, fileName, fileChecksum) {
  const [rows] = await connection.query(
    "SELECT checksum FROM database_migrations WHERE file_name = ?",
    [fileName]
  );

  if (!rows.length) return false;
  if (rows[0].checksum !== fileChecksum) {
    console.warn(`Skipping ${fileName}: already applied with a different checksum. Create a new migrate_*.sql file for production changes.`);
  } else {
    console.log(`Skipping ${fileName}: already applied.`);
  }
  return true;
}

async function recordMigration(connection, fileName, fileChecksum) {
  await connection.query(
    `INSERT INTO database_migrations (file_name, checksum)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)`,
    [fileName, fileChecksum]
  );
}

async function runSqlFile(connection, filePath) {
  const fileName = basename(filePath);
  const sql = await readFile(filePath, "utf8");
  const fileChecksum = checksum(sql);
  if (await hasMigrationRun(connection, fileName, fileChecksum)) return;

  const statements = splitSqlStatements(sql).map(normalizeDatabaseName);

  console.log(`Running ${fileName} (${statements.length} statements)`);

  for (const statement of statements) {
    if (isDestructiveStatement(statement) && !allowDestructiveMigrations) {
      console.warn(`Skipping destructive statement in ${fileName}. Set ALLOW_DESTRUCTIVE_MIGRATIONS=true to allow it intentionally.`);
      continue;
    }
    await connection.query(statement);
  }

  await recordMigration(connection, fileName, fileChecksum);
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

  await ensureMigrationTable(connection);
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
