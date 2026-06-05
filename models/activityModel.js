import { query } from "../config/db.js";
import { hasActivityI18nColumns } from "../utils/activitySchema.js";

export const Activity = {
  async all(lang = "en") {
    const hasI18n = await hasActivityI18nColumns();
    if (!hasI18n) {
      return query(
        `SELECT id, name, name AS display_name, category, carbon_value,
                '' AS feedback, is_default, created_at, updated_at
         FROM activities
         ORDER BY category, carbon_value DESC, name`
      );
    }

    const nameColumn = lang === "id" ? "name_id" : "name_en";
    const feedbackColumn = lang === "id" ? "feedback_id" : "feedback_en";
    return query(
      `SELECT id, name, name_en, name_id,
              COALESCE(NULLIF(${nameColumn}, ''), name) AS display_name,
              category, carbon_value,
              COALESCE(NULLIF(${feedbackColumn}, ''), '') AS feedback,
              feedback_en, feedback_id, is_default, created_at, updated_at
       FROM activities
       ORDER BY category, carbon_value DESC, COALESCE(NULLIF(${nameColumn}, ''), name)`
    );
  },
  findById(id) {
    return query("SELECT * FROM activities WHERE id = :id", { id });
  },
  async createLog(userId, { activity_id, other_activity, carbon_value, note }) {
    const result = await query(
      `INSERT INTO user_activity_logs
       (user_id, activity_id, other_activity, carbon_value, note)
       VALUES (:userId, :activityId, :otherActivity, :carbonValue, :note)`,
      {
        userId,
        activityId: activity_id || null,
        otherActivity: other_activity || null,
        carbonValue: carbon_value,
        note: note || null
      }
    );
    return result.insertId;
  },
  async logsByUser(userId, lang = "en") {
    const hasI18n = await hasActivityI18nColumns();
    if (!hasI18n) {
      return query(
        `SELECT l.*, a.name AS activity_name, a.category, '' AS feedback
         FROM user_activity_logs l
         LEFT JOIN activities a ON a.id = l.activity_id
         WHERE l.user_id = :userId
         ORDER BY l.created_at DESC`,
        { userId }
      );
    }

    const nameColumn = lang === "id" ? "a.name_id" : "a.name_en";
    const feedbackColumn = lang === "id" ? "a.feedback_id" : "a.feedback_en";
    return query(
      `SELECT l.*,
              COALESCE(NULLIF(${nameColumn}, ''), a.name) AS activity_name,
              a.name_en, a.name_id,
              COALESCE(NULLIF(${feedbackColumn}, ''), '') AS feedback,
              a.feedback_en, a.feedback_id, a.category
       FROM user_activity_logs l
       LEFT JOIN activities a ON a.id = l.activity_id
       WHERE l.user_id = :userId
       ORDER BY l.created_at DESC`,
      { userId }
    );
  },
  async deleteLog(userId, logId) {
    const result = await query(
      "DELETE FROM user_activity_logs WHERE id = :logId AND user_id = :userId",
      { userId, logId }
    );
    return result.affectedRows || 0;
  }
};
