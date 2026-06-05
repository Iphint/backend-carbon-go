import { Router } from "express";
import { createActivityLog, deleteActivityLog, getActivities, getMyActivityLogs } from "../controllers/activityController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/activities", requireAuth, getActivities);
router.post("/activity-logs", requireAuth, createActivityLog);
router.get("/activity-logs/me", requireAuth, getMyActivityLogs);
router.delete("/activity-logs/:id", requireAuth, deleteActivityLog);
router.post("/activity-logs/:id/delete", requireAuth, deleteActivityLog);

export default router;
