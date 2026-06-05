import { syncUserAwards } from "../models/progressModel.js";
import { query } from "../config/db.js";

export async function getMyMilestones(req, res, next) {
  try {
    await syncUserAwards(req.user.id);
    const milestones = await query(
      `SELECT m.*, COALESCE(um.progress_value, 0) AS progress_value,
              COALESCE(um.is_completed, 0) AS is_completed, um.completed_at
       FROM milestones m
       LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.user_id = :userId
       ORDER BY m.target_value`,
      { userId: req.user.id }
    );
    res.json({ milestones });
  } catch (error) {
    next(error);
  }
}
