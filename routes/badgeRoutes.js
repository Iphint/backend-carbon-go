import { Router } from "express";
import { getMyBadges } from "../controllers/badgeController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/me", requireAuth, getMyBadges);

export default router;
