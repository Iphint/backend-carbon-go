import { Router } from "express";
import {
  activityLogs,
  activityStats,
  createActivityLogAdmin,
  createMilestone,
  dashboardPointSummary,
  dashboardSummary,
  deleteActivityLogAdmin,
  deleteMilestone,
  deleteRankLog,
  deleteUser,
  leaderboard,
  milestones,
  pointLogs,
  createRankLog,
  rankLogs,
  surveyLogs,
  updateRankLog,
  updateActivityLog,
  updateMilestone,
  userActivityLogs,
  userById,
  userPointLogs,
  userSurveyLogs,
  users
} from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/dashboard-summary", dashboardSummary);
router.get("/dashboard-point-summary", dashboardPointSummary);
router.get("/users", users);
router.get("/survey-logs", surveyLogs);
router.get("/users/:id", userById);
router.delete("/users/:id", deleteUser);
router.get("/users/:id/activity-logs", userActivityLogs);
router.get("/users/:id/rank-logs", rankLogs);
router.get("/point-logs", pointLogs);
router.get("/users/:id/point-logs", userPointLogs);
router.get("/users/:id/survey-logs", userSurveyLogs);
router.get("/activity-logs", activityLogs);
router.get("/activity-stats", activityStats);
router.post("/activity-logs", createActivityLogAdmin);
router.put("/activity-logs/:id", updateActivityLog);
router.delete("/activity-logs/:id", deleteActivityLogAdmin);
router.get("/milestones", milestones);
router.post("/milestones", createMilestone);
router.put("/milestones/:id", updateMilestone);
router.delete("/milestones/:id", deleteMilestone);
router.get("/rank-logs", rankLogs);
router.post("/rank-logs", createRankLog);
router.put("/rank-logs/:id", updateRankLog);
router.delete("/rank-logs/:id", deleteRankLog);
router.get("/leaderboard", leaderboard);

export default router;
