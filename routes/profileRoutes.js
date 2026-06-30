import { Router } from "express";
import { getMyProfile, onboarding, updateMyProfile } from "../controllers/profileController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.post("/onboarding", requireAuth, onboarding);
router.put("/me", requireAuth, updateMyProfile);

export default router;
