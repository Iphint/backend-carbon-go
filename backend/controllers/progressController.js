import { Activity } from "../models/activityModel.js";
import { syncUserAwards } from "../models/progressModel.js";
import { query } from "../config/db.js";

export async function getMyProgress(req, res, next) {
  try {
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
      `SELECT b.*, :totalCarbon AS progress_value,
              CASE WHEN ub.id IS NULL THEN 0 ELSE 1 END AS is_completed,
              ub.earned_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = :userId
       WHERE b.name <> 'Earth Guardian'
       ORDER BY b.requirement_value`,
      { userId: req.user.id, totalCarbon }
    );
    const milestones = await query(
      `SELECT m.*, COALESCE(um.progress_value, 0) AS progress_value,
              COALESCE(um.is_completed, 0) AS is_completed, um.completed_at
       FROM milestones m
       LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.user_id = :userId
       ORDER BY m.target_value`,
      { userId: req.user.id }
    );

    res.json({
      totalCarbon,
      ecoPoints,
      todayCarbon,
      journeyPoints,
      quests,
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
