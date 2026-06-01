import { Router } from "express";
import {
  conversationByIdController,
  feedbackController,
  hybridHealthController,
  humanTakeoverController,
  reservationController,
  searchPropertiesController,
} from "../../controllers/core.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.get("/properties/search", searchPropertiesController);
router.post("/reservation", reservationController);
router.get("/conversation/:id", requireAuth, conversationByIdController);
router.post("/human-takeover", requireAuth, humanTakeoverController);
router.post("/feedback", requireAuth, feedbackController);
router.get("/hybrid/health", hybridHealthController);
export default router;
