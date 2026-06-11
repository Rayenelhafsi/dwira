import { Router } from "express";
import {
  debugReservationDemandActionController,
  debugReservationDemandController,
  debugChatSessionController,
  debugEvaluateChatController,
  debugResetChatSessionController,
} from "../../controllers/debug.controller.js";

const router = Router();

router.post("/debug/chat/evaluate", debugEvaluateChatController);
router.get("/debug/chat/session/:platform/:platformUserId", debugChatSessionController);
router.delete("/debug/chat/session/:platform/:platformUserId", debugResetChatSessionController);
router.get("/debug/project/reservation-demand/:id", debugReservationDemandController);
router.post("/debug/project/reservation-demand/:id/action", debugReservationDemandActionController);

export default router;
