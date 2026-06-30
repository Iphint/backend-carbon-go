import { query } from "../config/db.js";

let cachedHasI18nColumns = null;

export async function hasActivityI18nColumns() {
  if (cachedHasI18nColumns !== null) return cachedHasI18nColumns;

  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'activities'
       AND COLUMN_NAME IN ('name_en', 'name_id', 'feedback_en', 'feedback_id')`
  );

  cachedHasI18nColumns = rows.length === 4;
  return cachedHasI18nColumns;
}

export async function ensureActivityI18nColumns() {
  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'activities'`
  );
  const columns = new Set(rows.map((row) => row.COLUMN_NAME));

  if (!columns.has("name_en")) {
    await query("ALTER TABLE activities ADD COLUMN name_en VARCHAR(180) NULL AFTER name");
  }
  if (!columns.has("name_id")) {
    await query("ALTER TABLE activities ADD COLUMN name_id VARCHAR(180) NULL AFTER name_en");
  }
  if (!columns.has("feedback_en")) {
    await query("ALTER TABLE activities ADD COLUMN feedback_en TEXT NULL AFTER carbon_value");
  }
  if (!columns.has("feedback_id")) {
    await query("ALTER TABLE activities ADD COLUMN feedback_id TEXT NULL AFTER feedback_en");
  }

  await query(
    `UPDATE activities
     SET name_en = COALESCE(name_en, name),
         name_id = COALESCE(name_id, name),
         feedback_en = COALESCE(feedback_en, ''),
         feedback_id = COALESCE(feedback_id, '')`
  );

  cachedHasI18nColumns = true;
}
