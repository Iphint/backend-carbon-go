import { Router } from "express";
import {
  activityLogs,
  activityStats,
  getActivities,
  createActivityLogAdmin,
  createBadge,
  createCustomGreenAction,
  createMilestone,
  createQuest,
  customGreenActions,
  dashboardPointSummary,
  dashboardSummary,
  deleteActivityLogAdmin,
  deleteBadge,
  deleteCustomGreenAction,
  deleteMilestone,
  deleteQuest,
  deleteRankLog,
  deleteUser,
  ecoBadges,
  leaderboard,
  milestones,
  pointLogs,
  quests,
  createRankLog,
  rankLogs,
  surveyLogs,
  updateRankLog,
  updateActivityLog,
  updateBadge,
  updateCustomGreenAction,
  updateMilestone,
  updateQuest,
  userActivityLogs,
  userById,
  userPointLogs,
  userProgress,
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
router.get("/users/:id/custom-green-actions", customGreenActions);
router.get("/users/:id/progress", userProgress);
router.get("/users/:id/rank-logs", rankLogs);
router.get("/point-logs", pointLogs);
router.get("/users/:id/point-logs", userPointLogs);
router.get("/users/:id/survey-logs", userSurveyLogs);
router.get("/activity-logs", activityLogs);
router.get("/activity-stats", activityStats);
router.get("/activities", getActivities);
router.post("/activity-logs", createActivityLogAdmin);
router.put("/activity-logs/:id", updateActivityLog);
router.delete("/activity-logs/:id", deleteActivityLogAdmin);
router.get("/custom-green-actions", customGreenActions);
router.post("/custom-green-actions", createCustomGreenAction);
router.put("/custom-green-actions/:id", updateCustomGreenAction);
router.delete("/custom-green-actions/:id", deleteCustomGreenAction);
router.get("/milestones", milestones);
router.post("/milestones", createMilestone);
router.put("/milestones/:id", updateMilestone);
router.delete("/milestones/:id", deleteMilestone);
router.get("/eco-badges", ecoBadges);
router.post("/eco-badges", createBadge);
router.put("/eco-badges/:id", updateBadge);
router.delete("/eco-badges/:id", deleteBadge);
router.get("/quests", quests);
router.post("/quests", createQuest);
router.put("/quests/:id", updateQuest);
router.delete("/quests/:id", deleteQuest);
router.get("/rank-logs", rankLogs);
router.post("/rank-logs", createRankLog);
router.put("/rank-logs/:id", updateRankLog);
router.delete("/rank-logs/:id", deleteRankLog);
router.get("/leaderboard", leaderboard);

export default router;
