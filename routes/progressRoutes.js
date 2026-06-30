import { Router } from "express";
import { getMyProgress, getRankLog } from "../controllers/progressController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/me", requireAuth, getMyProgress);
router.get("/rank-log", requireAuth, getRankLog);

export default router;
