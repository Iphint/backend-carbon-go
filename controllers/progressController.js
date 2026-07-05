import { Activity } from "../models/activityModel.js";
import { syncUserAwards } from "../models/progressModel.js";
import { query, isBilingualReady } from "../config/db.js";

export async function getMyProgress(req, res, next) {
  try {
    const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
    const bilingual = await isBilingualReady();
    const {
      totalCarbon,
      ecoPoints,
      todayCarbon,
      journeyPoints,
      quests,
      rankCounts,
      currentRank,
      rankAchievements
    } = await syncUserAwards(req.user.id);
    const logs = await Activity.logsByUser(req.user.id, req.query.lang);
    const badges = await query(
      `SELECT b.*,
              ${bilingual ? `CASE WHEN :lang = 'en' THEN COALESCE(b.name_en, b.name) ELSE COALESCE(b.name_id, b.name) END AS display_name,
              CASE WHEN :lang = 'en' THEN COALESCE(b.description_en, b.description) ELSE COALESCE(b.description_id, b.description) END AS display_description,` : `b.name AS display_name, b.description AS display_description,`}
              :totalCarbon AS progress_value,
              CASE WHEN ub.id IS NULL THEN 0 ELSE 1 END AS is_completed,
              ub.earned_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = :userId
       WHERE b.name <> 'Earth Guardian'
       ORDER BY b.requirement_value`,
      { userId: req.user.id, totalCarbon, lang }
    );
    const milestones = await query(
      `SELECT m.*,
              ${bilingual ? `CASE WHEN :lang = 'en' THEN COALESCE(m.name_en, m.name) ELSE COALESCE(m.name_id, m.name) END AS display_name,
              CASE WHEN :lang = 'en' THEN COALESCE(m.description_en, m.description) ELSE COALESCE(m.description_id, m.description) END AS display_description,` : `m.name AS display_name, m.description AS display_description,`}
              COALESCE(um.progress_value, 0) AS progress_value,
              COALESCE(um.is_completed, 0) AS is_completed, um.completed_at
       FROM milestones m
       LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.user_id = :userId
       ORDER BY m.target_value`,
      { userId: req.user.id, lang }
    );

    res.json({
      totalCarbon,
      ecoPoints,
      todayCarbon,
      journeyPoints,
      quests: quests.map((q) => ({
        ...q,
        display_name: bilingual ? (lang === 'en' ? (q.name_en || q.name) : (q.name_id || q.name)) : q.name,
        display_description: bilingual ? (lang === 'en' ? (q.description_en || q.description) : (q.description_id || q.description)) : q.description,
      })),
      rankCounts,
      currentRank,
      rankAchievements,
      logs,
      badges,
      milestones
    });
  } catch (error) {
    next(error);
  }
}

export async function getRankLog(req, res, next) {
  try {
    const { rankAchievements } = await syncUserAwards(req.user.id);
    res.json({ rankLog: rankAchievements });
  } catch (error) {
    next(error);
  }
}
