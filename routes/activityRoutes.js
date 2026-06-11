import { Router } from "express";
import {
  completeDailySurvey,
  createActivityLog,
  deleteActivityLog,
  getActivities,
  getDailySurvey,
  getMyActivityLogs,
  submitDailySurvey
} from "../controllers/activityController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/activities", requireAuth, getActivities);
router.post("/activity-logs", requireAuth, createActivityLog);
router.get("/activity-logs/me", requireAuth, getMyActivityLogs);
router.delete("/activity-logs/:id", requireAuth, deleteActivityLog);
router.post("/activity-logs/:id/delete", requireAuth, deleteActivityLog);
router.get("/daily-survey/status", requireAuth, getDailySurvey);
router.post("/daily-survey/complete", requireAuth, completeDailySurvey);
router.post("/daily-survey/submit", requireAuth, submitDailySurvey);

export default router;
