import { Router } from "express";
import { getRankings } from "../controllers/rankingController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getRankings);

export default router;
