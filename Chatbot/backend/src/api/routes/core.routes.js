import { Router } from "express";
import {
  conversationByIdController,
  feedbackController,
  feedbackListController,
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
router.get("/feedback", feedbackListController);
router.post("/feedback", feedbackController);
router.get("/hybrid/health", hybridHealthController);
export default router;
