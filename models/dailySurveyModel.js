import { query } from "../config/db.js";

let dailySurveyTableReady = false;

export async function ensureDailySurveyTable() {
  if (dailySurveyTableReady) return;

  await query(
    `CREATE TABLE IF NOT EXISTS daily_survey_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      survey_date DATE NOT NULL,
      completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_daily_survey_user_date (user_id, survey_date),
      INDEX idx_daily_survey_date (survey_date),
      CONSTRAINT fk_daily_survey_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )`
  );

  dailySurveyTableReady = true;
}

export function makassarDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));

  const get = (type) => parts.find((part) => part.type === type)?.value;
  const makassarHour = Number(get("hour") || 0);
  const makassarNoonUtc = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00.000Z`);

  if (makassarHour < 12) {
    makassarNoonUtc.setUTCDate(makassarNoonUtc.getUTCDate() - 1);
  }

  return makassarNoonUtc.toISOString().slice(0, 10);
}

export function nextMakassarSurveyReset(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));

  const get = (type) => parts.find((part) => part.type === type)?.value;
  const makassarHour = Number(get("hour") || 0);
  const resetDay = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00.000Z`);

  if (makassarHour >= 12) {
    resetDay.setUTCDate(resetDay.getUTCDate() + 1);
  }

  return `${resetDay.toISOString().slice(0, 10)}T12:00:00+08:00`;
}

export function surveyWindow(date = makassarDate()) {
  const start = new Date(`${date}T12:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const toMysqlDateTime = (value) => value.toISOString().slice(0, 19).replace("T", " ");
  return {
    start: toMysqlDateTime(start),
    end: toMysqlDateTime(end)
  };
}

export async function getDailySurveyStatus(userId, date = makassarDate()) {
  await ensureDailySurveyTable();
  const window = surveyWindow(date);

  const rows = await query(
    `SELECT id, user_id, survey_date, completed_at, created_at, updated_at
     FROM daily_survey_logs
     WHERE user_id = :userId AND survey_date = :date
     LIMIT 1`,
    { userId, date }
  );

  const fallbackRows = rows.length ? [] : await query(
    `SELECT MIN(created_at) AS completed_at, COUNT(*) AS total_entries
     FROM user_activity_logs
     WHERE user_id = :userId
       AND created_at >= :start
       AND created_at < :end`,
    { userId, start: window.start, end: window.end }
  );
  const fallbackCompleted = Number(fallbackRows[0]?.total_entries || 0) > 0;

  return {
    survey_date: date,
    next_reset_at: nextMakassarSurveyReset(),
    completed: Boolean(rows.length) || fallbackCompleted,
    log: rows[0] || (fallbackCompleted ? {
      user_id: userId,
      survey_date: date,
      completed_at: fallbackRows[0].completed_at,
      source: "activity_logs"
    } : null)
  };
}

export async function markDailySurveyComplete(userId, date = makassarDate()) {
  await ensureDailySurveyTable();

  await query(
    `INSERT INTO daily_survey_logs (user_id, survey_date, completed_at)
     VALUES (:userId, :date, NOW())
     ON DUPLICATE KEY UPDATE completed_at = COALESCE(completed_at, VALUES(completed_at))`,
    { userId, date }
  );

  return getDailySurveyStatus(userId, date);
}
