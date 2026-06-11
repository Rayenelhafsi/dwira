import { Router } from "express";
import {
  chatController,
  chatSessionController,
  chatSyncController,
  notifyReservationDemandChatController,
  resetChatSessionController,
} from "../../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.post("/chat", chatController);
router.post("/chat/sync", chatSyncController);
router.get("/chat/session/:platform/:platformUserId", chatSessionController);
router.post("/chat/session/reset", resetChatSessionController);
router.post("/chat/project/reservation-demand/notify", notifyReservationDemandChatController);
router.post("/chat/admin", requireAuth, chatController);
export default router;
