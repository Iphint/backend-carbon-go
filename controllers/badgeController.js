import { syncUserAwards } from "../models/progressModel.js";
import { query } from "../config/db.js";

export async function getMyBadges(req, res, next) {
  try {
    const { totalCarbon } = await syncUserAwards(req.user.id);
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
    res.json({ badges, carbonPoints: totalCarbon });
  } catch (error) {
    next(error);
  }
}
