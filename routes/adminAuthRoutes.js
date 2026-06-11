import { Router } from "express";
import { adminLogin, adminLogout, adminMe } from "../controllers/authController.js";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/login", adminLogin);
router.get("/me", requireAuth, requireAdmin, adminMe);
router.post("/logout", adminLogout);

export default router;
