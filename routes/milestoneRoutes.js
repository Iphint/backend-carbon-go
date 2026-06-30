import { Router } from "express";
import { getMyMilestones } from "../controllers/milestoneController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/me", requireAuth, getMyMilestones);

export default router;
