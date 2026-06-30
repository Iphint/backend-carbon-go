import { query } from "../config/db.js";

export async function getRankings(req, res, next) {
  try {
    const rankings = await query(
      `SELECT u.id, u.username, u.email, p.full_name,
              COALESCE(SUM(l.carbon_value), 0) AS total_carbon,
              COUNT(l.id) AS total_activities
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN user_activity_logs l ON l.user_id = u.id
       GROUP BY u.id, u.username, u.email, p.full_name
       ORDER BY total_carbon DESC, total_activities DESC, u.username ASC`
    );
    res.json({ rankings });
  } catch (error) {
    next(error);
  }
}
