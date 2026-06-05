import { Profile } from "../models/profileModel.js";
import { Activity } from "../models/activityModel.js";
import { syncUserAwards } from "../models/progressModel.js";
import { query } from "../config/db.js";

function validateProfile(body) {
  const { full_name, address, gender, phone_number } = body;
  return Boolean(full_name && address && gender && phone_number);
}

export async function getMyProfile(req, res, next) {
  try {
    await syncUserAwards(req.user.id);
    const profile = await Profile.findByUserId(req.user.id);
    const logs = await Activity.logsByUser(req.user.id, req.query.lang);
    const badges = await query(
      `SELECT b.*, ub.earned_at FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = :userId ORDER BY ub.earned_at DESC`,
      { userId: req.user.id }
    );
    const stats = {
      total_activities: logs.length,
      total_carbon: logs.reduce((sum, log) => sum + Number(log.carbon_value), 0),
      positive_actions: logs.filter((log) => Number(log.carbon_value) > 0).length,
      negative_actions: logs.filter((log) => Number(log.carbon_value) < 0).length
    };

    res.json({ user: req.user, profile: profile[0] || null, badges, stats });
  } catch (error) {
    next(error);
  }
}

export async function onboarding(req, res, next) {
  try {
    if (!validateProfile(req.body)) {
      return res.status(400).json({ message: "Full name, address, gender, and phone number are required" });
    }
    const [profile] = await Profile.upsert(req.user.id, req.body);
    res.status(201).json({ message: "Onboarding completed", profile });
  } catch (error) {
    next(error);
  }
}

export async function updateMyProfile(req, res, next) {
  try {
    if (!validateProfile(req.body)) {
      return res.status(400).json({ message: "Full name, address, gender, and phone number are required" });
    }
    const [profile] = await Profile.upsert(req.user.id, req.body);
    res.json({ message: "Profile updated", profile });
  } catch (error) {
    next(error);
  }
}
